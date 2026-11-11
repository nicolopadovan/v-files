const ROW = /<script>addRow\((.*)\);<\/script>/g;

export function parseListing(html) {
  const entries = [];
  for (const [, args] of html.matchAll(ROW)) {
    let fields;
    try {
      fields = JSON.parse(`[${args}]`);
    } catch {
      continue;
    }
    const [name, href, isDir, size, , mtime] = fields;
    if (name === '.' || name === '..') continue;
    const dir = isDir === 1;
    entries.push({ name, href: dir ? `${href}/` : href, isDir: dir, size: dir ? 0 : size, mtime: mtime * 1000 });
  }
  return entries;
}
