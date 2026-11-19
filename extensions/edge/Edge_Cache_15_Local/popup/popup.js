'use strict';

const enabled = document.getElementById('enabled');
const cacheStorage = document.getElementById('cacheStorage');
const clearNow = document.getElementById('clearNow');
const result = document.getElementById('result');
const last = document.getElementById('last');
const next = document.getElementById('next');

function formatTime(value) {
  if (!value) return 'Not yet';
  try { return new Date(value).toLocaleString(); } catch { return 'Unknown'; }
}

async function send(message) {
  return chrome.runtime.sendMessage(message);
}

async function refresh() {
  const status = await send({ type: 'GET_STATUS' });

  if (!status?.ok) {
    result.textContent = 'Unable to read extension status.';
    last.textContent = '';
    next.textContent = '';
    return;
  }

  enabled.checked = !!status.enabled;
  cacheStorage.checked = !!status.clearCacheStorage;
  result.textContent = status.lastClearResult || 'Ready.';
  last.textContent = `Last clear: ${formatTime(status.lastClearAt)}`;
  next.textContent = status.enabled
    ? `Next automatic clear: ${formatTime(status.nextClearAt)}`
    : 'Automatic clearing is disabled.';
}

enabled.addEventListener('change', async () => {
  await send({ type: 'SET_ENABLED', enabled: enabled.checked });
  await refresh();
});

cacheStorage.addEventListener('change', async () => {
  await send({ type: 'SET_CACHE_STORAGE', enabled: cacheStorage.checked });
  await refresh();
});

clearNow.addEventListener('click', async () => {
  clearNow.disabled = true;
  result.textContent = 'Clearing cache…';

  try {
    const response = await send({ type: 'CLEAR_NOW' });
    result.textContent = response?.result || (response?.ok ? 'Cache cleared.' : 'Cache clear failed.');
  } finally {
    clearNow.disabled = false;
    await refresh();
  }
});

refresh();
