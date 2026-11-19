(() => {
  'use strict';

  const TAG = '[Kindred Smart Queue v4]';
  const REQUEST = 'kindred-smart-queue:req';
  const RESPONSE = 'kindred-smart-queue:res';
  const PANEL = 'ytd-playlist-panel-renderer#playlist';
  const ROW = 'ytd-playlist-panel-video-renderer';

  const DEFAULTS = Object.freeze({
    enabled: true,
    mode: 'duration-asc',
    auto: true,
    fullQueue: true,
    debug: false
  });

  const state = {
    settings: { ...DEFAULTS },
    locks: {},
    dates: {},
    dateLoading: new Map(),
    shuffleRanks: new Map(),
    plan: [],
    identity: '',
    applying: false,
    applyAgain: false,
    applyTimer: 0,
    observer: null,
    observedPanel: null,
    lastSignature: '',
    lastUrl: location.href,
    lastStatus: 'Waiting for YouTube’s native queue…',
    bridgeCounter: 0
  };

  function log(...args) {
    if (state.settings.debug) console.debug(TAG, ...args);
  }

  function nativeRequest(action, payload = {}, timeout = 6000) {
    const id = `${Date.now().toString(36)}-${++state.bridgeCounter}-${Math.random().toString(36).slice(2)}`;

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve({ ok: false, reason: 'bridge-timeout' });
      }, timeout);

      function onMessage(event) {
        if (event.source !== window) return;
        const message = event.data;
        if (!message || message.channel !== RESPONSE || message.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(message.result || { ok: false, reason: 'empty-response' });
      }

      window.addEventListener('message', onMessage);
      window.postMessage({ channel: REQUEST, id, action, payload }, '*');
    });
  }

  function norm(value) {
    return String(value || '')
      .normalize('NFKD')
      .toLocaleLowerCase();
  }

  function compareUnknown(a, b, direction = 1) {
    const aUnknown = a == null || Number.isNaN(a);
    const bUnknown = b == null || Number.isNaN(b);
    if (aUnknown && bUnknown) return 0;
    if (aUnknown) return 1;
    if (bUnknown) return -1;
    return a < b ? -direction : a > b ? direction : 0;
  }

  function rank(key) {
    if (!state.shuffleRanks.has(key)) {
      state.shuffleRanks.set(key, Math.random());
    }
    return state.shuffleRanks.get(key);
  }

  function comparator(mode) {
    switch (mode) {
      case 'duration-asc':
        return (a, b) => compareUnknown(a.duration, b.duration, 1) || a.native - b.native;
      case 'duration-desc':
        return (a, b) => compareUnknown(a.duration, b.duration, -1) || a.native - b.native;
      case 'date-newest':
        return (a, b) => compareUnknown(a.releaseDate, b.releaseDate, -1) || a.native - b.native;
      case 'date-oldest':
        return (a, b) => compareUnknown(a.releaseDate, b.releaseDate, 1) || a.native - b.native;
      case 'title-asc':
        return (a, b) => norm(a.title).localeCompare(norm(b.title)) || a.native - b.native;
      case 'title-desc':
        return (a, b) => norm(b.title).localeCompare(norm(a.title)) || a.native - b.native;
      case 'channel-asc':
        return (a, b) => norm(a.channel).localeCompare(norm(b.channel)) || a.native - b.native;
      case 'channel-desc':
        return (a, b) => norm(b.channel).localeCompare(norm(a.channel)) || a.native - b.native;
      case 'reverse':
        return (a, b) => b.native - a.native;
      case 'shuffle':
        return (a, b) => rank(a.key) - rank(b.key);
      default:
        return (a, b) => a.native - b.native;
    }
  }

  function primaryComparator(mode) {
    switch (mode) {
      case 'duration-asc': return (a, b) => compareUnknown(a.duration, b.duration, 1);
      case 'duration-desc': return (a, b) => compareUnknown(a.duration, b.duration, -1);
      case 'date-newest': return (a, b) => compareUnknown(a.releaseDate, b.releaseDate, -1);
      case 'date-oldest': return (a, b) => compareUnknown(a.releaseDate, b.releaseDate, 1);
      case 'title-asc': return (a, b) => norm(a.title).localeCompare(norm(b.title));
      case 'title-desc': return (a, b) => norm(b.title).localeCompare(norm(a.title));
      case 'channel-asc': return (a, b) => norm(a.channel).localeCompare(norm(b.channel));
      case 'channel-desc': return (a, b) => norm(b.channel).localeCompare(norm(a.channel));
      default: return () => 0;
    }
  }

  function labelMode(mode) {
    return ({
      manual: 'Manual / YouTube order',
      'duration-asc': 'Duration: shortest first',
      'duration-desc': 'Duration: longest first',
      'date-newest': 'Release date: newest first',
      'date-oldest': 'Release date: oldest first',
      'title-asc': 'Title: A → Z',
      'title-desc': 'Title: Z → A',
      'channel-asc': 'Channel: A → Z',
      'channel-desc': 'Channel: Z → A',
      reverse: 'Reverse queue order',
      shuffle: 'Shuffle'
    })[mode] || mode;
  }

  function needsDates() {
    return state.settings.mode === 'date-newest' || state.settings.mode === 'date-oldest';
  }

  async function fetchDate(videoId) {
    if (!videoId) return null;
    if (Object.hasOwn(state.dates, videoId)) return state.dates[videoId];
    if (state.dateLoading.has(videoId)) return state.dateLoading.get(videoId);

    const promise = (async () => {
      let value = null;

      try {
        const response = await fetch(
          `/watch?v=${encodeURIComponent(videoId)}&hl=en`,
          { credentials: 'same-origin', cache: 'force-cache' }
        );

        if (response.ok) {
          const text = await response.text();
          const match =
            text.match(/"publishDate":"([^"]+)"/) ||
            text.match(/"uploadDate":"([^"]+)"/);

          if (match) {
            const parsed = Date.parse(match[1]);
            if (Number.isFinite(parsed)) value = parsed;
          }
        }
      } catch {}

      state.dates[videoId] = value;
      state.dateLoading.delete(videoId);
      await chrome.storage.local.set({ dateCache: state.dates });
      return value;
    })();

    state.dateLoading.set(videoId, promise);
    return promise;
  }

  async function ensureDates(items) {
    const missing = items.filter(
      item => item.videoId && !Object.hasOwn(state.dates, item.videoId)
    );

    if (!missing.length) return;

    let next = 0;
    let done = 0;
    state.lastStatus = `Loading release dates: 0/${missing.length}…`;

    const worker = async () => {
      while (next < missing.length) {
        const item = missing[next++];
        await fetchDate(item.videoId);
        done++;
        state.lastStatus = `Loading release dates: ${done}/${missing.length}…`;
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(4, missing.length) }, () => worker())
    );
  }

  function decorate(snapshot) {
    return snapshot.items.map((item, native) => ({
      ...item,
      native,
      releaseDate: item.videoId && Object.hasOwn(state.dates, item.videoId)
        ? state.dates[item.videoId]
        : null
    }));
  }

  function lockCompatible(lock, identity, items) {
    if (!lock) return false;
    if (lock.identity !== identity) return false;
    if (lock.mode !== state.settings.mode) return false;
    if (lock.fullQueue !== state.settings.fullQueue) return false;
    if (!Array.isArray(lock.order)) return false;

    const current = new Set(items.map(item => item.key));
    const overlap = lock.order.filter(key => current.has(key)).length;
    const denominator = Math.max(1, Math.min(lock.order.length, current.size));
    return overlap / denominator >= 0.5;
  }

  function reconcileLockedOrder(lockOrder, items) {
    const byKey = new Map(items.map(item => [item.key, item]));
    const existing = [];
    const seen = new Set();

    for (const key of lockOrder) {
      const item = byKey.get(key);
      if (!item) continue;
      existing.push(item);
      seen.add(key);
    }

    const added = items.filter(item => !seen.has(item.key));
    if (!added.length) return existing;

    if (state.settings.mode === 'shuffle') {
      const out = [...existing];
      for (const item of added) {
        const slot = Math.floor(Math.random() * (out.length + 1));
        out.splice(slot, 0, item);
      }
      return out;
    }

    if (state.settings.mode === 'reverse') {
      return [...added.sort((a, b) => b.native - a.native), ...existing];
    }

    const compare = primaryComparator(state.settings.mode);
    const out = [...existing];

    for (const item of added) {
      let at = out.findIndex(other => compare(item, other) < 0);
      if (at < 0) at = out.length;
      out.splice(at, 0, item);
    }

    return out;
  }

  function buildPlan(items, snapshot, identity, forceRebuild) {
    if (state.settings.mode === 'manual') return [...items];

    if (!state.settings.fullQueue) {
      const currentIndex = Number.isFinite(snapshot.currentIndex)
        ? snapshot.currentIndex
        : items.findIndex(item => item.selected);
      const lockedCount = currentIndex >= 0 ? currentIndex + 1 : 0;
      const prefix = items.slice(0, lockedCount);
      const suffix = [...items.slice(lockedCount)].sort(comparator(state.settings.mode));
      return [...prefix, ...suffix];
    }

    const lock = state.locks[identity];
    if (!forceRebuild && lockCompatible(lock, identity, items)) {
      return reconcileLockedOrder(lock.order, items);
    }

    return [...items].sort(comparator(state.settings.mode));
  }

  async function persistLock(identity, plan) {
    const order = plan.map(item => item.key);
    const current = state.locks[identity];

    if (
      current &&
      current.mode === state.settings.mode &&
      current.fullQueue === state.settings.fullQueue &&
      Array.isArray(current.order) &&
      current.order.length === order.length &&
      current.order.every((key, index) => key === order[index])
    ) {
      return;
    }

    const next = {
      ...state.locks,
      [identity]: {
        identity,
        mode: state.settings.mode,
        fullQueue: state.settings.fullQueue,
        order,
        updated: Date.now()
      }
    };

    state.locks = next;
    await chrome.storage.local.set({ queueLocks: next });
  }

  function signature(snapshot) {
    return `${snapshot.playlistId}|${snapshot.currentIndex}|${snapshot.items.map(item => item.key).join(',')}`;
  }

  async function applySort({ quiet = false, forceRebuild = false } = {}) {
    if (state.applying) {
      state.applyAgain = true;
      return;
    }

    state.applying = true;

    try {
      if (!state.settings.enabled) {
        state.plan = [];
        state.lastStatus = 'Extension disabled.';
        return;
      }

      const response = await nativeRequest('SNAPSHOT');
      const snapshot = response?.snapshot;

      if (!response?.ok || !snapshot?.present) {
        state.plan = [];
        state.identity = '';
        state.lastStatus = 'No active YouTube queue found.';
        ensureObserver();
        return;
      }

      if (!snapshot.isQueue) {
        state.plan = [];
        state.identity = snapshot.playlistId || '';
        state.lastStatus = 'Saved playlist detected — not rewriting your saved playlist.';
        return;
      }

      let items = decorate(snapshot);
      const identity = `queue:${snapshot.playlistId}`;
      state.identity = identity;

      if (state.settings.mode === 'manual') {
        state.plan = items;
        state.lastStatus = 'Manual / YouTube order — native queue left alone.';
        return;
      }

      if (needsDates()) {
        await ensureDates(items);
        items = decorate(snapshot);
      }

      const plan = buildPlan(items, snapshot, identity, forceRebuild);
      const targetKeys = plan.map(item => item.key);

      const result = await nativeRequest(
        'APPLY_ORDER',
        { keys: targetKeys },
        Math.max(8000, targetKeys.length * 250)
      );

      if (!result?.ok) {
        const reason = result?.reason || 'unknown';
        const text = ({
          'no-panel': 'YouTube queue panel is not ready for native reorder yet.',
          'queue-changed': 'YouTube changed the queue while it was being sorted; retrying.',
          'verification-failed': 'Native reorder ran, but YouTube did not confirm the final order.',
          'bridge-timeout': 'Native queue bridge timed out.',
          'saved-playlist': 'Saved playlist detected — not rewriting your saved playlist.'
        })[reason] || `Native queue reorder failed: ${reason}`;

        state.lastStatus = text;
        log(text, result);

        if (reason === 'queue-changed' && state.settings.auto) {
          scheduleApply(700, 'queue-changed');
        }
        return;
      }

      const fresh = result.snapshot;
      state.plan = decorate(fresh);
      state.lastSignature = signature(fresh);

      if (state.settings.fullQueue) {
        await persistLock(identity, plan);
      }

      const current = Number.isFinite(fresh.currentIndex) ? fresh.currentIndex : -1;
      const position = current >= 0
        ? ` • current ${current + 1}/${fresh.items.length}`
        : '';

      state.lastStatus =
        `${labelMode(state.settings.mode)} • native YouTube queue synchronized` +
        ` • ${result.moves || 0} move${result.moves === 1 ? '' : 's'}` +
        `${result.playerMatches ? ' • player confirmed' : ''}` +
        position;

      if (!quiet) log(state.lastStatus);
      ensureObserver();
    } finally {
      state.applying = false;

      if (state.applyAgain) {
        state.applyAgain = false;
        scheduleApply(250, 'queued-apply');
      }
    }
  }

  function scheduleApply(delay = 250, reason = 'change') {
    if (!state.settings.auto && reason !== 'manual') return;
    clearTimeout(state.applyTimer);
    state.applyTimer = setTimeout(
      () => applySort({ quiet: true }),
      delay
    );
  }

  function ensureObserver() {
    const panel = document.querySelector(PANEL);

    if (!panel) {
      state.observer?.disconnect();
      state.observer = null;
      state.observedPanel = null;
      return;
    }

    if (panel === state.observedPanel && state.observer) return;

    state.observer?.disconnect();
    state.observedPanel = panel;

    state.observer = new MutationObserver(records => {
      if (state.applying) {
        state.applyAgain = true;
        return;
      }

      const relevant = records.some(record =>
        [...record.addedNodes, ...record.removedNodes].some(node =>
          node instanceof Element &&
          (node.matches?.(ROW) || node.querySelector?.(ROW))
        )
      );

      if (relevant) scheduleApply(350, 'queue-mutation');
    });

    state.observer.observe(panel, {
      childList: true,
      subtree: true
    });
  }

  async function loadStoredState() {
    const stored = await chrome.storage.local.get([
      'settings',
      'queueLocks',
      'dateCache'
    ]);

    state.settings = { ...DEFAULTS, ...(stored.settings || {}) };
    // Drop obsolete v3 playback-control settings if they are still present.
    delete state.settings.followPlayback;
    delete state.settings.wrapSortedPlayback;
    state.locks = stored.queueLocks || {};
    state.dates = stored.dateCache || {};
  }

  async function updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    await chrome.storage.local.set({ settings: state.settings });
  }

  async function clearCurrentLock() {
    const identity = state.identity;
    if (!identity) return;
    const locks = { ...state.locks };
    delete locks[identity];
    state.locks = locks;
    await chrome.storage.local.set({ queueLocks: locks });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      switch (message?.type) {
        case 'GET_STATUS': {
          const diagnostics = state.settings.debug
            ? await nativeRequest('DIAGNOSTICS')
            : null;

          sendResponse({
            ok: true,
            status: state.lastStatus,
            identity: state.identity,
            planLength: state.plan.length,
            currentIndex: state.plan.findIndex(item => item.selected),
            settings: state.settings,
            diagnostics: diagnostics?.diagnostics || null,
            url: location.href
          });
          break;
        }

        case 'RELOAD_SETTINGS': {
          const stored = await chrome.storage.local.get('settings');
          state.settings = { ...DEFAULTS, ...(stored.settings || {}) };
          delete state.settings.followPlayback;
          delete state.settings.wrapSortedPlayback;
          await applySort({ forceRebuild: false });
          sendResponse({ ok: true });
          break;
        }

        case 'REBUILD': {
          await clearCurrentLock();
          if (state.settings.mode === 'shuffle') state.shuffleRanks.clear();
          await applySort({ forceRebuild: true });
          sendResponse({ ok: true, status: state.lastStatus });
          break;
        }

        case 'RESHUFFLE': {
          state.shuffleRanks.clear();
          await clearCurrentLock();
          if (state.settings.mode !== 'shuffle') {
            await updateSettings({ mode: 'shuffle' });
          }
          await applySort({ forceRebuild: true });
          sendResponse({ ok: true, status: state.lastStatus });
          break;
        }

        case 'CLEAR_LOCK': {
          await clearCurrentLock();
          await applySort({ forceRebuild: true });
          sendResponse({ ok: true, status: state.lastStatus });
          break;
        }

        case 'DIAGNOSTICS': {
          const result = await nativeRequest('DIAGNOSTICS');
          sendResponse(result);
          break;
        }

        default:
          sendResponse({ ok: false });
      }
    })().catch(error => {
      console.error(TAG, error);
      sendResponse({ ok: false, error: String(error) });
    });

    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.settings) {
      state.settings = { ...DEFAULTS, ...(changes.settings.newValue || {}) };
      delete state.settings.followPlayback;
      delete state.settings.wrapSortedPlayback;
      scheduleApply(100, 'manual');
    }

    if (changes.queueLocks) {
      state.locks = changes.queueLocks.newValue || {};
    }
  });

  document.addEventListener('yt-navigate-finish', () => {
    ensureObserver();
    scheduleApply(500, 'navigation');
  }, true);

  document.addEventListener('yt-page-data-updated', () => {
    ensureObserver();
    scheduleApply(500, 'navigation');
  }, true);

  setInterval(async () => {
    ensureObserver();

    if (!state.settings.auto || !state.settings.enabled || state.applying) return;

    const response = await nativeRequest('SNAPSHOT', {}, 2500);
    const snap = response?.snapshot;
    if (!response?.ok || !snap?.present || !snap.isQueue) return;

    const nextSignature = signature(snap);
    if (location.href !== state.lastUrl || nextSignature !== state.lastSignature) {
      state.lastUrl = location.href;
      state.lastSignature = nextSignature;
      scheduleApply(300, 'watchdog-change');
    }
  }, 5000);

  (async () => {
    await loadStoredState();
    ensureObserver();
    await applySort({ quiet: true });
    log('Loaded', state.settings);
  })().catch(error => console.error(TAG, error));
})();
