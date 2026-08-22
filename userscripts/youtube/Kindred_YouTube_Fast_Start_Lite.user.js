// ==UserScript==
// @name         Kindred YouTube Fast-Start Lite
// @namespace    kindred-tech.local
// @version      1.2.0
// @description  Lightweight YouTube performance trim that preserves native animations/queue behavior, hides Kindred Media List add icons, and fully suppresses YouTube live chat/live chat replay.
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

    const STYLE_ID = 'kindred-fast-start-lite';

    const ADD_SELECTORS = [
        '[title^="Add to Media List"]',
        '[aria-label^="Add to Media List"]',
        '[data-tooltip-text^="Add to Media List"]'
    ];

    const CHAT_SELECTORS = [
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
        '[data-panel-identifier*="live-chat" i]'
    ];

    function installCss() {
        if (!document.documentElement) return;

        let style = document.getElementById(STYLE_ID);

        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }

        style.textContent = `
            #cinematics,
            ytd-watch-flexy #cinematics {
                display:none !important;
            }

            html,
            body {
                scroll-behavior:auto !important;
            }

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
            ytd-engagement-panel-section-list-renderer[target-id*="live-chat" i],
            ytd-engagement-panel-section-list-renderer[panel-identifier*="live-chat" i],
            [data-panel-identifier*="live-chat" i] {
                display:none !important;
                visibility:hidden !important;
                width:0 !important;
                height:0 !important;
                min-width:0 !important;
                min-height:0 !important;
                max-width:0 !important;
                max-height:0 !important;
                margin:0 !important;
                padding:0 !important;
                border:0 !important;
                overflow:hidden !important;
                pointer-events:none !important;
            }
        `;
    }

    function cleanupLegacyAddButtons() {
        if (!document.documentElement) return;

        const markers = document.querySelectorAll(ADD_SELECTORS.join(','));

        for (const marker of markers) {
            const clickable =
                marker.matches('button,yt-icon-button,tp-yt-paper-icon-button,[role="button"]')
                    ? marker
                    : marker.closest('button,yt-icon-button,tp-yt-paper-icon-button,[role="button"]');

            const target = clickable || marker;
            target.style.setProperty('display', 'none', 'important');
            target.style.setProperty('visibility', 'hidden', 'important');
            target.style.setProperty('pointer-events', 'none', 'important');
        }
    }

    function collapseConversationBar(conversationBar) {
        const renderer =
            conversationBar?.liveChatRenderer ||
            conversationBar?.liveChatRenderer?.liveChatRenderer;

        if (!renderer) return;

        renderer.initialDisplayState = 'LIVE_CHAT_DISPLAY_STATE_COLLAPSED';

        const toggle = renderer.showHideButton?.toggleButtonRenderer;
        if (toggle) toggle.isToggled = false;
    }

    function suppressExistingChat() {
        if (!document.documentElement) return;

        const chat = document.getElementById('chat');

        if (chat) {
            try { chat.collapsed = true; } catch (_) {}
            chat.setAttribute('collapsed', '');
            try { collapseConversationBar(chat.data); } catch (_) {}
        }

        for (const element of document.querySelectorAll(CHAT_SELECTORS.join(','))) {
            element.style.setProperty('display', 'none', 'important');
            element.style.setProperty('visibility', 'hidden', 'important');
            element.setAttribute('aria-hidden', 'true');
        }
    }

    function refresh() {
        installCss();
        cleanupLegacyAddButtons();
        suppressExistingChat();

        setTimeout(cleanupLegacyAddButtons, 250);
        setTimeout(cleanupLegacyAddButtons, 1000);

        setTimeout(suppressExistingChat, 100);
        setTimeout(suppressExistingChat, 500);
        setTimeout(suppressExistingChat, 1500);
        setTimeout(suppressExistingChat, 3500);
    }

    document.addEventListener(
        'yt-page-data-fetched',
        event => {
            try {
                const conversationBar =
                    event.detail
                        ?.pageData
                        ?.response
                        ?.contents
                        ?.twoColumnWatchNextResults
                        ?.conversationBar;

                collapseConversationBar(conversationBar);
            } catch (_) {}

            setTimeout(suppressExistingChat, 0);
        },
        true
    );

    installCss();

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            refresh,
            { once:true }
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
