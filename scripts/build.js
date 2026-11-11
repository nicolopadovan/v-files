import { build } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { metafile } = await build({
  entryPoints: { editor: 'bundles/editor.js', csv: 'bundles/csv.js' },
  outdir: 'extension/vendor',
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'chrome120',
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
});

function packageRoot(input) {
  const parts = input.split('/');
  const at = parts.lastIndexOf('node_modules');
  const nameLength = parts[at + 1].startsWith('@') ? 2 : 1;
  return parts.slice(0, at + 1 + nameLength).join('/');
}

function licenseText(root) {
  const file = readdirSync(root).find((name) => /^(licen[cs]e|copying)(\.|$)/i.test(name));
  return file ? readFileSync(join(root, file), 'utf8').trim() : null;
}

const roots = new Set(Object.keys(metafile.inputs).filter((input) => input.includes('node_modules/')).map(packageRoot));
const notices = [...roots].sort().map((root) => {
  const { name, version, license } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const text = licenseText(root);
  if (!text) throw new Error(`${name} ships no license file; add its notice by hand`);
  return `## ${name}@${version} (${license})\n\n${text}\n`;
});

writeFileSync(
  'extension/vendor/THIRD_PARTY_LICENSES.md',
  `# Third-party licenses\n\nextension/vendor bundles these packages.\n\n${notices.join('\n')}`,
);
