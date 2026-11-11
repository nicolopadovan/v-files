import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { HOST_NAME } from '../extension/src/host-name.js';

const ROOT = resolve(import.meta.dirname, '..');
const APP_NAME = 'v-files Saver';
const EXECUTABLE = 'v-files-saver';
const FOLDER_REASON = 'v-files saves the Markdown files you edit in Chrome.';

export function unpackedExtensionId(extensionDir) {
  const hex = createHash('sha256').update(extensionDir).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const infoPlist = () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>io.github.nicolopadovan.v-files-saver</string>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleExecutable</key><string>${EXECUTABLE}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
  <key>NSDocumentsFolderUsageDescription</key><string>${FOLDER_REASON}</string>
  <key>NSDesktopFolderUsageDescription</key><string>${FOLDER_REASON}</string>
  <key>NSDownloadsFolderUsageDescription</key><string>${FOLDER_REASON}</string>
  <key>NSRemovableVolumesUsageDescription</key><string>${FOLDER_REASON}</string>
  <key>NSNetworkVolumesUsageDescription</key><string>${FOLDER_REASON}</string>
  <key>NSFileProviderDomainUsageDescription</key><string>${FOLDER_REASON}</string>
</dict>
</plist>
`;

function buildApp(appsDir) {
  const app = join(appsDir, `${APP_NAME}.app`);
  rmSync(app, { recursive: true, force: true });
  mkdirSync(join(app, 'Contents/MacOS'), { recursive: true });
  writeFileSync(join(app, 'Contents/Info.plist'), infoPlist());
  const executable = join(app, 'Contents/MacOS', EXECUTABLE);
  execFileSync('xcrun', ['swiftc', '-O', join(ROOT, 'host/main.swift'), '-o', executable], { stdio: 'inherit' });
  execFileSync('codesign', ['--force', '--sign', '-', app], { stdio: 'pipe' });
  return executable;
}

export function installHost(hostsDir, appsDir = join(homedir(), 'Applications')) {
  const manifest = {
    name: HOST_NAME,
    description: 'Saves Markdown files edited in v-files',
    path: buildApp(appsDir),
    type: 'stdio',
    allowed_origins: [`chrome-extension://${unpackedExtensionId(join(ROOT, 'extension'))}/`],
  };
  mkdirSync(hostsDir, { recursive: true });
  const target = join(hostsDir, `${HOST_NAME}.json`);
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.platform !== 'darwin') {
    console.error('v-files Saver is macOS-only. The viewer works without it; Markdown edits just will not save.');
    process.exit(1);
  }
  const { values } = parseArgs({ options: { dir: { type: 'string' } } });
  const dir = values.dir ?? join(homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts');
  console.log(`Installed ${installHost(dir)}`);
}
