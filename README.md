# S.A.
Software and Firmware Apps

Personal userscripts and browser automation helpers.

## Userscripts

### YouTube
- `userscripts/youtube/Efficient_YouTube_Age_Restriction_Bypass.user.js` — efficient hybrid age/content restriction helper based on the two MIT-licensed scripts used during development. Direct methods are attempted before optional proxy fallback, with signed-out/incognito performance in mind.
- `userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js` — lightweight YouTube UI/performance trim that avoids invasive timer/scheduler monkey-patching.

### Media / yt-dlp
- `userscripts/media/Kindred_Universal_Media_Toolkit.user.js` — v2.0 adaptive desktop/mobile toolkit with popup-or-tab media players, touch controls, responsive multi-player layouts, YouTube live-chat cleanup, anti-rickroll guard, direct-media helpers, yt-dlp playlist commands, and Android/Termux command helpers.
- `userscripts/media/Kindred_yt-dlp_Helper.user.js` — lightweight yt-dlp command helper with single-video and playlist commands for Best, MP4, MP3, and OPUS.

## Install in Tampermonkey / a compatible userscript manager

1. Open the desired `.user.js` file on GitHub.
2. Click **Raw**.
3. Your userscript manager should offer to install it. If it does not, create a new userscript, select all existing text, paste the raw file contents, and save.

The userscripts in this repository include GitHub `@downloadURL` / `@updateURL` metadata so compatible userscript managers can check this repository for updates.

## Kindred Universal Media Toolkit v2.0

The v2 toolkit automatically adapts to desktop versus touch/mobile environments. Desktop keeps popup-style windows and hotkeys, while touch/mobile environments favor new tabs, larger tap targets, a floating media control button, responsive portrait/landscape multi-player layouts, and compatibility fallbacks for clipboard, storage, and downloads.

On Android it also exposes Termux-oriented yt-dlp command copying. Browser userscripts cannot directly execute the local yt-dlp binary, so these commands are copied for use in Termux or another shell environment.

## yt-dlp playlist helper

The yt-dlp helpers can copy commands for either the current item only or the entire playlist. Playlist commands use playlist folders and numbered filenames so downloads stay organized. Custom playlist item ranges are also supported.

The scripts do not attempt to defeat DRM. yt-dlp features depend on what the site and yt-dlp can access.

## Credits

The Efficient YouTube Age Restriction Bypass is derived from ideas/code paths in:
- Simple YouTube Age Restriction Bypass by Zerody — MIT License
- YouTube Restriction Bypass (Advanced Config) by EmersonxD — MIT License

See the individual userscript headers for attribution.
