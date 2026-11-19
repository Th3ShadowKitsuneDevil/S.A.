'use strict';

const ALARM_NAME = 'edge-cache-15-clear';
const INTERVAL_MINUTES = 15;

const DEFAULTS = Object.freeze({
  enabled: true,
  clearCacheStorage: false,
  lastClearAt: 0,
  lastClearResult: ''
});

async function getState() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return {
    enabled: stored.enabled !== false,
    clearCacheStorage: !!stored.clearCacheStorage,
    lastClearAt: Number(stored.lastClearAt) || 0,
    lastClearResult: String(stored.lastClearResult || '')
  };
}

async function ensureAlarm() {
  const state = await getState();

  if (!state.enabled) {
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }

  const existing = await chrome.alarms.get(ALARM_NAME);

  if (!existing || existing.periodInMinutes !== INTERVAL_MINUTES) {
    await chrome.alarms.clear(ALARM_NAME);
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: INTERVAL_MINUTES,
      periodInMinutes: INTERVAL_MINUTES
    });
  }
}

async function clearSelectedCache(reason = 'scheduled') {
  const state = await getState();

  if (reason === 'scheduled' && !state.enabled) {
    return { ok: false, skipped: true, reason: 'disabled' };
  }

  try {
    await chrome.browsingData.removeCache({ since: 0 });

    if (state.clearCacheStorage) {
      await chrome.browsingData.removeCacheStorage({ since: 0 });
    }

    const now = Date.now();
    const resultText = state.clearCacheStorage
      ? 'HTTP cache + Cache Storage cleared'
      : 'HTTP cache cleared';

    await chrome.storage.local.set({
      lastClearAt: now,
      lastClearResult: resultText
    });

    return {
      ok: true,
      clearedAt: now,
      clearCacheStorage: state.clearCacheStorage,
      result: resultText
    };
  } catch (error) {
    const resultText = `Clear failed: ${String(error)}`;

    await chrome.storage.local.set({
      lastClearAt: Date.now(),
      lastClearResult: resultText
    });

    return { ok: false, error: String(error), result: resultText };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get([
    'enabled',
    'clearCacheStorage',
    'lastClearAt',
    'lastClearResult'
  ]);

  await chrome.storage.local.set({
    enabled: typeof current.enabled === 'boolean' ? current.enabled : DEFAULTS.enabled,
    clearCacheStorage: typeof current.clearCacheStorage === 'boolean' ? current.clearCacheStorage : DEFAULTS.clearCacheStorage,
    lastClearAt: Number(current.lastClearAt) || DEFAULTS.lastClearAt,
    lastClearResult: String(current.lastClearResult || DEFAULTS.lastClearResult)
  });

  await ensureAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    clearSelectedCache('scheduled');
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.enabled) ensureAlarm();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'CLEAR_NOW':
        sendResponse(await clearSelectedCache('manual'));
        break;

      case 'GET_STATUS': {
        const state = await getState();
        const alarm = await chrome.alarms.get(ALARM_NAME);
        sendResponse({
          ok: true,
          ...state,
          intervalMinutes: INTERVAL_MINUTES,
          nextClearAt: alarm?.scheduledTime || 0
        });
        break;
      }

      case 'SET_ENABLED':
        await chrome.storage.local.set({ enabled: !!message.enabled });
        await ensureAlarm();
        sendResponse({ ok: true });
        break;

      case 'SET_CACHE_STORAGE':
        await chrome.storage.local.set({ clearCacheStorage: !!message.enabled });
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: 'Unknown request.' });
    }
  })().catch(error => {
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});

ensureAlarm();
