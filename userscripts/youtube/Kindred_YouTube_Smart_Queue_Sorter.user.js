// ==UserScript==
// @name         Kindred YouTube Smart Queue Sorter
// @namespace    kindred-tech.local
// @version      2.5.0
// @description  Desktop/mobile-safe YouTube queue sorter with persistent visual order and playback-order enforcement so Next/Previous/autoplay follow the same locked queue.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Smart_Queue_Sorter.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Kindred_YouTube_Smart_Queue_Sorter.user.js
// ==/UserScript==

(() => {
  'use strict';

  const KEY='kindred-smart-queue', BAR=`${KEY}-bar`, STYLE=`${KEY}-style`, PARENT=`${KEY}-parent`;
  // Desktop-site mode on mobile uses these same queue elements. If a mobile-web layout does not expose them, the script simply stays dormant.
  const PANEL='ytd-playlist-panel-renderer', ROW='ytd-playlist-panel-video-renderer';
  const SETTINGS=`${KEY}:settings`, DATECACHE=`${KEY}:publish-date-cache`, ORDERCACHE=`${KEY}:locked-order`;
  const defaults={mode:'duration-asc',auto:true,fullQueue:true};
  const state={applying:false,observer:null,parent:null,timer:0,plan:[],ranks:new Map(),dates:loadDates(),loading:new Map(),pending:null,install:0,lock:loadOrderLock(),navSerial:0};
  let settings=loadSettings();

  /*
   * v2.5 playback contract:
   *   1) CSS order controls what the queue LOOKS like.
   *   2) state.plan is built from that exact same locked order.
   *   3) ended/Next/Previous/keyboard navigation all use state.plan.
   *   4) native YouTube ended/autonav is stopped while smart mode is active.
   */

  function loadSettings(){
    try{
      const x=JSON.parse(localStorage.getItem(SETTINGS)||'{}');
      return{
        mode:typeof x.mode==='string'?x.mode:defaults.mode,
        auto:typeof x.auto==='boolean'?x.auto:defaults.auto,
        fullQueue:typeof x.fullQueue==='boolean'?x.fullQueue:(typeof x.relativeQueue==='boolean'?x.relativeQueue:defaults.fullQueue)
      };
    }catch{return{...defaults}}
  }
  function saveSettings(){try{localStorage.setItem(SETTINGS,JSON.stringify(settings))}catch{}}
  function loadDates(){try{const x=JSON.parse(sessionStorage.getItem(DATECACHE)||'{}');return x&&typeof x==='object'?x:{}}catch{return{}}}
  function saveDates(){try{sessionStorage.setItem(DATECACHE,JSON.stringify(state.dates))}catch{}}
  function loadOrderLock(){
    try{
      const x=JSON.parse(sessionStorage.getItem(ORDERCACHE)||'null');
      return x&&typeof x==='object'&&Array.isArray(x.order)?x:null;
    }catch{return null}
  }
  function saveOrderLock(lock){
    state.lock=lock;
    try{
      if(lock)sessionStorage.setItem(ORDERCACHE,JSON.stringify(lock));
      else sessionStorage.removeItem(ORDERCACHE);
    }catch{}
  }
  function clearOrderLock(){saveOrderLock(null)}
  function u(v,b=location.href){try{return new URL(v,b)}catch{return null}}
  function runs(v){if(!v)return'';if(typeof v==='string')return v;if(typeof v.simpleText==='string')return v.simpleText;return Array.isArray(v.runs)?v.runs.map(x=>x?.text||'').join(''):''}
  function durText(v){
    const m=String(v||'').replace(/\s+/g,' ').trim().match(/(?:\d{1,3}:)?\d{1,2}:\d{2}/);
    if(!m)return null;
    const p=m[0].split(':').map(Number);
    if(p.some(Number.isNaN))return null;
    return p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1];
  }
  function data(r){try{const d=r?.data||r?.__data?.data||r?.__data||null;return d?.playlistPanelVideoRenderer||d?.playlistVideoRenderer||d}catch{return null}}
  function id(r){const d=data(r),v=d?.videoId;if(v)return String(v);const a=r.querySelector('a[href*="/watch"]');return u(a?.href)?.searchParams.get('v')||''}
  function href(r){return (r.querySelector('a#thumbnail[href*="/watch"]')||r.querySelector('a[href*="/watch"]'))?.href||''}
  function title(r){const d=data(r);return runs(d?.title)||r.querySelector('#video-title')?.textContent?.trim()||r.querySelector('a[title]')?.getAttribute('title')||'Untitled'}
  function channel(r){const d=data(r);return runs(d?.shortBylineText)||runs(d?.longBylineText)||r.querySelector('#byline')?.textContent?.trim()||r.querySelector('.byline')?.textContent?.trim()||''}
  function duration(r){
    const d=data(r),n=Number(d?.lengthSeconds);
    if(Number.isFinite(n)&&n>=0)return n;
    const a=durText(runs(d?.lengthText));if(a!==null)return a;
    for(const s of ['ytd-thumbnail-overlay-time-status-renderer #text','ytd-thumbnail-overlay-time-status-renderer','.badge-shape-wiz__text','badge-shape']){
      const e=r.querySelector(s),x=durText(e?.textContent);if(x!==null)return x;
    }
    return null;
  }
  function selected(r){if(r.hasAttribute('selected')||r.getAttribute('aria-current')==='true'||r.querySelector('[aria-current="true"]'))return true;return data(r)?.selected===true}
  function panel(){const p=[...document.querySelectorAll(PANEL)];return p.find(x=>x.offsetParent!==null)||p[0]||null}
  function rows(){const p=panel();return p?[...p.querySelectorAll(ROW)]:[]}
  function parent(rs=rows()){if(!rs.length)return null;const p=rs[0].parentElement;return p&&rs.every(r=>r.parentElement===p)?p:null}
  function norm(v){return String(v||'').normalize('NFKD').toLocaleLowerCase()}
  function rank(k){if(!state.ranks.has(k))state.ranks.set(k,Math.random());return state.ranks.get(k)}
  function info(r,i){
    const v=id(r);
    return{row:r,native:i,videoId:v,href:href(r),title:title(r),channel:channel(r),duration:duration(r),releaseDate:v&&Object.hasOwn(state.dates,v)?state.dates[v]:null,selected:selected(r)};
  }
  function rawStableKey(item){
    const d=data(item.row);
    const endpoint=d?.navigationEndpoint?.watchEndpoint||{};
    const url=u(item.href);

    const setId=
      d?.playlistSetVideoId||
      d?.setVideoId||
      endpoint?.playlistSetVideoId||
      '';

    if(setId)return`set:${setId}`;

    const playlistId=
      endpoint?.playlistId||
      d?.playlistId||
      url?.searchParams.get('list')||
      '';

    const index=
      endpoint?.index ??
      d?.index ??
      url?.searchParams.get('index');

    if(
      item.videoId&&
      playlistId&&
      index!==null&&
      index!==undefined&&
      index!==''
    ){
      return`video:${item.videoId}:list:${playlistId}:index:${index}`;
    }

    /*
     * For ordinary temporary queues, videoId is more stable than YouTube's
     * mutable queue index. Duplicate video IDs are disambiguated by
     * collectItems() with an occurrence suffix.
     */
    if(item.videoId)return`video:${item.videoId}`;

    return`href:${url ? `${url.pathname}${url.search}` : item.href || item.native}`;
  }

  function collectItems(){
    const seen=new Map();

    return rows().map(info).map(item=>{
      const base=rawStableKey(item);
      const count=seen.get(base)||0;
      seen.set(base,count+1);

      return{
        ...item,
        key:count===0?base:`${base}:occ:${count}`
      };
    });
  }

  function queueIdentity(items){
    const pageList=u(location.href)?.searchParams.get('list');
    if(pageList)return`list:${pageList}`;

    for(const item of items){
      const d=data(item.row);
      const listId=
        d?.navigationEndpoint?.watchEndpoint?.playlistId||
        d?.playlistId||
        u(item.href)?.searchParams.get('list');

      if(listId)return`list:${listId}`;
    }

    let token=sessionStorage.getItem(`${KEY}:tab-queue-token`);
    if(!token){
      token=`tab:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
      try{sessionStorage.setItem(`${KEY}:tab-queue-token`,token)}catch{}
    }
    return token;
  }

  function lockCompatible(lock,identity,items){
    if(!lock)return false;
    if(lock.identity!==identity)return false;
    if(lock.mode!==settings.mode)return false;
    if(lock.fullQueue!==settings.fullQueue)return false;

    const current=new Set(items.map(x=>x.key));
    const overlap=lock.order.filter(k=>current.has(k)).length;
    const denominator=Math.max(1,Math.min(lock.order.length,current.size));

    return overlap/denominator>=0.35;
  }
  function cmpUnknown(a,b,dir=1){
    const au=a==null||Number.isNaN(a),bu=b==null||Number.isNaN(b);
    if(au&&bu)return 0;if(au)return 1;if(bu)return-1;
    return a<b?-dir:a>b?dir:0;
  }
  function comparator(m){
    switch(m){
      case'duration-asc':return(a,b)=>cmpUnknown(a.duration,b.duration,1)||a.native-b.native;
      case'duration-desc':return(a,b)=>cmpUnknown(a.duration,b.duration,-1)||a.native-b.native;
      case'date-newest':return(a,b)=>cmpUnknown(a.releaseDate,b.releaseDate,-1)||a.native-b.native;
      case'date-oldest':return(a,b)=>cmpUnknown(a.releaseDate,b.releaseDate,1)||a.native-b.native;
      case'title-asc':return(a,b)=>norm(a.title).localeCompare(norm(b.title))||a.native-b.native;
      case'title-desc':return(a,b)=>norm(b.title).localeCompare(norm(a.title))||a.native-b.native;
      case'channel-asc':return(a,b)=>norm(a.channel).localeCompare(norm(b.channel))||a.native-b.native;
      case'channel-desc':return(a,b)=>norm(b.channel).localeCompare(norm(a.channel))||a.native-b.native;
      case'reverse':return(a,b)=>b.native-a.native;
      case'shuffle':return(a,b)=>rank(a.videoId||`${a.title}|${a.native}`)-rank(b.videoId||`${b.title}|${b.native}`);
      default:return(a,b)=>a.native-b.native;
    }
  }
  function primaryComparator(m){
    switch(m){
      case'duration-asc':return(a,b)=>cmpUnknown(a.duration,b.duration,1);
      case'duration-desc':return(a,b)=>cmpUnknown(a.duration,b.duration,-1);
      case'date-newest':return(a,b)=>cmpUnknown(a.releaseDate,b.releaseDate,-1);
      case'date-oldest':return(a,b)=>cmpUnknown(a.releaseDate,b.releaseDate,1);
      case'title-asc':return(a,b)=>norm(a.title).localeCompare(norm(b.title));
      case'title-desc':return(a,b)=>norm(b.title).localeCompare(norm(a.title));
      case'channel-asc':return(a,b)=>norm(a.channel).localeCompare(norm(b.channel));
      case'channel-desc':return(a,b)=>norm(b.channel).localeCompare(norm(a.channel));
      default:return()=>0;
    }
  }

  function reconcileLockedOrder(lockOrder,items){
    const byKey=new Map(items.map(x=>[x.key,x]));
    const existing=[];
    const existingKeys=new Set();

    for(const key of lockOrder){
      const item=byKey.get(key);
      if(!item)continue;
      existing.push(item);
      existingKeys.add(key);
    }

    const added=items.filter(x=>!existingKeys.has(x.key));
    if(!added.length)return existing;

    if(settings.mode==='shuffle'){
      const out=[...existing];
      for(const item of added){
        const slot=Math.floor(Math.random()*(out.length+1));
        out.splice(slot,0,item);
      }
      return out;
    }

    if(settings.mode==='reverse'){
      return[
        ...added.sort((a,b)=>b.native-a.native),
        ...existing
      ];
    }

    const cmp=primaryComparator(settings.mode);
    const out=[...existing];

    for(const item of added){
      let at=out.findIndex(other=>cmp(item,other)<0);
      if(at<0)at=out.length;
      out.splice(at,0,item);
    }

    return out;
  }

  function buildLockedOrder(items,identity,{force=false}={}){
    if(!items.length)return[];

    if(!force&&lockCompatible(state.lock,identity,items)){
      return reconcileLockedOrder(state.lock.order,items);
    }

    return[...items].sort(comparator(settings.mode));
  }

  function currentProgress(identity,items){
    const keys=new Set(items.map(x=>x.key));

    if(state.lock?.identity===identity){
      return new Set(
        Array.isArray(state.lock.completed)
          ? state.lock.completed.filter(k=>keys.has(k))
          : []
      );
    }

    /*
     * On a brand-new queue lock, rows that YouTube already places before
     * the selected/current row are historical items. Mark them completed so
     * Full queue sorting does not unexpectedly replay earlier videos.
     */
    const selectedNative=items.findIndex(x=>x.selected);

    return new Set(
      selectedNative>0
        ? items.slice(0,selectedNative).map(x=>x.key)
        : []
    );
  }

  function persistOrder(identity,ordered,items){
    const completed=currentProgress(identity,items);

    saveOrderLock({
      identity,
      mode:settings.mode,
      fullQueue:settings.fullQueue,
      order:ordered.map(x=>x.key),
      completed:[...completed],
      updated:Date.now()
    });
  }

  function completedKeys(){
    return new Set(
      Array.isArray(state.lock?.completed)
        ? state.lock.completed
        : []
    );
  }

  function markCompleted(item){
    if(!item?.key||!state.lock)return;

    const done=completedKeys();
    done.add(item.key);

    state.lock={
      ...state.lock,
      completed:[...done],
      updated:Date.now()
    };

    saveOrderLock(state.lock);
  }

  function unmarkCompleted(item){
    if(!item?.key||!state.lock)return;

    const done=completedKeys();
    done.delete(item.key);

    state.lock={
      ...state.lock,
      completed:[...done],
      updated:Date.now()
    };

    saveOrderLock(state.lock);
  }
  function needDates(){return settings.mode==='date-newest'||settings.mode==='date-oldest'}
  function label(m){return({manual:'Manual / YouTube order','duration-asc':'Duration: shortest first','duration-desc':'Duration: longest first','date-newest':'Release date: newest first','date-oldest':'Release date: oldest first','title-asc':'Title: A → Z','title-desc':'Title: Z → A','channel-asc':'Channel: A → Z','channel-desc':'Channel: Z → A',reverse:'Reverse queue order',shuffle:'Shuffle'})[m]||m}

  async function fetchDate(videoId){
    if(!videoId)return null;
    if(Object.hasOwn(state.dates,videoId))return state.dates[videoId];
    if(state.loading.has(videoId))return state.loading.get(videoId);
    const p=(async()=>{
      let value=null;
      try{
        const r=await fetch(`/watch?v=${encodeURIComponent(videoId)}&hl=en`,{credentials:'same-origin',cache:'force-cache'});
        if(r.ok){
          const t=await r.text(),m=t.match(/"publishDate":"([^"]+)"/)||t.match(/"uploadDate":"([^"]+)"/);
          if(m){const x=Date.parse(m[1]);if(Number.isFinite(x))value=x}
        }
      }catch{}
      state.dates[videoId]=value;saveDates();state.loading.delete(videoId);return value;
    })();
    state.loading.set(videoId,p);return p;
  }
  async function ensureDates(items){
    const miss=items.filter(x=>x.videoId&&!Object.hasOwn(state.dates,x.videoId));
    if(!miss.length)return;
    let done=0,next=0;status(`Loading release dates: 0/${miss.length}…`);
    const worker=async()=>{while(next<miss.length){await fetchDate(miss[next++].videoId);status(`Loading release dates: ${++done}/${miss.length}…`)}};
    await Promise.all(Array.from({length:Math.min(4,miss.length)},worker));
  }

  function clearSort({clearLock=false}={}){
    const rs=rows(),p=parent(rs);p?.classList.remove(PARENT);
    for(const r of rs)r.style.removeProperty('--kindred-smart-order');
    state.plan=[];
    if(clearLock)clearOrderLock();
  }

  async function applySort({quiet=false,forceRebuild=false}={}){
    if(state.applying)return;
    state.applying=true;

    try{
      let rs=rows(),p=parent(rs);

      if(!rs.length||!p){
        if(!quiet)status('No active YouTube queue found.');
        return;
      }

      observe(p);

      if(settings.mode==='manual'){
        clearSort({clearLock:true});

        if(!quiet){
          status(
            'Manual / YouTube order — persistent smart order is off.'
          );
        }

        return;
      }

      let items=collectItems();
      const identity=queueIdentity(items);

      let sortable;
      let lockedPrefix=[];

      if(settings.fullQueue){
        sortable=items;

      }else{
        const sel=items.findIndex(x=>x.selected);
        const lockedCount=sel>=0?sel+1:0;

        lockedPrefix=items.slice(0,lockedCount);
        sortable=items.slice(lockedCount);
      }

      if(needDates()){
        await ensureDates(sortable);

        items=collectItems();

        if(settings.fullQueue){
          sortable=items;
          lockedPrefix=[];

        }else{
          const sel=items.findIndex(x=>x.selected);
          const lockedCount=sel>=0?sel+1:0;

          lockedPrefix=items.slice(0,lockedCount);
          sortable=items.slice(lockedCount);
        }
      }

      /*
       * Core v2.5 behavior:
       *
       * Once the chosen sort order is built, keep that exact relative order
       * through YouTube SPA navigation, row rerenders, and page refreshes.
       * New queue items are inserted without scrambling already-locked items.
       */
      const orderedSortable=
        buildLockedOrder(
          sortable,
          identity,
          {force:forceRebuild}
        );

      persistOrder(identity,orderedSortable,items);

      const plan=settings.fullQueue
        ? orderedSortable
        : [...lockedPrefix,...orderedSortable];

      p.classList.add(PARENT);

      plan.forEach(
        (x,i)=>
          x.row.style.setProperty(
            '--kindred-smart-order',
            String(i)
          )
      );

      state.plan=plan;

      if(!quiet){
        const currentVisual=
          plan.findIndex(x=>x.selected);

        const currentText=
          currentVisual>=0
            ? ` • current visual position ${currentVisual+1}/${plan.length}`
            : '';

        status(
          `${label(settings.mode)} • ` +
          `${settings.fullQueue?'full queue':'upcoming only'} • ` +
          `🔒 visual + playback order locked` +
          currentText
        );
      }


    }finally{
      state.applying=false;
    }
  }

  function currentLocator(){
    const url=u(location.href);

    return{
      videoId:url?.searchParams.get('v')||'',
      index:url?.searchParams.get('index')||'',
      list:url?.searchParams.get('list')||''
    };
  }

  function currentIndex(){
    if(!state.plan.length)return-1;

    /*
     * Prefer the actual URL over row.selected. During YouTube SPA rerenders,
     * detached row objects can temporarily retain selected=true and point at
     * the video we just left.
     */
    const loc=currentLocator();

    if(loc.videoId){
      const exact=state.plan.findIndex(item=>{
        if(item.videoId!==loc.videoId)return false;

        const target=u(item.href);

        if(loc.list&&target?.searchParams.get('list')!==loc.list){
          return false;
        }

        if(loc.index&&target?.searchParams.get('index')){
          return target.searchParams.get('index')===loc.index;
        }

        return true;
      });

      if(exact>=0)return exact;

      const byVideo=state.plan.findIndex(x=>x.videoId===loc.videoId);
      if(byVideo>=0)return byVideo;
    }

    return state.plan.findIndex(x=>selected(x.row));
  }

  function currentItem(){
    const i=currentIndex();
    return i>=0?state.plan[i]:null;
  }

  function nextPlayable(){
    if(settings.mode==='manual'||!state.plan.length)return null;

    const done=completedKeys();
    const i=currentIndex();

    if(i<0){
      return state.plan.find(x=>!done.has(x.key))||null;
    }

    /*
     * Full queue is a circular sorted sequence anchored at whatever is
     * currently playing. This lets a video that began in the middle of the
     * sorted display finish, then continue forward and wrap once to any
     * still-unplayed items that visually precede it.
     *
     * completed[] prevents that wrap from replaying historical/finished rows.
     */
    if(settings.fullQueue){
      for(let step=1;step<state.plan.length;step++){
        const x=state.plan[(i+step)%state.plan.length];
        if(!x||done.has(x.key))continue;
        return x;
      }

      return null;
    }

    /*
     * Upcoming-only mode never wraps into the already-played prefix.
     */
    for(let n=i+1;n<state.plan.length;n++){
      const x=state.plan[n];
      if(!x||done.has(x.key))continue;
      return x;
    }

    return null;
  }

  function previousVisual(){
    if(settings.mode==='manual'||!state.plan.length)return null;

    const i=currentIndex();
    if(i<0)return null;

    if(i>0)return state.plan[i-1];

    return settings.fullQueue
      ? state.plan[state.plan.length-1]||null
      : null;
  }

  function planned(delta){
    if(delta>0)return nextPlayable();
    if(delta<0)return previousVisual();
    return currentItem();
  }

  function armPending(item,url,reason){
    const serial=++state.navSerial;

    state.pending={
      serial,
      key:item.key,
      videoId:item.videoId,
      href:url.href,
      reason,
      until:Date.now()+8000
    };

    /*
     * If YouTube ignores/loses the synthetic row click during a rerender,
     * force the exact target after a short grace period.
     */
    setTimeout(()=>{
      const p=state.pending;
      if(!p||p.serial!==serial)return;

      const cur=currentLocator().videoId;

      if(cur===p.videoId){
        state.pending=null;
        return;
      }

      if(Date.now()<p.until){
        location.assign(p.href);
      }
    },1800);
  }

  function go(item,{reason='smart-navigation'}={}){
    if(!item)return false;

    const h=item.href||href(item.row);
    const url=u(h);

    if(!url)return false;

    const current=currentLocator().videoId;
    if(item.videoId&&current===item.videoId){
      state.pending=null;
      return false;
    }

    armPending(item,url,reason);

    const a=
      item.row?.querySelector('a#thumbnail[href*="/watch"]')
      ||
      item.row?.querySelector('a[href*="/watch"]');

    if(a){
      a.click();
    }else{
      location.assign(url.href);
    }

    return true;
  }

  function forward({reason='next'}={}){
    const here=currentItem();
    const next=nextPlayable();

    /*
     * Treat an explicit forward skip exactly like finishing the video:
     * don't let the skipped item reappear when Full queue wraps.
     */
    if(here)markCompleted(here);

    if(!next){
      status(
        `${label(settings.mode)} • queue complete • ` +
        `no unplayed item remains in the locked order`
      );
      return false;
    }

    return go(next,{reason});
  }

  function backward({reason='previous'}={}){
    const prev=previousVisual();

    if(!prev)return false;

    /*
     * If the user deliberately goes back to something previously completed,
     * make it eligible again until it finishes/is skipped.
     */
    unmarkCompleted(prev);

    return go(prev,{reason});
  }

  function endedCapture(e){
    if(
      settings.mode==='manual'||
      !(e.target instanceof HTMLVideoElement)||
      !state.plan.length
    ){
      return;
    }

    const here=currentItem();
    if(here)markCompleted(here);

    const next=nextPlayable();

    /*
     * Stop YouTube's native queue/autonav handler from racing our sorted plan.
     * ended itself is not cancelable, but stopping propagation during capture
     * prevents downstream YouTube ended listeners from choosing native-next.
     */
    e.stopImmediatePropagation();
    e.stopPropagation();

    if(!next){
      status(
        `${label(settings.mode)} • queue complete • ` +
        `playback followed the locked sorted order`
      );
      return;
    }

    go(next,{reason:'ended'});
  }

  function navClick(e){
    if(settings.mode==='manual')return;

    const b=e.target?.closest?.(
      '.ytp-next-button, .ytp-prev-button'
    );

    if(!b)return;

    const previous=
      b.matches('.ytp-prev-button');

    const target=
      previous
        ? previousVisual()
        : nextPlayable();

    if(!target)return;

    e.preventDefault();
    e.stopImmediatePropagation();

    if(previous){
      backward({reason:'player-previous'});
    }else{
      forward({reason:'player-next'});
    }
  }

  function keyboard(e){
    if(settings.mode==='manual')return;

    const t=e.target;
    const tag=(t?.tagName||'').toUpperCase();

    if(
      ['INPUT','TEXTAREA','SELECT'].includes(tag)||
      t?.isContentEditable
    ){
      return;
    }

    let d=0;

    if(e.shiftKey&&e.code==='KeyN')d=1;
    else if(e.shiftKey&&e.code==='KeyP')d=-1;
    else if(e.code==='MediaTrackNext')d=1;
    else if(e.code==='MediaTrackPrevious')d=-1;

    if(!d)return;

    const target=d>0?nextPlayable():previousVisual();
    if(!target)return;

    e.preventDefault();
    e.stopImmediatePropagation();

    if(d>0){
      forward({reason:'keyboard-next'});
    }else{
      backward({reason:'keyboard-previous'});
    }
  }

  function verifyPending(){
    const p=state.pending;
    if(!p)return;

    if(Date.now()>p.until){
      state.pending=null;
      return;
    }

    const cur=currentLocator().videoId;

    if(cur===p.videoId){
      state.pending=null;
      return;
    }

    /*
     * If native YouTube autoplay won a race and navigated to its own next
     * item, immediately correct back to the target from the locked plan.
     */
    const target=u(p.href);

    if(target){
      state.pending=null;
      location.assign(target.href);
    }
  }

  function status(text){
    const e=document.querySelector(`#${BAR} [data-status]`);
    if(e)e.textContent=text;
  }

  function setMode(m){
    settings.mode=m;
    saveSettings();

    if(m==='shuffle'){
      state.ranks.clear();
    }

    clearOrderLock();
    syncUi();
    applySort({forceRebuild:true});
  }

  function setAuto(v){
    settings.auto=!!v;
    saveSettings();
    syncUi();

    if(settings.auto){
      applySort();
    }

    status(
      `${label(settings.mode)} • automatic queue sync ` +
      `${settings.auto?'enabled':'paused'}`
    );
  }

  function setFullQueue(v){
    settings.fullQueue=!!v;
    saveSettings();
    clearOrderLock();
    syncUi();
    applySort({forceRebuild:true});

    status(
      settings.fullQueue
        ? 'Full queue ON — videos before, current, and after the playing item are included in sorting.'
        : 'Full queue OFF — only videos after the currently playing item are sorted.'
    );
  }

  function syncUi(){
    const b=document.getElementById(BAR);
    if(!b)return;

    const s=b.querySelector('select[data-sort-mode]');
    const a=b.querySelector('input[data-auto]');
    const f=b.querySelector('input[data-full-queue]');

    if(s)s.value=settings.mode;
    if(a)a.checked=settings.auto;
    if(f)f.checked=settings.fullQueue;
  }

  function installStyle(){
    if(document.getElementById(STYLE))return;
    const s=document.createElement('style');s.id=STYLE;
    s.textContent=`.${PARENT}{display:flex!important;flex-direction:column!important}.${PARENT}>${ROW}{order:var(--kindred-smart-order,0)!important}
#${BAR}{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:8px 10px;margin:4px 8px 6px;border-radius:10px;background:rgba(127,127,127,.10);color:var(--yt-spec-text-primary,#f1f1f1);font:12px/1.35 Roboto,Arial,sans-serif}
#${BAR} select,#${BAR} button{min-height:30px;border:0;border-radius:8px;padding:5px 9px;background:var(--yt-spec-badge-chip-background,rgba(255,255,255,.10));color:inherit;font:inherit}
#${BAR} select{max-width:215px;cursor:pointer}#${BAR} option{background:#212121;color:#fff}#${BAR} button{cursor:pointer}
#${BAR} button:hover{background:var(--yt-spec-button-chip-background-hover,rgba(255,255,255,.18))}
#${BAR} label{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;cursor:pointer}
#${BAR} [data-status]{flex:1 1 220px;min-width:150px;opacity:.82}
@media (pointer:coarse),(max-width:820px){
  #${BAR}{margin:4px 4px 6px;padding:8px;gap:8px;font-size:13px}
  #${BAR} select{flex:1 1 100%;max-width:none;min-height:42px}
  #${BAR} button{min-height:42px;padding:8px 12px}
  #${BAR} label{min-height:40px;padding:0 2px}
  #${BAR} input[type="checkbox"]{width:18px;height:18px}
  #${BAR} [data-status]{flex-basis:100%;min-width:0}
}`;
    (document.head||document.documentElement).appendChild(s);
  }
  function opt(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o}
  function checkbox(labelText,datasetKey,checked,titleText,onChange){
    const l=document.createElement('label'),i=document.createElement('input'),t=document.createElement('span');
    i.type='checkbox';i.dataset[datasetKey]='1';i.checked=checked;i.title=titleText;i.addEventListener('change',()=>onChange(i.checked));
    t.textContent=labelText;l.append(i,t);return l;
  }

  function installBar(){
    installStyle();

    const p=panel();
    if(!p)return false;

    if(p.querySelector(`#${BAR}`)){
      syncUi();
      return true;
    }

    const bar=document.createElement('div');
    bar.id=BAR;

    const select=document.createElement('select');
    select.dataset.sortMode='1';
    select.title='Kindred queue sort mode';

    select.append(
      opt('manual','Manual / YouTube order'),
      opt('duration-asc','Duration — shortest first'),
      opt('duration-desc','Duration — longest first'),
      opt('date-newest','Release date — newest first'),
      opt('date-oldest','Release date — oldest first'),
      opt('title-asc','Title — A to Z'),
      opt('title-desc','Title — Z to A'),
      opt('channel-asc','Channel — A to Z'),
      opt('channel-desc','Channel — Z to A'),
      opt('reverse','Reverse current queue'),
      opt('shuffle','Shuffle')
    );

    select.value=settings.mode;

    select.addEventListener(
      'change',
      ()=>setMode(select.value)
    );

    const auto=checkbox(
      'Auto',
      'auto',
      settings.auto,
      'Automatically re-apply the selected sort whenever YouTube changes the queue.',
      setAuto
    );

    const fullQueue=checkbox(
      'Full queue',
      'fullQueue',
      settings.fullQueue,
      'ON: include videos before the current video, the current video, and videos after it. OFF: sort upcoming videos only.',
      setFullQueue
    );

    const apply=document.createElement('button');
    apply.type='button';
    apply.textContent='Rebuild order';
    apply.title='Re-read the queue, rebuild the chosen sort, and make playback follow that same locked order';
    apply.addEventListener('click',()=>applySort({forceRebuild:true}));

    const shuffle=document.createElement('button');
    shuffle.type='button';
    shuffle.textContent='↻';
    shuffle.title='Generate a new shuffle order';

    shuffle.addEventListener(
      'click',
      ()=>{
        state.ranks.clear();

        if(settings.mode==='shuffle'){
          clearOrderLock();
          applySort({forceRebuild:true});
        }else{
          setMode('shuffle');
        }
      }
    );

    const st=document.createElement('span');
    st.dataset.status='1';

    st.textContent=
      settings.fullQueue
        ? 'Full queue on • visual order + playback are locked together.'
        : 'Upcoming-only sort • playback follows the same locked upcoming order.';

    bar.append(
      select,
      auto,
      fullQueue,
      apply,
      shuffle,
      st
    );

    const h=
      p.querySelector('#header')
      ||
      p.querySelector('#playlist-info')
      ||
      p.firstElementChild;

    h?.parentNode
      ? h.parentNode.insertBefore(bar,h.nextSibling)
      : p.prepend(bar);

    syncUi();

    const rs=rows(),pr=parent(rs);
    if(pr)observe(pr);

    applySort({quiet:true});

    return true;
  }

  function observe(p){
    if(!p||state.parent===p)return;
    state.observer?.disconnect();state.parent=p;
    state.observer=new MutationObserver(records=>{
      if(state.applying||!settings.auto)return;
      const changed=records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n instanceof Element&&(n.matches?.(ROW)||n.querySelector?.(ROW))));
      if(!changed)return;
      clearTimeout(state.timer);
      state.timer=setTimeout(()=>{installBar();applySort({quiet:true})},250);
    });
    state.observer.observe(p,{childList:true,subtree:false});
  }

  function scheduleInstall(){
    clearInterval(state.install);let tries=0;
    state.install=setInterval(()=>{
      tries++;
      const ok=installBar();
      if(ok||tries>=30){clearInterval(state.install);state.install=0}
    },500);
  }

  document.addEventListener('ended',endedCapture,true);
  document.addEventListener('click',navClick,true);
  document.addEventListener('keydown',keyboard,true);
  document.addEventListener('yt-navigate-finish',()=>{
    verifyPending();scheduleInstall();
    setTimeout(()=>{if(settings.auto)applySort({quiet:true})},250);
  },true);

  scheduleInstall();
})();