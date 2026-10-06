const WATCH_KEY = 'nfeDownloadWatch';
const PENDING_KEY = 'nfePendingDownload';
const WATCH_WINDOW_MS = 15 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'nfe:watch-download' || !sender.tab?.id) return;
  chrome.storage.local.set({ [WATCH_KEY]: { tabId: sender.tab.id, armedAt: Date.now(), expiresAt: Date.now() + WATCH_WINDOW_MS } })
    .then(() => sendResponse({ armed: true }))
    .catch(() => sendResponse({ armed: false }));
  return true;
});

chrome.downloads.onCreated.addListener(async item => {
  const { [WATCH_KEY]: watch } = await chrome.storage.local.get(WATCH_KEY);
  if (!watch) return;
  if (watch.expiresAt < Date.now()) {
    await chrome.storage.local.remove(WATCH_KEY);
    return;
  }
  const officialSite = value => {
    try { return new URL(value).hostname === 'www.nfe.fazenda.gov.br'; }
    catch { return false; }
  };
  if (!officialSite(item.url) && !officialSite(item.referrer || '')) return;
  await chrome.storage.local.set({ [PENDING_KEY]: { downloadId: item.id, tabId: watch.tabId } });
  await chrome.storage.local.remove(WATCH_KEY);
  if (item.state === 'complete') await closeAfterDownload(item.id);
});

chrome.downloads.onChanged.addListener(async delta => {
  if (delta.state?.current !== 'complete' && delta.state?.current !== 'interrupted') return;
  const { [PENDING_KEY]: pending } = await chrome.storage.local.get(PENDING_KEY);
  if (!pending || pending.downloadId !== delta.id) return;
  if (delta.state.current === 'complete') await closeAfterDownload(delta.id);
  else await chrome.storage.local.remove(PENDING_KEY);
});

async function closeAfterDownload(downloadId) {
  const { [PENDING_KEY]: pending } = await chrome.storage.local.get(PENDING_KEY);
  if (!pending || pending.downloadId !== downloadId) return;
  await chrome.storage.local.remove(PENDING_KEY);
  try { await chrome.tabs.remove(pending.tabId); } catch { /* The user may already have closed the tab. */ }
}
