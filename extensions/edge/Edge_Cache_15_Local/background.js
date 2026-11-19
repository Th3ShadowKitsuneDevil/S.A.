"use strict";

const ALARM = "clear-edge-cache-15-minutes";
const INTERVAL_MINUTES = 15;
let inFlight = null;

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM);
  if (!existing) {
    await chrome.alarms.create(ALARM, {
      delayInMinutes: INTERVAL_MINUTES,
      periodInMinutes: INTERVAL_MINUTES
    });
  }
}

async function clearBrowserCache() {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { includeCacheStorage } = await chrome.storage.local.get({
      includeCacheStorage: false
    });

    const dataTypes = { cache: true };
    if (includeCacheStorage) dataTypes.cacheStorage = true;

    // No cookies, history, passwords, site localStorage, IndexedDB, or
    // service-worker registrations are removed.
    await chrome.browsingData.remove(
      {
        since: 0,
        originTypes: {
          unprotectedWeb: true,
          protectedWeb: true
        }
      },
      dataTypes
    );

    const finishedAt = Date.now();
    await chrome.storage.local.set({ lastRun: finishedAt, lastError: null });
    return { ok: true, finishedAt, includeCacheStorage };
  })().catch(async error => {
    const message = error?.message || String(error);
    await chrome.storage.local.set({ lastError: message });
    throw error;
  }).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm().catch(console.error);
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== ALARM) return;
  (async () => {
    const { enabled } = await chrome.storage.local.get({ enabled: true });
    if (enabled) await clearBrowserCache();
  })().catch(console.error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== "clearNow") return false;
  clearBrowserCache()
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

// Browser alarms may be discarded on restart; recover if necessary.
ensureAlarm().catch(console.error);
