import { h } from './dom.js';
import { formatCharacters } from './format.js';
import { readFile, writeFile } from './fs.js';

const SAVE_DELAY_MS = 1000;
const MAX_UNSAVED_MS = 2000;

const timeOfDay = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

export class MarkdownEditor {
  static async open(node, text, { onReload }) {
    const { createEditor } = await import('../vendor/editor.js');
    const editor = new MarkdownEditor(node, text, onReload);
    editor.milkdown = await createEditor(editor.surface, text, { fileUrl: node.url, onChange: () => editor.changed() });
    editor.synced = editor.milkdown.markdown();
    editor.countCharacters();
    return editor;
  }

  constructor(node, text, onReload) {
    this.node = node;
    this.base = text;
    this.onReload = onReload;
    this.conflict = null;
    this.saving = Promise.resolve();
    this.status = h('span', { class: 'save-status', role: 'status' });
    this.characters = h('span', { class: 'meta characters', title: 'Characters with spaces, without Markdown syntax' });
    this.message = h('span', {});
    this.actions = h('span', { class: 'actions' });
    this.banner = h('div', { class: 'banner', hidden: true }, this.message, this.actions);
    this.surface = h('article', { class: 'markdown editor', spellcheck: 'false' });
    this.element = h('div', { class: 'md-doc' }, this.banner, this.surface);
  }

  get dirty() {
    return Boolean(this.milkdown) && this.milkdown.markdown() !== this.synced;
  }

  countCharacters() {
    if (!this.milkdown) return;
    this.characters.textContent = formatCharacters(this.milkdown.text());
  }

  changed() {
    this.countCharacters();
    clearTimeout(this.timer);
    if (this.conflict) return;
    this.setStatus('unsaved', 'Unsaved');
    this.timer = setTimeout(() => this.save(), SAVE_DELAY_MS);
    this.deadline ??= setTimeout(() => this.save(), MAX_UNSAVED_MS);
  }

  clearDeadline() {
    clearTimeout(this.deadline);
    this.deadline = null;
  }

  setStatus(state, text) {
    this.status.dataset.state = state;
    this.status.textContent = text;
  }

  save() {
    clearTimeout(this.timer);
    this.clearDeadline();
    this.saving = this.saving.then(() => this.write());
    return this.saving;
  }

  async write() {
    if (this.conflict) return;
    const text = this.milkdown.markdown();
    if (text === this.synced) {
      if (this.status.dataset.state === 'unsaved') this.setStatus('saved', 'No changes');
      return;
    }
    this.setStatus('saving', 'Saving…');
    try {
      const reply = await writeFile(this.node.url, text, this.base);
      if (reply.conflict) return this.showConflict(reply.text);
      this.base = text;
      this.synced = text;
      this.hideBanner();
      if (this.dirty) this.setStatus('unsaved', 'Unsaved');
      else this.setStatus('saved', `Saved ${timeOfDay.format(new Date())}`);
    } catch (error) {
      this.setStatus('error', 'Not saved');
      this.showBanner(`Not saved: ${error.message}`, h('button', { onClick: () => this.save() }, 'Retry'));
    }
  }

  async needsReload() {
    await this.saving;
    const { text } = await readFile(this.node.url);
    if (text === this.base) return false;
    if (!this.dirty) return true;
    this.showConflict(text);
    return false;
  }

  showConflict(diskText) {
    clearTimeout(this.timer);
    this.clearDeadline();
    this.conflict = diskText;
    this.setStatus('error', 'Not saved: conflict');
    this.showBanner(
      'This file changed on disk while you were editing.',
      h('button', { onClick: () => this.reload() }, 'Reload'),
      h('button', { class: 'primary', onClick: () => this.keepMine() }, 'Keep my version'),
    );
  }

  reload() {
    this.discarded = true;
    this.onReload();
  }

  keepMine() {
    this.base = this.conflict;
    this.conflict = null;
    this.hideBanner();
    this.save();
  }

  showBanner(message, ...actions) {
    this.message.textContent = message;
    this.actions.replaceChildren(...actions);
    this.banner.hidden = false;
  }

  hideBanner() {
    this.banner.hidden = true;
  }

  async dispose() {
    if (!this.discarded) await this.save();
    this.milkdown.destroy();
  }
}
