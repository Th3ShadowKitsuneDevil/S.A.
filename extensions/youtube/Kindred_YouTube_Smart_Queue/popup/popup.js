'use strict';

const DEFAULTS = Object.freeze({
  enabled: true,
  mode: 'duration-asc',
  auto: true,
  fullQueue: true,
  debug: false
});

const ids = ['enabled', 'mode', 'auto', 'fullQueue', 'debug'];
const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const status = document.getElementById('status');
const position = document.getElementById('position');

let settings = { ...DEFAULTS };
let activeTab = null;

function isYouTube(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'youtube.com' || host === 'www.youtube.com';
  } catch {
    return false;
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function send(type, extra = {}) {
  if (!activeTab?.id || !isYouTube(activeTab.url || '')) {
    return { ok: false, error: 'Open a YouTube tab first.' };
  }

  try {
    return await chrome.tabs.sendMessage(activeTab.id, { type, ...extra });
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function renderSettings() {
  elements.enabled.checked = !!settings.enabled;
  elements.mode.value = settings.mode;
  elements.auto.checked = !!settings.auto;
  elements.fullQueue.checked = !!settings.fullQueue;
  elements.debug.checked = !!settings.debug;
}

async function saveSettings() {
  settings = {
    enabled: elements.enabled.checked,
    mode: elements.mode.value,
    auto: elements.auto.checked,
    fullQueue: elements.fullQueue.checked,
    debug: elements.debug.checked
  };

  await chrome.storage.local.set({ settings });
  await send('RELOAD_SETTINGS');
  await refreshStatus();
}

async function refreshStatus() {
  activeTab = await getActiveTab();

  if (!activeTab || !isYouTube(activeTab.url || '')) {
    status.textContent = 'Open a YouTube watch/queue tab to use Smart Queue.';
    position.textContent = '';
    return;
  }

  const response = await send('GET_STATUS');

  if (!response?.ok) {
    status.textContent = 'YouTube is open, but the extension is not ready. Refresh the tab once after updating.';
    position.textContent = response?.error || '';
    return;
  }

  status.textContent = response.status || 'Ready.';

  if (response.planLength > 0) {
    position.textContent = response.identity
      ? `${response.planLength} native queue items • ${response.identity}`
      : `${response.planLength} native queue items`;
  } else {
    position.textContent = response.identity ? `Queue: ${response.identity}` : '';
  }
}

for (const element of Object.values(elements)) {
  element.addEventListener('change', saveSettings);
}

document.getElementById('rebuild').addEventListener('click', async () => {
  status.textContent = 'Rebuilding YouTube’s native queue…';
  await send('REBUILD');
  await refreshStatus();
});

document.getElementById('reshuffle').addEventListener('click', async () => {
  status.textContent = 'Reshuffling YouTube’s native queue…';
  const response = await send('RESHUFFLE');
  if (response?.ok) {
    const stored = await chrome.storage.local.get('settings');
    settings = { ...DEFAULTS, ...(stored.settings || {}) };
    renderSettings();
  }
  await refreshStatus();
});

document.getElementById('clearLock').addEventListener('click', async () => {
  status.textContent = 'Clearing lock…';
  await send('CLEAR_LOCK');
  await refreshStatus();
});

(async () => {
  const stored = await chrome.storage.local.get('settings');
  settings = { ...DEFAULTS, ...(stored.settings || {}) };
  renderSettings();
  await refreshStatus();
})();
