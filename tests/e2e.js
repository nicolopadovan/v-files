import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { installHost } from '../scripts/install-host.js';

const extension = resolve('extension');
const work = realpathSync(mkdtempSync(join(tmpdir(), 'v-files-')));
const folder = join(work, 'fixture');
cpSync(resolve('tests/fixture'), folder, { recursive: true });
const folderUrl = `file://${folder}/`;
installHost(join(work, 'profile', 'NativeMessagingHosts'), join(work, 'apps'));

const context = await chromium.launchPersistentContext(join(work, 'profile'), {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
const problems = [];
const page = await context.newPage();
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));

const rowNames = () => page.locator('.tree .row .name').allTextContents();
const previewTitle = () => page.locator('.preview-head h1').textContent();

async function waitForFile(file, ready, timeout = 10000) {
  const until = Date.now() + timeout;
  while (!ready(readFileSync(file, 'utf8'))) {
    if (Date.now() > until) {
      const banner = await page.locator('.banner:not([hidden])').allTextContents();
      throw new Error(`${file} never matched; it reads:\n${readFileSync(file, 'utf8')}\nbanner: ${banner.join(' | ') || 'none'}`);
    }
    await new Promise((done) => setTimeout(done, 100));
  }
}

const steps = {
  async 'shows the folder as a tree with hidden files filtered out'() {
    await page.goto(folderUrl);
    await page.waitForSelector('#vfiles .tree .row');
    assert.deepEqual(await rowNames(), ['img', 'notes', 'report', 'data.bin', 'data.csv', 'README.md']);
    assert.equal(await page.title(), 'fixture');
    assert.equal(await previewTitle(), 'fixture');
  },
  async 'renders markdown sanitized, with relative images resolved'() {
    await page.locator('.row', { hasText: 'README.md' }).click();
    await page.waitForSelector('.markdown h2');
    assert.equal(await page.locator('.markdown h2').textContent(), 'Second section');
    assert.equal(await page.locator('.markdown table td').first().textContent(), '1');
    assert.equal(await page.locator('.markdown img[alt="pixel"]').evaluate((img) => img.complete && img.naturalWidth), 1);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(new URL(page.url()).hash, '#README.md');
  },
  async 'follows a markdown link into a subfolder, expanding the tree'() {
    await page.locator('.markdown a', { hasText: 'link to the note' }).click({ modifiers: ['Meta'] });
    await page.waitForFunction(() => document.querySelector('.preview-head h1')?.textContent === 'note one.md');
    assert.deepEqual(await rowNames(), ['img', 'notes', 'deep', 'note one.md', 'report', 'data.bin', 'data.csv', 'README.md']);
  },
  async 'navigates with the keyboard'() {
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => document.querySelector('.preview-head h1')?.textContent === 'deep');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.preview-head h1')?.textContent === 'plain.txt');
    assert.equal(await page.locator('pre.text').textContent(), 'plain text\n');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('.row.selected .name').textContent(), 'deep');
  },
  async 'filters by name'() {
    await page.keyboard.press('/');
    await page.keyboard.type('plain');
    assert.deepEqual(await rowNames(), ['notes', 'deep', 'plain.txt']);
    await page.keyboard.press('Escape');
    assert.equal((await rowNames()).length > 3, true);
  },
  async 'toggles hidden files'() {
    await page.keyboard.press('.');
    assert.deepEqual((await rowNames()).slice(0, 3), ['.hidden-dir', 'img', 'notes']);
    await page.keyboard.press('.');
  },
  async 'previews images'() {
    await page.locator('.row', { hasText: 'img' }).click();
    await page.locator('.row', { hasText: 'pixel.png' }).click();
    await page.waitForSelector('.media img');
    await page.waitForFunction(() => document.querySelector('.media img').naturalWidth === 1);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
  },
  async 'runs HTML with its scripts, styles and relative images'() {
    await page.goto(`${folderUrl}#report/index.html`);
    const frame = page.frameLocator('iframe.frame');
    await frame.locator('#title', { hasText: 'Scripted' }).waitFor();
    assert.equal(await frame.locator('#title').evaluate((el) => getComputedStyle(el).color), 'rgb(200, 0, 0)');
    await frame.locator('#pixel').evaluate((img) => img.decode());
    const box = await page.locator('iframe.frame').boundingBox();
    assert.ok(box.height > 400, `frame is ${box.height}px tall`);
    await frame.locator('a', { hasText: 'to the end' }).click();
    assert.equal(new URL(page.url()).hash, '#report/index.html');
    assert.ok(await frame.locator('body').evaluate(() => window.scrollY > 1000));
  },
  async 'reloads HTML on change and keeps its scroll position'() {
    const frame = page.frameLocator('iframe.frame');
    const before = await frame.locator('body').evaluate(() => window.scrollY);
    const file = join(folder, 'report/index.html');
    writeFileSync(file, readFileSync(file, 'utf8').replace('Scripted', 'Rescripted'));
    await frame.locator('#title', { hasText: 'Rescripted' }).waitFor({ timeout: 20000 });
    await page.waitForFunction((y) => document.querySelector('iframe.frame').contentWindow.scrollY === y, before, { timeout: 5000 });
  },
  async 'scrolls the preview from the tree with Space'() {
    await page.locator('.tree').focus();
    await page.evaluate(() => document.querySelector('iframe.frame').contentWindow.scrollTo(0, 0));
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('iframe.frame').contentWindow.scrollY > 100);
  },
  async 'shows CSV as a sortable table'() {
    await page.locator('.row', { hasText: 'data.csv' }).click();
    await page.waitForSelector('table.grid');
    assert.deepEqual(await page.locator('.grid thead th:not(.gutter)').allTextContents(), ['Cliente', 'Importo', 'Note']);
    const column = (i) => page.locator(`.grid tbody tr td:nth-child(${i + 1})`).allTextContents();
    assert.deepEqual(await column(1), ['Rossi; Mario', 'Bianchi', 'Verdi']);
    assert.equal(await page.locator('.grid tbody tr').first().locator('td').nth(3).textContent(), 'riga\nsu due');
    assert.equal(await page.locator('.grid thead th').nth(2).getAttribute('class'), 'num');
    await page.locator('.grid th', { hasText: 'Importo' }).click();
    assert.deepEqual(await column(2), ['10', '99,9', '1.200,50']);
    await page.locator('.grid th', { hasText: 'Importo' }).click();
    assert.deepEqual(await column(2), ['1.200,50', '99,9', '10']);
  },
  async 'resizes CSV columns and rows, and keeps them across reloads'() {
    const header = page.locator('.grid th', { hasText: 'Cliente' });
    const width = async () => (await header.boundingBox()).width;
    const before = await width();
    const handle = await header.locator('.col-resize').boundingBox();
    await page.mouse.move(handle.x + 4, handle.y + 10);
    await page.mouse.down();
    await page.mouse.move(handle.x + 84, handle.y + 10, { steps: 5 });
    await page.mouse.up();
    assert.ok(Math.abs((await width()) - (before + 80)) <= 2, `width ${before} -> ${await width()}`);
    assert.equal(await page.locator('.grid th[aria-sort]').count(), 1, 'resizing must not sort');

    const row = page.locator('.grid tbody tr').nth(1);
    const height = async () => (await row.boundingBox()).height;
    const rowBefore = await height();
    const grip = await row.locator('.row-resize').boundingBox();
    await page.mouse.move(grip.x + 10, grip.y + 4);
    await page.mouse.down();
    await page.mouse.move(grip.x + 10, grip.y + 64, { steps: 5 });
    await page.mouse.up();
    assert.ok(Math.abs((await height()) - (rowBefore + 60)) <= 2, `height ${rowBefore} -> ${await height()}`);

    await page.locator('.row', { hasText: 'README.md' }).click();
    await page.waitForSelector('.markdown h1');
    await page.locator('.row', { hasText: 'data.csv' }).click();
    await page.waitForSelector('table.grid');
    assert.ok(Math.abs((await width()) - (before + 80)) <= 2);
    assert.ok(Math.abs((await height()) - (rowBefore + 60)) <= 2);

    await header.locator('.col-resize').dblclick();
    assert.ok(Math.abs((await width()) - before) <= 2, 'double-click fits the column');
  },
  async 'shows binary files as a notice'() {
    await page.locator('.row', { hasText: 'data.bin' }).click();
    await page.waitForSelector('.preview .notice');
    assert.match(await page.locator('.preview .notice').textContent(), /Binary/);
  },
  async 'picks up new files and edits without reloading'() {
    await page.locator('.row', { hasText: 'README.md' }).click();
    await page.waitForSelector('.markdown h2');
    await page.locator('.preview').evaluate((el) => { el.querySelector('.markdown').style.paddingBottom = '3000px'; el.scrollTop = 500; });
    writeFileSync(join(folder, 'new.md'), '# New\n');
    writeFileSync(join(folder, 'README.md'), `# Edited\n\n${'line\n\n'.repeat(200)}`);
    await page.waitForFunction(() => [...document.querySelectorAll('.tree .name')].some((n) => n.textContent === 'new.md'), null, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('.markdown h1')?.textContent === 'Edited', null, { timeout: 20000 });
    assert.equal(await page.locator('.preview').evaluate((el) => el.scrollTop), 500);
  },
  async 'viewing and clicking into markdown never writes it'() {
    const file = join(folder, 'new.md');
    await page.locator('.row', { hasText: 'new.md' }).click();
    await page.waitForFunction(() => document.querySelector('.markdown h1')?.textContent === 'New');
    assert.equal(await page.locator('.preview-head .characters').textContent(), '3 characters');
    await page.locator('.markdown h1').click();
    await page.waitForTimeout(1800);
    assert.equal(readFileSync(file, 'utf8'), '# New\n');
  },
  async 'formats markdown while typing and autosaves it'() {
    const file = join(folder, 'new.md');
    await page.locator('.markdown h1').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Typed heading');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Some **bold** text and - a dash');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- first item');
    assert.equal(await page.locator('.markdown h2').textContent(), 'Typed heading');
    assert.equal(await page.locator('.markdown strong').textContent(), 'bold');
    assert.equal(await page.locator('.markdown ul li').textContent(), 'first item');
    assert.equal(await page.locator('.preview-head .characters').textContent(), '53 characters');
    await waitForFile(file, (text) => text.includes('* first item') || text.includes('- first item'));
    await page.locator('.save-status', { hasText: /^Saved / }).waitFor();
    assert.match(readFileSync(file, 'utf8'), /^# New\n\n## Typed heading\n\nSome \*\*bold\*\* text and - a dash\n\n[*-] first item\n$/);
  },
  async 'saves while typing without pauses'() {
    const file = join(folder, 'new.md');
    const started = Date.now();
    let typed = 0;
    let savedWhileTyping = false;
    while (Date.now() - started < 4000) {
      await page.keyboard.type('x');
      typed += 1;
      await page.waitForTimeout(150);
      savedWhileTyping ||= readFileSync(file, 'utf8').includes('itemxx');
    }
    assert.ok(savedWhileTyping, 'nothing was saved during 4 s of continuous typing');
    for (let i = 0; i < typed; i += 1) await page.keyboard.press('Backspace');
    await waitForFile(file, (text) => !text.includes('itemx'));
  },
  async 'asks before overwriting a file that changed on disk, and can keep my version'() {
    const file = join(folder, 'new.md');
    await page.keyboard.type(' mine');
    writeFileSync(file, '# Theirs\n');
    await page.locator('.banner', { hasText: 'changed on disk' }).waitFor({ timeout: 20000 });
    assert.equal(readFileSync(file, 'utf8'), '# Theirs\n');
    await page.locator('.banner button', { hasText: 'Keep my version' }).click();
    await waitForFile(file, (text) => text.includes('first item mine'));
    assert.equal(await page.locator('.banner').isHidden(), true);
  },
  async 'or reloads the version on disk'() {
    const file = join(folder, 'new.md');
    await page.locator('.markdown li').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' again');
    writeFileSync(file, '# Disk wins\n');
    await page.locator('.banner button', { hasText: 'Reload' }).click({ timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('.markdown h1')?.textContent === 'Disk wins');
    await page.waitForTimeout(1500);
    assert.equal(readFileSync(file, 'utf8'), '# Disk wins\n');
  },
  async 'goes up to the enclosing folder with the current one selected'() {
    await page.keyboard.press('Meta+ArrowUp');
    await page.waitForFunction(() => document.querySelector('.row.selected .name')?.textContent === 'fixture');
    assert.equal(page.url(), `file://${work}/#fixture/`);
  },
  async 'opening a markdown file directly lands in the viewer'() {
    await page.goto(`${folderUrl}notes/note%20one.md`);
    await page.waitForFunction(() => document.querySelector('.preview-head h1')?.textContent === 'note one.md');
    assert.equal(page.url(), `${folderUrl}notes/#note%20one.md`);
  },
  async 'remembers expanded folders across visits'() {
    await page.goto(folderUrl);
    await page.waitForSelector('#vfiles .tree .row');
    assert.ok((await rowNames()).includes('note one.md'));
  },
};

let failed = 0;
try {
  for (const [name, step] of Object.entries(steps)) {
    try {
      await step();
      console.log(`✔ ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`✖ ${name}\n  ${error.message.split('\n').join('\n  ')}`);
      break;
    }
  }
  if (problems.length) {
    failed += 1;
    console.log(`✖ page errors:\n  ${problems.join('\n  ')}`);
  }
} finally {
  await context.close();
  rmSync(work, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
