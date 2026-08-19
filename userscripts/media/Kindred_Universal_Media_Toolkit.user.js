// ==UserScript==
// @name         Kindred Universal Media Toolkit
// @namespace    kindred-tech.local
// @version      1.2.0
// @description  Universal popup/multi-player, YouTube live-chat cleanup, anti-rickroll guard, direct-media helper, and yt-dlp single/playlist command copier.
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
    const LIST_COUNT = 4;
    const CURRENT_LIST_KEY = `${APP}:currentList`;
    const LIST_KEY = n => `${APP}:list:${n}`;
    const POP_MODE = 'kt-media-popout';
    const POP_FRAME_MODE = 'kt-media-popout-frame';
    const PLAYLIST_TEMPLATE = '%(playlist)s/%(playlist_index)03d - %(title)s [%(id)s].%(ext)s';

    const isYouTube = /(^|\.)youtube\.com$/i.test(location.hostname) || /(^|\.)youtu\.be$/i.test(location.hostname);
    const isYouTubeMain = /(^|\.)youtube\.com$/i.test(location.hostname);
    const isTopWindow = (() => {
        try { return window.top === window.self; } catch (_) { return false; }
    })();

    const RR = {
        storageKey: `${APP}:rickrollDB`,
        bypassPrefix: `${APP}:rr:bypass:`,
        apiUrl: 'https://api.jm26.net/rickroll-db/?type=get&api=userscript',
        updateInterval: 86400000,
        fallback: [
            'dQw4w9WgXcQ',
            'oHg5SJYRHA0',
            'cvh0nX08nRw',
            'xfr64zoBTAQ',
            'iik25wqIuFo'
        ]
    };

    function getCurrentListNumber() {
        const n = Number(GM_getValue(CURRENT_LIST_KEY, 1));
        return Number.isInteger(n) && n >= 1 && n <= LIST_COUNT ? n : 1;
    }

    function getList(n = getCurrentListNumber()) {
        const value = GM_getValue(LIST_KEY(n), []);
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

        GM_setValue(LIST_KEY(n), clean);
        return clean;
    }

    function setCurrentListNumber(n) {
        if (!Number.isInteger(n) || n < 1 || n > LIST_COUNT) return;
        GM_setValue(CURRENT_LIST_KEY, n);
        toast(`List ${n} selected (${getList(n).length})`);
    }

    function toast(message) {
        if (!document.documentElement) return;
        let el = document.getElementById(`${APP}-toast`);

        if (!el) {
            el = document.createElement('div');
            el.id = `${APP}-toast`;
            el.style.cssText = `
                position:fixed;left:50%;bottom:38px;z-index:2147483647;
                transform:translateX(-50%);padding:9px 13px;border-radius:9px;
                background:rgba(0,0,0,.86);color:#fff;font:13px/1.35 Arial,sans-serif;
                box-shadow:0 3px 14px rgba(0,0,0,.35);pointer-events:none;
            `;
            document.documentElement.appendChild(el);
        }

        el.textContent = message;
        el.style.display = 'block';
        clearTimeout(el._ktTimer);
        el._ktTimer = setTimeout(() => { el.style.display = 'none'; }, 1700);
    }

    function safeUrl(value, base = location.href) {
        try { return new URL(value, base); } catch (_) { return null; }
    }

    function shellQuote(value) {
        return "'" + String(value).replace(/'/g, "'\\''") + "'";
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
        const candidates = [
            el.currentSrc,
            el.src,
            ...[...el.querySelectorAll('source[src]')].map(s => s.src)
        ];

        for (const value of candidates) {
            const u = safeUrl(value);
            if (u && /^https?:$/i.test(u.protocol)) return u.href;
        }
        return null;
    }

    function buildCurrentItem(url = location.href, title = document.title || location.hostname) {
        const yt = getYouTubeId(url);
        if (yt) {
            return { kind:'youtube', id:yt, url:stripToolkitMarker(url), title:title || `YouTube ${yt}` };
        }

        const vim = getVimeoId(url);
        if (vim) {
            return { kind:'vimeo', id:vim, url:stripToolkitMarker(url), title:title || `Vimeo ${vim}` };
        }

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

        return { kind:'page', url:stripToolkitMarker(url), title:title || location.hostname };
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
    }

    function clearCurrentList() {
        const n = getCurrentListNumber();
        setList([], n);
        toast(`Cleared List ${n}`);
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

    function escapeHtml(s) {
        return String(s || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

    function multiHtml(items, title = 'Kindred Multi-Player') {
        const data = items.map(item => ({
            ...item,
            playerUrl: itemPlayerUrl(item, true),
            popUrl: item.kind === 'page'
                ? withMarker(item.url, POP_MODE)
                : (item.pageUrl || item.url)
        }));

        return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden;font-family:Arial,sans-serif}
#grid{position:fixed;inset:0;display:grid;background:#000}
.cell{position:relative;min-width:0;min-height:0;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center}
.framebox{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000}
iframe,video,audio{display:block;border:0;max-width:100%;max-height:100%;width:100%;height:100%;background:#000;object-fit:contain}
audio{height:80px;align-self:center}.controls{position:absolute;top:6px;right:6px;z-index:20;display:flex;gap:5px;opacity:0;transition:opacity .15s}.cell:hover .controls{opacity:1}.controls button{width:31px;height:31px;border:0;border-radius:7px;background:rgba(0,0,0,.78);color:#fff;font-size:17px;cursor:pointer}.label{position:absolute;left:7px;bottom:7px;z-index:15;max-width:70%;padding:4px 7px;border-radius:5px;background:rgba(0,0,0,.65);color:#fff;font:12px Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .15s}.cell:hover .label{opacity:1}#empty{position:fixed;inset:0;display:none;align-items:center;justify-content:center;color:#aaa;font-size:18px}
</style></head><body><div id="grid"></div><div id="empty">No videos left</div>
<script>
const ITEMS=${JSON.stringify(data)};
const grid=document.getElementById('grid');const empty=document.getElementById('empty');
function makeCell(item){const cell=document.createElement('div');cell.className='cell';const box=document.createElement('div');box.className='framebox';let media;if(item.kind==='direct'||item.kind==='audio'){media=document.createElement(item.kind==='audio'?'audio':'video');media.src=item.playerUrl;media.controls=true;media.autoplay=true;media.playsInline=true}else{media=document.createElement('iframe');media.src=item.playerUrl;media.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';media.allowFullscreen=true}const ctl=document.createElement('div');ctl.className='controls';const close=document.createElement('button');close.textContent='×';close.title='Remove from this player';close.onclick=()=>{cell.remove();layout()};const ext=document.createElement('button');ext.textContent='↗';ext.title='Open separate popout';ext.onclick=()=>window.open(item.popUrl||item.url||item.playerUrl,'_blank','popup=yes,width=960,height=600,resizable=yes');ctl.append(close,ext);const label=document.createElement('div');label.className='label';label.textContent=item.title||item.url;box.append(media,ctl,label);cell.appendChild(box);return cell}
function layout(){const cells=[...grid.children];const n=cells.length;empty.style.display=n?'none':'flex';if(!n)return;const W=innerWidth,H=innerHeight;let best={cols:1,rows:n,area:0};for(let cols=1;cols<=n;cols++){const rows=Math.ceil(n/cols);const bw=W/cols,bh=H/rows;const vw=Math.min(bw,bh*16/9);const vh=vw*9/16;const area=vw*vh;if(area>best.area)best={cols,rows,area}}grid.style.gridTemplateColumns='repeat('+best.cols+',1fr)';grid.style.gridTemplateRows='repeat('+best.rows+',1fr)'}
ITEMS.forEach(item=>grid.appendChild(makeCell(item)));layout();addEventListener('resize',layout);
<\/script></body></html>`;
    }

    function openBlobHtml(html, name, popup = true) {
        const blob = URL.createObjectURL(new Blob([html], { type:'text/html' }));
        let w;

        if (popup) {
            const width = Math.min(1360, Math.max(760, Math.floor(screen.availWidth * 0.74)));
            const height = Math.min(900, Math.max(500, Math.floor(screen.availHeight * 0.74)));
            const left = Math.max(0, Math.floor((screen.availWidth - width) / 2));
            const top = Math.max(0, Math.floor((screen.availHeight - height) / 2));
            w = window.open(blob, name, `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`);
        } else {
            w = window.open(blob, '_blank');
        }

        if (!w) {
            URL.revokeObjectURL(blob);
            toast('Popup blocked — allow popups for this site');
            return null;
        }

        setTimeout(() => URL.revokeObjectURL(blob), 60000);
        return w;
    }

    function openMulti(popup = true) {
        const n = getCurrentListNumber();
        let items = getList(n);
        if (!items.length) items = [buildCurrentItem()];
        openBlobHtml(multiHtml(items, `Kindred Multi-Player — List ${n}`), `ktMediaList${n}`, popup);
    }

    function openCurrentPopup() {
        const item = buildCurrentItem();

        if (item.kind === 'page') {
            const target = withMarker(item.url, POP_MODE);
            const width = Math.min(1280, Math.max(720, Math.floor(screen.availWidth * 0.70)));
            const height = Math.min(850, Math.max(480, Math.floor(screen.availHeight * 0.70)));
            const w = window.open(target, 'ktMediaSinglePopout', `popup=yes,width=${width},height=${height},resizable=yes`);
            if (!w) toast('Popup blocked — allow popups for this site');
            return;
        }

        openBlobHtml(multiHtml([item], 'Kindred Popup Player'), 'ktMediaSinglePopup', true);
    }

    function isPopoutMode() {
        const h = location.hash || '';
        return new RegExp(`(?:^#|&)${POP_MODE}=1(?:&|$)`).test(h) || new RegExp(`(?:^#|&)${POP_FRAME_MODE}=1(?:&|$)`).test(h);
    }

    function isolateMediaForPopout() {
        if (!isPopoutMode()) return;
        let done = false;
        let observer;

        const finish = media => {
            if (done || !media) return;
            done = true;
            observer?.disconnect();
            document.documentElement.style.background = '#000';
            if (document.body) document.body.style.background = '#000';
            media.controls = true;
            media.style.cssText += ';position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;z-index:2147483646!important;background:#000!important;object-fit:contain!important;';
            try { media.play().catch(() => {}); } catch (_) {}
        };

        const scan = () => finish(largestMediaElement());
        const begin = () => {
            scan();
            if (done) return;
            observer = new MutationObserver(scan);
            observer.observe(document.documentElement, { childList:true, subtree:true });
            setTimeout(() => observer?.disconnect(), 20000);
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once:true });
        else begin();
    }

    function installYouTubeChatCss() {
        if (!isYouTubeMain || !document.documentElement || document.getElementById(`${APP}-nochat`)) return;

        const style = document.createElement('style');
        style.id = `${APP}-nochat`;
        style.textContent = `
            ytd-live-chat-frame,
            ytd-watch-flexy #chat,
            ytd-watch-flexy #chat-container,
            yt-live-chat-app,
            yt-live-chat-renderer,
            ytd-engagement-panel-section-list-renderer[target-id*="live-chat"],
            ytd-engagement-panel-section-list-renderer[panel-identifier*="live-chat"] {
                display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;
                width:0!important;height:0!important;min-width:0!important;min-height:0!important;max-width:0!important;max-height:0!important;
                margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;
            }
        `;
        document.documentElement.appendChild(style);
    }

    function removeYouTubeChatNow() {
        if (!isYouTubeMain) return;
        installYouTubeChatCss();
        const sels = [
            'ytd-live-chat-frame','ytd-watch-flexy #chat','ytd-watch-flexy #chat-container','yt-live-chat-app','yt-live-chat-renderer',
            'ytd-engagement-panel-section-list-renderer[target-id*="live-chat"]','ytd-engagement-panel-section-list-renderer[panel-identifier*="live-chat"]'
        ];
        for (const s of sels) document.querySelectorAll(s).forEach(n => n.remove());
    }

    function killChatBurst() {
        if (!isYouTubeMain) return;
        let passes = 0;
        removeYouTubeChatNow();
        const id = setInterval(() => {
            removeYouTubeChatNow();
            if (++passes >= 10) clearInterval(id);
        }, 250);
    }

    function installYouTubeHoverAdder() {
        if (!isYouTubeMain) return;

        const start = () => {
            if (document.getElementById(`${APP}-hover-style`)) return;
            const style = document.createElement('style');
            style.id = `${APP}-hover-style`;
            style.textContent = `.kt-media-host{position:relative!important}.kt-media-add{position:absolute;top:7px;left:7px;z-index:9999;width:34px;height:34px;border:1px solid rgba(255,255,255,.35);border-radius:50%;background:rgba(0,0,0,.74);color:#fff;font:700 24px/30px Arial,sans-serif;cursor:pointer;box-shadow:0 2px 7px rgba(0,0,0,.35)}`;
            document.head.appendChild(style);

            document.addEventListener('pointerover', e => {
                const anchor = e.target?.closest?.('a[href*="/watch?v="],a[href^="/shorts/"],a[href^="/live/"]');
                if (!anchor) return;
                const id = getYouTubeId(anchor.href);
                if (!id) return;
                const host = anchor.closest('ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,ytd-playlist-video-renderer,ytd-playlist-panel-video-renderer,ytd-thumbnail');
                if (!host || host.querySelector(':scope > .kt-media-add')) return;

                host.classList.add('kt-media-host');
                const btn = document.createElement('button');
                btn.className = 'kt-media-add';
                btn.type = 'button';
                btn.textContent = '+';
                btn.title = `Add to Media List ${getCurrentListNumber()}`;
                btn.addEventListener('click', ev => {
                    ev.preventDefault();ev.stopPropagation();
                    const n = getCurrentListNumber();
                    const list = getList(n);
                    const item = { kind:'youtube', id, url:anchor.href, title:anchor.getAttribute('title') || anchor.textContent.trim() || `YouTube ${id}` };
                    if (!list.some(x => x.kind === 'youtube' && x.id === id)) {
                        list.push(item);setList(list,n);toast(`Added to List ${n} (${list.length})`);
                    } else toast(`Already in List ${n}`);
                });
                host.appendChild(btn);
            }, true);
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
        else start();
    }

    function getRickrollDb() {
        const store = GM_getValue(RR.storageKey, {});
        const remote = store && Array.isArray(store.database) ? store.database : [];
        return [...new Set([...RR.fallback, ...remote])];
    }

    function updateRickrollDb() {
        if (!isYouTube) return;
        const store = GM_getValue(RR.storageKey, {});
        const now = Date.now();
        if (store?.lastUpdate && now - store.lastUpdate < RR.updateInterval) return;

        GM_xmlhttpRequest({
            method:'GET', url:RR.apiUrl, timeout:5000,
            onload:r => {
                try {
                    const json = JSON.parse(r.responseText);
                    if (json && Array.isArray(json.ids)) {
                        GM_setValue(RR.storageKey, { database:[...new Set(json.ids)], lastUpdate:now });
                    }
                } catch (_) {}
            },
            onerror:() => {}
        });
    }

    function blockRickrollIfNeeded() {
        if (!isYouTube) return;
        const id = getYouTubeId();
        if (!id || sessionStorage.getItem(RR.bypassPrefix + id) === '1' || !getRickrollDb().includes(id)) return;
        if (document.getElementById(`${APP}-rr-block`)) return;

        const show = () => {
            const media = largestMediaElement();
            if (media) { try { media.pause(); media.muted = true; } catch (_) {} }

            const box = document.createElement('div');
            box.id = `${APP}-rr-block`;
            box.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;background:#111!important;color:#eee!important;display:flex!important;align-items:center!important;justify-content:center!important;font-family:Arial,sans-serif!important;';
            box.innerHTML = `<div style="max-width:540px;padding:28px;text-align:center"><div style="font-size:58px">⚠</div><h1 style="font-size:24px">Known Rickroll blocked</h1><p style="opacity:.82">Video ID: <code>${id}</code></p><div style="display:flex;gap:10px;justify-content:center;margin-top:20px"><button id="kt-rr-back" style="padding:9px 14px;cursor:pointer">Back</button><button id="kt-rr-continue" style="padding:9px 14px;cursor:pointer">Continue anyway</button></div></div>`;
            document.documentElement.appendChild(box);
            box.querySelector('#kt-rr-back').onclick = () => history.length > 1 ? history.back() : window.close();
            box.querySelector('#kt-rr-continue').onclick = () => { sessionStorage.setItem(RR.bypassPrefix + id, '1'); location.reload(); };
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once:true });
        else show();
    }

    function collectMediaUrls() {
        const out = new Set();
        const add = value => {
            const u = safeUrl(value);
            if (u && /^https?:$/i.test(u.protocol)) out.add(u.href);
        };

        document.querySelectorAll('video,audio,video source,audio source').forEach(el => {
            add(el.currentSrc);add(el.src);add(el.getAttribute?.('src'));
        });

        try {
            performance.getEntriesByType('resource').forEach(entry => {
                const s = entry.name || '';
                if (/\.(?:m3u8|mpd|mp4|webm|m4a|mp3|ogg|opus)(?:[?#]|$)/i.test(s)) add(s);
            });
        } catch (_) {}

        return [...out];
    }

    function copyText(text, message = 'Copied') {
        try { GM_setClipboard(text, 'text'); toast(message); }
        catch (_) { navigator.clipboard?.writeText(text).then(() => toast(message)).catch(() => {}); }
    }

    function isLikelyPlaylist(url = location.href) {
        try {
            const u = new URL(url);
            return u.searchParams.has('list') || /\/playlist(?:\/|$)/i.test(u.pathname) || /\/sets(?:\/|$)/i.test(u.pathname) || /\/album(?:\/|$)/i.test(u.pathname);
        } catch (_) { return false; }
    }

    function ytDlpArgs(kind, playlist) {
        const base = playlist
            ? `--yes-playlist --ignore-errors -o ${shellQuote(PLAYLIST_TEMPLATE)}`
            : '--no-playlist';
        if (kind === 'mp4') return `${base} -f "bv*+ba/b" --merge-output-format mp4`;
        if (kind === 'mp3') return `${base} -x --audio-format mp3 --audio-quality 0`;
        if (kind === 'opus') return `${base} -x --audio-format opus`;
        return base;
    }

    function copyYtDlp(kind, playlist = false, range = '') {
        const rangeArg = range ? ` -I ${shellQuote(range)}` : '';
        const cmd = `yt-dlp ${ytDlpArgs(kind, playlist)}${rangeArg} ${shellQuote(stripToolkitMarker(location.href))}`;
        copyText(cmd, `Copied yt-dlp ${playlist ? 'playlist ' : ''}${kind.toUpperCase()} command`);
    }

    function customPlaylistYtDlp() {
        const range = prompt('Playlist items/range\n\nExamples:\n1:10 = items 1–10\n1,3,5 = selected items\n5: = item 5 onward\n:20 = first 20\n\nLeave blank for all:', '');
        if (range === null) return;
        const kind = prompt('Format: best, mp4, mp3, or opus', 'mp4');
        if (kind === null) return;
        const k = String(kind).trim().toLowerCase();
        if (!['best','mp4','mp3','opus'].includes(k)) { alert('Use: best, mp4, mp3, or opus'); return; }
        copyYtDlp(k, true, String(range).trim());
    }

    function sanitizeFilename(name) {
        return String(name || 'media').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 140) || 'media';
    }

    function downloadFirstDirect() {
        const urls = collectMediaUrls();
        const preferred = directMediaUrl(largestMediaElement());
        const direct = preferred || urls.find(u => !/\.(?:m3u8|mpd)(?:[?#]|$)/i.test(u));

        if (!direct) {
            if (urls.length) copyText(urls.join('\n'), 'Only stream manifests found — copied URLs');
            else toast('No direct media URL detected');
            return;
        }

        const parsed = safeUrl(direct);
        const extMatch = parsed ? parsed.pathname.match(/\.([A-Za-z0-9]{2,5})$/) : null;
        const ext = extMatch ? '.' + extMatch[1] : '';
        const name = sanitizeFilename(document.title) + ext;

        try {
            GM_download({
                url:direct,name,saveAs:true,
                onerror:() => copyText(direct, 'Direct download failed — copied URL')
            });
        } catch (_) {
            copyText(direct, 'Copied direct media URL');
        }
    }

    function copyDetectedMediaUrls() {
        const urls = collectMediaUrls();
        if (!urls.length) { toast('No media URLs detected yet'); return; }
        copyText(urls.join('\n'), `Copied ${urls.length} media URL${urls.length === 1 ? '' : 's'}`);
    }

    function registerMenus() {
        GM_registerMenuCommand('➕ Add current media/page', addCurrent);
        GM_registerMenuCommand('▦ Open current list as popup', () => openMulti(true));
        GM_registerMenuCommand('↗ Open current list in tab', () => openMulti(false));
        GM_registerMenuCommand('◱ Popup current media/page', openCurrentPopup);
        GM_registerMenuCommand('🧹 Clear current list', clearCurrentList);

        for (let i = 1; i <= LIST_COUNT; i++) {
            GM_registerMenuCommand(`Use Media List ${i}`, () => setCurrentListNumber(i));
        }

        GM_registerMenuCommand('⬇ Download first direct media', downloadFirstDirect);
        GM_registerMenuCommand('📋 Copy detected media URLs', copyDetectedMediaUrls);

        GM_registerMenuCommand('yt-dlp — Current: Best', () => copyYtDlp('best', false));
        GM_registerMenuCommand('yt-dlp — Current: MP4', () => copyYtDlp('mp4', false));
        GM_registerMenuCommand('yt-dlp — Current: MP3', () => copyYtDlp('mp3', false));
        GM_registerMenuCommand('yt-dlp — Current: OPUS', () => copyYtDlp('opus', false));
        GM_registerMenuCommand('yt-dlp — Playlist: Best', () => copyYtDlp('best', true));
        GM_registerMenuCommand('yt-dlp — Playlist: MP4', () => copyYtDlp('mp4', true));
        GM_registerMenuCommand('yt-dlp — Playlist: MP3', () => copyYtDlp('mp3', true));
        GM_registerMenuCommand('yt-dlp — Playlist: OPUS', () => copyYtDlp('opus', true));
        GM_registerMenuCommand('yt-dlp — Playlist: Custom range + format', customPlaylistYtDlp);
    }

    function installHotkeys() {
        const start = () => document.addEventListener('keydown', e => {
            if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
            const t = e.target;
            if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
            const k = e.key.toLowerCase();
            if (k === 'a') { e.preventDefault(); addCurrent(); }
            else if (k === 'm') { e.preventDefault(); openMulti(true); }
            else if (k === 't') { e.preventDefault(); openMulti(false); }
            else if (k === 'p') { e.preventDefault(); openCurrentPopup(); }
            else if (k === 'x') { e.preventDefault(); clearCurrentList(); }
            else if (/^[1-4]$/.test(k)) { e.preventDefault(); setCurrentListNumber(Number(k)); }
        }, true);

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
        else start();
    }

    if (!isTopWindow) {
        if (isPopoutMode()) isolateMediaForPopout();
        return;
    }

    registerMenus();
    isolateMediaForPopout();
    installHotkeys();

    if (isYouTubeMain) {
        installYouTubeChatCss();
        installYouTubeHoverAdder();
        document.addEventListener('yt-navigate-start', killChatBurst, true);
        document.addEventListener('yt-navigate-finish', () => { killChatBurst(); blockRickrollIfNeeded(); }, true);
        document.addEventListener('fullscreenchange', killChatBurst, true);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { killChatBurst(); blockRickrollIfNeeded(); }, { once:true });
        } else {
            killChatBurst();
            blockRickrollIfNeeded();
        }
    } else if (isYouTube) {
        blockRickrollIfNeeded();
    }

    updateRickrollDb();

    if (isLikelyPlaylist()) {
        console.info('[Kindred Universal Media Toolkit] Playlist detected; yt-dlp playlist commands are available in the userscript menu.');
    }
})();
