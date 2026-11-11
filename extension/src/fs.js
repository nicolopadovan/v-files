async function send(to, message) {
  try {
    return await chrome.runtime.sendMessage({ ...message, to });
  } catch (error) {
    if (error.message.includes('Receiving end does not exist')) return undefined;
    throw error;
  }
}

function unwrap(reply) {
  if (!reply) throw new Error('v-files is out of date. Reload it in chrome://extensions.');
  if (reply.error) throw new Error(reply.error);
  return reply;
}

async function read(message) {
  const reply = await send('reader', message);
  if (reply) return unwrap(reply);
  unwrap(await send('background', { type: 'ensureReader' }));
  return unwrap(await send('reader', message));
}

export const listDir = async (url) => (await read({ type: 'list', url })).entries;

export const readFile = (url) => read({ type: 'read', url });

export const writeFile = async (url, text, base) => unwrap(await send('background', { type: 'write', url, text, base }));
