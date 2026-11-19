'use strict';

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  mode: 'duration-asc',
  auto: true,
  fullQueue: true,
  followPlayback: true,
  wrapSortedPlayback: true,
  debug: false
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    'settings',
    'queueLocks',
    'dateCache'
  ]);

  await chrome.storage.local.set({
    settings: {
      ...DEFAULT_SETTINGS,
      ...(stored.settings || {})
    },
    queueLocks: stored.queueLocks || {},
    dateCache: stored.dateCache || {}
  });
});
