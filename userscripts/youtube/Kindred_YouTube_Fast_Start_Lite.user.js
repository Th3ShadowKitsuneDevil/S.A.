// ==UserScript==
// @name         Kindred YouTube Fast-Start Lite
// @namespace    kindred-tech.local
// @version      1.3.0
// @description  Lightweight YouTube cleanup that preserves native playback/queue animations, hides Kindred add icons, suppresses live chat/replay, and disables YouTube's fullscreen quick-actions/comments/grid UI.
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

    /*
     * Classic/live-chat and side-panel variants.
     * Normal below-the-video comments are intentionally NOT targeted.
     */
    const CHAT_PANEL_SELECTORS = [
        '#chat',
        '#chat-container',
        'ytd-live-chat-frame',
        'yt-live-chat-app',
        'yt-live-chat-renderer',
        'yt-live-chat-header-renderer',
        'yt-live-chat-item-list-renderer',
        'iframe#chatframe',
        'iframe[src*="/live_chat"]',
        'iframe[src*="live_chat_replay"]',

        'ytd-engagement-panel-section-list-renderer[target-id*="live-chat" i]',
        'ytd-engagement-panel-section-list-renderer[panel-identifier*="live-chat" i]',
        '[data-panel-identifier*="live-chat" i]',

        /*
         * Newer fullscreen Comments panel.
         * This is an engagement panel, not the normal #comments section.
         */
        'ytd-engagement-panel-section-list-renderer[target-id*="comments" i]',
        'ytd-engagement-panel-section-list-renderer[panel-identifier*="comments" i]',
        '[data-panel-identifier*="comments" i]'
    ];

    /*
     * YouTube's newer fullscreen/grid state classes.
     * When one of these remains active after hiding the visible panel,
     * the video can stay shifted/squeezed even though the panel itself
     * looks gone.
     */
    const GRID_STATE_CLASSES = [
        'ytp-fullscreen-grid-active',
        'ytp-grid-scrolling',
        'ytp-grid-scrollable',
        'ytp-fullscreen-grid-peeking'
    ];

    let guardedPlayer =
        null;

    let playerObserver =
        null;


    /*
     * -----------------------------------------------------
     * CSS
     * -----------------------------------------------------
     */

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
             * Keep YouTube's ambient cinematic
             * background disabled.
             */
            #cinematics,
            ytd-watch-flexy #cinematics {
                display:
                    none !important;
            }


            /*
             * Do NOT disable normal YouTube
             * transitions/animations.
             */
            html,
            body {
                scroll-behavior:
                    auto !important;
            }


            /*
             * ---------------------------------------------
             * REMOVE KINDRED "ADD TO MEDIA LIST" BUTTONS
             * ---------------------------------------------
             *
             * YouTube's own Save control is not targeted.
             */

            [title^="Add to Media List"],
            [aria-label^="Add to Media List"],
            [data-tooltip-text^="Add to Media List"],

            button:has(
                [title^="Add to Media List"]
            ),

            button:has(
                [aria-label^="Add to Media List"]
            ),

            button:has(
                [data-tooltip-text^="Add to Media List"]
            ),

            yt-icon-button:has(
                [title^="Add to Media List"]
            ),

            yt-icon-button:has(
                [aria-label^="Add to Media List"]
            ),

            tp-yt-paper-icon-button:has(
                [title^="Add to Media List"]
            ),

            tp-yt-paper-icon-button:has(
                [aria-label^="Add to Media List"]
            ),

            [role="button"]:has(
                [title^="Add to Media List"]
            ),

            [role="button"]:has(
                [aria-label^="Add to Media List"]
            ) {
                display:
                    none !important;

                visibility:
                    hidden !important;

                pointer-events:
                    none !important;
            }


            /*
             * ---------------------------------------------
             * CLASSIC LIVE CHAT / CHAT REPLAY
             * ---------------------------------------------
             */

            #chat,
            #chat-container,
            ytd-live-chat-frame,
            yt-live-chat-app,
            yt-live-chat-renderer,
            yt-live-chat-header-renderer,
            yt-live-chat-item-list-renderer,
            iframe#chatframe,
            iframe[src*="/live_chat"],
            iframe[src*="live_chat_replay"],

            ytd-engagement-panel-section-list-renderer[
                target-id*="live-chat" i
            ],

            ytd-engagement-panel-section-list-renderer[
                panel-identifier*="live-chat" i
            ],

            [data-panel-identifier*="live-chat" i],


            /*
             * New comments engagement/side panel.
             *
             * This does NOT target normal:
             *
             *     #comments
             *
             * below the video.
             */

            ytd-engagement-panel-section-list-renderer[
                target-id*="comments" i
            ],

            ytd-engagement-panel-section-list-renderer[
                panel-identifier*="comments" i
            ],

            [data-panel-identifier*="comments" i] {
                display:
                    none !important;

                visibility:
                    hidden !important;

                width:
                    0 !important;

                height:
                    0 !important;

                min-width:
                    0 !important;

                min-height:
                    0 !important;

                max-width:
                    0 !important;

                max-height:
                    0 !important;

                margin:
                    0 !important;

                padding:
                    0 !important;

                border:
                    0 !important;

                overflow:
                    hidden !important;

                pointer-events:
                    none !important;
            }


            /*
             * ---------------------------------------------
             * NEW FULLSCREEN QUICK-ACTIONS UI
             * ---------------------------------------------
             *
             * This is the row that contains the newer
             * Like / Dislike / Comments / Share / Ask /
             * More buttons in fullscreen.
             *
             * The lit speech-bubble icon in the supplied
             * screenshot comes from this UI family.
             */

            #movie_player
                .ytp-fullscreen-quick-actions,

            #movie_player
                .ytp-fullscreen-grid,

            #movie_player
                .ytp-fullscreen-grid-stills-container,

            #movie_player
                .ytp-fullscreen-grid-expand-button {

                display:
                    none !important;

                visibility:
                    hidden !important;

                opacity:
                    0 !important;

                pointer-events:
                    none !important;

                width:
                    0 !important;

                height:
                    0 !important;

                min-width:
                    0 !important;

                min-height:
                    0 !important;

                max-width:
                    0 !important;

                max-height:
                    0 !important;

                margin:
                    0 !important;

                padding:
                    0 !important;
            }


            /*
             * Neutralize YouTube's fullscreen-grid
             * layout variables.
             *
             * This is what prevents the video from
             * remaining shifted/squeezed after the
             * comments/grid UI has been suppressed.
             */

            #movie_player {
                --ytp-grid-scroll-percentage:
                    0 !important;

                --ytp-grid-peek-height:
                    0px !important;
            }
        `;
    }


    /*
     * -----------------------------------------------------
     * KINDRED ADD-BUTTON FALLBACK
     * -----------------------------------------------------
     */

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
            const marker of
            markers
        ) {
            const clickable =
                marker.matches(
                    'button,' +
                    'yt-icon-button,' +
                    'tp-yt-paper-icon-button,' +
                    '[role="button"]'
                )
                    ? marker
                    : marker.closest(
                        'button,' +
                        'yt-icon-button,' +
                        'tp-yt-paper-icon-button,' +
                        '[role="button"]'
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


    /*
     * -----------------------------------------------------
     * LIVE-CHAT PAGE DATA
     * -----------------------------------------------------
     */

    function collapseConversationBar(
        conversationBar
    ) {
        const renderer =
            conversationBar
                ?.liveChatRenderer
            ||
            conversationBar
                ?.liveChatRenderer
                ?.liveChatRenderer;

        if (
            !renderer
        ) {
            return;
        }

        renderer.initialDisplayState =
            'LIVE_CHAT_DISPLAY_STATE_COLLAPSED';

        const toggle =
            renderer
                .showHideButton
                ?.toggleButtonRenderer;

        if (
            toggle
        ) {
            toggle.isToggled =
                false;
        }
    }


    /*
     * -----------------------------------------------------
     * CLOSE/HIDE CHAT + COMMENT PANELS
     * -----------------------------------------------------
     */

    function suppressSidePanels() {
        if (
            !document.documentElement
        ) {
            return;
        }

        const chat =
            document.getElementById(
                'chat'
            );

        if (
            chat
        ) {
            try {
                chat.collapsed =
                    true;

            } catch (_) {}

            chat.setAttribute(
                'collapsed',
                ''
            );

            try {
                collapseConversationBar(
                    chat.data
                );

            } catch (_) {}
        }


        /*
         * If YouTube currently has the fullscreen
         * Comments/Chat quick-action toggled ON,
         * click it once to return the player to its
         * untoggled state before hiding the control.
         */
        const expandedPanel =
            document.querySelector(
                'ytd-engagement-panel-section-list-renderer' +
                '[target-id*="comments" i]' +
                '[visibility*="EXPANDED" i], ' +

                'ytd-engagement-panel-section-list-renderer' +
                '[panel-identifier*="comments" i]' +
                '[visibility*="EXPANDED" i], ' +

                'ytd-engagement-panel-section-list-renderer' +
                '[target-id*="live-chat" i]' +
                '[visibility*="EXPANDED" i], ' +

                'ytd-engagement-panel-section-list-renderer' +
                '[panel-identifier*="live-chat" i]' +
                '[visibility*="EXPANDED" i]'
            );

        if (
            expandedPanel
        ) {
            const quickButtons =
                document.querySelectorAll(
                    '.ytp-fullscreen-quick-actions ' +
                    'button[aria-label]'
                );

            for (
                const button of
                quickButtons
            ) {
                const label =
                    button.getAttribute(
                        'aria-label'
                    )
                    ||
                    '';

                if (
                    /comments?|live\s*chat|chat\s*replay/i
                        .test(
                            label
                        )
                ) {
                    try {
                        button.click();

                    } catch (_) {}

                    break;
                }
            }
        }


        for (
            const element of
            document.querySelectorAll(
                CHAT_PANEL_SELECTORS.join(',')
            )
        ) {
            element.style.setProperty(
                'display',
                'none',
                'important'
            );

            element.style.setProperty(
                'visibility',
                'hidden',
                'important'
            );

            element.setAttribute(
                'aria-hidden',
                'true'
            );
        }
    }


    /*
     * -----------------------------------------------------
     * FULLSCREEN PLAYER STABILIZATION
     * -----------------------------------------------------
     */

    function stabilizePlayer() {
        const player =
            document.getElementById(
                'movie_player'
            );

        if (
            !player
        ) {
            return;
        }

        for (
            const className of
            GRID_STATE_CLASSES
        ) {
            if (
                player.classList.contains(
                    className
                )
            ) {
                player.classList.remove(
                    className
                );
            }
        }
    }


    function attachPlayerGuard() {
        const player =
            document.getElementById(
                'movie_player'
            );

        if (
            !player
            ||
            player === guardedPlayer
        ) {
            return;
        }

        playerObserver
            ?.disconnect();

        guardedPlayer =
            player;

        stabilizePlayer();


        /*
         * Only watch the player's CLASS attribute.
         *
         * This is intentionally tiny compared with
         * observing the whole YouTube DOM.
         */
        playerObserver =
            new MutationObserver(
                () => {
                    stabilizePlayer();
                }
            );

        playerObserver.observe(
            player,
            {
                attributes:
                    true,

                attributeFilter:
                    [
                        'class'
                    ]
            }
        );
    }


    /*
     * -----------------------------------------------------
     * REFRESH
     * -----------------------------------------------------
     */

    function refresh() {
        installCss();

        cleanupLegacyAddButtons();

        suppressSidePanels();

        attachPlayerGuard();

        stabilizePlayer();


        /*
         * YouTube creates some controls asynchronously.
         * Keep this a short finite burst rather than
         * continuously polling the page.
         */

        setTimeout(
            cleanupLegacyAddButtons,
            250
        );

        setTimeout(
            cleanupLegacyAddButtons,
            1000
        );


        for (
            const delay of
            [
                0,
                100,
                400,
                1000,
                2000,
                4000
            ]
        ) {
            setTimeout(
                () => {
                    suppressSidePanels();

                    attachPlayerGuard();

                    stabilizePlayer();
                },
                delay
            );
        }
    }


    /*
     * -----------------------------------------------------
     * EARLY YOUTUBE PAGE DATA
     * -----------------------------------------------------
     */

    document.addEventListener(
        'yt-page-data-fetched',

        event => {
            try {
                const conversationBar =
                    event
                        .detail
                        ?.pageData
                        ?.response
                        ?.contents
                        ?.twoColumnWatchNextResults
                        ?.conversationBar;

                collapseConversationBar(
                    conversationBar
                );

            } catch (_) {}


            setTimeout(
                () => {
                    suppressSidePanels();

                    attachPlayerGuard();

                    stabilizePlayer();
                },
                0
            );
        },

        true
    );


    /*
     * -----------------------------------------------------
     * FULLSCREEN TRANSITIONS
     * -----------------------------------------------------
     */

    document.addEventListener(
        'fullscreenchange',

        () => {
            suppressSidePanels();

            attachPlayerGuard();

            stabilizePlayer();

            setTimeout(
                stabilizePlayer,
                100
            );

            setTimeout(
                stabilizePlayer,
                500
            );
        },

        true
    );


    /*
     * -----------------------------------------------------
     * START
     * -----------------------------------------------------
     *
     * Deliberately untouched:
     *
     * - normal YouTube animations
     * - queue animations
     * - video playback
     * - requestAnimationFrame
     * - requestIdleCallback
     * - fetch/XMLHttpRequest
     * - setInterval
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
                once:
                    true
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
