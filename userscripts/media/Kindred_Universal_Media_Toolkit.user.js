// ==UserScript==
// @name         Kindred Universal Media Toolkit
// @namespace    kindred-tech.local
// @version      2.0.0
// @description  Adaptive desktop/mobile media toolkit: popup/tab/multi-player, touch controls, YouTube live-chat cleanup, anti-rickroll, direct-media helper, and yt-dlp single/playlist command copier.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        *://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      api.jm26.net
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_Universal_Media_Toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_Universal_Media_Toolkit.user.js
// ==/UserScript==

(() => {
    'use strict';

    const APP = 'ktMediaToolkit';
    const VERSION = '2.0.0';
    const LIST_COUNT = 4;
    const CURRENT_LIST_KEY = `${APP}:currentList`;
    const LIST_KEY = n => `${APP}:list:${n}`;
    const FLOATING_BUTTON_KEY = `${APP}:floatingButton`;
    const POP_MODE = 'kt-media-popout';
    const POP_FRAME_MODE = 'kt-media-popout-frame';
    const PLAYLIST_TEMPLATE = '%(playlist)s/%(playlist_index)03d - %(title)s [%(id)s].%(ext)s';

    const isYouTube = /(^|\.)youtube\.com$/i.test(location.hostname) || /(^|\.)youtu\.be$/i.test(location.hostname);
    const isYouTubeMain = /(^|\.)youtube\.com$/i.test(location.hostname);
    const isTopWindow = (() => {
        try { return window.top === window.self; } catch (_) { return false; }
    })();

    const ENV = (() => {
        const ua = navigator.userAgent || '';
        const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
        const hoverNone = !!window.matchMedia?.('(hover: none)').matches;
        const small = Math.min(window.screen?.width || innerWidth || 9999, window.screen?.height || innerHeight || 9999) <= 820;
        const android = /Android/i.test(ua);
        const ios = /iPad|iPhone|iPod/i.test(ua);
        const mobileUA = /Android|Mobile|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);
        const mobile = coarse || hoverNone || small || mobileUA;
        const tablet = mobile && Math.max(window.screen?.width || 0, window.screen?.height || 0) >= 768;
        return { ua, coarse, hoverNone, small, android, ios, mobile, tablet };
    })();

    const RR = {
        storageKey: `${APP}:rickrollDB`,
        bypassPrefix: `${APP}:rr:bypass:`,
        apiUrl: 'https://api.jm26.net/rickroll-db/?type=get&api=userscript',
        updateInterval: 86400000,
        fallback: ['dQw4w9WgXcQ', 'oHg5SJYRHA0', 'cvh0nX08nRw', 'xfr64zoBTAQ', 'iik25wqIuFo']
    };

    function storageGet(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
        } catch (_) {}
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }

    function storageSet(key, value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, value);
                return;
            }
        } catch (_) {}
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    }

    function registerMenu(label, handler) {
        try {
            if (typeof GM_registerMenuCommand === 'function') {
                GM_registerMenuCommand(label, handler);
                return true;
            }
        } catch (_) {}
        return false;
    }

    function copyText(text, message = 'Copied') {
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text, 'text');
                toast(message);
                return;
            }
        } catch (_) {}

        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => toast(message))
                .catch(() => prompt('Copy this text:', text));
            return;
        }

        prompt('Copy this text:', text);
    }

    function fallbackDownload(url, name = '') {
        try {
            const a = document.createElement('a');
            a.href = url;
            if (name) a.download = name;
            a.rel = 'noopener noreferrer';
            a.target = ENV.mobile ? '_self' : '_blank';
            document.documentElement.appendChild(a);
            a.click();
            a.remove();
            return true;
        } catch (_) {
            try { location.href = url; return true; } catch (_) { return false; }
        }
    }

    function downloadUrl(url, name = '') {
        try {
            if (typeof GM_download === 'function') {
                GM_download({
                    url,
                    name: name || undefined,
                    saveAs: true,
                    onerror: () => fallbackDownload(url, name)
                });
                return;
            }
        } catch (_) {}
        fallbackDownload(url, name);
    }

    function safeUrl(value, base = location.href) {
        try { return new URL(value, base); } catch (_) { return null; }
    }

    function shellQuote(value) {
        return "'" + String(value).replace(/'/g, "'\\''") + "'";
    }

    function escapeHtml(s) {
        return String(s || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

    function toast(message) {
        if (!document.documentElement) return;
        let el = document.getElementById(`${APP}-toast`);
        if (!el) {
            el = document.createElement('div');
            el.id = `${APP}-toast`;
            el.style.cssText = `
                position:fixed;left:50%;bottom:${ENV.mobile ? '82px' : '38px'};z-index:2147483647;
                transform:translateX(-50%);padding:10px 14px;border-radius:10px;
                background:rgba(0,0,0,.88);color:#fff;font:13px/1.35 system-ui,-apple-system,sans-serif;
                box-shadow:0 3px 14px rgba(0,0,0,.35);pointer-events:none;
                max-width:min(92vw,560px);text-align:center;
            `;
            document.documentElement.appendChild(el);
        }
        el.textContent = message;
        el.style.display = 'block';
        clearTimeout(el._ktTimer);
        el._ktTimer = setTimeout(() => { el.style.display = 'none'; }, 1800);
    }

    function getCurrentListNumber() {
        const n = Number(storageGet(CURRENT_LIST_KEY, 1));
        return Number.isInteger(n) && n >= 1 && n <= LIST_COUNT ? n : 1;
    }

    function getList(n = getCurrentListNumber()) {
        const value = storageGet(LIST_KEY(n), []);
        return Array.isArray(value) ? value : [];
    }

    function setList(items, n = getCurrentListNumber()) {
        const seen = new Set();
        const clean = [];
        for (const item of items) {
            if (!item || typeof item.url !== 'string') continue;
            const key = `${item.kind || 'page'}|${item.url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            clean.push(item);
        }
        storageSet(LIST_KEY(n), clean);
        return clean;
    }

    function setCurrentListNumber(n) {
        if (!Number.isInteger(n) || n < 1 || n > LIST_COUNT) return;
        storageSet(CURRENT_LIST_KEY, n);
        toast(`List ${n} selected (${getList(n).length})`);
        refreshTouchPanel();
    }

    function stripToolkitMarker(url) {
        const u = safeUrl(url);
        if (!u) return url;
        let h = u.hash || '';
        for (const marker of [POP_MODE, POP_FRAME_MODE]) {
            h = h.replace(new RegExp(`([#&])${marker}=1(?=&|$)`, 'g'), '$1');
        }
        h = h.replace(/&&+/g, '&').replace(/^#&/, '#').replace(/&$/, '');
        if (h === '#') h = '';
        u.hash = h;
        return u.href;
    }

    function withMarker(url, marker) {
        const u = safeUrl(url);
        if (!u) return url;
        const text = `${marker}=1`;
        if (!u.hash) u.hash = text;
        else if (!new RegExp(`(?:^#|&)${marker}=1(?:&|$)`).test(u.hash)) u.hash += `&${text}`;
        return u.href;
    }

    function getYouTubeId(value = location.href) {
        const u = safeUrl(value);
        if (!u) return null;
        if (/youtu\.be$/i.test(u.hostname)) {
            const id = u.pathname.split('/').filter(Boolean)[0];
            return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
        }
        const v = u.searchParams.get('v');
        if (/^[A-Za-z0-9_-]{11}$/.test(v || '')) return v;
        const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
        return m ? m[1] : null;
    }

    function getVimeoId(value = location.href) {
        const u = safeUrl(value);
        if (!u || !/(^|\.)vimeo\.com$/i.test(u.hostname)) return null;
        const m = u.pathname.match(/\/(?:video\/)?(\d{6,})/);
        return m ? m[1] : null;
    }

    function largestMediaElement(root = document) {
        const els = [...root.querySelectorAll('video,audio')];
        if (!els.length) return null;
        return els.map(el => {
            const r = el.getBoundingClientRect();
            const area = Math.max(0, r.width) * Math.max(0, r.height);
            const visible = r.width > 20 && r.height > 20;
            const playing = !el.paused && !el.ended ? 1e12 : 0;
            return { el, score: playing + (visible ? 1e9 : 0) + area };
        }).sort((a, b) => b.score - a.score)[0].el;
    }

    function directMediaUrl(el) {
        if (!el) return null;
        const candidates = [el.currentSrc, el.src, ...[...el.querySelectorAll('source[src]')].map(s => s.src)];
        for (const value of candidates) {
            const u = safeUrl(value);
            if (u && /^https?:$/i.test(u.protocol)) return u.href;
        }
        return null;
    }

    function buildCurrentItem(url = location.href, title = document.title || location.hostname) {
        const yt = getYouTubeId(url);
        if (yt) return { kind: 'youtube', id: yt, url: stripToolkitMarker(url), title: title || `YouTube ${yt}` };

        const vim = getVimeoId(url);
        if (vim) return { kind: 'vimeo', id: vim, url: stripToolkitMarker(url), title: title || `Vimeo ${vim}` };

        const media = largestMediaElement();
        const direct = directMediaUrl(media);
        if (direct) {
            return {
                kind: media?.tagName === 'AUDIO' ? 'audio' : 'direct',
                url: direct,
                pageUrl: stripToolkitMarker(url),
                title: title || 'Direct media'
            };
        }
        return { kind: 'page', url: stripToolkitMarker(url), title: title || location.hostname };
    }

    function addCurrent() {
        const item = buildCurrentItem();
        const n = getCurrentListNumber();
        const list = getList(n);
        const key = `${item.kind}|${item.url}`;
        if (list.some(x => `${x.kind}|${x.url}` === key)) {
            toast(`Already in List ${n}`);
            return;
        }
        list.push(item);
        setList(list, n);
        toast(`Added to List ${n} (${list.length})`);
        refreshTouchPanel();
    }

    function clearCurrentList() {
        const n = getCurrentListNumber();
        setList([], n);
        toast(`Cleared List ${n}`);
        refreshTouchPanel();
    }

    function itemPlayerUrl(item, frameFallback = false) {
        if (!item) return null;
        if (item.kind === 'youtube' && item.id) {
            return `https://www.youtube.com/embed/${encodeURIComponent(item.id)}?autoplay=1&rel=0&playsinline=1`;
        }
        if (item.kind === 'vimeo' && item.id) {
            return `https://player.vimeo.com/video/${encodeURIComponent(item.id)}?autoplay=1`;
        }
        if (item.kind === 'direct' || item.kind === 'audio') return item.url;
        if (item.kind === 'page' && frameFallback) return withMarker(item.url, POP_FRAME_MODE);
        return null;
    }

    function multiHtml(items, title = 'Kindred Multi-Player') {
        const data = items.map(item => ({
            ...item,
            playerUrl: itemPlayerUrl(item, true),
            popUrl: item.kind === 'page' ? withMarker(item.url, POP_MODE) : (item.pageUrl || item.url)
        }));

        return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%;background:#000;font-family:system-ui,-apple-system,sans-serif}body{overflow:auto;-webkit-overflow-scrolling:touch}#grid{display:grid;gap:2px;background:#111;min-height:100dvh;padding:2px}.cell{position:relative;min-width:0;min-height:0;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;aspect-ratio:16/9}.framebox{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000}iframe,video,audio{display:block;border:0;width:100%;height:100%;background:#000;object-fit:contain}audio{height:84px;align-self:center}.controls{position:absolute;top:max(7px,env(safe-area-inset-top));right:7px;z-index:20;display:flex;gap:6px;opacity:1}.controls button{min-width:38px;height:38px;border:0;border-radius:9px;background:rgba(0,0,0,.78);color:#fff;font-size:19px;cursor:pointer;touch-action:manipulation}.label{position:absolute;left:7px;bottom:7px;z-index:15;max-width:72%;padding:4px 7px;border-radius:6px;background:rgba(0,0,0,.68);color:#fff;font:12px system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.empty{display:flex;align-items:center;justify-content:center;color:#aaa;min-height:100dvh;font-size:18px}
@media (hover:hover) and (pointer:fine){.controls,.label{opacity:0;transition:opacity .15s}.cell:hover .controls,.cell:hover .label{opacity:1}}
@media (orientation:portrait) and (max-width:820px){#grid{grid-template-columns:1fr!important;grid-auto-rows:auto}.cell{width:100%;min-height:56.25vw}}
</style></head><body><div id="grid"></div>
<script>
const ITEMS=${JSON.stringify(data)};const grid=document.getElementById('grid');
function makeCell(item){const cell=document.createElement('div');cell.className='cell';const box=document.createElement('div');box.className='framebox';let media;if(item.kind==='direct'||item.kind==='audio'){media=document.createElement(item.kind==='audio'?'audio':'video');media.src=item.playerUrl;media.controls=true;media.autoplay=true;media.playsInline=true}else{media=document.createElement('iframe');media.src=item.playerUrl;media.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';media.allowFullscreen=true}const ctl=document.createElement('div');ctl.className='controls';const close=document.createElement('button');close.textContent='×';close.title='Remove';close.onclick=()=>{cell.remove();layout()};const ext=document.createElement('button');ext.textContent='↗';ext.title='Open separately';ext.onclick=()=>window.open(item.popUrl||item.url||item.playerUrl,'_blank');ctl.append(close,ext);if(media.tagName==='VIDEO'&&document.pictureInPictureEnabled){const pip=document.createElement('button');pip.textContent='▣';pip.title='Picture in Picture';pip.onclick=()=>media.requestPictureInPicture?.();ctl.append(pip)}const label=document.createElement('div');label.className='label';label.textContent=item.title||item.url;box.append(media,ctl,label);cell.appendChild(box);return cell}
function layout(){const cells=[...grid.children];const n=cells.length;if(!n){grid.innerHTML='<div class="empty">No videos left</div>';return}const portrait=matchMedia('(orientation:portrait)').matches&&innerWidth<=820;if(portrait){grid.style.gridTemplateColumns='1fr';return}const W=innerWidth,H=innerHeight;let best={cols:1,area:0};for(let cols=1;cols<=n;cols++){const rows=Math.ceil(n/cols),bw=W/cols,bh=H/rows,vw=Math.min(bw,bh*16/9),vh=vw*9/16,area=vw*vh;if(area>best.area)best={cols,area}}grid.style.gridTemplateColumns='repeat('+best.cols+',minmax(0,1fr))'}
ITEMS.forEach(item=>grid.appendChild(makeCell(item)));layout();addEventListener('resize',layout);screen.orientation?.addEventListener?.('change',layout);
<\/script></body></html>`;
    }

    function openBlobHtml(html, name, popup = true) {
        const blob = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        let w = null;
        const useTab = ENV.mobile || !popup;
        if (useTab) {
            w = window.open(blob, '_blank');
        } else {
            const width = Math.min(1360, Math.max(760, Math.floor((screen.availWidth || innerWidth) * 0.74)));
            const height = Math.min(900, Math.max(500, Math.floor((screen.availHeight || innerHeight) * 0.74)));
            const left = Math.max(0, Math.floor(((screen.availWidth || innerWidth) - width) / 2));
            const top = Math.max(0, Math.floor(((screen.availHeight || innerHeight) - height) / 2));
            w = window.open(blob, name, `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
        }
        if (!w) {
            URL.revokeObjectURL(blob);
            toast(ENV.mobile ? 'New tab blocked — allow popups/tabs for this site' : 'Popup blocked — allow popups for this site');
            return null;
        }
        setTimeout(() => URL.revokeObjectURL(blob), 60000);
        return w;
    }

    function openMulti(popup = true) {
        const n = getCurrentListNumber();
        let items = getList(n);
        if (!items.length) items = [buildCurrentItem()];
        openBlobHtml(multiHtml(items, `Kindred Multi-Player — List ${n}`), `ktMediaList${n}`, ENV.mobile ? false : popup);
    }

    function openCurrentPopup() {
        const item = buildCurrentItem();
        const playerUrl = itemPlayerUrl(item, true);
        if (item.kind === 'direct' || item.kind === 'audio') {
            const tag = item.kind === 'audio' ? 'audio' : 'video';
            const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;width:100%;height:100%;background:#000}body{display:flex;align-items:center;justify-content:center}${tag}{width:100%;height:100%;object-fit:contain}</style></head><body><${tag} src="${escapeHtml(playerUrl)}" controls autoplay playsinline></${tag}></body></html>`;
            openBlobHtml(html, 'ktMediaCurrent', !ENV.mobile);
            return;
        }
        if (playerUrl) {
            if (ENV.mobile) window.open(playerUrl, '_blank');
            else window.open(playerUrl, 'ktMediaCurrent', 'popup=yes,width=1100,height=700,resizable=yes,scrollbars=yes');
            return;
        }
        window.open(withMarker(item.url, POP_MODE), '_blank');
    }

    function detectedResourceMediaUrls() {
        const out = [];
        const seen = new Set();
        const push = value => {
            const u = safeUrl(value);
            if (!u || !/^https?:$/i.test(u.protocol)) return;
            const s = u.href;
            if (seen.has(s)) return;
            if (!/\.(?:mp4|webm|m4v|mp3|m4a|aac|ogg|opus|wav|flac)(?:$|[?#])/i.test(s) && !/googlevideo\.com|videoplayback|media|stream/i.test(s)) return;
            seen.add(s); out.push(s);
        };
        try { performance.getEntriesByType('resource').forEach(e => push(e.name)); } catch (_) {}
        document.querySelectorAll('video,audio,source').forEach(el => push(el.currentSrc || el.src));
        return out;
    }

    function downloadFirstDirect() {
        const direct = directMediaUrl(largestMediaElement());
        const urls = direct ? [direct] : detectedResourceMediaUrls();
        if (!urls.length) {
            toast('No direct media URL detected');
            return;
        }
        downloadUrl(urls[0]);
    }

    function copyDetectedUrls() {
        const urls = detectedResourceMediaUrls();
        if (!urls.length) {
            toast('No media URLs detected');
            return;
        }
        copyText(urls.join('\n'), `Copied ${urls.length} detected media URL${urls.length === 1 ? '' : 's'}`);
    }

    function ytDlpArgs(format, playlist) {
        const common = playlist
            ? `--yes-playlist --ignore-errors -o ${shellQuote(PLAYLIST_TEMPLATE)}`
            : '--no-playlist';
        switch (format) {
            case 'mp4': return `${common} -f "bv*+ba/b" --merge-output-format mp4`;
            case 'mp3': return `${common} -x --audio-format mp3 --audio-quality 0`;
            case 'opus': return `${common} -x --audio-format opus`;
            default: return common;
        }
    }

    function buildYtDlpCommand({ format = 'best', playlist = false, range = '', termux = false } = {}) {
        const rangeArg = range ? ` -I ${shellQuote(range)}` : '';
        const base = `yt-dlp ${ytDlpArgs(format, playlist)}${rangeArg} ${shellQuote(location.href)}`;
        return termux ? `cd ~/storage/downloads && ${base}` : base;
    }

    function copyYtDlp(format = 'best', playlist = false, range = '', termux = false) {
        const label = `${termux ? 'Termux ' : ''}${playlist ? 'playlist ' : ''}${format.toUpperCase()}`;
        copyText(buildYtDlpCommand({ format, playlist, range, termux }), `Copied ${label} yt-dlp command`);
    }

    function customPlaylist(termux = false) {
        const range = prompt('Playlist items/range\n\nExamples:\n1:10\n1,3,5\n5:\n:20\n\nLeave blank for all:', '');
        if (range === null) return;
        const format = prompt('Format: best, mp4, mp3, or opus', 'mp4');
        if (format === null) return;
        const f = String(format).trim().toLowerCase();
        if (!['best', 'mp4', 'mp3', 'opus'].includes(f)) {
            alert('Use one of: best, mp4, mp3, opus');
            return;
        }
        copyYtDlp(f, true, String(range).trim(), termux);
    }

    const CHAT_SELECTORS = [
        'ytd-live-chat-frame', '#chat', '#chat-container', '#show-hide-button',
        'yt-live-chat-app', 'iframe#chatframe', 'ytd-watch-flexy[is-live-content] #chat'
    ];

    function installYouTubeChatCss() {
        if (!isYouTubeMain || document.getElementById(`${APP}-nochat-style`)) return;
        const style = document.createElement('style');
        style.id = `${APP}-nochat-style`;
        style.textContent = `${CHAT_SELECTORS.join(',')}{display:none!important;width:0!important;height:0!important;min-width:0!important;min-height:0!important;visibility:hidden!important}`;
        (document.head || document.documentElement).appendChild(style);
    }

    function removeYouTubeChatBurst() {
        if (!isYouTubeMain) return;
        let pass = 0;
        const run = () => {
            for (const sel of CHAT_SELECTORS) document.querySelectorAll(sel).forEach(el => el.remove());
            if (++pass < 10) setTimeout(run, pass < 3 ? 80 : 250);
        };
        run();
    }

    function rrRead() {
        const stored = storageGet(RR.storageKey, null);
        return stored && Array.isArray(stored.ids) ? stored : { ids: RR.fallback, updated: 0 };
    }

    function rrWrite(ids) {
        storageSet(RR.storageKey, { ids: [...new Set(ids)], updated: Date.now() });
    }

    function rrUpdate() {
        const state = rrRead();
        if (Date.now() - Number(state.updated || 0) < RR.updateInterval) return;
        const onData = text => {
            try {
                const parsed = JSON.parse(text);
                const values = Array.isArray(parsed) ? parsed : parsed?.videos || parsed?.ids || [];
                const ids = values.map(v => typeof v === 'string' ? v : v?.id).filter(v => /^[A-Za-z0-9_-]{11}$/.test(v || ''));
                if (ids.length) rrWrite([...RR.fallback, ...ids]);
            } catch (_) {}
        };
        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({ method: 'GET', url: RR.apiUrl, timeout: 5000, onload: r => onData(r.responseText) });
                return;
            }
        } catch (_) {}
        fetch(RR.apiUrl).then(r => r.text()).then(onData).catch(() => {});
    }

    function rrIsKnown(id) {
        return !!id && rrRead().ids.includes(id);
    }

    function rrBypassKey(id) { return RR.bypassPrefix + id; }

    function rrOverlay(id) {
        if (!document.documentElement || document.getElementById(`${APP}-rr-overlay`)) return;
        if (sessionStorage.getItem(rrBypassKey(id)) === '1') return;
        const media = largestMediaElement();
        try { media?.pause(); media && (media.muted = true); } catch (_) {}

        const cover = document.createElement('div');
        cover.id = `${APP}-rr-overlay`;
        cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#070707;color:#fff;display:flex;align-items:center;justify-content:center;padding:22px;font-family:system-ui,sans-serif';
        cover.innerHTML = `<div style="max-width:620px;text-align:center"><h2 style="margin:0 0 12px">Possible rickroll blocked</h2><p style="opacity:.82">Kindred Universal Media Toolkit recognized this media ID.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button id="ktRRBack" style="font-size:16px;padding:12px 18px">Go back</button><button id="ktRRContinue" style="font-size:16px;padding:12px 18px">Continue anyway</button></div></div>`;
        document.documentElement.appendChild(cover);
        cover.querySelector('#ktRRBack').onclick = () => history.length > 1 ? history.back() : location.replace('about:blank');
        cover.querySelector('#ktRRContinue').onclick = () => {
            sessionStorage.setItem(rrBypassKey(id), '1');
            cover.remove();
            try { media && (media.muted = false); media?.play?.(); } catch (_) {}
        };
    }

    function rrCheckCurrent() {
        if (!isYouTube) return;
        const id = getYouTubeId();
        if (rrIsKnown(id)) rrOverlay(id);
    }

    let touchPanel = null;
    let touchButton = null;

    function floatingButtonEnabled() {
        const configured = storageGet(FLOATING_BUTTON_KEY, null);
        return configured === null ? ENV.mobile : !!configured;
    }

    function setFloatingButtonEnabled(value) {
        storageSet(FLOATING_BUTTON_KEY, !!value);
        if (value) installTouchUi();
        else removeTouchUi();
    }

    function removeTouchUi() {
        touchButton?.remove();
        touchPanel?.remove();
        touchButton = null;
        touchPanel = null;
    }

    function button(label, fn) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'border:0;border-radius:10px;padding:11px 10px;background:#242424;color:#fff;font:14px system-ui,sans-serif;min-height:44px;touch-action:manipulation';
        b.onclick = e => { e.preventDefault(); e.stopPropagation(); fn(); };
        return b;
    }

    function refreshTouchPanel() {
        if (!touchPanel) return;
        const n = getCurrentListNumber();
        const count = getList(n).length;
        const label = touchPanel.querySelector('[data-list-label]');
        if (label) label.textContent = `List ${n} • ${count} item${count === 1 ? '' : 's'}`;
    }

    function buildTouchPanel() {
        const panel = document.createElement('div');
        panel.id = `${APP}-touch-panel`;
        panel.style.cssText = `position:fixed;right:12px;bottom:76px;z-index:2147483646;width:min(92vw,360px);max-height:min(76vh,620px);overflow:auto;padding:12px;border-radius:16px;background:rgba(10,10,10,.96);color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.5);font-family:system-ui,-apple-system,sans-serif;display:none;overscroll-behavior:contain`;

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px';
        const title = document.createElement('strong');
        title.textContent = `Kindred Media Toolkit ${VERSION}`;
        const close = button('×', () => panel.style.display = 'none');
        close.style.cssText += ';min-width:44px;padding:6px 10px;font-size:20px';
        head.append(title, close);

        const listLabel = document.createElement('div');
        listLabel.dataset.listLabel = '1';
        listLabel.style.cssText = 'opacity:.75;margin:2px 0 10px;font-size:13px';

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px';

        grid.append(
            button('＋ Add current', addCurrent),
            button('▶ Open current', openCurrentPopup),
            button('▦ Open multi', () => openMulti(false)),
            button('⌫ Clear list', clearCurrentList),
            button('↓ Direct media', downloadFirstDirect),
            button('⧉ Copy media URLs', copyDetectedUrls),
            button('yt-dlp MP4', () => copyYtDlp('mp4', false)),
            button('yt-dlp MP3', () => copyYtDlp('mp3', false)),
            button('Playlist MP4', () => copyYtDlp('mp4', true)),
            button('Playlist MP3', () => copyYtDlp('mp3', true))
        );

        if (ENV.android) {
            grid.append(
                button('Termux MP4', () => copyYtDlp('mp4', false, '', true)),
                button('Termux playlist', () => copyYtDlp('mp4', true, '', true))
            );
        }

        const lists = document.createElement('div');
        lists.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px';
        for (let i = 1; i <= LIST_COUNT; i++) lists.append(button(String(i), () => setCurrentListNumber(i)));

        panel.append(head, listLabel, grid, lists);
        return panel;
    }

    function installTouchUi() {
        if (!isTopWindow || !floatingButtonEnabled() || !document.documentElement || touchButton) return;
        touchPanel = buildTouchPanel();
        touchButton = document.createElement('button');
        touchButton.id = `${APP}-touch-button`;
        touchButton.textContent = '▶';
        touchButton.title = 'Kindred Media Toolkit';
        touchButton.style.cssText = `position:fixed;right:14px;bottom:max(14px,env(safe-area-inset-bottom));z-index:2147483647;width:54px;height:54px;border:0;border-radius:50%;background:rgba(15,15,15,.92);color:#fff;font-size:22px;box-shadow:0 5px 20px rgba(0,0,0,.45);touch-action:manipulation`;
        touchButton.onclick = e => {
            e.preventDefault(); e.stopPropagation();
            touchPanel.style.display = touchPanel.style.display === 'none' ? 'block' : 'none';
            refreshTouchPanel();
        };
        document.documentElement.append(touchPanel, touchButton);
        refreshTouchPanel();
    }

    function registerMenus() {
        registerMenu('Kindred — Add current to list', addCurrent);
        registerMenu('Kindred — Open current player', openCurrentPopup);
        registerMenu('Kindred — Open multi-player', () => openMulti(true));
        registerMenu('Kindred — Open multi-player in tab', () => openMulti(false));
        registerMenu('Kindred — Clear current list', clearCurrentList);
        for (let i = 1; i <= LIST_COUNT; i++) registerMenu(`Kindred — Select List ${i}`, () => setCurrentListNumber(i));
        registerMenu('Kindred — Download first direct media', downloadFirstDirect);
        registerMenu('Kindred — Copy detected media URLs', copyDetectedUrls);
        registerMenu('yt-dlp — Current Best', () => copyYtDlp('best'));
        registerMenu('yt-dlp — Current MP4', () => copyYtDlp('mp4'));
        registerMenu('yt-dlp — Current MP3', () => copyYtDlp('mp3'));
        registerMenu('yt-dlp — Current OPUS', () => copyYtDlp('opus'));
        registerMenu('yt-dlp — Playlist Best', () => copyYtDlp('best', true));
        registerMenu('yt-dlp — Playlist MP4', () => copyYtDlp('mp4', true));
        registerMenu('yt-dlp — Playlist MP3', () => copyYtDlp('mp3', true));
        registerMenu('yt-dlp — Playlist OPUS', () => copyYtDlp('opus', true));
        registerMenu('yt-dlp — Playlist custom range + format', () => customPlaylist(false));
        if (ENV.android) {
            registerMenu('yt-dlp — Termux current MP4', () => copyYtDlp('mp4', false, '', true));
            registerMenu('yt-dlp — Termux current MP3', () => copyYtDlp('mp3', false, '', true));
            registerMenu('yt-dlp — Termux playlist MP4', () => copyYtDlp('mp4', true, '', true));
            registerMenu('yt-dlp — Termux playlist custom', () => customPlaylist(true));
        }
        registerMenu(`Kindred — Floating touch button: ${floatingButtonEnabled() ? 'ON' : 'OFF'}`, () => {
            setFloatingButtonEnabled(!floatingButtonEnabled());
            toast(`Floating touch button ${floatingButtonEnabled() ? 'enabled' : 'disabled'}`);
        });
    }

    function installHotkeys() {
        if (!isTopWindow) return;
        addEventListener('keydown', e => {
            if (!(e.altKey && e.shiftKey) || e.ctrlKey || e.metaKey) return;
            const tag = (e.target?.tagName || '').toUpperCase();
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return;
            const k = e.key.toLowerCase();
            if (k === 'a') { e.preventDefault(); addCurrent(); }
            else if (k === 'm') { e.preventDefault(); openMulti(true); }
            else if (k === 't') { e.preventDefault(); openMulti(false); }
            else if (k === 'p') { e.preventDefault(); openCurrentPopup(); }
            else if (k === 'x') { e.preventDefault(); clearCurrentList(); }
            else if (/^[1-4]$/.test(k)) { e.preventDefault(); setCurrentListNumber(Number(k)); }
        }, true);
    }

    function applyPopoutMode() {
        const hash = location.hash || '';
        const pop = hash.includes(`${POP_MODE}=1`) || hash.includes(`${POP_FRAME_MODE}=1`);
        if (!pop) return;
        const style = document.createElement('style');
        style.textContent = `html,body{background:#000!important;margin:0!important}header,nav,aside,footer,[role="banner"],[role="navigation"],#masthead,#comments,#related{display:none!important}video{max-width:100vw!important;max-height:100vh!important}`;
        (document.head || document.documentElement).appendChild(style);
    }

    function bootstrapDom() {
        installYouTubeChatCss();
        removeYouTubeChatBurst();
        applyPopoutMode();
        if (floatingButtonEnabled()) installTouchUi();
        rrCheckCurrent();
    }

    registerMenus();
    installHotkeys();
    rrUpdate();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapDom, { once: true });
    } else {
        bootstrapDom();
    }

    if (isYouTubeMain) {
        document.addEventListener('yt-navigate-finish', () => {
            installYouTubeChatCss();
            removeYouTubeChatBurst();
            rrCheckCurrent();
        }, true);
        document.addEventListener('fullscreenchange', removeYouTubeChatBurst, true);
    }

    addEventListener('hashchange', () => {
        applyPopoutMode();
        rrCheckCurrent();
    }, true);
})();
