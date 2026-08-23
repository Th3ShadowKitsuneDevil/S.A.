// ==UserScript==
// @name         Kindred YouTube Fast-Start Lite
// @namespace    kindred-tech.local
// @version      1.7.0
// @description  Compatibility-first desktop/mobile YouTube helper. Leaves playback, controls, chat, queues, fullscreen, networking, and player state untouched; optional ambient/cinematics suppression is off by default and only activates after playback has started.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @run-at       document-start
// @noframes
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js
// ==/UserScript==

(() => {
    'use strict';

    /*
     * v1.7.0 — compatibility-first rebuild
     * -------------------------------------
     *
     * The previous minimal build only used:
     *
     *     #cinematics { display:none !important; }
     *
     * That should not directly control video playback, but this version
     * removes even that early layout change as a possible variable.
     *
     * By default this script makes ZERO page/player changes.
     *
     * Optional ambient/cinematics suppression:
     * - OFF by default.
     * - Can be enabled from the Tampermonkey userscript menu.
     * - Waits until an actual HTML5 video has started playing.
     * - Uses content-visibility/visibility instead of display:none.
     * - Never touches the <video>, player classes, timers, network APIs,
     *   YouTube buttons, live chat, comments, queue, or fullscreen state.
     */

    const APP =
        'Kindred YouTube Fast-Start Lite';

    const SETTING_KEY =
        'kindred-fast-start-lite:ambient-suppression';

    const STYLE_ID =
        'kindred-fast-start-lite-ambient-safe';

    let waitingForPlayback =
        false;


    function getAmbientEnabled() {
        try {
            if (
                typeof GM_getValue ===
                'function'
            ) {
                return !!GM_getValue(
                    SETTING_KEY,
                    false
                );
            }
        } catch (_) {}

        try {
            return (
                localStorage.getItem(
                    SETTING_KEY
                ) ===
                '1'
            );
        } catch (_) {
            return false;
        }
    }


    function setAmbientEnabled(
        value
    ) {
        const enabled =
            !!value;

        try {
            if (
                typeof GM_setValue ===
                'function'
            ) {
                GM_setValue(
                    SETTING_KEY,
                    enabled
                );
            } else {
                localStorage.setItem(
                    SETTING_KEY,
                    enabled
                        ? '1'
                        : '0'
                );
            }
        } catch (_) {
            try {
                localStorage.setItem(
                    SETTING_KEY,
                    enabled
                        ? '1'
                        : '0'
                );
            } catch (_) {}
        }

        if (
            enabled
        ) {
            armAmbientSuppression();

        } else {
            disarmAmbientSuppression();
            removeAmbientStyle();
        }

        console.info(
            `[${APP}] Ambient/cinematics suppression ` +
            `${enabled ? 'enabled' : 'disabled'}.`
        );
    }


    function installAmbientStyle() {
        if (
            !getAmbientEnabled() ||
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
            /*
             * Preserve YouTube's layout box instead of using display:none.
             * content-visibility prevents the ambient subtree from painting
             * while avoiding player/video sizing changes.
             */
            #cinematics,
            ytd-watch-flexy #cinematics {
                content-visibility:
                    hidden !important;

                visibility:
                    hidden !important;

                pointer-events:
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


    function removeAmbientStyle() {
        document.getElementById(
            STYLE_ID
        )?.remove();
    }


    function onVideoPlaying(
        event
    ) {
        if (
            !(
                event.target instanceof
                HTMLVideoElement
            )
        ) {
            return;
        }

        document.removeEventListener(
            'playing',
            onVideoPlaying,
            true
        );

        waitingForPlayback =
            false;

        if (
            getAmbientEnabled()
        ) {
            installAmbientStyle();
        }
    }


    function disarmAmbientSuppression() {
        if (
            !waitingForPlayback
        ) {
            return;
        }

        document.removeEventListener(
            'playing',
            onVideoPlaying,
            true
        );

        waitingForPlayback =
            false;
    }


    function armAmbientSuppression() {
        if (
            !getAmbientEnabled()
        ) {
            disarmAmbientSuppression();
            removeAmbientStyle();
            return;
        }

        const video =
            document.querySelector(
                'video'
            );

        if (
            video &&
            !video.paused &&
            !video.ended &&
            video.readyState >=
                HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
            installAmbientStyle();
            return;
        }

        if (
            waitingForPlayback
        ) {
            return;
        }

        waitingForPlayback =
            true;

        document.addEventListener(
            'playing',
            onVideoPlaying,
            true
        );
    }


    function registerMenus() {
        if (
            typeof GM_registerMenuCommand !==
            'function'
        ) {
            return;
        }

        GM_registerMenuCommand(
            'Fast-Start — Enable ambient suppression',
            () => {
                setAmbientEnabled(
                    true
                );
            }
        );

        GM_registerMenuCommand(
            'Fast-Start — Disable ambient suppression',
            () => {
                setAmbientEnabled(
                    false
                );
            }
        );
    }


    registerMenus();

    if (
        getAmbientEnabled()
    ) {
        armAmbientSuppression();
    }


    document.addEventListener(
        'yt-navigate-finish',
        () => {
            if (
                getAmbientEnabled()
            ) {
                armAmbientSuppression();
            }
        },
        true
    );

})();
