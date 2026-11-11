import { h } from './dom.js';
import { kindOf } from './filetypes.js';
import { csvTable } from './csvtable.js';
import { formatDate, formatSize } from './format.js';
import { readFile } from './fs.js';
import { htmlFrame } from './htmlframe.js';
import { MarkdownEditor } from './mdeditor.js';
import { sortedChildren } from './tree.js';

const MAX_TEXT_BYTES = 5_000_000;

const versioned = (node) => `${node.url}?v=${node.mtime}`;

const notice = (text) => h('p', { class: 'notice' }, text);

async function readText(node) {
  if (node.size > MAX_TEXT_BYTES) return { tooLarge: true };
  return readFile(node.url);
}

function folderTable(node, ctx) {
  const children = sortedChildren(node, ctx.view);
  if (!children.length) return notice('Empty folder');
  return h(
    'table',
    { class: 'listing' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Modified'), h('th', {}, 'Size'))),
    h(
      'tbody',
      {},
      children.map((child) =>
        h(
          'tr',
          { onClick: () => ctx.select(child), onDblclick: () => child.isDir && ctx.openRoot(child.url) },
          h('td', {}, h('span', { class: `icon ${child.isDir ? 'dir' : 'file'}` }), child.name),
          h('td', {}, formatDate(child.mtime)),
          h('td', {}, child.isDir ? '' : formatSize(child.size)),
        ),
      ),
    ),
  );
}

const BODIES = {
  async markdown(node, ctx) {
    const file = await readText(node);
    if (file.tooLarge) return notice('Too large to preview');
    return MarkdownEditor.open(node, file.text ?? '', { onReload: ctx.reload });
  },
  image: (node) => h('div', { class: 'media' }, h('img', { src: versioned(node), alt: node.name })),
  pdf: (node) => h('iframe', { class: 'frame', src: versioned(node) }),
  async html(node) {
    const file = await readText(node);
    if (file.tooLarge) return notice('Too large to preview');
    return htmlFrame(file.text ?? '', node.url);
  },
  async csv(node) {
    const file = await readText(node);
    if (file.tooLarge) return notice('Too large to preview');
    if (file.binary) return notice('Binary file. Use Open.');
    const { Papa } = await import('../vendor/csv.js');
    const { data, meta } = Papa.parse(file.text, { skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t', '|'] });
    if (!data.length) return notice('Empty file');
    return csvTable(data, meta.delimiter, node.url);
  },
  video: (node) => h('div', { class: 'media' }, h('video', { src: versioned(node), controls: true })),
  audio: (node) => h('div', { class: 'media' }, h('audio', { src: versioned(node), controls: true })),
  document: () => notice('No preview for this file type. Use Open.'),
  async text(node) {
    const file = await readText(node);
    if (file.tooLarge) return notice('Too large to preview');
    if (file.binary) return notice('Binary file. Use Open.');
    return h('pre', { class: 'text' }, file.text);
  },
};

export async function buildPreview(node, ctx) {
  const kind = node.isDir ? 'folder' : kindOf(node.name);
  const meta = node.isDir ? formatDate(node.mtime) : `${formatSize(node.size)} · ${formatDate(node.mtime)}`;
  let body;
  let editor = null;
  try {
    if (node.isDir) {
      if (!node.children) await node.load();
      body = folderTable(node, ctx);
    } else {
      body = await BODIES[kind](node, ctx);
    }
    if (body instanceof MarkdownEditor) {
      editor = body;
      body = editor.element;
    }
  } catch (error) {
    body = notice(`Could not read this ${node.isDir ? 'folder' : 'file'}: ${error.message}`);
  }
  const element = h(
    'div',
    { class: `preview-content kind-${kind}` },
    h(
      'header',
      { class: 'preview-head' },
      h('h1', {}, node.name),
      h('span', { class: 'meta' }, meta),
      editor?.characters,
      editor?.status,
      node.isDir
        ? h('button', { class: 'link', onClick: () => ctx.openRoot(node.url) }, 'Open folder')
        : kind !== 'markdown' && h('a', { class: 'link', href: node.url, target: '_blank' }, 'Open'),
    ),
    body,
  );
  return { element, editor };
}
