const KINDS = {
  markdown: ['md', 'markdown', 'mdown', 'mkd'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'heic'],
  pdf: ['pdf'],
  video: ['mp4', 'webm', 'mov', 'm4v'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'],
  html: ['html', 'htm'],
  csv: ['csv', 'tsv'],
  document: ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'pages', 'numbers', 'key', 'zip', 'dmg'],
};

const byExtension = new Map(Object.entries(KINDS).flatMap(([kind, exts]) => exts.map((ext) => [ext, kind])));

export function kindOf(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'text';
  return byExtension.get(name.slice(dot + 1).toLowerCase()) ?? 'text';
}
