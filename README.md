# v-files

A quickly put together file explorer for Chrome. It's a personal tool, shared as is: expect rough edges, and don't expect support.

It turns Chrome's plain `file://` folder pages into a file viewer: a folder tree, breadcrumbs with an up button, and a preview pane that shows images, PDFs, HTML, CSV tables, media and text, and edits Markdown in place.

## Install

You need Chrome (or another Chromium browser). No build step is needed: the built bundles are in the repo.

1. Download the repo (**Code → Download ZIP**, then unzip it) or `git clone` it. Keep it where it is: Chrome loads the extension from that folder.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `extension` folder.
3. Click the extension's **Details** and turn on **Allow access to file URLs**. Without it, nothing happens.
4. Open any folder in Chrome, for example `file:///Users/` on a Mac or `file:///C:/` on Windows.

Opening a `.md` file directly lands in the viewer with that file selected. If another Markdown extension also runs on file URLs, turn off its file access.

### Saving Markdown edits (optional, macOS only)

Viewing works everywhere. To save Markdown you edit, Chrome needs a small helper app, because extensions can't write files on their own. It needs macOS with Node.js and the Xcode command-line tools (`xcode-select --install`):

```sh
npm install
npm run install-host
```

This builds **v-files Saver** (`host/main.swift`) into `~/Applications` and registers it with Chrome. It writes only to existing `.md` and `.markdown` files. The first save in Documents, Desktop or Downloads makes macOS ask whether v-files Saver may access that folder: allow it. If you move the repo folder, load the extension again and rerun `npm run install-host`, because Chrome derives the extension's ID from its folder path.

## Keys

| Key | Action |
| --- | --- |
| ↑ ↓ Home End | Move |
| → ← | Expand / collapse, or step in / out |
| Enter | Open the selected folder as the root |
| ⌘↑ or ⌫ | Enclosing folder |
| / | Filter by name (Esc clears) |
| . | Show hidden files |
| Space, ⇧Space, PgUp, PgDn | Scroll the preview |
| r | Refresh (also automatic every 2 s) |

CSV and TSV files show as a table. The separator (comma, semicolon, tab or pipe) is detected automatically. Click a column header to sort it ascending, descending, then back to file order. Number columns align right, and with `;` files the comma is read as the decimal separator. Only the first 5,000 rows are shown. Drag a column header's right edge to resize it (double-click to fit the content), or a row number's bottom edge to make the row taller so its text wraps (double-click to reset). Sizes and sort order stay while the page is open, also when the file reloads.

HTML files run with their scripts, styles and relative assets. A file that changes on disk reloads in place and keeps its scroll position (PDFs reload at the top: Chrome's PDF viewer doesn't expose its position).

## Editing Markdown

Markdown files open ready to edit and format as you type: `## ` starts a heading, `**bold**` turns bold, `- ` starts a list, and ⌘B / ⌘I work. Your changes save about a second after you stop typing, and at least every 2 seconds while you keep typing. The top right of the header shows Unsaved, Saving…, Saved with the time, or Not saved in red. Next to the file size the header shows the character count with spaces, as the text reads (Markdown syntax and paragraph breaks are not counted), updated as you type. Just viewing a file never writes to it. Saving rewrites the file in a normalized Markdown style.

⌘-click a link to follow it. A plain click puts the cursor in the link.

If the file changes on disk while you have unsaved edits, a banner lets you **Reload** the disk version or **Keep my version**. Without unsaved edits it reloads silently.

The selected file lives in the URL hash (`folder/#sub/file.md`), so links and reloads keep it.

## Develop

```sh
npm install
npm run build    # bundles Milkdown and PapaParse into extension/vendor, with their licenses
npm test         # unit tests + Playwright end-to-end run in Chromium
```

## License

MIT, see [LICENSE](LICENSE). The bundled third-party code is listed with its licenses in [extension/vendor/THIRD_PARTY_LICENSES.md](extension/vendor/THIRD_PARTY_LICENSES.md).
