// ==UserScript==
// @name         Kindred YouTube Fast-Start Lite
// @namespace    kindred-tech.local
// @version      1.0.0
// @description  Lightweight YouTube performance trim that avoids scheduler/timer/appendChild monkey-patching and stays compatible with media popup and restriction scripts.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://music.youtube.com/*
// @run-at       document-start
// @noframes
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js
// ==/UserScript==

(() => {
    'use strict';

    const STYLE_ID = 'kindred-fast-start-lite';

    function installCss() {
        if (
            !document.documentElement ||
            document.getElementById(STYLE_ID)
        ) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #cinematics,
            ytd-watch-flexy #cinematics,
            tp-yt-paper-ripple {
                display:none !important;
            }

            yt-animated-rolling-number,
            yt-animated-rolling-number *,
            .yt-spec-touch-feedback-shape__fill,
            .yt-spec-touch-feedback-shape__stroke {
                animation:none !important;
                transition:none !important;
            }

            html,
            body {
                scroll-behavior:auto !important;
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    /*
     * Deliberately leaves these native:
     * requestIdleCallback, requestAnimationFrame,
     * setTimeout, setInterval, appendChild,
     * JSON.parse, fetch, Request and XMLHttpRequest.
     */

    installCss();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installCss, { once:true });
    }

    document.addEventListener('yt-navigate-finish', installCss, true);
})();
