const DEFAULTS = { sort: 'name', showHidden: false, treeWidth: 300, expanded: [] };
const MAX_EXPANDED = 500;

export async function loadPrefs() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

export function savePrefs(prefs) {
  return chrome.storage.local.set({ ...prefs, expanded: prefs.expanded.slice(-MAX_EXPANDED) });
}
