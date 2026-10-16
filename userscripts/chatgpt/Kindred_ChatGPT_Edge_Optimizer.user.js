// ==UserScript==
// @name         Kindred ChatGPT Edge Optimizer
// @namespace    kindred-tech.local
// @version      1.0.0
// @description  Conservative ChatGPT performance/UI optimizer for Microsoft Edge tabs and installed web-app/PWA windows: reduced effects, long-chat render assist, compact mode, and web-app controls without network/timer monkey-patching.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
    'use strict';

    const APP = 'kindredChatGPTOptimizer';

    const IS_EDGE = /Edg\//.test(navigator.userAgent);
    const IS_STANDALONE =
        matchMedia?.('(display-mode: standalone)')?.matches ||
        navigator.standalone === true;

    const DEFAULTS = {
        reduceEffects: true,
        longChatAssist: true,
        compactUi: false,
        wideChat: false,
        pauseHiddenMedia: false,
        floatingButton: IS_STANDALONE
    };

    const state = {
        panelOpen: false
    };

    function getValue(name) {
        try {
            if (typeof GM_getValue === 'function') {
                return GM_getValue(`${APP}:${name}`, DEFAULTS[name]);
            }
        } catch (_) {}

        try {
            const raw = localStorage.getItem(`${APP}:${name}`);
            return raw == null ? DEFAULTS[name] : JSON.parse(raw);
        } catch (_) {
            return DEFAULTS[name];
        }
    }

    function setValue(name, value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(`${APP}:${name}`, value);
            } else {
                localStorage.setItem(`${APP}:${name}`, JSON.stringify(value));
            }
        } catch (_) {}

        applySettings();
    }

    function settings() {
        return Object.fromEntries(
            Object.keys(DEFAULTS).map(key => [key, getValue(key)])
        );
    }

    function installStyle() {
        if (document.getElementById(`${APP}-style`)) return;

        const style = document.createElement('style');
        style.id = `${APP}-style`;
        style.textContent = `
            /* ---------- Reduced visual overhead ---------- */
            html.${APP}-effects {
                scroll-behavior:auto !important;
            }

            html.${APP}-effects *,
            html.${APP}-effects *::before,
            html.${APP}-effects *::after {
                scroll-behavior:auto !important;
            }

            html.${APP}-effects main *,
            html.${APP}-effects nav *,
            html.${APP}-effects aside *,
            html.${APP}-effects header * {
                transition-duration:0.04s !important;
                transition-delay:0s !important;
            }

            html.${APP}-effects textarea,
            html.${APP}-effects [contenteditable="true"] {
                transition:none !important;
                animation:none !important;
                will-change:auto !important;
            }

            html.${APP}-effects [role="dialog"],
            html.${APP}-effects [role="menu"],
            html.${APP}-effects nav,
            html.${APP}-effects aside {
                backdrop-filter:none !important;
                -webkit-backdrop-filter:none !important;
            }

            /* Leave busy/progress indicators alone so streaming status still works. */
            html.${APP}-effects [aria-busy="true"],
            html.${APP}-effects [role="progressbar"] {
                animation-duration:initial !important;
            }

            /* ---------- Long conversation render assist ---------- */
            html.${APP}-longchat main article[data-testid^="conversation-turn"],
            html.${APP}-longchat main article {
                content-visibility:auto;
                contain-intrinsic-size:auto 420px;
            }

            html.${APP}-longchat main img,
            html.${APP}-longchat main video {
                content-visibility:auto;
                contain-intrinsic-size:auto 320px;
            }

            /* ---------- Optional compact mode ---------- */
            html.${APP}-compact nav,
            html.${APP}-compact aside {
                --kindred-compact-gap:4px;
            }

            html.${APP}-compact nav button,
            html.${APP}-compact aside button,
            html.${APP}-compact header button {
                min-height:30px !important;
            }

            html.${APP}-compact main {
                --kindred-main-gap:0.65rem;
            }

            /* ---------- Optional wide conversation ---------- */
            html.${APP}-wide main [class*="max-w-"] {
                max-width:min(96vw, 1120px) !important;
            }

            /* ---------- Web-app / PWA floating controls ---------- */
            #${APP}-button {
                position:fixed;
                right:14px;
                bottom:14px;
                z-index:2147483646;
                width:44px;
                height:44px;
                border:1px solid rgba(127,127,127,.28);
                border-radius:999px;
                background:rgba(22,22,24,.90);
                color:#fff;
                font:19px/1 system-ui,sans-serif;
                box-shadow:0 5px 18px rgba(0,0,0,.35);
                cursor:pointer;
                backdrop-filter:none;
            }

            #${APP}-panel {
                position:fixed;
                right:14px;
                bottom:66px;
                z-index:2147483646;
                width:min(88vw,330px);
                padding:11px;
                border:1px solid rgba(127,127,127,.30);
                border-radius:12px;
                background:rgba(22,22,24,.97);
                color:#fff;
                font:13px/1.35 system-ui,sans-serif;
                box-shadow:0 8px 28px rgba(0,0,0,.45);
            }

            #${APP}-panel[hidden] {
                display:none !important;
            }

            #${APP}-panel .kt-title {
                font-weight:700;
                margin:0 0 8px;
            }

            #${APP}-panel .kt-meta {
                opacity:.7;
                font-size:11px;
                margin:0 0 9px;
            }

            #${APP}-panel .kt-grid {
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:7px;
            }

            #${APP}-panel button {
                min-height:36px;
                border:1px solid rgba(255,255,255,.10);
                border-radius:8px;
                background:#2a2a2e;
                color:#fff;
                font:inherit;
                cursor:pointer;
                padding:7px;
            }

            @media (pointer:coarse), (max-width:600px) {
                #${APP}-button {
                    width:52px;
                    height:52px;
                    font-size:22px;
                }

                #${APP}-panel {
                    left:10px;
                    right:10px;
                    bottom:74px;
                    width:auto;
                }

                #${APP}-panel button {
                    min-height:46px;
                }
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    function applySettings() {
        const s = settings();
        const root = document.documentElement;
        if (!root) return;

        root.classList.toggle(`${APP}-effects`, !!s.reduceEffects);
        root.classList.toggle(`${APP}-longchat`, !!s.longChatAssist);
        root.classList.toggle(`${APP}-compact`, !!s.compactUi);
        root.classList.toggle(`${APP}-wide`, !!s.wideChat);

        const button = document.getElementById(`${APP}-button`);
        if (button) button.hidden = !s.floatingButton;

        refreshPanel();
    }

    function toast(message) {
        let el = document.getElementById(`${APP}-toast`);
        if (!el) {
            el = document.createElement('div');
            el.id = `${APP}-toast`;
            el.style.cssText = `
                position:fixed;left:50%;bottom:28px;transform:translateX(-50%);
                z-index:2147483647;padding:8px 12px;border-radius:8px;
                background:rgba(0,0,0,.88);color:#fff;font:13px system-ui,sans-serif;
                pointer-events:none;box-shadow:0 3px 14px rgba(0,0,0,.35)
            `;
            document.documentElement.appendChild(el);
        }

        el.textContent = message;
        el.hidden = false;
        clearTimeout(el._ktTimer);
        el._ktTimer = setTimeout(() => { el.hidden = true; }, 1600);
    }

    function toggle(name, label) {
        const next = !getValue(name);
        setValue(name, next);
        toast(`${label}: ${next ? 'ON' : 'OFF'}`);
    }

    function makePanelButton(text, handler) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', handler);
        return b;
    }

    function ensureUi() {
        if (!document.documentElement || document.getElementById(`${APP}-button`)) return;

        const button = document.createElement('button');
        button.id = `${APP}-button`;
        button.type = 'button';
        button.textContent = '⚡';
        button.title = 'Kindred ChatGPT Optimizer';

        const panel = document.createElement('div');
        panel.id = `${APP}-panel`;
        panel.hidden = true;

        const title = document.createElement('div');
        title.className = 'kt-title';
        title.textContent = 'Kindred ChatGPT Optimizer';

        const meta = document.createElement('div');
        meta.id = `${APP}-meta`;
        meta.className = 'kt-meta';

        const grid = document.createElement('div');
        grid.className = 'kt-grid';

        grid.append(
            makePanelButton('Effects', () => toggle('reduceEffects', 'Reduced effects')),
            makePanelButton('Long chat', () => toggle('longChatAssist', 'Long-chat assist')),
            makePanelButton('Compact', () => toggle('compactUi', 'Compact UI')),
            makePanelButton('Wide chat', () => toggle('wideChat', 'Wide chat')),
            makePanelButton('Hide button', () => {
                setValue('floatingButton', false);
                state.panelOpen = false;
                panel.hidden = true;
            }),
            makePanelButton('Reset', () => {
                for (const [key, value] of Object.entries(DEFAULTS)) {
                    try {
                        if (typeof GM_setValue === 'function') GM_setValue(`${APP}:${key}`, value);
                        else localStorage.setItem(`${APP}:${key}`, JSON.stringify(value));
                    } catch (_) {}
                }
                applySettings();
                toast('Optimizer settings reset');
            })
        );

        panel.append(title, meta, grid);
        document.documentElement.append(button, panel);

        button.addEventListener('click', () => {
            state.panelOpen = !state.panelOpen;
            panel.hidden = !state.panelOpen;
            refreshPanel();
        });

        applySettings();
    }

    function refreshPanel() {
        const meta = document.getElementById(`${APP}-meta`);
        if (!meta) return;

        const s = settings();
        meta.textContent = [
            IS_EDGE ? 'Edge' : 'Chromium/browser',
            IS_STANDALONE ? 'web-app/PWA' : 'normal tab',
            `effects ${s.reduceEffects ? 'on' : 'off'}`,
            `long-chat ${s.longChatAssist ? 'on' : 'off'}`
        ].join(' • ');
    }

    function registerMenus() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        GM_registerMenuCommand('ChatGPT Optimizer — Reduced effects', () => toggle('reduceEffects', 'Reduced effects'));
        GM_registerMenuCommand('ChatGPT Optimizer — Long-chat assist', () => toggle('longChatAssist', 'Long-chat assist'));
        GM_registerMenuCommand('ChatGPT Optimizer — Compact UI', () => toggle('compactUi', 'Compact UI'));
        GM_registerMenuCommand('ChatGPT Optimizer — Wide chat', () => toggle('wideChat', 'Wide chat'));
        GM_registerMenuCommand('ChatGPT Optimizer — Floating button', () => toggle('floatingButton', 'Floating button'));
    }

    function registerVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden || !getValue('pauseHiddenMedia')) return;

            for (const media of document.querySelectorAll('video,audio')) {
                try {
                    if (!media.paused) media.pause();
                } catch (_) {}
            }
        });
    }

    function registerHotkey() {
        addEventListener('keydown', event => {
            if (!(event.altKey && event.shiftKey && event.code === 'KeyO')) return;

            event.preventDefault();
            ensureUi();

            const panel = document.getElementById(`${APP}-panel`);
            if (!panel) return;

            state.panelOpen = !state.panelOpen;
            panel.hidden = !state.panelOpen;
            refreshPanel();
        }, true);
    }

    function boot() {
        installStyle();
        applySettings();
        registerMenus();
        registerVisibilityHandler();
        registerHotkey();

        const ready = () => {
            ensureUi();
            applySettings();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ready, { once:true });
        } else {
            ready();
        }
    }

    boot();
})();