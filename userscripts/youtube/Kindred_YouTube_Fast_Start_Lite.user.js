// ==UserScript==
// @name         Kindred YouTube Fast-Start Lite
// @namespace    kindred-tech.local
// @version      1.6.2
// @description  Minimal desktop/mobile-safe YouTube performance helper: disables only the cinematic/ambient background and leaves chat, buttons, queues, fullscreen, player sizing, and input completely native.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @run-at       document-start
// @noframes
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js
// ==/UserScript==

(() => {
    'use strict';

    /*
     * MINIMAL / SAFE BUILD
     * ---------------------
     *
     * This version intentionally does ONE performance tweak only:
     *
     *     hide YouTube's cinematic/ambient background.
     *
     * It does NOT:
     *
     * - hide or modify any buttons
     * - use :has()
     * - change pointer-events
     * - attach click listeners
     * - intercept keyboard input
     * - touch Live Chat / Chat Replay
     * - touch Comments
     * - touch Share / Save / Ask
     * - touch fullscreen UI
     * - touch the fixed side rail
     * - touch the video element
     * - touch queue items
     * - add MutationObservers
     * - change player classes
     * - change animation / transition behavior
     */

    const STYLE_ID =
        'kindred-fast-start-lite-safe';

    function install() {
        if (
            !document.documentElement ||
            document.getElementById(
                STYLE_ID
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id =
            STYLE_ID;

        style.textContent = `
            #cinematics,
            ytd-watch-flexy #cinematics {
                display:
                    none !important;
            }
        `;

        (
            document.head ||
            document.documentElement
        ).appendChild(
            style
        );
    }

    install();

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            install,
            {
                once:
                    true
            }
        );
    }

    document.addEventListener(
        'yt-navigate-finish',
        install,
        true
    );

})();
