// ==UserScript==
// @name         Kindred yt-dlp Helper
// @namespace    kindred-tech.local
// @version      2.1.0
// @description  Safe standalone desktop/mobile yt-dlp command copier with playlists and Android/Termux support. Automatically stays dormant when Kindred Universal Media Toolkit provides integrated yt-dlp.
// @author       Th3ShadowKitsuneDevil / Kindred
// @license      MIT
// @match        *://*/*
// @run-at       document-end
// @noframes
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_yt-dlp_Helper.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/media/Kindred_yt-dlp_Helper.user.js
// ==/UserScript==

(() => {
  'use strict';

  const APP='Kindred yt-dlp Helper';
  const PLAYLIST='%(playlist)s/%(playlist_index)03d - %(title)s [%(id)s].%(ext)s';
  const SINGLE='%(title)s [%(id)s].%(ext)s';
  const ANDROID=/Android/i.test(navigator.userAgent||'');

  /*
   * Universal Media Toolkit v3+ already includes the full yt-dlp helper.
   * Do nothing when that toolkit marker is present, preventing duplicate
   * menus/buttons and keeping media pages as untouched as possible.
   */
  if(document.documentElement?.getAttribute('data-kindred-toolkit-ytdlp')){
    console.info(`[${APP}] Integrated toolkit yt-dlp detected; standalone helper is dormant.`);
    return;
  }

  function menu(label,fn){
    try{
      if(typeof GM_registerMenuCommand==='function')GM_registerMenuCommand(label,fn);
    }catch{}
  }

  function shellQuote(value){
    return "'"+String(value).replace(/'/g,"'\\''")+"'";
  }

  async function copy(text,message='yt-dlp command copied'){
    try{
      if(typeof GM_setClipboard==='function'){
        GM_setClipboard(text,'text');
        console.info(`[${APP}] ${message}`);
        return;
      }
    }catch{}

    try{
      await navigator.clipboard.writeText(text);
      console.info(`[${APP}] ${message}`);
      return;
    }catch{}

    prompt('Copy this command:',text);
  }

  function args(format,playlist){
    const template=playlist?PLAYLIST:SINGLE;
    const scope=playlist
      ? `--yes-playlist --ignore-errors -o ${shellQuote(template)}`
      : `--no-playlist -o ${shellQuote(template)}`;

    if(format==='mp4')return `${scope} -f "bv*+ba/b" --merge-output-format mp4`;
    if(format==='mp3')return `${scope} -x --audio-format mp3 --audio-quality 0`;
    if(format==='opus')return `${scope} -x --audio-format opus`;
    return scope;
  }

  function command(format='best',playlist=false,range='',termux=false){
    const rangeArg=range?` -I ${shellQuote(range)}`:'';
    const cmd=`yt-dlp ${args(format,playlist)}${rangeArg} ${shellQuote(location.href)}`;
    return termux?`cd ~/storage/downloads && ${cmd}`:cmd;
  }

  function copyCommand(format='best',playlist=false,range='',termux=false){
    const label=`${termux?'Termux ':''}${playlist?'playlist ':'current '}${format.toUpperCase()}`;
    copy(command(format,playlist,range,termux),`Copied ${label} command`);
  }

  function custom(termux=false){
    const range=prompt(
      'Playlist items/range\n\nExamples:\n1:10\n1,3,5\n5:\n:20\n\nLeave blank for the whole playlist:',
      ''
    );

    if(range===null)return;

    const format=(prompt('Format: best, mp4, mp3, or opus','mp4')||'')
      .trim()
      .toLowerCase();

    if(!['best','mp4','mp3','opus'].includes(format)){
      alert('Use one of: best, mp4, mp3, opus');
      return;
    }

    copyCommand(format,true,range.trim(),termux);
  }

  menu('yt-dlp — Current Best',()=>copyCommand('best'));
  menu('yt-dlp — Current MP4',()=>copyCommand('mp4'));
  menu('yt-dlp — Current MP3',()=>copyCommand('mp3'));
  menu('yt-dlp — Current OPUS',()=>copyCommand('opus'));

  menu('yt-dlp — Playlist Best',()=>copyCommand('best',true));
  menu('yt-dlp — Playlist MP4',()=>copyCommand('mp4',true));
  menu('yt-dlp — Playlist MP3',()=>copyCommand('mp3',true));
  menu('yt-dlp — Playlist OPUS',()=>copyCommand('opus',true));
  menu('yt-dlp — Playlist custom range + format',()=>custom(false));

  menu('yt-dlp — Copy current URL',()=>copy(location.href,'Current URL copied'));

  if(ANDROID){
    menu('yt-dlp — Termux current MP4',()=>copyCommand('mp4',false,'',true));
    menu('yt-dlp — Termux current MP3',()=>copyCommand('mp3',false,'',true));
    menu('yt-dlp — Termux playlist MP4',()=>copyCommand('mp4',true,'',true));
    menu('yt-dlp — Termux playlist MP3',()=>copyCommand('mp3',true,'',true));
    menu('yt-dlp — Termux custom playlist',()=>custom(true));
  }

  /*
   * No floating overlay, no page-wide CSS, no click interception, and no
   * media/player mutation. This keeps the standalone helper mobile-safe
   * and avoids interfering with YouTube or streaming-site controls.
   */
})();
