(() => {
  'use strict';

  const REQUEST = 'kindred-smart-queue:req';
  const RESPONSE = 'kindred-smart-queue:res';
  const TAG = '[Kindred Smart Queue native bridge]';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function safe(fn, fallback = null) {
    try {
      const value = fn();
      return value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  }

  const YT = {
    manager: () => document.querySelector('yt-playlist-manager'),
    player: () => document.querySelector('#movie_player'),
    app: () => document.querySelector('ytd-app'),
    panel: () => document.querySelector('ytd-playlist-panel-renderer#playlist'),
    panelRows() {
      const panel = YT.panel();
      return panel
        ? [...panel.querySelectorAll('ytd-playlist-panel-video-renderer')]
        : [];
    },
    data() {
      const manager = YT.manager();
      if (!manager || typeof manager.getPlaylistData !== 'function') return null;
      const data = safe(() => manager.getPlaylistData(), null);
      return data && Array.isArray(data.contents) ? data : null;
    },
    resolve(command) {
      const app = YT.app();
      if (!app || typeof app.resolveCommand !== 'function') return false;
      return safe(() => {
        app.resolveCommand(command);
        return true;
      }, false);
    }
  };

  function rendererOf(entry) {
    return entry?.playlistPanelVideoRenderer || null;
  }

  function makeKeys(contents) {
    const seen = new Map();

    return contents.map((entry, index) => {
      const renderer = rendererOf(entry);
      const setId = renderer?.playlistSetVideoId || '';
      const videoId = renderer?.videoId || '';
      const base = setId
        ? `set:${setId}`
        : videoId
          ? `video:${videoId}`
          : `index:${index}`;
      const occurrence = seen.get(base) || 0;
      seen.set(base, occurrence + 1);
      return occurrence ? `${base}:occ:${occurrence}` : base;
    });
  }

  function textFromRuns(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) {
      return value.runs.map(run => run?.text || '').join('');
    }
    return '';
  }

  function parseDuration(value) {
    const match = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .match(/(?:\d{1,3}:)?\d{1,2}:\d{2}/);

    if (!match) return null;
    const parts = match[0].split(':').map(Number);
    if (parts.some(Number.isNaN)) return null;
    return parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
  }

  function snapshot() {
    const data = YT.data();
    if (!data) {
      return {
        present: false,
        isQueue: false,
        playlistId: '',
        currentIndex: -1,
        items: [],
        playerPlaylist: []
      };
    }

    const keys = makeKeys(data.contents);
    const items = [];

    data.contents.forEach((entry, index) => {
      const renderer = rendererOf(entry);
      if (!renderer?.videoId) return;

      const badges = (renderer.badges || [])
        .map(badge => safe(() => badge[Object.keys(badge)[0]]?.style, ''))
        .filter(Boolean);
      const isLive = badges.some(style => /LIVE/.test(style));

      items.push({
        index,
        key: keys[index],
        setId: renderer.playlistSetVideoId || '',
        videoId: renderer.videoId,
        title: textFromRuns(renderer.title) || renderer.videoId,
        channel:
          textFromRuns(renderer.shortBylineText) ||
          textFromRuns(renderer.longBylineText) ||
          '',
        duration: isLive ? null : parseDuration(textFromRuns(renderer.lengthText)),
        selected: !!renderer.selected
      });
    });

    const playerPlaylist = safe(() => {
      const value = YT.player()?.getPlaylist?.();
      return Array.isArray(value) ? [...value] : [];
    }, []);

    return {
      present: true,
      isQueue: typeof data.playlistId === 'string' && data.playlistId.startsWith('TLPQ'),
      playlistId: data.playlistId || '',
      currentIndex: Number.isFinite(data.currentIndex)
        ? data.currentIndex
        : safe(() => YT.player()?.getPlaylistIndex?.(), -1),
      items,
      playerPlaylist
    };
  }

  function moveViaServer(from, to) {
    const data = YT.data();
    const contents = data?.contents;
    if (!data || !Array.isArray(contents) || !contents[from]) return 'error';
    if (!String(data.playlistId || '').startsWith('TLPQ')) return 'not-queue';

    const playerOwnsQueue = safe(
      () => YT.player()?.getPlaylistId?.() === data.playlistId,
      false
    );

    // When the active player owns the queue, a manager-only server edit can
    // desync the player. Refuse instead of creating another split-brain queue.
    if (playerOwnsQueue) return 'no-panel';

    const movingSetId = rendererOf(contents[from])?.playlistSetVideoId;
    if (!movingSetId) return 'error';

    const without = contents.filter((_, index) => index !== from);
    const predecessor = to > 0
      ? rendererOf(without[to - 1])?.playlistSetVideoId
      : null;

    const action = {
      action: 'ACTION_MOVE_VIDEO_AFTER',
      setVideoId: movingSetId
    };

    if (predecessor) {
      action.movedSetVideoIdPredecessor = predecessor;
    }

    const sent = YT.resolve({
      clickTrackingParams: '',
      commandMetadata: {
        webCommandMetadata: {
          sendPost: true,
          apiUrl: '/youtubei/v1/browse/edit_playlist'
        }
      },
      playlistEditEndpoint: {
        playlistId: data.playlistId,
        params: 'CAE%3D',
        actions: [action]
      }
    });

    if (!sent) return 'error';

    const manager = YT.manager();
    if (manager && typeof manager.setPlaylistData === 'function') {
      const next = safe(() => JSON.parse(JSON.stringify(data)), null);
      if (next) {
        const moved = next.contents.splice(from, 1)[0];
        next.contents.splice(to, 0, moved);
        safe(() => manager.setPlaylistData(next));
      }
    }

    return 'ok';
  }

  async function moveNative(from, to) {
    if (from === to) return 'noop';

    const before = snapshot();
    if (!before.present || !before.isQueue) return 'not-queue';

    to = Math.max(0, Math.min(to, before.items.length - 1));

    const panel = YT.panel();
    const controller = panel?.polymerController;
    const rows = YT.panelRows();

    if (
      controller &&
      typeof controller.handleDrop === 'function' &&
      rows.length === before.items.length &&
      rows[from]
    ) {
      const node = rows[from];
      const parent = node.parentNode;

      if (parent) {
        const others = rows.filter((_, index) => index !== from);

        try {
          parent.insertBefore(node, others[to] || null);
          controller.handleDrop({ currDragItem: node });
          await sleep(45);
          return 'ok';
        } catch (error) {
          console.warn(TAG, 'Native handleDrop failed.', error);
        }
      }
    }

    return moveViaServer(from, to);
  }

  async function applyOrder(targetKeys) {
    if (!Array.isArray(targetKeys) || !targetKeys.length) {
      return { ok: false, reason: 'empty-target', snapshot: snapshot() };
    }

    const initial = snapshot();
    if (!initial.present) {
      return { ok: false, reason: 'no-queue', snapshot: initial };
    }
    if (!initial.isQueue) {
      return { ok: false, reason: 'saved-playlist', snapshot: initial };
    }
    if (initial.items.length !== targetKeys.length) {
      return { ok: false, reason: 'queue-changed', snapshot: initial };
    }

    const targetSet = new Set(targetKeys);
    if (
      targetSet.size !== targetKeys.length ||
      initial.items.some(item => !targetSet.has(item.key))
    ) {
      return { ok: false, reason: 'target-mismatch', snapshot: initial };
    }

    let moves = 0;

    for (let targetIndex = 0; targetIndex < targetKeys.length; targetIndex++) {
      const live = snapshot();
      const currentKeys = live.items.map(item => item.key);
      const wanted = targetKeys[targetIndex];
      const from = currentKeys.indexOf(wanted);

      if (from < 0) {
        return {
          ok: false,
          reason: 'item-disappeared',
          moves,
          snapshot: live
        };
      }

      if (from === targetIndex) continue;

      const result = await moveNative(from, targetIndex);
      if (result !== 'ok' && result !== 'noop') {
        return {
          ok: false,
          reason: result,
          moves,
          snapshot: snapshot()
        };
      }

      moves++;
    }

    await sleep(80);
    const final = snapshot();
    const actualKeys = final.items.map(item => item.key);
    const managerMatches =
      actualKeys.length === targetKeys.length &&
      actualKeys.every((key, index) => key === targetKeys[index]);

    // The player list is videoId-only, so duplicates cannot be disambiguated
    // here. It is still useful as a second sanity check for ordinary queues.
    const expectedVideoIds = targetKeys.map(key => {
      return final.items.find(item => item.key === key)?.videoId || '';
    });
    const playerMatches =
      final.playerPlaylist.length === expectedVideoIds.length &&
      final.playerPlaylist.every((id, index) => id === expectedVideoIds[index]);

    return {
      ok: managerMatches,
      reason: managerMatches ? 'ok' : 'verification-failed',
      moves,
      managerMatches,
      playerMatches,
      snapshot: final
    };
  }

  async function handle(action, payload) {
    switch (action) {
      case 'SNAPSHOT':
        return { ok: true, snapshot: snapshot() };

      case 'APPLY_ORDER':
        return applyOrder(payload?.keys || []);

      case 'DIAGNOSTICS': {
        const snap = snapshot();
        const panel = YT.panel();
        return {
          ok: true,
          diagnostics: {
            playlistPresent: snap.present,
            playlistId: snap.playlistId,
            isQueue: snap.isQueue,
            itemCount: snap.items.length,
            manager: !!YT.manager(),
            player: !!YT.player(),
            panel: !!panel,
            panelRows: YT.panelRows().length,
            handleDrop: typeof panel?.polymerController?.handleDrop === 'function',
            playerPlaylistLength: snap.playerPlaylist.length
          }
        };
      }

      default:
        return { ok: false, reason: 'unknown-action' };
    }
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.channel !== REQUEST || !message.id) return;

    Promise.resolve(handle(message.action, message.payload))
      .then(result => {
        window.postMessage({
          channel: RESPONSE,
          id: message.id,
          result
        }, '*');
      })
      .catch(error => {
        window.postMessage({
          channel: RESPONSE,
          id: message.id,
          result: {
            ok: false,
            reason: 'bridge-error',
            error: String(error)
          }
        }, '*');
      });
  });
})();
