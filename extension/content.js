(async () => {
  const { pathname } = location;
  if (!pathname.endsWith('/')) {
    const slash = pathname.lastIndexOf('/');
    location.replace(`file://${pathname.slice(0, slash + 1)}#${pathname.slice(slash + 1)}`);
    return;
  }
  if (document.readyState === 'loading') {
    await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  const { start } = await import(chrome.runtime.getURL('src/main.js'));
  await start();
})();
