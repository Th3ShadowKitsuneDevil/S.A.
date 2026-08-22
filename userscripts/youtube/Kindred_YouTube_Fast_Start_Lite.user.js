// ==UserScript==
// @name         Kindred YouTube Fast-Start Lite
// @namespace    kindred-tech.local
// @version      1.1.0
// @description  Lightweight YouTube performance trim that preserves native animations/queue reordering while hiding Kindred Media List add icons across YouTube.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://music.youtube.com/*
// @run-at       document-start
// @noframes
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js
// ==/UserScript==

(() => {
    'use strict';

    const STYLE_ID =
        'kindred-fast-start-lite';

    const ADD_SELECTORS = [
        '[title^="Add to Media List"]',
        '[aria-label^="Add to Media List"]',
        '[data-tooltip-text^="Add to Media List"]'
    ];

    function installCss() {
        if (
            !document.documentElement
        ) {
            return;
        }

        let style =
            document.getElementById(
                STYLE_ID
            );

        if (
            !style
        ) {
            style =
                document.createElement(
                    'style'
                );

            style.id =
                STYLE_ID;

            (
                document.head ||
                document.documentElement
            ).appendChild(
                style
            );
        }

        style.textContent = `
            /*
             * Keep the expensive ambient cinematic
             * background disabled.
             */
            #cinematics,
            ytd-watch-flexy #cinematics {
                display:none !important;
            }

            /*
             * Keep scrolling immediate without
             * suppressing YouTube's native queue
             * animations/transitions.
             */
            html,
            body {
                scroll-behavior:auto !important;
            }

            /*
             * Remove Kindred Media Toolkit's
             * "Add to Media List" icon everywhere
             * on YouTube while leaving YouTube's own
             * Save/Add-to-playlist controls intact.
             */
            [title^="Add to Media List"],
            [aria-label^="Add to Media List"],
            [data-tooltip-text^="Add to Media List"],

            button:has([title^="Add to Media List"]),
            button:has([aria-label^="Add to Media List"]),
            button:has([data-tooltip-text^="Add to Media List"]),

            yt-icon-button:has([title^="Add to Media List"]),
            yt-icon-button:has([aria-label^="Add to Media List"]),

            tp-yt-paper-icon-button:has([title^="Add to Media List"]),
            tp-yt-paper-icon-button:has([aria-label^="Add to Media List"]),

            [role="button"]:has([title^="Add to Media List"]),
            [role="button"]:has([aria-label^="Add to Media List"]) {
                display:none !important;
                visibility:hidden !important;
                pointer-events:none !important;
            }
        `;
    }

    function cleanupLegacyAddButtons() {
        if (
            !document.documentElement
        ) {
            return;
        }

        const markers =
            document.querySelectorAll(
                ADD_SELECTORS.join(',')
            );

        for (
            const marker of markers
        ) {
            const clickable =
                marker.matches(
                    'button,yt-icon-button,tp-yt-paper-icon-button,[role="button"]'
                )
                    ? marker
                    : marker.closest(
                        'button,yt-icon-button,tp-yt-paper-icon-button,[role="button"]'
                    );

            const target =
                clickable ||
                marker;

            target.style.setProperty(
                'display',
                'none',
                'important'
            );

            target.style.setProperty(
                'visibility',
                'hidden',
                'important'
            );

            target.style.setProperty(
                'pointer-events',
                'none',
                'important'
            );
        }
    }

    function refresh() {
        installCss();

        cleanupLegacyAddButtons();

        setTimeout(
            cleanupLegacyAddButtons,
            250
        );

        setTimeout(
            cleanupLegacyAddButtons,
            1000
        );
    }

    /*
     * Deliberately leave YouTube's native animation,
     * transition, drag/reorder, scheduling, and network
     * behavior alone:
     *
     * requestIdleCallback
     * requestAnimationFrame
     * setTimeout / setInterval
     * appendChild
     * JSON.parse
     * fetch / Request / XMLHttpRequest
     * CSS animations / transitions
     */

    installCss();

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            refresh,
            {
                once:true
            }
        );

    } else {
        refresh();
    }

    document.addEventListener(
        'yt-navigate-finish',
        refresh,
        true
    );
})();
