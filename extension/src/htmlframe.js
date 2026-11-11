import { h } from './dom.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads';
const BASE_AFTER = [/<head\b[^>]*>/i, /<html\b[^>]*>/i, /<!doctype[^>]*>/i];

export function withBase(html, url) {
  const tag = `<base href="${url.replaceAll('"', '%22')}">`;
  for (const pattern of BASE_AFTER) {
    const match = pattern.exec(html);
    if (match) {
      const at = match.index + match[0].length;
      return html.slice(0, at) + tag + html.slice(at);
    }
  }
  return tag + html;
}

function scrollAnchorsInPlace(frame) {
  const doc = frame.contentDocument;
  doc?.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    (doc.getElementById(id) ?? doc.getElementsByName(id)[0])?.scrollIntoView();
  });
}

export function htmlFrame(html, url) {
  const frame = h('iframe', { class: 'frame', sandbox: SANDBOX, srcdoc: withBase(html, url) });
  frame.addEventListener('load', () => scrollAnchorsInPlace(frame));
  return frame;
}
