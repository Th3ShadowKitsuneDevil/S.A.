// ==UserScript==
// @name         Kindred YouTube Smart Queue Sorter
// @namespace    kindred-tech.local
// @version      2.3.0
// @description  Desktop/mobile-safe smart YouTube queue sorting by duration, release date, title, channel, reverse, or shuffle, with Auto and Full queue scope controls.
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
  const SETTINGS=`${KEY}:settings`, DATECACHE=`${KEY}:publish-date-cache`;
  const defaults={mode:'duration-asc',auto:true,fullQueue:true};
  const state={applying:false,observer:null,parent:null,timer:0,plan:[],ranks:new Map(),dates:loadDates(),loading:new Map(),pending:null,hooked:new WeakSet(),install:0};
  let settings=loadSettings();

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

  function clearSort(){
    const rs=rows(),p=parent(rs);p?.classList.remove(PARENT);
    for(const r of rs)r.style.removeProperty('--kindred-smart-order');
    state.plan=[];
  }

  async function applySort({quiet=false}={}){
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
        clearSort();

        if(!quiet){
          status(
            'Manual / YouTube order — Kindred sorting is not controlling the queue.'
          );
        }

        return;
      }

      let items=rs.map(info);
      let sortable;
      let locked=[];

      if(settings.fullQueue){
        sortable=items;

      }else{
        const sel=items.findIndex(x=>x.selected);
        const lockedCount=sel>=0?sel+1:0;

        locked=items.slice(0,lockedCount);
        sortable=items.slice(lockedCount);
      }

      if(needDates()){
        await ensureDates(sortable);
        items=rows().map(info);

        if(settings.fullQueue){
          sortable=items;
          locked=[];

        }else{
          const sel=items.findIndex(x=>x.selected);
          const lockedCount=sel>=0?sel+1:0;

          locked=items.slice(0,lockedCount);
          sortable=items.slice(lockedCount);
        }
      }

      const sorted=[...sortable].sort(
        comparator(settings.mode)
      );

      const plan=settings.fullQueue
        ? sorted
        : [...locked,...sorted];

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
          `${sorted.length} sorted item${sorted.length===1?'':'s'}` +
          currentText
        );
      }

      hookVideo();

    }finally{
      state.applying=false;
    }
  }

  function currentIndex(){
    if(!state.plan.length)return-1;
    const s=state.plan.findIndex(x=>selected(x.row));if(s>=0)return s;
    const current=u(location.href)?.searchParams.get('v')||'';
    return state.plan.findIndex(x=>x.videoId===current);
  }
  function planned(delta){if(settings.mode==='manual')return null;const i=currentIndex();return i<0?null:state.plan[i+delta]||null}
  function go(item){
    if(!item)return false;
    const h=item.href||href(item.row),url=u(h);if(!url)return false;
    state.pending={videoId:item.videoId,href:url.href,until:Date.now()+5000};
    const a=item.row?.querySelector('a#thumbnail[href*="/watch"]')||item.row?.querySelector('a[href*="/watch"]');
    if(a)a.click();else location.assign(url.href);
    return true;
  }
  function relative(delta){return go(planned(delta))}
  function hookVideo(){
    const v=document.querySelector('video');if(!v||state.hooked.has(v))return;
    state.hooked.add(v);
    v.addEventListener('ended',()=>{if(settings.mode!=='manual')relative(1)},true);
  }
  function navClick(e){
    if(settings.mode==='manual')return;
    const b=e.target?.closest?.('.ytp-next-button, .ytp-prev-button');if(!b)return;
    const x=planned(b.matches('.ytp-prev-button')?-1:1);if(!x)return;
    e.preventDefault();e.stopImmediatePropagation();go(x);
  }
  function keyboard(e){
    if(settings.mode==='manual')return;
    const t=e.target,tag=(t?.tagName||'').toUpperCase();
    if(['INPUT','TEXTAREA','SELECT'].includes(tag)||t?.isContentEditable)return;
    let d=0;
    if(e.shiftKey&&e.code==='KeyN')d=1;
    else if(e.shiftKey&&e.code==='KeyP')d=-1;
    else if(e.code==='MediaTrackNext')d=1;
    else if(e.code==='MediaTrackPrevious')d=-1;
    if(!d)return;
    const x=planned(d);if(!x)return;
    e.preventDefault();e.stopImmediatePropagation();go(x);
  }
  function verifyPending(){
    const p=state.pending;if(!p)return;
    if(Date.now()>p.until){state.pending=null;return}
    const cur=u(location.href)?.searchParams.get('v')||'';
    if(cur===p.videoId){state.pending=null;return}
    const target=u(p.href);if(target){state.pending=null;location.assign(target.href)}
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

    syncUi();
    applySort();
  }

  function setAuto(v){
    settings.auto=!!v;
    saveSettings();
    syncUi();

    if(settings.auto){
      applySort();
    }

    status(
      `${label(settings.mode)} • automatic re-sort ` +
      `${settings.auto?'enabled':'paused'}`
    );
  }

  function setFullQueue(v){
    settings.fullQueue=!!v;
    saveSettings();
    syncUi();
    applySort();

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
    apply.textContent='Apply now';
    apply.title='Re-read the current queue and apply the selected sort';
    apply.addEventListener('click',()=>applySort());

    const shuffle=document.createElement('button');
    shuffle.type='button';
    shuffle.textContent='↻';
    shuffle.title='Generate a new shuffle order';

    shuffle.addEventListener(
      'click',
      ()=>{
        state.ranks.clear();

        settings.mode==='shuffle'
          ? applySort()
          : setMode('shuffle');
      }
    );

    const st=document.createElement('span');
    st.dataset.status='1';

    st.textContent=
      settings.fullQueue
        ? 'Full queue on — the entire queue participates in the selected sort.'
        : 'Full queue off — only upcoming videos are sorted.';

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
      const ok=installBar();hookVideo();
      if(ok||tries>=30){clearInterval(state.install);state.install=0}
    },500);
  }

  document.addEventListener('click',navClick,true);
  document.addEventListener('keydown',keyboard,true);
  document.addEventListener('yt-navigate-finish',()=>{
    verifyPending();scheduleInstall();
    setTimeout(()=>{hookVideo();if(settings.auto)applySort({quiet:true})},250);
  },true);
  document.addEventListener('loadedmetadata',e=>{if(e.target instanceof HTMLVideoElement)hookVideo()},true);

  scheduleInstall();
})();
