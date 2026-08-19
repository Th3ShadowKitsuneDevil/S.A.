# S.A.
Software and Firmware Apps

Personal userscripts and browser automation helpers.

## Userscripts

### YouTube
- `userscripts/youtube/Efficient_YouTube_Age_Restriction_Bypass.user.js` — efficient hybrid age/content restriction helper based on the two MIT-licensed scripts used during development. Direct methods are attempted before optional proxy fallback, with signed-out/incognito performance in mind.
- `userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js` — lightweight YouTube UI/performance trim that avoids invasive timer/scheduler monkey-patching.

### Media / yt-dlp
- `userscripts/media/Kindred_Universal_Media_Toolkit.user.js` — popup/multi-player, YouTube live-chat cleanup, anti-rickroll guard, direct-media helpers, and yt-dlp command copying.
- `userscripts/media/Kindred_yt-dlp_Helper.user.js` — lightweight yt-dlp command helper with single-video and playlist commands for Best, MP4, MP3, and OPUS.

## Install in Tampermonkey

1. Open the desired `.user.js` file on GitHub.
2. Click **Raw**.
3. Tampermonkey should offer to install it. If it does not, create a new Tampermonkey script, press `Ctrl+A`, paste the raw file contents, and press `Ctrl+S`.

The userscripts in this repository include GitHub `@downloadURL` / `@updateURL` metadata so Tampermonkey can check this repository for updates.

## yt-dlp playlist helper

The yt-dlp helper can copy commands for either the current item only or the entire playlist. Playlist commands use playlist folders and numbered filenames so downloads stay organized.

The scripts do not attempt to defeat DRM. yt-dlp features depend on what the site and yt-dlp can access.

## Credits

The Efficient YouTube Age Restriction Bypass is derived from ideas/code paths in:
- Simple YouTube Age Restriction Bypass by Zerody — MIT License
- YouTube Restriction Bypass (Advanced Config) by EmersonxD — MIT License

See the individual userscript headers for attribution.
