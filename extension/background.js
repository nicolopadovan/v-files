import { HOST_NAME } from './src/host-name.js';

let creating = null;
let readerReady = null;

async function ensureReader() {
  if (!creating && (await chrome.offscreen.hasDocument())) return;
  creating ??= new Promise((resolve, reject) => {
    readerReady = resolve;
    chrome.offscreen
      .createDocument({
        url: 'reader.html',
        reasons: ['DOM_PARSER'],
        justification: 'Reads file:// folder listings and files for the viewer.',
      })
      .catch(reject);
  }).finally(() => (creating = null));
  await creating;
}

const handlers = {
  ensureReader,
  async readerReady() {
    readerReady?.();
  },
  async write({ url, text, base }) {
    const reply = await chrome.runtime.sendNativeMessage(HOST_NAME, { type: 'write', path: decodeURIComponent(new URL(url).pathname), text, base });
    if (reply.error) throw new Error(reply.error);
    return reply;
  },
};

chrome.runtime.onInstalled.addListener(ensureReader);
chrome.runtime.onStartup.addListener(ensureReader);

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const handler = message.to === 'background' && handlers[message.type];
  if (!handler) return false;
  handler(message).then((result) => reply(result ?? {}), (error) => reply({ error: error.message }));
  return true;
});
