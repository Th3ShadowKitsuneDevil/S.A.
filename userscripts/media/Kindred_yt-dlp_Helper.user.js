// ==UserScript==
// @name         Kindred yt-dlp Helper
// @namespace    kindred-tech.local
// @version      1.0.0
// @description  Copy ready-to-run yt-dlp commands for single videos and playlists, including Best, MP4, MP3, OPUS, playlist folders, and custom playlist ranges.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        *://*/*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_yt-dlp_Helper.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_yt-dlp_Helper.user.js
// ==/UserScript==

(() => {
    'use strict';

    const APP = 'Kindred yt-dlp Helper';
    const PLAYLIST_TEMPLATE = '%(playlist)s/%(playlist_index)03d - %(title)s [%(id)s].%(ext)s';

    function toast(message) {
        if (!document.documentElement) return;

        let el = document.getElementById('kindred-ytdlp-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'kindred-ytdlp-toast';
            el.style.cssText = `
                position:fixed;
                left:50%;
                bottom:36px;
                transform:translateX(-50%);
                z-index:2147483647;
                padding:9px 13px;
                border-radius:8px;
                background:rgba(0,0,0,.86);
                color:#fff;
                font:13px/1.35 Arial,sans-serif;
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
        }, 1800);
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
                /\/album(?:\/|$)/i.test(u.pathname)
            );
        } catch (_) {
            return false;
        }
    }

    function formatArgs(format, playlist) {
        const common = playlist
            ? `--yes-playlist --ignore-errors -o ${shellQuote(PLAYLIST_TEMPLATE)}`
            : '--no-playlist';

        switch (format) {
            case 'mp4':
                return `${common} -f "bv*+ba/b" --merge-output-format mp4`;

            case 'mp3':
                return `${common} -x --audio-format mp3 --audio-quality 0`;

            case 'opus':
                return `${common} -x --audio-format opus`;

            case 'best':
            default:
                return `${common}`;
        }
    }

    function buildCommand({
        format = 'best',
        playlist = false,
        range = ''
    } = {}) {
        const rangeArg = range
            ? ` -I ${shellQuote(range)}`
            : '';

        return `yt-dlp ${formatArgs(format, playlist)}${rangeArg} ${shellQuote(currentUrl())}`;
    }

    function copy(text, message) {
        try {
            GM_setClipboard(text, 'text');
            toast(message || 'yt-dlp command copied');
        } catch (_) {
            navigator.clipboard?.writeText(text)
                .then(() => toast(message || 'yt-dlp command copied'))
                .catch(() => prompt('Copy this command:', text));
        }
    }

    function copySingle(format) {
        copy(
            buildCommand({ format, playlist: false }),
            `Copied current-item ${format.toUpperCase()} command`
        );
    }

    function copyPlaylist(format) {
        copy(
            buildCommand({ format, playlist: true }),
            `Copied playlist ${format.toUpperCase()} command`
        );
    }

    function copyCustomPlaylist() {
        const range = prompt(
            'Playlist items/range for yt-dlp\n\nExamples:\n1:10 = items 1 through 10\n1,3,5 = items 1, 3, and 5\n5: = item 5 onward\n:20 = first 20 items\n\nLeave blank for the whole playlist:',
            ''
        );

        if (range === null) return;

        const format = prompt(
            'Format: best, mp4, mp3, or opus',
            'mp4'
        );

        if (format === null) return;

        const normalized = String(format).trim().toLowerCase();
        const allowed = new Set(['best', 'mp4', 'mp3', 'opus']);

        if (!allowed.has(normalized)) {
            alert('Use one of: best, mp4, mp3, opus');
            return;
        }

        copy(
            buildCommand({
                format: normalized,
                playlist: true,
                range: String(range).trim()
            }),
            `Copied custom playlist ${normalized.toUpperCase()} command`
        );
    }

    function copyPlaylistUrlOnly() {
        copy(currentUrl(), 'Playlist/page URL copied');
    }

    GM_registerMenuCommand('yt-dlp — Current: Best', () => copySingle('best'));
    GM_registerMenuCommand('yt-dlp — Current: MP4', () => copySingle('mp4'));
    GM_registerMenuCommand('yt-dlp — Current: MP3', () => copySingle('mp3'));
    GM_registerMenuCommand('yt-dlp — Current: OPUS', () => copySingle('opus'));

    GM_registerMenuCommand('yt-dlp — Playlist: Best', () => copyPlaylist('best'));
    GM_registerMenuCommand('yt-dlp — Playlist: MP4', () => copyPlaylist('mp4'));
    GM_registerMenuCommand('yt-dlp — Playlist: MP3', () => copyPlaylist('mp3'));
    GM_registerMenuCommand('yt-dlp — Playlist: OPUS', () => copyPlaylist('opus'));

    GM_registerMenuCommand('yt-dlp — Playlist: Custom range + format', copyCustomPlaylist);
    GM_registerMenuCommand('yt-dlp — Copy current URL', copyPlaylistUrlOnly);

    if (isLikelyPlaylist()) {
        console.info(`[${APP}] Playlist detected. Playlist download commands are available in the userscript menu.`);
    }
})();
