// ==UserScript==
// @name         Kindred Universal Media Toolkit
// @namespace    kindred-tech.local
// @version      3.0.1
// @description  Desktop/mobile media toolkit with media lists, popup/tab multi-player, direct-media helpers, integrated yt-dlp + Android/Termux commands, and anti-rickroll. Leaves YouTube chat/fullscreen UI native.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        *://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      api.jm26.net
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_Universal_Media_Toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_Universal_Media_Toolkit.user.js
// ==/UserScript==

(() => {
  'use strict';

  const APP='ktMediaToolkit';
  const VERSION='3.0.1';
  const LISTS=4;
  const K={
    current:`${APP}:currentList`,
    list:n=>`${APP}:list:${n}`,
    floating:`${APP}:floatingButton`,
    rr:`${APP}:antiRickroll`,
    rrdb:`${APP}:rickrollDB`,
    rrpass:id=>`${APP}:rr:pass:${id}`
  };

  const PLAYLIST_TEMPLATE='%(playlist)s/%(playlist_index)03d - %(title)s [%(id)s].%(ext)s';
  const SINGLE_TEMPLATE='%(title)s [%(id)s].%(ext)s';

  const topWindow=(()=>{try{return top===self}catch{return false}})();
  const host=location.hostname;
  const isYouTube=/(^|\.)youtube\.com$/i.test(host)||/(^|\.)youtu\.be$/i.test(host);
  const isYouTubeMain=/(^|\.)youtube\.com$/i.test(host);

  const ENV=(()=>{
    const ua=navigator.userAgent||'';
    const android=/Android/i.test(ua);
    const ios=/iPhone|iPad|iPod/i.test(ua);
    const coarse=!!matchMedia?.('(pointer:coarse)').matches;
    const hoverNone=!!matchMedia?.('(hover:none)').matches;
    const mobileUA=/Android|Mobile|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);
    const mobile=android||ios||coarse||hoverNone||mobileUA;
    return{ua,android,ios,mobile};
  })();

  const RR={
    api:'https://api.jm26.net/rickroll-db/?type=get&api=userscript',
    interval:86400000,
    fallback:['dQw4w9WgXcQ','oHg5SJYRHA0','cvh0nX08nRw','xfr64zoBTAQ','iik25wqIuFo']
  };

  function get(key,fallback){
    try{
      if(typeof GM_getValue==='function')return GM_getValue(key,fallback);
    }catch{}
    try{
      const raw=localStorage.getItem(key);
      return raw===null?fallback:JSON.parse(raw);
    }catch{return fallback}
  }

  function set(key,value){
    try{
      if(typeof GM_setValue==='function'){
        GM_setValue(key,value);
        return;
      }
    }catch{}
    try{localStorage.setItem(key,JSON.stringify(value))}catch{}
  }

  function menu(label,fn){
    try{
      if(typeof GM_registerMenuCommand==='function')GM_registerMenuCommand(label,fn);
    }catch{}
  }

  function safeUrl(value,base=location.href){
    try{return new URL(value,base)}catch{return null}
  }

  function shellQuote(value){
    return "'"+String(value).replace(/'/g,"'\\''")+"'";
  }

  function toast(message){
    if(!document.documentElement)return;
    let el=document.getElementById(`${APP}-toast`);
    if(!el){
      el=document.createElement('div');
      el.id=`${APP}-toast`;
      el.style.cssText=`
        position:fixed;left:50%;bottom:max(26px,env(safe-area-inset-bottom));
        transform:translateX(-50%);z-index:2147483647;pointer-events:none;
        max-width:min(92vw,560px);padding:10px 14px;border-radius:10px;
        background:rgba(0,0,0,.9);color:#fff;text-align:center;
        font:13px/1.35 system-ui,-apple-system,sans-serif;
        box-shadow:0 4px 18px rgba(0,0,0,.4)
      `;
      document.documentElement.appendChild(el);
    }
    el.textContent=message;
    el.style.display='block';
    clearTimeout(el._timer);
    el._timer=setTimeout(()=>el.style.display='none',1800);
  }

  async function copy(text,message='Copied'){
    try{
      if(typeof GM_setClipboard==='function'){
        GM_setClipboard(text,'text');
        toast(message);
        return;
      }
    }catch{}
    try{
      await navigator.clipboard.writeText(text);
      toast(message);
      return;
    }catch{}
    prompt('Copy this text:',text);
  }

  function download(url,name=''){
    try{
      if(typeof GM_download==='function'){
        GM_download({url,name:name||undefined,saveAs:true,onerror:()=>open(url,'_blank')});
        return;
      }
    }catch{}
    try{
      const a=document.createElement('a');
      a.href=url;a.rel='noopener';a.target=ENV.mobile?'_self':'_blank';
      if(name)a.download=name;
      document.documentElement.appendChild(a);a.click();a.remove();
    }catch{open(url,'_blank')}
  }

  function ytId(value=location.href){
    const u=safeUrl(value);
    if(!u)return'';
    if(/youtu\.be$/i.test(u.hostname)){
      const id=u.pathname.split('/').filter(Boolean)[0]||'';
      return/^[\w-]{11}$/.test(id)?id:'';
    }
    const v=u.searchParams.get('v')||'';
    if(/^[\w-]{11}$/.test(v))return v;
    return u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)?.[1]||'';
  }

  function vimeoId(value=location.href){
    const u=safeUrl(value);
    if(!u||!/(^|\.)vimeo\.com$/i.test(u.hostname))return'';
    return u.pathname.match(/\/(?:video\/)?(\d{6,})/)?.[1]||'';
  }

  function largestMedia(){
    const all=[...document.querySelectorAll('video,audio')];
    if(!all.length)return null;
    return all.map(el=>{
      const r=el.getBoundingClientRect();
      const area=Math.max(0,r.width)*Math.max(0,r.height);
      return{el,score:(!el.paused&&!el.ended?1e12:0)+(r.width>20&&r.height>20?1e9:0)+area};
    }).sort((a,b)=>b.score-a.score)[0].el;
  }

  function directMedia(el=largestMedia()){
    if(!el)return'';
    const values=[el.currentSrc,el.src,...[...el.querySelectorAll('source[src]')].map(s=>s.src)];
    for(const value of values){
      const u=safeUrl(value);
      if(u&&/^https?:$/.test(u.protocol))return u.href;
    }
    return'';
  }

  function currentItem(){
    const y=ytId();
    if(y)return{kind:'youtube',id:y,url:location.href,title:document.title||`YouTube ${y}`};
    const v=vimeoId();
    if(v)return{kind:'vimeo',id:v,url:location.href,title:document.title||`Vimeo ${v}`};
    const el=largestMedia(),direct=directMedia(el);
    if(direct)return{kind:el?.tagName==='AUDIO'?'audio':'direct',url:direct,pageUrl:location.href,title:document.title||host};
    return{kind:'page',url:location.href,title:document.title||host};
  }

  function currentList(){
    const n=Number(get(K.current,1));
    return Number.isInteger(n)&&n>=1&&n<=LISTS?n:1;
  }

  function list(n=currentList()){
    const x=get(K.list(n),[]);
    return Array.isArray(x)?x:[];
  }

  function saveList(items,n=currentList()){
    const seen=new Set(),out=[];
    for(const item of items){
      if(!item?.url)continue;
      const key=`${item.kind}|${item.url}`;
      if(seen.has(key))continue;
      seen.add(key);out.push(item);
    }
    set(K.list(n),out);
    return out;
  }

  function selectList(n){
    if(n<1||n>LISTS)return;
    set(K.current,n);
    toast(`List ${n} selected (${list(n).length})`);
    refreshPanel();
  }

  function addCurrent(){
    const n=currentList(),items=list(n),item=currentItem();
    const key=`${item.kind}|${item.url}`;
    if(items.some(x=>`${x.kind}|${x.url}`===key)){
      toast(`Already in List ${n}`);
      return;
    }
    items.push(item);saveList(items,n);refreshPanel();
    toast(`Added to List ${n} (${items.length})`);
  }

  function clearList(){
    const n=currentList();saveList([],n);refreshPanel();toast(`Cleared List ${n}`);
  }

  function playerUrl(item){
    if(item.kind==='youtube')return`https://www.youtube.com/embed/${encodeURIComponent(item.id)}?autoplay=1&rel=0&playsinline=1`;
    if(item.kind==='vimeo')return`https://player.vimeo.com/video/${encodeURIComponent(item.id)}?autoplay=1`;
    if(item.kind==='direct'||item.kind==='audio')return item.url;
    return item.url;
  }

  function openCurrent(){
    const item=currentItem(),url=playerUrl(item);
    if(!url)return;
    if(ENV.mobile){
      open(url,'_blank');
      return;
    }
    open(url,'ktMediaCurrent','popup=yes,width=1100,height=700,resizable=yes,scrollbars=yes');
  }

  function multiHtml(items){
    const data=items.map(x=>({...x,playerUrl:playerUrl(x)}));
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Kindred Multi-Player</title><style>
      :root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#000;font-family:system-ui}
      #grid{display:grid;gap:2px;padding:2px;min-height:100dvh;background:#111}
      .cell{position:relative;min-width:0;overflow:hidden;background:#000;aspect-ratio:16/9}
      iframe,video,audio{display:block;border:0;width:100%;height:100%;background:#000;object-fit:contain}
      audio{height:84px;margin:auto}.label{position:absolute;left:7px;bottom:7px;max-width:75%;padding:4px 7px;border-radius:6px;background:#000b;font:12px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(orientation:portrait) and (max-width:820px){#grid{grid-template-columns:1fr!important}.cell{width:100%}}
    </style></head><body><div id="grid"></div><script>
      const items=${JSON.stringify(data)},grid=document.getElementById('grid');
      function cell(item){const c=document.createElement('div');c.className='cell';let m;if(item.kind==='direct'||item.kind==='audio'){m=document.createElement(item.kind==='audio'?'audio':'video');m.src=item.playerUrl;m.controls=true;m.autoplay=true;m.playsInline=true}else{m=document.createElement('iframe');m.src=item.playerUrl;m.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';m.allowFullscreen=true}const l=document.createElement('div');l.className='label';l.textContent=item.title||item.url;c.append(m,l);return c}
      function layout(){const n=grid.children.length;if(!n)return;const portrait=matchMedia('(orientation:portrait)').matches&&innerWidth<=820;if(portrait){grid.style.gridTemplateColumns='1fr';return}let best={cols:1,area:0};for(let cols=1;cols<=n;cols++){const rows=Math.ceil(n/cols),bw=innerWidth/cols,bh=innerHeight/rows,vw=Math.min(bw,bh*16/9),vh=vw*9/16,area=vw*vh;if(area>best.area)best={cols,area}}grid.style.gridTemplateColumns='repeat('+best.cols+',minmax(0,1fr))'}
      items.forEach(x=>grid.appendChild(cell(x)));layout();addEventListener('resize',layout);
    <\/script></body></html>`;
  }

  function openMulti(){
    let items=list();
    if(!items.length)items=[currentItem()];
    const blob=URL.createObjectURL(new Blob([multiHtml(items)],{type:'text/html'}));
    const w=ENV.mobile?open(blob,'_blank'):open(blob,'ktMediaMulti','popup=yes,width=1200,height=760,resizable=yes,scrollbars=yes');
    if(!w)toast('Popup/tab blocked');
    setTimeout(()=>URL.revokeObjectURL(blob),60000);
  }

  function detectedUrls(){
    const out=[],seen=new Set();
    const add=value=>{
      const u=safeUrl(value);
      if(!u||!/^https?:$/.test(u.protocol)||seen.has(u.href))return;
      if(!/\.(?:mp4|webm|m4v|mp3|m4a|aac|ogg|opus|wav|flac)(?:$|[?#])/i.test(u.href)&&!/googlevideo\.com|videoplayback|media|stream/i.test(u.href))return;
      seen.add(u.href);out.push(u.href);
    };
    try{performance.getEntriesByType('resource').forEach(e=>add(e.name))}catch{}
    document.querySelectorAll('video,audio,source').forEach(el=>add(el.currentSrc||el.src));
    return out;
  }

  function downloadDirect(){
    const urls=[directMedia(),...detectedUrls()].filter(Boolean);
    if(!urls.length){toast('No exposed direct media URL detected');return}
    download(urls[0]);
  }

  function copyUrls(){
    const urls=detectedUrls();
    if(!urls.length){toast('No exposed media URLs detected');return}
    copy(urls.join('\n'),`Copied ${urls.length} media URL${urls.length===1?'':'s'}`);
  }

  function playlistLikely(){
    const u=safeUrl(location.href);
    if(!u)return false;
    return u.searchParams.has('list')||/\/(?:playlist|sets|album|collection)(?:\/|$)/i.test(u.pathname);
  }

  function formatArgs(format,playlist){
    const tpl=playlist?PLAYLIST_TEMPLATE:SINGLE_TEMPLATE;
    const scope=playlist?`--yes-playlist --ignore-errors -o ${shellQuote(tpl)}`:`--no-playlist -o ${shellQuote(tpl)}`;
    if(format==='mp4')return`${scope} -f "bv*+ba/b" --merge-output-format mp4`;
    if(format==='mp3')return`${scope} -x --audio-format mp3 --audio-quality 0`;
    if(format==='opus')return`${scope} -x --audio-format opus`;
    return scope;
  }

  function dlpCommand(format='best',playlist=false,range='',termux=false){
    const rangeArg=range?` -I ${shellQuote(range)}`:'';
    const cmd=`yt-dlp ${formatArgs(format,playlist)}${rangeArg} ${shellQuote(location.href)}`;
    return termux?`cd ~/storage/downloads && ${cmd}`:cmd;
  }

  function copyDlp(format='best',playlist=false,range='',termux=false){
    const label=`${termux?'Termux ':''}${playlist?'playlist ':'current '}${format.toUpperCase()}`;
    copy(dlpCommand(format,playlist,range,termux),`Copied ${label} yt-dlp command`);
  }

  function customDlp(termux=false){
    const range=prompt('Playlist items/range\nExamples: 1:10, 1,3,5, 5:, :20\nLeave blank for all:','');
    if(range===null)return;
    const f=(prompt('Format: best, mp4, mp3, or opus','mp4')||'').trim().toLowerCase();
    if(!['best','mp4','mp3','opus'].includes(f)){alert('Use best, mp4, mp3, or opus');return}
    copyDlp(f,true,range.trim(),termux);
  }

  function rrEnabled(){return !!get(K.rr,true)}

  function rrData(){
    const x=get(K.rrdb,null);
    return x&&Array.isArray(x.ids)?x:{ids:RR.fallback,updated:0};
  }

  function rrWrite(ids){
    set(K.rrdb,{ids:[...new Set(ids)],updated:Date.now()});
  }

  function rrUpdate(){
    if(!rrEnabled())return;
    const state=rrData();
    if(Date.now()-Number(state.updated||0)<RR.interval)return;

    const parse=text=>{
      try{
        const p=JSON.parse(text);
        const values=Array.isArray(p)?p:(p?.videos||p?.ids||[]);
        const ids=values.map(x=>typeof x==='string'?x:x?.id).filter(x=>/^[\w-]{11}$/.test(x||''));
        if(ids.length)rrWrite([...RR.fallback,...ids]);
      }catch{}
    };

    try{
      if(typeof GM_xmlhttpRequest==='function'){
        GM_xmlhttpRequest({method:'GET',url:RR.api,timeout:5000,onload:r=>parse(r.responseText)});
        return;
      }
    }catch{}
    fetch(RR.api).then(r=>r.text()).then(parse).catch(()=>{});
  }

  function rrOverlay(id){
    if(!rrEnabled()||!document.documentElement||document.getElementById(`${APP}-rr`))return;
    if(sessionStorage.getItem(K.rrpass(id))==='1')return;

    const media=largestMedia();
    try{media?.pause()}catch{}

    const cover=document.createElement('div');
    cover.id=`${APP}-rr`;
    cover.style.cssText=`
      position:fixed;inset:0;z-index:2147483647;background:#070707;color:#fff;
      display:flex;align-items:center;justify-content:center;box-sizing:border-box;
      padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right))
              max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));
      font-family:system-ui,-apple-system,sans-serif
    `;
    cover.innerHTML=`<div style="width:min(100%,620px);text-align:center">
      <h2 style="margin:0 0 12px">Possible rickroll blocked</h2>
      <p style="opacity:.82;margin:0 0 18px">This YouTube media ID matched the Kindred anti-rickroll list.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button id="ktRRBack" style="min-height:46px;padding:12px 18px;font-size:16px">Go back</button>
        <button id="ktRRContinue" style="min-height:46px;padding:12px 18px;font-size:16px">Continue anyway</button>
      </div></div>`;
    document.documentElement.appendChild(cover);

    cover.querySelector('#ktRRBack').onclick=()=>history.length>1?history.back():location.replace('about:blank');
    cover.querySelector('#ktRRContinue').onclick=()=>{
      sessionStorage.setItem(K.rrpass(id),'1');
      cover.remove();
      try{media?.play?.()}catch{}
    };
  }

  function rrCheck(){
    if(!rrEnabled()||!isYouTube)return;
    const id=ytId();
    if(id&&rrData().ids.includes(id))rrOverlay(id);
  }

  function setRr(value){
    set(K.rr,!!value);
    if(!value)document.getElementById(`${APP}-rr`)?.remove();
    else{rrUpdate();rrCheck()}
    refreshPanel();
    toast(`Anti-rickroll ${value?'enabled':'disabled'}`);
  }

  let panel=null,fab=null;

  function floating(){
    const configured=get(K.floating,null);
    return configured===null?(ENV.mobile&&!isYouTubeMain):!!configured;
  }

  function setFloating(value){
    set(K.floating,!!value);
    if(value)mountFab();else removeUi();
    toast(`Floating toolkit button ${value?'enabled':'disabled'}`);
  }

  function ownButton(label,fn){
    const b=document.createElement('button');
    b.type='button';b.textContent=label;
    b.style.cssText='min-height:44px;border:0;border-radius:10px;padding:9px 10px;background:#292929;color:#fff;font:600 13px/1.2 system-ui;cursor:pointer;touch-action:manipulation';
    b.onclick=e=>{e.preventDefault();e.stopPropagation();fn()};
    return b;
  }

  function buildPanel(){
    const p=document.createElement('div');
    p.id=`${APP}-panel`;
    p.style.cssText=`
      position:fixed;right:max(10px,env(safe-area-inset-right));bottom:calc(76px + env(safe-area-inset-bottom));
      z-index:2147483646;width:min(calc(100vw - 20px),410px);max-height:min(76dvh,640px);
      overflow:auto;box-sizing:border-box;padding:12px;border-radius:16px;background:rgba(12,12,12,.97);
      color:#fff;box-shadow:0 8px 30px #0008;font-family:system-ui,-apple-system,sans-serif;
      display:none;overscroll-behavior:contain;-webkit-overflow-scrolling:touch
    `;

    const head=document.createElement('div');
    head.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px';
    const title=document.createElement('strong');title.textContent=`Kindred Media Toolkit ${VERSION}`;
    const close=ownButton('×',()=>p.style.display='none');close.style.minWidth='44px';close.style.fontSize='20px';
    head.append(title,close);

    const info=document.createElement('div');
    info.dataset.info='1';info.style.cssText='opacity:.72;font-size:12px;margin:0 0 10px';

    const grid=document.createElement('div');
    grid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px';

    grid.append(
      ownButton('＋ Add current',addCurrent),
      ownButton('▶ Open current',openCurrent),
      ownButton('▦ Multi-player',openMulti),
      ownButton('⌫ Clear list',clearList),
      ownButton('↓ Direct media',downloadDirect),
      ownButton('⧉ Copy media URLs',copyUrls),
      ownButton('yt-dlp Best',()=>copyDlp('best')),
      ownButton('yt-dlp MP4',()=>copyDlp('mp4')),
      ownButton('yt-dlp MP3',()=>copyDlp('mp3')),
      ownButton('yt-dlp OPUS',()=>copyDlp('opus')),
      ownButton('Playlist Best',()=>copyDlp('best',true)),
      ownButton('Playlist MP4',()=>copyDlp('mp4',true)),
      ownButton('Playlist MP3',()=>copyDlp('mp3',true)),
      ownButton('Playlist OPUS',()=>copyDlp('opus',true)),
      ownButton('Playlist range…',()=>customDlp(false)),
      ownButton(`🛡 Anti-rickroll: ${rrEnabled()?'ON':'OFF'}`,()=>setRr(!rrEnabled()))
    );

    if(ENV.android){
      grid.append(
        ownButton('Termux MP4',()=>copyDlp('mp4',false,'',true)),
        ownButton('Termux MP3',()=>copyDlp('mp3',false,'',true)),
        ownButton('Termux playlist',()=>copyDlp('mp4',true,'',true)),
        ownButton('Termux custom…',()=>customDlp(true))
      );
    }

    const lists=document.createElement('div');
    lists.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px';
    for(let i=1;i<=LISTS;i++)lists.append(ownButton(String(i),()=>selectList(i)));

    p.append(head,info,grid,lists);
    return p;
  }

  function refreshPanel(){
    if(!panel)return;
    const n=currentList();
    const info=panel.querySelector('[data-info]');
    if(info)info.textContent=`List ${n} • ${list(n).length} item${list(n).length===1?'':'s'}${playlistLikely()?' • playlist detected':''}`;

    const anti=[...panel.querySelectorAll('button')].find(b=>b.textContent.startsWith('🛡 Anti-rickroll'));
    if(anti)anti.textContent=`🛡 Anti-rickroll: ${rrEnabled()?'ON':'OFF'}`;
  }

  function mountFab(){
    if(!topWindow||!document.documentElement||fab)return;
    panel=buildPanel();
    fab=ownButton('▶',()=>{
      panel.style.display=panel.style.display==='none'?'block':'none';
      refreshPanel();
    });
    fab.id=`${APP}-fab`;
    fab.title='Kindred Media Toolkit';
    fab.style.cssText+=`
      ;position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));
      z-index:2147483645;width:54px;height:54px;padding:0;border-radius:50%;font-size:22px;box-shadow:0 5px 20px #0007
    `;
    document.documentElement.append(panel,fab);
    refreshPanel();
  }

  function removeUi(){
    panel?.remove();fab?.remove();panel=null;fab=null;
  }

  function registerMenus(){
    menu('Kindred — Add current to list',addCurrent);
    menu('Kindred — Open current player',openCurrent);
    menu('Kindred — Open multi-player',openMulti);
    menu('Kindred — Clear current list',clearList);
    menu('Kindred — Download first direct media',downloadDirect);
    menu('Kindred — Copy detected media URLs',copyUrls);
    for(let i=1;i<=LISTS;i++)menu(`Kindred — Select List ${i}`,()=>selectList(i));

    menu(`Kindred — Anti-rickroll: ${rrEnabled()?'ON':'OFF'}`,()=>setRr(!rrEnabled()));
    menu(`Kindred — Floating panel: ${floating()?'ON':'OFF'}`,()=>setFloating(!floating()));

    menu('yt-dlp — Current Best',()=>copyDlp('best'));
    menu('yt-dlp — Current MP4',()=>copyDlp('mp4'));
    menu('yt-dlp — Current MP3',()=>copyDlp('mp3'));
    menu('yt-dlp — Current OPUS',()=>copyDlp('opus'));
    menu('yt-dlp — Playlist Best',()=>copyDlp('best',true));
    menu('yt-dlp — Playlist MP4',()=>copyDlp('mp4',true));
    menu('yt-dlp — Playlist MP3',()=>copyDlp('mp3',true));
    menu('yt-dlp — Playlist OPUS',()=>copyDlp('opus',true));
    menu('yt-dlp — Playlist custom range + format',()=>customDlp(false));

    if(ENV.android){
      menu('yt-dlp — Termux current MP4',()=>copyDlp('mp4',false,'',true));
      menu('yt-dlp — Termux current MP3',()=>copyDlp('mp3',false,'',true));
      menu('yt-dlp — Termux playlist MP4',()=>copyDlp('mp4',true,'',true));
      menu('yt-dlp — Termux custom playlist',()=>customDlp(true));
    }
  }

  function markIntegrated(){
    try{document.documentElement?.setAttribute('data-kindred-toolkit-ytdlp',VERSION)}catch{}
  }

  function bootstrap(){
    markIntegrated();
    if(floating())mountFab();
    rrCheck();
  }

  markIntegrated();
  registerMenus();
  rrUpdate();

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',bootstrap,{once:true});
  }else bootstrap();

  if(isYouTubeMain){
    document.addEventListener('yt-navigate-finish',()=>{
      markIntegrated();
      rrCheck();
    },true);
  }

  /*
   * Deliberately NO YouTube live-chat, comments, share, fullscreen,
   * side-rail, player-size, queue, or global-click manipulation.
   */
})();
