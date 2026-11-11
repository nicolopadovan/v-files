import { h } from './dom.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { buildPreview } from './preview.js';
import { SORTS, TreeNode, visibleRows } from './tree.js';

const POLL_MS = 2000;
const MIN_TREE_WIDTH = 160;
const MIN_PREVIEW_WIDTH = 320;
const SORT_LABELS = { name: 'Name', modified: 'Date modified', size: 'Size' };

const decode = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const isTyping = (el) =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement || Boolean(el?.isContentEditable);

const FOLLOWABLE = new Set(['file:', 'http:', 'https:', 'mailto:']);

class Viewer {
  constructor(prefs) {
    const url = location.href.split('#')[0];
    this.segments = new URL(url).pathname.split('/').filter(Boolean);
    this.prefs = prefs;
    this.view = { sort: SORTS.includes(prefs.sort) ? prefs.sort : 'name', showHidden: prefs.showHidden, filter: '' };
    this.expanded = new Set(prefs.expanded);
    this.root = new TreeNode({ name: decode(this.segments.at(-1) ?? '/'), url, isDir: true });
    this.root.expanded = true;
    this.rows = [];
    this.selected = null;
    this.previewed = null;
    this.previewToken = 0;
    this.ui = this.mount();
  }

  mount() {
    const crumbs = [h('a', { href: 'file:///' }, '/')];
    this.segments.forEach((segment, i) => {
      const href = `file:///${this.segments.slice(0, i + 1).join('/')}/`;
      crumbs.push(h('span', { class: 'sep' }, '›'), h('a', { href }, decode(segment)));
    });
    const ui = {
      filter: h('input', { type: 'search', placeholder: 'Filter  /', spellcheck: 'false', onInput: (e) => this.setFilter(e.target.value) }),
      sort: h(
        'select',
        { title: 'Sort', onChange: (e) => this.setView({ sort: e.target.value }) },
        SORTS.map((sort) => h('option', { value: sort, selected: sort === this.view.sort }, SORT_LABELS[sort])),
      ),
      hidden: h('button', { class: 'toggle', title: 'Show hidden files  .', onClick: () => this.setView({ showHidden: !this.view.showHidden }) }, '.*'),
      tree: h('div', { class: 'tree', role: 'tree', tabindex: '0', onClick: (e) => this.onTreeClick(e) }),
      preview: h('main', { class: 'preview', tabindex: '-1', onClick: (e) => this.onPreviewClick(e) }),
    };
    ui.app = h(
      'div',
      { id: 'vfiles', style: `--tree-width: ${this.prefs.treeWidth}px` },
      h(
        'header',
        { class: 'bar' },
        h('button', { class: 'up', title: 'Enclosing folder  ⌘↑', disabled: !this.segments.length, onClick: () => this.goUp() }, '↑'),
        h('nav', { class: 'crumbs' }, crumbs),
        ui.filter,
        ui.sort,
        ui.hidden,
      ),
      ui.tree,
      h('div', { class: 'resizer', onPointerdown: (e) => this.startResize(e) }),
      ui.preview,
    );
    ui.hidden.classList.toggle('on', this.view.showHidden);
    document.head.replaceChildren(h('meta', { charset: 'utf-8' }), h('title', {}, this.root.name));
    document.body.replaceChildren(ui.app);
    document.documentElement.dataset.vfiles = '';
    return ui;
  }

  async init() {
    try {
      await this.root.load();
    } catch (error) {
      this.ui.tree.replaceChildren(h('p', { class: 'notice' }, `Could not read this folder: ${error.message}`));
      return;
    }
    await this.restoreExpanded(this.root);
    await this.followHash();
    this.ui.tree.focus();
    window.addEventListener('hashchange', () => this.followHash());
    document.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('focus', () => this.refresh());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.previewed?.editor?.save());
    window.addEventListener('beforeunload', (e) => this.previewed?.editor?.dirty && e.preventDefault());
    setInterval(() => document.visibilityState === 'visible' && this.refresh(), POLL_MS);
  }

  async followHash() {
    const hash = location.hash.slice(1);
    const target = hash ? await this.reveal(new URL(hash, this.root.url).href) : null;
    this.renderTree();
    if (target) this.select(target);
    else this.showPreview(this.root);
  }

  async restoreExpanded(node) {
    const dirs = node.children.filter((child) => child.isDir && this.expanded.has(child.url));
    await Promise.all(
      dirs.map(async (dir) => {
        try {
          await dir.load();
          dir.expanded = true;
          await this.restoreExpanded(dir);
        } catch {
          this.expanded.delete(dir.url);
        }
      }),
    );
  }

  async reveal(target) {
    let node = this.root;
    while (node.url !== target) {
      if (!node.children) await node.load();
      const next =
        node.children.find((child) => child.url === target || (child.isDir && target.startsWith(child.url))) ??
        node.children.find((child) => child.isDir && child.url === `${target}/`);
      if (!next) return null;
      if (next.isDir && next.url !== target && next.url !== `${target}/`) this.setExpanded(next, true);
      node = next;
      if (node.url === `${target}/`) break;
    }
    return node;
  }

  renderTree() {
    this.rows = visibleRows(this.root, this.view);
    if (!this.rows.length) {
      this.ui.tree.replaceChildren(h('p', { class: 'notice' }, this.view.filter ? 'No matches' : 'Empty folder'));
      return;
    }
    this.ui.tree.replaceChildren(
      ...this.rows.map(({ node, depth }, index) =>
        h(
          'div',
          {
            class: ['row', node === this.selected && 'selected', node.hidden && 'dim'].filter(Boolean).join(' '),
            role: 'treeitem',
            'aria-expanded': node.isDir ? String(node.expanded) : null,
            style: `--depth: ${depth}`,
            dataset: { index },
          },
          h('span', { class: ['twisty', node.isDir && (node.expanded || this.view.filter ? 'open' : 'closed')].filter(Boolean).join(' ') }),
          h('span', { class: `icon ${node.isDir ? 'dir' : 'file'}` }),
          h('span', { class: 'name' }, node.name),
        ),
      ),
    );
    this.ui.tree.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  select(node) {
    for (const ancestor of node.ancestors()) {
      if (ancestor !== this.root && !ancestor.expanded) this.setExpanded(ancestor, true);
    }
    this.selected = node;
    history.replaceState(null, '', `#${node.url.slice(this.root.url.length)}`);
    this.renderTree();
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.showPreview(node), 60);
  }

  async showPreview(node) {
    const token = ++this.previewToken;
    const { element, editor } = await buildPreview(node, {
      view: this.view,
      select: (child) => this.select(child),
      openRoot: (url) => this.openRoot(url),
      reload: () => this.showPreview(node),
    });
    if (token !== this.previewToken) {
      editor?.dispose();
      return;
    }
    const scroll = this.previewed?.node === node ? this.readScroll() : null;
    this.previewed?.editor?.dispose();
    this.ui.preview.replaceChildren(element);
    this.restoreScroll(scroll);
    this.previewed = { node, mtime: node.mtime, editor };
  }

  previewFrameWindow() {
    const frame = this.ui.preview.querySelector('iframe.frame');
    try {
      return frame?.contentWindow?.document ? frame.contentWindow : null;
    } catch {
      return null;
    }
  }

  readScroll() {
    const frame = this.previewFrameWindow();
    return { top: this.ui.preview.scrollTop, frame: frame && [frame.scrollX, frame.scrollY] };
  }

  restoreScroll(scroll) {
    this.ui.preview.scrollTop = scroll?.top ?? 0;
    const frame = this.ui.preview.querySelector('iframe.frame');
    if (!frame || !scroll?.frame) return;
    frame.addEventListener('load', () => this.previewFrameWindow()?.scrollTo(...scroll.frame), { once: true });
  }

  scrollPreview(direction) {
    const target = this.previewFrameWindow() ?? this.ui.preview;
    const height = (target.innerHeight ?? target.clientHeight) * 0.85;
    target.scrollBy({ top: direction * height });
  }

  setExpanded(node, expanded) {
    node.expanded = expanded;
    if (expanded) this.expanded.add(node.url);
    else this.expanded.delete(node.url);
    this.savePrefs();
  }

  async toggle(node, expanded = !node.expanded) {
    if (expanded && !node.children) {
      try {
        await node.load();
      } catch {
        return;
      }
    }
    this.setExpanded(node, expanded);
    this.renderTree();
  }

  setFilter(filter) {
    this.view.filter = filter;
    this.renderTree();
  }

  setView(change) {
    Object.assign(this.view, change);
    this.ui.hidden.classList.toggle('on', this.view.showHidden);
    this.savePrefs();
    this.renderTree();
    this.showPreview(this.selected ?? this.root);
  }

  savePrefs() {
    Object.assign(this.prefs, { sort: this.view.sort, showHidden: this.view.showHidden, expanded: [...this.expanded] });
    savePrefs(this.prefs);
  }

  openRoot(url) {
    location.href = url;
  }

  openUrl(url) {
    const target = url.split('#')[0];
    if (target.startsWith(this.root.url) && target !== this.root.url) {
      this.reveal(target).then((node) => (node ? this.select(node) : this.openRoot(target)));
    } else {
      this.openRoot(target);
    }
  }

  goUp() {
    if (!this.segments.length) return;
    location.href = `${new URL('../', this.root.url).href}#${this.segments.at(-1)}/`;
  }

  onTreeClick(event) {
    const row = event.target.closest('.row');
    if (!row) return;
    const { node } = this.rows[Number(row.dataset.index)];
    if (node.isDir && (event.target.classList.contains('twisty') || node === this.selected)) this.toggle(node);
    else if (node.isDir) {
      this.select(node);
      this.toggle(node, true);
    } else this.select(node);
  }

  onPreviewClick(event) {
    const link = event.target.closest('.markdown a[href]');
    if (!link) return;
    event.preventDefault();
    if (!(event.metaKey || event.ctrlKey)) return;
    const href = link.getAttribute('href');
    if (href.startsWith('#')) {
      this.ui.preview.querySelector(`[id="${CSS.escape(decode(href.slice(1)))}"]`)?.scrollIntoView({ block: 'start' });
      return;
    }
    const target = new URL(href, this.previewed.node.url);
    if (!FOLLOWABLE.has(target.protocol)) return;
    if (target.protocol === 'file:') this.openUrl(target.href);
    else window.open(target.href, '_blank', 'noopener');
  }

  onKey(event) {
    if (event.target === this.ui.filter) {
      if (event.key === 'Escape') {
        this.ui.filter.value = '';
        this.setFilter('');
        this.ui.tree.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault();
        this.ui.tree.focus();
        if (this.rows.length) this.select(this.rows[0].node);
      }
      return;
    }
    if (isTyping(event.target)) return;
    if ((event.metaKey && event.key === 'ArrowUp') || (event.key === 'Backspace' && !event.metaKey)) {
      event.preventDefault();
      this.goUp();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const shortcuts = {
      '/': () => this.ui.filter.focus(),
      '.': () => this.setView({ showHidden: !this.view.showHidden }),
      r: () => this.refresh(),
    };
    if (shortcuts[event.key]) {
      event.preventDefault();
      shortcuts[event.key]();
      return;
    }
    if (this.ui.preview.contains(document.activeElement)) return;
    const navigation = {
      ArrowDown: () => this.moveBy(1),
      ArrowUp: () => this.moveBy(-1),
      Home: () => this.moveTo(0),
      End: () => this.moveTo(this.rows.length - 1),
      ArrowRight: () => this.expandOrEnter(),
      ArrowLeft: () => this.collapseOrLeave(),
      Enter: () => this.selected?.isDir && this.openRoot(this.selected.url),
      ' ': () => this.scrollPreview(event.shiftKey ? -1 : 1),
      PageDown: () => this.scrollPreview(1),
      PageUp: () => this.scrollPreview(-1),
    };
    if (navigation[event.key]) {
      event.preventDefault();
      this.ui.tree.focus();
      navigation[event.key]();
    }
  }

  selectedIndex() {
    return this.rows.findIndex((row) => row.node === this.selected);
  }

  moveTo(index) {
    const row = this.rows[Math.max(0, Math.min(this.rows.length - 1, index))];
    if (row) this.select(row.node);
  }

  moveBy(delta) {
    const index = this.selectedIndex();
    this.moveTo(index === -1 ? 0 : index + delta);
  }

  expandOrEnter() {
    const node = this.selected;
    if (!node?.isDir) return;
    if (!node.expanded) this.toggle(node, true);
    else this.moveBy(1);
  }

  collapseOrLeave() {
    const node = this.selected;
    if (!node) return;
    if (node.isDir && node.expanded) this.toggle(node, false);
    else if (node.parent !== this.root) this.select(node.parent);
  }

  startResize(event) {
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (e) => {
      const width = Math.max(MIN_TREE_WIDTH, Math.min(window.innerWidth - MIN_PREVIEW_WIDTH, e.clientX));
      this.prefs.treeWidth = Math.round(width);
      this.ui.app.style.setProperty('--tree-width', `${this.prefs.treeWidth}px`);
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      this.savePrefs();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('lostpointercapture', stop, { once: true });
  }

  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const dirs = [this.root];
      const collect = (node) => {
        for (const child of node.children ?? []) {
          if (child.isDir && child.expanded && child.children) {
            dirs.push(child);
            collect(child);
          }
        }
      };
      collect(this.root);
      const selectedDir = this.selected?.isDir && this.selected.children && !dirs.includes(this.selected) ? this.selected : null;
      if (selectedDir) dirs.push(selectedDir);
      const results = await Promise.allSettled(dirs.map((dir) => dir.load()));
      const changedDirs = new Set(dirs.filter((_, i) => results[i].status === 'fulfilled' && results[i].value));
      if (!changedDirs.size) return;
      if (this.selected && !this.selected.parent.children.includes(this.selected)) {
        this.selected = null;
        history.replaceState(null, '', this.root.url);
      }
      this.renderTree();
      const shown = this.previewed?.node;
      if (!shown) return;
      const stale = shown.isDir ? changedDirs.has(shown) : shown.parent.children.includes(shown) && shown.mtime !== this.previewed.mtime;
      if (stale) {
        this.previewed.mtime = shown.mtime;
        const { editor } = this.previewed;
        if (!editor || (await editor.needsReload())) this.showPreview(shown);
      } else if (!this.selected && shown !== this.root) this.showPreview(this.root);
    } finally {
      this.refreshing = false;
    }
  }
}

export async function start() {
  await new Viewer(await loadPrefs()).init();
}
