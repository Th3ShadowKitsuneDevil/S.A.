// ==UserScript==
// @name         Kindred yt-dlp Helper
// @namespace    kindred-tech.local
// @version      2.0.0
// @description  Adaptive desktop/mobile yt-dlp command helper with touch UI, Android/Termux support, playlists, MP4, MP3, OPUS, Best, and custom ranges.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        *://*/*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_yt-dlp_Helper.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_yt-dlp_Helper.user.js
// ==/UserScript==

(() => {
    'use strict';

    const APP = 'Kindred yt-dlp Helper';
    const KEY = 'kindredYtdlpHelper';
    const PLAYLIST_TEMPLATE = '%(playlist)s/%(playlist_index)03d - %(title)s [%(id)s].%(ext)s';
    const SINGLE_TEMPLATE = '%(title)s [%(id)s].%(ext)s';

    const isAndroid = /Android/i.test(navigator.userAgent);
    const isMobile = (
        isAndroid ||
        /iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        navigator.maxTouchPoints > 0 ||
        matchMedia('(pointer: coarse)').matches
    );

    const getSetting = (name, fallback) => {
        try {
            if (typeof GM_getValue === 'function') return GM_getValue(`${KEY}:${name}`, fallback);
        } catch (_) {}
        try {
            const raw = localStorage.getItem(`${KEY}:${name}`);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    };

    const setSetting = (name, value) => {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(`${KEY}:${name}`, value);
                return;
            }
        } catch (_) {}
        try {
            localStorage.setItem(`${KEY}:${name}`, JSON.stringify(value));
        } catch (_) {}
    };

    let floatingEnabled = getSetting('floatingButton', isMobile);

    function toast(message) {
        if (!document.documentElement) return;

        let el = document.getElementById('kindred-ytdlp-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'kindred-ytdlp-toast';
            el.style.cssText = `
                position:fixed;
                left:50%;
                bottom:max(36px, env(safe-area-inset-bottom));
                transform:translateX(-50%);
                z-index:2147483647;
                max-width:min(90vw,560px);
                padding:10px 14px;
                border-radius:10px;
                background:rgba(0,0,0,.88);
                color:#fff;
                font:14px/1.35 system-ui,sans-serif;
                text-align:center;
                pointer-events:none;
                box-shadow:0 3px 14px rgba(0,0,0,.35);
            `;
            document.documentElement.appendChild(el);
        }

        el.textContent = message;
        el.style.display = 'block';
        clearTimeout(el._timer);
        el._timer = setTimeout(() => {
            el.style.display = 'none';
        }, 1900);
    }

    function shellQuote(value) {
        return "'" + String(value).replace(/'/g, "'\\''") + "'";
    }

    function currentUrl() {
        return location.href;
    }

    function isLikelyPlaylist(url = currentUrl()) {
        try {
            const u = new URL(url);
            return (
                u.searchParams.has('list') ||
                /\/playlist(?:\/|$)/i.test(u.pathname) ||
                /\/sets(?:\/|$)/i.test(u.pathname) ||
                /\/album(?:\/|$)/i.test(u.pathname) ||
                /\/collection(?:\/|$)/i.test(u.pathname)
            );
        } catch (_) {
            return false;
        }
    }

    function formatArgs(format, playlist) {
        const template = playlist ? PLAYLIST_TEMPLATE : SINGLE_TEMPLATE;
        const scope = playlist
            ? `--yes-playlist --ignore-errors -o ${shellQuote(template)}`
            : `--no-playlist -o ${shellQuote(template)}`;

        switch (format) {
            case 'mp4':
                return `${scope} -f "bv*+ba/b" --merge-output-format mp4`;

            case 'mp3':
                return `${scope} -x --audio-format mp3 --audio-quality 0`;

            case 'opus':
                return `${scope} -x --audio-format opus`;

            case 'best':
            default:
                return scope;
        }
    }

    function buildCommand({
        format = 'best',
        playlist = false,
        range = '',
        termux = false
    } = {}) {
        const rangeArg = range ? ` -I ${shellQuote(range)}` : '';
        const command = `yt-dlp ${formatArgs(format, playlist)}${rangeArg} ${shellQuote(currentUrl())}`;

        if (termux) {
            return `cd ~/storage/downloads && ${command}`;
        }

        return command;
    }

    async function copyText(text, message = 'yt-dlp command copied') {
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text, 'text');
                toast(message);
                return;
            }
        } catch (_) {}

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                toast(message);
                return;
            }
        } catch (_) {}

        prompt('Copy this command:', text);
    }

    function copySingle(format, termux = false) {
        copyText(
            buildCommand({ format, playlist: false, termux }),
            `Copied ${termux ? 'Termux ' : ''}current-item ${format.toUpperCase()} command`
        );
    }

    function copyPlaylist(format, termux = false) {
        copyText(
            buildCommand({ format, playlist: true, termux }),
            `Copied ${termux ? 'Termux ' : ''}playlist ${format.toUpperCase()} command`
        );
    }

    function askFormat(defaultFormat = 'mp4') {
        const value = prompt(
            'Format: best, mp4, mp3, or opus',
            defaultFormat
        );

        if (value === null) return null;

        const normalized = String(value).trim().toLowerCase();
        if (!new Set(['best', 'mp4', 'mp3', 'opus']).has(normalized)) {
            alert('Use one of: best, mp4, mp3, opus');
            return null;
        }

        return normalized;
    }

    function copyCustomPlaylist(termux = false) {
        const range = prompt(
            'Playlist items/range for yt-dlp\n\n' +
            'Examples:\n' +
            '1:10 = items 1 through 10\n' +
            '1,3,5 = items 1, 3, and 5\n' +
            '5: = item 5 onward\n' +
            ':20 = first 20 items\n\n' +
            'Leave blank for the whole playlist:',
            ''
        );

        if (range === null) return;

        const format = askFormat('mp4');
        if (!format) return;

        copyText(
            buildCommand({
                format,
                playlist: true,
                range: String(range).trim(),
                termux
            }),
            `Copied ${termux ? 'Termux ' : ''}custom playlist ${format.toUpperCase()} command`
        );
    }

    function registerMenus() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        GM_registerMenuCommand('yt-dlp — Current: Best', () => copySingle('best'));
        GM_registerMenuCommand('yt-dlp — Current: MP4', () => copySingle('mp4'));
        GM_registerMenuCommand('yt-dlp — Current: MP3', () => copySingle('mp3'));
        GM_registerMenuCommand('yt-dlp — Current: OPUS', () => copySingle('opus'));

        GM_registerMenuCommand('yt-dlp — Playlist: Best', () => copyPlaylist('best'));
        GM_registerMenuCommand('yt-dlp — Playlist: MP4', () => copyPlaylist('mp4'));
        GM_registerMenuCommand('yt-dlp — Playlist: MP3', () => copyPlaylist('mp3'));
        GM_registerMenuCommand('yt-dlp — Playlist: OPUS', () => copyPlaylist('opus'));

        GM_registerMenuCommand('yt-dlp — Playlist: Custom range + format', () => copyCustomPlaylist(false));

        if (isAndroid) {
            GM_registerMenuCommand('yt-dlp — Termux: Current MP4', () => copySingle('mp4', true));
            GM_registerMenuCommand('yt-dlp — Termux: Current MP3', () => copySingle('mp3', true));
            GM_registerMenuCommand('yt-dlp — Termux: Playlist MP4', () => copyPlaylist('mp4', true));
            GM_registerMenuCommand('yt-dlp — Termux: Playlist MP3', () => copyPlaylist('mp3', true));
            GM_registerMenuCommand('yt-dlp — Termux: Custom playlist', () => copyCustomPlaylist(true));
        }

        GM_registerMenuCommand('yt-dlp — Copy current URL', () => {
            copyText(currentUrl(), 'Current URL copied');
        });

        GM_registerMenuCommand(
            `yt-dlp — Floating button: ${floatingEnabled ? 'ON' : 'OFF'}`,
            () => {
                floatingEnabled = !floatingEnabled;
                setSetting('floatingButton', floatingEnabled);
                if (floatingEnabled) mountFloatingButton();
                else removeFloatingUi();
                toast(`Floating button ${floatingEnabled ? 'enabled' : 'disabled'}`);
            }
        );
    }

    function button(label, handler, className = '') {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.className = className;
        b.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            handler();
        });
        return b;
    }

    function panelSection(title, entries) {
        const wrap = document.createElement('section');

        const h = document.createElement('div');
        h.textContent = title;
        h.style.cssText = `
            margin:8px 2px 6px;
            color:#ddd;
            font:600 12px/1.2 system-ui,sans-serif;
            text-transform:uppercase;
            letter-spacing:.04em;
        `;
        wrap.appendChild(h);

        const grid = document.createElement('div');
        grid.style.cssText = `
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:7px;
        `;

        for (const [label, fn] of entries) {
            grid.appendChild(button(label, fn));
        }

        wrap.appendChild(grid);
        return wrap;
    }

    function mountPanel() {
        let panel = document.getElementById('kindred-ytdlp-panel');
        if (panel) {
            panel.hidden = !panel.hidden;
            return;
        }

        panel = document.createElement('div');
        panel.id = 'kindred-ytdlp-panel';
        panel.style.cssText = `
            position:fixed;
            right:max(12px, env(safe-area-inset-right));
            bottom:calc(72px + env(safe-area-inset-bottom));
            z-index:2147483646;
            width:min(92vw,390px);
            max-height:min(72vh,620px);
            overflow:auto;
            overscroll-behavior:contain;
            padding:12px;
            border:1px solid rgba(255,255,255,.15);
            border-radius:15px;
            background:rgba(18,18,18,.97);
            color:#fff;
            box-shadow:0 8px 28px rgba(0,0,0,.5);
            font-family:system-ui,sans-serif;
            -webkit-tap-highlight-color:transparent;
        `;

        const titleRow = document.createElement('div');
        titleRow.style.cssText = `
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:8px;
            margin-bottom:6px;
        `;

        const title = document.createElement('strong');
        title.textContent = 'yt-dlp Helper';

        const close = button('×', () => {
            panel.hidden = true;
        }, 'kindred-close');

        close.style.cssText = `
            width:38px;
            min-height:38px;
            font-size:24px;
            padding:0;
        `;

        titleRow.append(title, close);
        panel.appendChild(titleRow);

        panel.appendChild(panelSection('Current item', [
            ['Best', () => copySingle('best')],
            ['MP4', () => copySingle('mp4')],
            ['MP3', () => copySingle('mp3')],
            ['OPUS', () => copySingle('opus')]
        ]));

        panel.appendChild(panelSection('Playlist', [
            ['Best playlist', () => copyPlaylist('best')],
            ['MP4 playlist', () => copyPlaylist('mp4')],
            ['MP3 playlist', () => copyPlaylist('mp3')],
            ['OPUS playlist', () => copyPlaylist('opus')],
            ['Custom range', () => copyCustomPlaylist(false)],
            ['Copy URL', () => copyText(currentUrl(), 'Current URL copied')]
        ]));

        if (isAndroid) {
            panel.appendChild(panelSection('Android / Termux', [
                ['Termux MP4', () => copySingle('mp4', true)],
                ['Termux MP3', () => copySingle('mp3', true)],
                ['Termux playlist MP4', () => copyPlaylist('mp4', true)],
                ['Termux playlist MP3', () => copyPlaylist('mp3', true)],
                ['Termux custom', () => copyCustomPlaylist(true)]
            ]));
        }

        const style = document.createElement('style');
        style.textContent = `
            #kindred-ytdlp-panel button {
                border:0;
                border-radius:10px;
                min-height:44px;
                padding:9px 10px;
                background:#2b2b2b;
                color:#fff;
                font:600 13px/1.2 system-ui,sans-serif;
                touch-action:manipulation;
                cursor:pointer;
            }
            #kindred-ytdlp-panel button:active {
                transform:scale(.98);
                background:#3a3a3a;
            }
        `;

        document.documentElement.append(style, panel);
    }

    function mountFloatingButton() {
        if (!floatingEnabled || document.getElementById('kindred-ytdlp-fab')) return;

        const fab = button('⬇', mountPanel);
        fab.id = 'kindred-ytdlp-fab';
        fab.title = 'Kindred yt-dlp Helper';
        fab.setAttribute('aria-label', 'Open Kindred yt-dlp Helper');

        fab.style.cssText = `
            position:fixed;
            right:max(14px, env(safe-area-inset-right));
            bottom:max(14px, env(safe-area-inset-bottom));
            z-index:2147483645;
            width:54px;
            height:54px;
            padding:0;
            border:0;
            border-radius:50%;
            background:rgba(20,20,20,.92);
            color:#fff;
            box-shadow:0 4px 16px rgba(0,0,0,.45);
            font:700 24px/54px system-ui,sans-serif;
            text-align:center;
            cursor:pointer;
            touch-action:manipulation;
            -webkit-tap-highlight-color:transparent;
        `;

        document.documentElement.appendChild(fab);
    }

    function removeFloatingUi() {
        document.getElementById('kindred-ytdlp-fab')?.remove();
        document.getElementById('kindred-ytdlp-panel')?.remove();
    }

    registerMenus();

    if (floatingEnabled) {
        mountFloatingButton();
    }

    if (isLikelyPlaylist()) {
        console.info(
            `[${APP}] Playlist detected. Playlist commands are available ${
                floatingEnabled ? 'from the floating button and ' : ''
            }in the userscript menu.`
        );
    }
})();
