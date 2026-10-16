// ==UserScript==
// @name         Kindred ChatGPT Low-Spec Optimizer (Firefox / Cross-Browser)
// @namespace    kindred-tech.local
// @version      1.0.1
// @description  CSS-only, user-switchable low-spec profiles for ChatGPT: reduced UI effects and optional long-chat rendering assistance.
// @author       Kindred
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const KEY = 'kindred.chatgpt.optimizer.profile';
  const PROFILES = ['Off', 'Light', 'Balanced', 'Aggressive'];
  const CLASS = {
    Light: 'kindred-chatgpt-light',
    Balanced: 'kindred-chatgpt-balanced',
    Aggressive: 'kindred-chatgpt-aggressive',
  };
  const STYLE_ID = 'kindred-chatgpt-low-spec-style';

  // No fetch/XHR/WebSocket, timers, React internals, or chat message mutations.
  const STYLE = `
    /* Light: remove smooth scrolling. */
    html:is(.kindred-chatgpt-light, .kindred-chatgpt-balanced, .kindred-chatgpt-aggressive) {
      scroll-behavior: auto !important;
    }

    /* Balanced and Aggressive: lighter UI painting in large conversations. */
    html:is(.kindred-chatgpt-balanced, .kindred-chatgpt-aggressive) :is(nav, aside, [role="dialog"], [role="menu"]) {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    html:is(.kindred-chatgpt-balanced, .kindred-chatgpt-aggressive) main [class*="shadow-"] {
      box-shadow: none !important;
    }
    html:is(.kindred-chatgpt-balanced, .kindred-chatgpt-aggressive) :is(main, nav, aside) * {
      transition-duration: 0.06s !important;
      transition-delay: 0s !important;
      scroll-behavior: auto !important;
    }
    html:is(.kindred-chatgpt-balanced, .kindred-chatgpt-aggressive) :is(textarea, [contenteditable="true"]) {
      animation: none !important;
      transition: none !important;
      will-change: auto !important;
    }

    /* Reduce background animation painting while the tab is hidden. */
    html.kindred-chatgpt-hidden:is(.kindred-chatgpt-balanced, .kindred-chatgpt-aggressive) :is(main, nav, aside) * {
      animation-play-state: paused !important;
    }

    /* Aggressive only. Browser may skip layout/paint for off-screen turns. */
    html.kindred-chatgpt-aggressive main article[data-testid^="conversation-turn"],
    html.kindred-chatgpt-aggressive main [data-message-author-role] {
      content-visibility: auto;
      contain-intrinsic-size: auto 360px;
    }
  `;

  function readProfile() {
    let profile = 'Balanced';
    try { profile = GM_getValue(KEY, 'Balanced'); } catch (_) {}
    return PROFILES.includes(profile) ? profile : 'Balanced';
  }

  function setProfile(name) {
    try { GM_setValue(KEY, name); } catch (_) {}
    applyProfile(name);
    console.info(`[Kindred ChatGPT Optimizer] ${name} profile active`);
  }

  function ensureStyle() {
    if (!document.documentElement || document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = STYLE;
    (document.head || document.documentElement).appendChild(el);
  }

  function applyProfile(profile = readProfile()) {
    const root = document.documentElement;
    if (!root) return;
    ensureStyle();
    Object.values(CLASS).forEach(name => root.classList.remove(name));
    if (CLASS[profile]) root.classList.add(CLASS[profile]);
    root.classList.toggle('kindred-chatgpt-hidden', document.hidden);
  }

  // Switch instantly through Tampermonkey's extension menu (no reload needed).
  PROFILES.forEach(profile => {
    GM_registerMenuCommand(`Kindred optimizer → ${profile}`, () => setProfile(profile));
  });
  GM_registerMenuCommand('Kindred optimizer → Show current profile', () => {
    alert(`Kindred ChatGPT Optimizer: ${readProfile()}`);
  });

  document.addEventListener('visibilitychange', () => {
    document.documentElement?.classList.toggle('kindred-chatgpt-hidden', document.hidden);
  });

  if (document.documentElement) {
    applyProfile();
  } else {
    document.addEventListener('DOMContentLoaded', () => applyProfile(), { once: true });
  }
})();