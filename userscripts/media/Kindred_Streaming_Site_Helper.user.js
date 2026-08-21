// ==UserScript==
// @name         Kindred Streaming Site Helper
// @namespace    kindred-tech.local
// @version      1.0.1
// @description  Adaptive desktop/mobile streaming helper for Tubi, LookMovie2, and similar sites: focus player, fullscreen, PiP, speed, player tab, URL copy, yt-dlp, and Termux helpers without DRM bypassing.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        *://*/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_Streaming_Site_Helper.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_Streaming_Site_Helper.user.js
// ==/UserScript==

(() => {
    'use strict';

    const APP = 'Kindred Streaming Site Helper';
    const KEY = 'kindredStreamingSiteHelper';
    const TOUCH = matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const TOP = (() => { try { return top === self; } catch (_) { return false; } })();
    const KNOWN = [/(^|\.)tubitv\.com$/i, /(^|\.)lookmovie2\.to$/i, /(^|\.)pluto\.tv$/i, /(^|\.)plex\.tv$/i, /(^|\.)crackle\.com$/i, /(^|\.)therokuchannel\.roku\.com$/i];
    const BAD_FRAME = /(?:recaptcha|doubleclick|googlesyndication|adservice|advert|banner|chat|comment|analytics|consent)/i;
    const state = { open:false, focus:null, timer:0, ready:false };

    const safeUrl = (v, base=location.href) => { try { return new URL(v, base); } catch (_) { return null; } };
    const isHttp = v => { const u = safeUrl(v); return !!u && /^https?:$/i.test(u.protocol); };
    const knownHost = () => KNOWN.some(re => re.test(location.hostname));

    function area(el) {
        try {
            const r = el.getBoundingClientRect();
            const w = Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left));
            const h = Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top));
            return w * h;
        } catch (_) { return 0; }
    }

    function visible(el) {
        try {
            const s = getComputedStyle(el), r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > .02 && r.width > 80 && r.height > 45;
        } catch (_) { return false; }
    }

    const videoScore = v => visible(v) ? ((!v.paused && !v.ended ? 1e12 : 0) + (v.readyState >= 2 ? 1e9 : 0) + area(v)) : -1;
    const frameScore = f => {
        if (!visible(f)) return -1;
        if (BAD_FRAME.test(`${f.src || ''} ${f.title || ''} ${f.name || ''}`)) return -1;
        const a = area(f); return a < 45000 ? -1 : a;
    };

    function best(sel, scoreFn) {
        let out = null, score = -1;
        for (const el of document.querySelectorAll(sel)) {
            const s = scoreFn(el);
            if (s > score) { out = el; score = s; }
        }
        return out;
    }

    const bestVideo = () => best('video', videoScore);
    const bestFrame = () => best('iframe', frameScore);
    function bestTarget() {
        const v = bestVideo(), f = bestFrame();
        if (!v) return f; if (!f) return v;
        return videoScore(v) >= frameScore(f) ? v : f;
    }

    function playerContainer(target) {
        if (!target) return null;
        const preferred = target.closest?.('[data-testid*="player" i],[data-test*="player" i],[id*="player" i],[class*="player" i],[class*="video-container" i],[class*="video_player" i]');
        if (preferred && visible(preferred)) return preferred;
        const base = Math.max(1, area(target));
        let node = target, chosen = target;
        for (let i = 0; i < 5 && node?.parentElement; i++) {
            node = node.parentElement;
            const a = area(node);
            if (!a) continue;
            if (a >= base * .85 && a <= base * 2.8) chosen = node;
            else if (a > base * 2.8) break;
        }
        return chosen;
    }

    function playerUrl() {
        const v = bestVideo();
        if (v) {
            for (const src of [v.currentSrc, v.src, ...[...v.querySelectorAll('source[src]')].map(s => s.src)]) if (isHttp(src)) return src;
        }
        const f = bestFrame();
        return f && isHttp(f.src) ? f.src : null;
    }

    function statusText() {
        const v = bestVideo();
        if (v) {
            const src = v.currentSrc || v.src || '';
            const kind = src.startsWith('blob:') ? 'blob/browser-managed stream' : (src ? 'direct media' : 'video element');
            const dim = v.videoWidth && v.videoHeight ? ` • ${v.videoWidth}×${v.videoHeight}` : '';
            return `Video detected • ${kind}${dim}`;
        }
        const f = bestFrame();
        if (f) return `Embedded player detected • ${safeUrl(f.src)?.hostname || 'iframe'}`;
        return 'No substantial player detected yet';
    }

    function toast(msg) {
        if (!TOP || !document.documentElement) return;
        let el = document.getElementById(`${KEY}-toast`);
        if (!el) {
            el = document.createElement('div'); el.id = `${KEY}-toast`;
            el.style.cssText = `position:fixed;left:50%;bottom:${TOUCH?'86px':'38px'};transform:translateX(-50%);z-index:2147483647;max-width:min(88vw,720px);padding:10px 14px;border-radius:10px;background:rgba(0,0,0,.9);color:#fff;font:14px/1.35 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.42);pointer-events:none;text-align:center`;
            document.documentElement.appendChild(el);
        }
        el.textContent = msg; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => el.hidden = true, 1900);
    }

    async function copyText(text, label='Copied') {
        try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); toast(label); return; } } catch (_) {}
        try { await navigator.clipboard.writeText(text); toast(label); } catch (_) { prompt('Copy this:', text); }
    }

    function installStyle() {
        if (document.getElementById(`${KEY}-style`)) return;
        const s = document.createElement('style'); s.id = `${KEY}-style`;
        s.textContent = `
.kindred-stream-focus{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;background:#000!important;z-index:2147483644!important}
.kindred-stream-focus video,.kindred-stream-focus iframe{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;background:#000!important}
html.kindred-stream-focus-lock,body.kindred-stream-focus-lock{overflow:hidden!important}
#${KEY}-button{position:fixed;right:14px;bottom:14px;z-index:2147483647;width:${TOUCH?'58px':'46px'};height:${TOUCH?'58px':'46px'};border:0;border-radius:999px;background:rgba(17,17,17,.93);color:#fff;font:${TOUCH?'25px':'20px'}/1 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.48);cursor:pointer;touch-action:manipulation}
#${KEY}-panel{position:fixed;right:14px;bottom:${TOUCH?'82px':'70px'};z-index:2147483647;width:min(92vw,390px);max-height:min(78dvh,720px);overflow:auto;border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:12px;background:rgba(14,14,16,.97);color:#fff;font:14px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.58)}
#${KEY}-panel[hidden]{display:none!important}#${KEY}-panel .title{font-weight:700;font-size:16px;margin-bottom:4px}#${KEY}-panel .status{opacity:.78;font-size:12px;margin-bottom:10px;word-break:break-word}#${KEY}-panel .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#${KEY}-panel button{min-height:${TOUCH?'48px':'38px'};padding:8px 9px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#27272c;color:#fff;font:inherit;cursor:pointer;touch-action:manipulation}#${KEY}-panel .wide{grid-column:1/-1}#${KEY}-panel .note{margin:10px 2px 0;opacity:.62;font-size:11px}@media(max-width:520px){#${KEY}-panel{left:10px;right:10px;width:auto;bottom:82px}}
`;
        (document.head || document.documentElement).appendChild(s);
    }

    function setFocus(on) {
        if (!on) {
            state.focus?.classList?.remove('kindred-stream-focus');
            document.documentElement.classList.remove('kindred-stream-focus-lock');
            document.body?.classList.remove('kindred-stream-focus-lock');
            state.focus = null; toast('Player focus mode off'); return refreshUi();
        }
        const target = bestTarget(); if (!target) return toast('No player detected yet');
        const node = playerContainer(target) || target;
        state.focus?.classList?.remove('kindred-stream-focus'); state.focus = node;
        node.classList.add('kindred-stream-focus'); document.documentElement.classList.add('kindred-stream-focus-lock'); document.body?.classList.add('kindred-stream-focus-lock');
        toast('Player focus mode on'); refreshUi();
    }

    async function fullscreen() {
        const target = bestTarget(); if (!target) return toast('No player detected yet');
        const node = playerContainer(target) || target;
        try { const fn = node.requestFullscreen || node.webkitRequestFullscreen || node.msRequestFullscreen; if (!fn) throw 0; await fn.call(node); }
        catch (_) { setFocus(true); toast('Native fullscreen unavailable — using focus mode'); }
    }

    async function pip() {
        const v = bestVideo(); if (!v) return toast('No local HTML5 video detected');
        try {
            if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return toast('Picture-in-Picture off'); }
            if (typeof v.requestPictureInPicture !== 'function') throw 0;
            await v.requestPictureInPicture(); toast('Picture-in-Picture on');
        } catch (_) { toast('PiP is not available for this player/browser'); }
    }

    function speed() {
        const v = bestVideo(); if (!v) return toast('No local HTML5 video detected');
        const raw = prompt('Playback speed (0.25 to 4):', String(v.playbackRate || 1)); if (raw == null) return;
        const n = Number(raw); if (!Number.isFinite(n) || n < .25 || n > 4) return toast('Use a speed from 0.25 to 4');
        v.playbackRate = n; toast(`Playback speed: ${n}×`);
    }

    function controls() { const v = bestVideo(); if (!v) return toast('No local HTML5 video detected'); v.controls = !v.controls; toast(`Native controls ${v.controls?'on':'off'}`); }
    function openPlayer() { const w = window.open(playerUrl() || location.href, '_blank', 'noopener,noreferrer'); if (!w) toast('Browser blocked the new tab'); }
    const shellQuote = v => `'${String(v).replace(/'/g, `'\\''`)}'`;
    const playlistLike = (u=location.href) => { const x = safeUrl(u); return !!x && (x.searchParams.has('list') || /(?:playlist|season|episodes|series)/i.test(`${x.pathname}${x.search}`)); };

    function ytdlp(format='mp4', termux=false) {
        const playlist = playlistLike();
        const output = playlist ? '%(playlist)s/%(playlist_index)03d - %(title)s [%(id)s].%(ext)s' : '%(title)s [%(id)s].%(ext)s';
        const common = `${playlist?'--yes-playlist --ignore-errors':'--no-playlist'} -o ${shellQuote(output)}`;
        const fmt = format==='mp3' ? '-x --audio-format mp3 --audio-quality 0' : format==='opus' ? '-x --audio-format opus' : format==='best' ? '' : '-f "bv*+ba/b" --merge-output-format mp4';
        const cmd = `yt-dlp ${common}${fmt?` ${fmt}`:''} ${shellQuote(location.href)}`;
        return termux ? `cd ~/storage/downloads && ${cmd}` : cmd;
    }

    function copyPlayerUrl() {
        const url = playerUrl(); if (url) return copyText(url, 'Player URL copied');
        const v = bestVideo(); if (v && String(v.currentSrc || v.src || '').startsWith('blob:')) return toast('This player uses a blob/browser-managed stream; no direct HTTP URL is exposed');
        toast('No direct player URL is exposed on this page');
    }

    function btn(text, fn, wide=false) { const b = document.createElement('button'); b.textContent = text; if (wide) b.className = 'wide'; b.onclick = fn; return b; }

    function ensureUi() {
        if (!TOP || !document.documentElement || state.ready) return;
        installStyle();
        const button = document.createElement('button'); button.id = `${KEY}-button`; button.type='button'; button.textContent='▶'; button.title=APP;
        const panel = document.createElement('div'); panel.id = `${KEY}-panel`; panel.hidden = true;
        const title = document.createElement('div'); title.className='title'; title.textContent='Kindred Streaming Helper';
        const status = document.createElement('div'); status.className='status'; status.id=`${KEY}-status`;
        const grid = document.createElement('div'); grid.className='grid';
        grid.append(
            btn('Focus Player', () => setFocus(!state.focus)), btn('Fullscreen', fullscreen), btn('Picture-in-Picture', pip), btn('Playback Speed', speed),
            btn('Native Controls', controls), btn('Open Player Tab', openPlayer), btn('Copy Page URL', () => copyText(location.href, 'Page URL copied')), btn('Copy Player URL', copyPlayerUrl),
            btn('yt-dlp MP4', () => copyText(ytdlp('mp4'), 'yt-dlp MP4 command copied')), btn('yt-dlp MP3', () => copyText(ytdlp('mp3'), 'yt-dlp MP3 command copied')),
            btn('Termux MP4', () => copyText(ytdlp('mp4', true), 'Termux MP4 command copied')), btn('Termux MP3', () => copyText(ytdlp('mp3', true), 'Termux MP3 command copied')),
            btn('Refresh Player Detection', () => { refreshUi(); toast(statusText()); }, true)
        );
        const note = document.createElement('div'); note.className='note'; note.textContent='Works with exposed HTML5 video/player frames. It does not decrypt DRM or bypass a service’s access controls.';
        panel.append(title, status, grid, note); document.documentElement.append(button, panel);
        button.onclick = () => { state.open = !state.open; panel.hidden = !state.open; refreshUi(); };
        state.ready = true; refreshUi();
    }

    function shouldShow() { if (knownHost()) return true; const t = bestTarget(); return !!t && area(t) >= Math.max(50000, innerWidth * innerHeight * .08); }
    function refreshUi() {
        if (!TOP) return;
        if (!state.ready) { if (shouldShow()) ensureUi(); return; }
        const b = document.getElementById(`${KEY}-button`), p = document.getElementById(`${KEY}-panel`), s = document.getElementById(`${KEY}-status`);
        if (b) b.style.display = shouldShow() ? 'block' : 'none'; if (p && b?.style.display==='none') p.hidden = true; if (s) s.textContent = `${location.hostname} • ${statusText()}`;
    }
    function schedule() { clearTimeout(state.timer); state.timer = setTimeout(refreshUi, 180); }

    function menus() {
        if (!TOP || typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand('Streaming Helper — Toggle panel', () => { ensureUi(); const p=document.getElementById(`${KEY}-panel`); state.open=!state.open; if(p)p.hidden=!state.open; refreshUi(); });
        GM_registerMenuCommand('Streaming Helper — Focus / exit focus', () => setFocus(!state.focus));
        GM_registerMenuCommand('Streaming Helper — Fullscreen', fullscreen);
        GM_registerMenuCommand('Streaming Helper — Picture-in-Picture', pip);
        GM_registerMenuCommand('Streaming Helper — Playback speed', speed);
        GM_registerMenuCommand('Streaming Helper — Copy player URL', copyPlayerUrl);
        GM_registerMenuCommand('Streaming Helper — Copy yt-dlp MP4 command', () => copyText(ytdlp('mp4')));
        GM_registerMenuCommand('Streaming Helper — Copy Termux MP4 command', () => copyText(ytdlp('mp4', true)));
    }

    function keys() {
        if (!TOP || TOUCH) return;
        addEventListener('keydown', e => {
            if (!e.altKey || !e.shiftKey) return;
            if (e.code==='KeyM') { e.preventDefault(); ensureUi(); const p=document.getElementById(`${KEY}-panel`); state.open=!state.open; if(p)p.hidden=!state.open; }
            else if (e.code==='KeyF') { e.preventDefault(); setFocus(!state.focus); }
            else if (e.code==='KeyP') { e.preventDefault(); pip(); }
        }, true);
    }

    function start() {
        menus(); keys();
        const ready = () => {
            if (shouldShow()) ensureUi(); refreshUi();
            const o = new MutationObserver(schedule); o.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['src','style','class'] });
            addEventListener('resize', schedule, {passive:true}); addEventListener('orientationchange', schedule, {passive:true}); document.addEventListener('fullscreenchange', schedule, true);
        };
        if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', ready, {once:true}); else ready();
    }

    start();
})();
