import { parseListing } from './src/listing.js';

const BINARY_SNIFF_BYTES = 8000;

const handlers = {
  async list({ url }) {
    const response = await fetch(url);
    return { entries: parseListing(await response.text()) };
  },
  async read({ url }) {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { binary: true };
    return { text: new TextDecoder().decode(bytes) };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.to !== 'reader') return false;
  handlers[message.type](message).then(reply, (error) => reply({ error: error.message }));
  return true;
});

chrome.runtime.sendMessage({ to: 'background', type: 'readerReady' });
