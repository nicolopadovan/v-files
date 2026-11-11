import { listDir } from './fs.js';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const COMPARE = {
  name: (a, b) => collator.compare(a.name, b.name),
  modified: (a, b) => b.mtime - a.mtime || collator.compare(a.name, b.name),
  size: (a, b) => b.size - a.size || collator.compare(a.name, b.name),
};

export const SORTS = Object.keys(COMPARE);

export class TreeNode {
  constructor({ name, url, isDir, size = 0, mtime = 0 }, parent = null) {
    Object.assign(this, { name, url, isDir, size, mtime, parent });
    this.children = null;
    this.expanded = false;
  }

  get hidden() {
    return this.name.startsWith('.');
  }

  async load() {
    const entries = await listDir(this.url);
    const previous = new Map((this.children ?? []).map((child) => [child.url, child]));
    let changed = this.children === null || previous.size !== entries.length;
    this.children = entries.map((entry) => {
      const url = new URL(entry.href, this.url).href;
      const existing = previous.get(url);
      if (!existing) {
        changed = true;
        return new TreeNode({ ...entry, url }, this);
      }
      if (existing.mtime !== entry.mtime || existing.size !== entry.size) changed = true;
      existing.mtime = entry.mtime;
      existing.size = entry.size;
      return existing;
    });
    return changed;
  }

  ancestors() {
    const chain = [];
    for (let node = this.parent; node; node = node.parent) chain.push(node);
    return chain;
  }
}

export function sortedChildren(node, { sort, showHidden }) {
  return (node.children ?? [])
    .filter((child) => showHidden || !child.hidden)
    .sort((a, b) => b.isDir - a.isDir || COMPARE[sort](a, b));
}

export function visibleRows(root, view) {
  const query = view.filter.trim().toLowerCase();
  const matches = (node) =>
    node.name.toLowerCase().includes(query) ||
    (node.isDir && sortedChildren(node, view).some(matches));
  const rows = [];
  const walk = (node, depth) => {
    for (const child of sortedChildren(node, view)) {
      if (query && !matches(child)) continue;
      rows.push({ node: child, depth });
      if (child.isDir && (child.expanded || query)) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}
