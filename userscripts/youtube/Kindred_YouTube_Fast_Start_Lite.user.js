// ==UserScript==
// @name         Kindred YouTube Fast-Start Lite
// @namespace    kindred-tech.local
// @version      1.5.0
// @description  YouTube cleanup/performance helper with chat/side-rail suppression, Kindred add-icon cleanup, native queue animations, and persistent fullscreen Fit/Fill/Zoom/Stretch sizing.
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

  const STYLE_ID='kindred-fast-start-lite';
  const SIZE_KEY='kindred-youtube-fullscreen-video-size';
  const SIZE_MODES=['fit','fill','zoom','stretch'];
  const SIZE_LABELS={fit:'FIT',fill:'FILL',zoom:'ZOOM',stretch:'STRETCH'};

  const ADD_MARKERS=[
    '[title^="Add to Media List"]',
    '[aria-label^="Add to Media List"]',
    '[data-tooltip-text^="Add to Media List"]'
  ];

  const PANEL_SELECTORS=[
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
    'ytd-engagement-panel-section-list-renderer[target-id*="comments" i]',
    'ytd-engagement-panel-section-list-renderer[panel-identifier*="comments" i]',
    '[data-panel-identifier*="comments" i]'
  ];

  const SIDE_RAIL=[
    '#fixed-side-menu',
    '.ytSideRailViewModelHost',
    '.ytSideRailViewModelHideButtonContainer'
  ];

  const GRID_CLASSES=[
    'ytp-fullscreen-grid-active',
    'ytp-grid-scrolling',
    'ytp-grid-scrollable',
    'ytp-fullscreen-grid-peeking'
  ];

  let sizeMode=loadSize();
  let guardedPlayer=null;
  let playerObserver=null;

  function loadSize(){
    try{
      const value=localStorage.getItem(SIZE_KEY);
      return SIZE_MODES.includes(value)?value:'fit';
    }catch{
      return'fit';
    }
  }

  function saveSize(){
    try{
      localStorage.setItem(SIZE_KEY,sizeMode);
    }catch{}
  }

  function installCss(){
    if(!document.documentElement)return;

    let style=document.getElementById(STYLE_ID);
    if(!style){
      style=document.createElement('style');
      style.id=STYLE_ID;
      (document.head||document.documentElement).appendChild(style);
    }

    style.textContent=`
      #cinematics,
      ytd-watch-flexy #cinematics{
        display:none!important;
      }

      html,body{
        scroll-behavior:auto!important;
      }

      ${ADD_MARKERS.join(',')},
      button:has([title^="Add to Media List"]),
      button:has([aria-label^="Add to Media List"]),
      button:has([data-tooltip-text^="Add to Media List"]),
      yt-icon-button:has([title^="Add to Media List"]),
      yt-icon-button:has([aria-label^="Add to Media List"]),
      tp-yt-paper-icon-button:has([title^="Add to Media List"]),
      tp-yt-paper-icon-button:has([aria-label^="Add to Media List"]),
      [role="button"]:has([title^="Add to Media List"]),
      [role="button"]:has([aria-label^="Add to Media List"]){
        display:none!important;
        visibility:hidden!important;
        pointer-events:none!important;
      }

      ${PANEL_SELECTORS.join(',')}{
        display:none!important;
        visibility:hidden!important;
        width:0!important;
        height:0!important;
        min-width:0!important;
        min-height:0!important;
        max-width:0!important;
        max-height:0!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
        overflow:hidden!important;
        pointer-events:none!important;
      }

      #movie_player .ytp-fullscreen-quick-actions,
      #movie_player .ytp-fullscreen-grid,
      #movie_player .ytp-fullscreen-grid-stills-container,
      #movie_player .ytp-fullscreen-grid-hover-overlay,
      #movie_player .ytp-fullscreen-grid-hover-overlay-chevron,
      #movie_player .ytp-fullscreen-grid-expand-button{
        display:none!important;
        visibility:hidden!important;
        opacity:0!important;
        pointer-events:none!important;
        width:0!important;
        height:0!important;
        min-width:0!important;
        min-height:0!important;
        max-width:0!important;
        max-height:0!important;
        margin:0!important;
        padding:0!important;
      }

      ${SIDE_RAIL.join(',')}{
        display:none!important;
        visibility:hidden!important;
        opacity:0!important;
        pointer-events:none!important;
        width:0!important;
        min-width:0!important;
        max-width:0!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
      }

      ytd-watch-flexy{
        --ytd-watch-flexy-side-menu-margin:0px!important;
        --ytd-watch-flexy-fixed-side-menu-width:0px!important;
      }

      ytd-watch-flexy[show-fixed-side-menu][is-two-columns_]:not([full-bleed-player])
      #columns.ytd-watch-flexy::after{
        display:none!important;
        width:0!important;
        min-width:0!important;
        max-width:0!important;
        content:none!important;
      }

      #movie_player{
        --ytp-grid-scroll-percentage:0!important;
        --ytp-grid-peek-height:0px!important;
      }

      #movie_player.ytp-fullscreen video.html5-main-video{
        transform-origin:center center!important;
      }

      html[data-kindred-video-size="fit"]
      #movie_player.ytp-fullscreen video.html5-main-video{
        width:100vw!important;
        height:100vh!important;
        left:0!important;
        top:0!important;
        object-fit:contain!important;
        transform:none!important;
      }

      html[data-kindred-video-size="fill"]
      #movie_player.ytp-fullscreen video.html5-main-video{
        width:100vw!important;
        height:100vh!important;
        left:0!important;
        top:0!important;
        object-fit:cover!important;
        transform:none!important;
      }

      html[data-kindred-video-size="zoom"]
      #movie_player.ytp-fullscreen video.html5-main-video{
        width:100vw!important;
        height:100vh!important;
        left:0!important;
        top:0!important;
        object-fit:cover!important;
        transform:scale(1.14)!important;
      }

      html[data-kindred-video-size="stretch"]
      #movie_player.ytp-fullscreen video.html5-main-video{
        width:100vw!important;
        height:100vh!important;
        left:0!important;
        top:0!important;
        object-fit:fill!important;
        transform:none!important;
      }

      #movie_player .kindred-video-size-button{
        width:auto!important;
        min-width:48px!important;
        padding:0 7px!important;
        font:700 11px/36px Arial,sans-serif!important;
        text-align:center!important;
      }

      #movie_player:not(.ytp-fullscreen) .kindred-video-size-button{
        display:none!important;
      }
    `;
  }

  function applySize(){
    if(!document.documentElement)return;

    document.documentElement.setAttribute(
      'data-kindred-video-size',
      sizeMode
    );

    const button=document.querySelector('.kindred-video-size-button');
    if(button){
      button.textContent=SIZE_LABELS[sizeMode];
      button.title=
        `Fullscreen sizing: ${SIZE_LABELS[sizeMode]}. `+
        'Click to cycle Fit → Fill → Zoom → Stretch.';
    }

    requestAnimationFrame(()=>{
      try{
        window.dispatchEvent(new Event('resize'));
      }catch{}
    });
  }

  function setSize(mode){
    if(!SIZE_MODES.includes(mode))return;
    sizeMode=mode;
    saveSize();
    applySize();
  }

  function cycleSize(){
    const i=SIZE_MODES.indexOf(sizeMode);
    setSize(SIZE_MODES[(i+1)%SIZE_MODES.length]);
  }

  function installSizeButton(){
    const player=document.getElementById('movie_player');
    const controls=player?.querySelector('.ytp-right-controls');

    if(!player||!controls)return;

    let button=controls.querySelector('.kindred-video-size-button');

    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='ytp-button kindred-video-size-button';
      button.setAttribute('aria-label','Kindred fullscreen video sizing');

      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        cycleSize();
      },true);

      const fullscreen=controls.querySelector('.ytp-fullscreen-button');

      if(fullscreen){
        controls.insertBefore(button,fullscreen);
      }else{
        controls.appendChild(button);
      }
    }

    applySize();
  }

  function cleanupAddIcons(){
    for(const marker of document.querySelectorAll(ADD_MARKERS.join(','))){
      const target=
        marker.matches('button,yt-icon-button,tp-yt-paper-icon-button,[role="button"]')
          ? marker
          : marker.closest('button,yt-icon-button,tp-yt-paper-icon-button,[role="button"]')||marker;

      target.style.setProperty('display','none','important');
      target.style.setProperty('visibility','hidden','important');
      target.style.setProperty('pointer-events','none','important');
    }
  }

  function collapseConversationBar(bar){
    const renderer=
      bar?.liveChatRenderer||
      bar?.liveChatRenderer?.liveChatRenderer;

    if(!renderer)return;

    renderer.initialDisplayState='LIVE_CHAT_DISPLAY_STATE_COLLAPSED';

    const toggle=renderer.showHideButton?.toggleButtonRenderer;
    if(toggle)toggle.isToggled=false;
  }

  function suppressPanels(){
    const chat=document.getElementById('chat');

    if(chat){
      try{chat.collapsed=true;}catch{}
      chat.setAttribute('collapsed','');
      try{collapseConversationBar(chat.data);}catch{}
    }

    for(const element of document.querySelectorAll(PANEL_SELECTORS.join(','))){
      element.style.setProperty('display','none','important');
      element.style.setProperty('visibility','hidden','important');
      element.setAttribute('aria-hidden','true');
    }
  }

  function suppressSideRail(){
    const flexy=document.querySelector('ytd-watch-flexy');

    if(flexy){
      flexy.style.setProperty(
        '--ytd-watch-flexy-side-menu-margin',
        '0px',
        'important'
      );

      flexy.style.setProperty(
        '--ytd-watch-flexy-fixed-side-menu-width',
        '0px',
        'important'
      );
    }

    for(const selector of SIDE_RAIL){
      for(const element of document.querySelectorAll(selector)){
        element.style.setProperty('display','none','important');
        element.style.setProperty('width','0px','important');
        element.style.setProperty('min-width','0px','important');
        element.style.setProperty('max-width','0px','important');
      }
    }
  }

  function stabilizePlayer(){
    const player=document.getElementById('movie_player');
    if(!player)return;

    for(const className of GRID_CLASSES){
      if(player.classList.contains(className)){
        player.classList.remove(className);
      }
    }
  }

  function attachPlayerGuard(){
    const player=document.getElementById('movie_player');

    if(!player||player===guardedPlayer)return;

    playerObserver?.disconnect();
    guardedPlayer=player;

    playerObserver=new MutationObserver(stabilizePlayer);
    playerObserver.observe(player,{
      attributes:true,
      attributeFilter:['class']
    });
  }

  function refresh(){
    installCss();
    cleanupAddIcons();
    suppressPanels();
    suppressSideRail();
    attachPlayerGuard();
    stabilizePlayer();
    installSizeButton();
    applySize();

    setTimeout(cleanupAddIcons,250);
    setTimeout(cleanupAddIcons,1000);

    for(const delay of [0,100,400,1000,2000,4000]){
      setTimeout(()=>{
        suppressPanels();
        suppressSideRail();
        attachPlayerGuard();
        stabilizePlayer();
        installSizeButton();
        applySize();
      },delay);
    }
  }

  function hotkey(event){
    if(
      !event.altKey||
      !event.shiftKey||
      event.code!=='KeyV'
    )return;

    const tag=(event.target?.tagName||'').toUpperCase();

    if(
      ['INPUT','TEXTAREA','SELECT'].includes(tag)||
      event.target?.isContentEditable
    )return;

    event.preventDefault();
    cycleSize();
  }

  document.addEventListener('keydown',hotkey,true);

  document.addEventListener('yt-page-data-fetched',event=>{
    try{
      collapseConversationBar(
        event.detail
          ?.pageData
          ?.response
          ?.contents
          ?.twoColumnWatchNextResults
          ?.conversationBar
      );
    }catch{}

    setTimeout(refresh,0);
  },true);

  document.addEventListener('fullscreenchange',()=>{
    refresh();
    setTimeout(refresh,100);
    setTimeout(refresh,500);
  },true);

  document.addEventListener('yt-navigate-finish',refresh,true);

  window.addEventListener('yt-page-data-updated',()=>{
    suppressSideRail();
    installSizeButton();
    applySize();
  },true);

  installCss();
  applySize();

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',refresh,{once:true});
  }else{
    refresh();
  }
})();
