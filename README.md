# S.A.
Software and Firmware Apps

Personal userscripts and browser automation helpers.

## Userscripts

### YouTube
- `userscripts/youtube/Efficient_YouTube_Age_Restriction_Bypass.user.js` — efficient hybrid age/content restriction helper based on the two MIT-licensed scripts used during development. Direct methods are attempted before optional proxy fallback, with signed-out/incognito performance in mind. Includes mobile YouTube matching.
- `userscripts/youtube/Kindred_YouTube_Fast_Start_Lite.user.js` — minimal desktop/mobile-safe YouTube performance helper. It only disables the cinematic/ambient background and deliberately leaves chat, buttons, queues, fullscreen UI, player sizing, and input native.
- `userscripts/youtube/Kindred_YouTube_Smart_Queue_Sorter.user.js` — smart queue sorter for duration, release date, title, channel, reverse, and shuffle, with Auto and Full Queue controls.

### Media / yt-dlp
- `userscripts/media/Kindred_Universal_Media_Toolkit.user.js` — v3.0.1 desktop/mobile toolkit with media lists, popup/tab players, responsive multi-player layouts, direct-media helpers, integrated yt-dlp single/playlist commands, Android/Termux commands, and anti-rickroll protection. It no longer hides, removes, or manipulates YouTube live chat, chat replay, comments, side rails, fullscreen quick actions, or player layout.
- `userscripts/media/Kindred_yt-dlp_Helper.user.js` — v2.1.0 safe standalone yt-dlp command copier. It supports Best/MP4/MP3/OPUS, playlists, custom ranges, and Android/Termux. When Universal Media Toolkit v3+ is active, this standalone helper automatically stays dormant to avoid duplicate menus/UI.
- `userscripts/media/Kindred_Streaming_Site_Helper.user.js` — adaptive desktop/mobile streaming helper for Tubi, LookMovie2, and similar sites. Keep site-specific playback compatibility in mind; DRM-protected media is outside its scope.

## Install in Tampermonkey / a compatible userscript manager

1. Open the desired `.user.js` file on GitHub.
2. Click **Raw**.
3. Your userscript manager should offer to install it. If it does not, create a new userscript, select all existing text, paste the raw file contents, and save.

The userscripts in this repository include GitHub `@downloadURL` / `@updateURL` metadata so compatible userscript managers can check this repository for updates.

## Kindred Universal Media Toolkit v3.0.1

The toolkit is now the primary combined media script. It includes the yt-dlp functionality directly, so the standalone yt-dlp helper is optional rather than required.

Desktop behavior favors popup-style media windows where useful. Touch/mobile behavior favors new tabs, large tap targets, safe-area-aware controls, responsive portrait/landscape multi-player layouts, and clipboard/download fallbacks. On Android it exposes Termux-oriented yt-dlp commands that begin in `~/storage/downloads`.

The floating toolkit button is deliberately conservative: on mobile sites it can be enabled, but on YouTube it defaults off so it does not cover or interfere with native player controls.

The anti-rickroll guard is integrated into the toolkit. It checks recognized YouTube video IDs, presents a reversible warning screen, and allows a one-session “Continue anyway” bypass. It can be turned on or off from the userscript menu or toolkit panel.

Most importantly, the toolkit no longer removes or hides YouTube live chat, live-chat replay, comments, side rails, fullscreen buttons, player classes, or player sizing. Those remain entirely under YouTube's control.

## Kindred yt-dlp Helper v2.1.0

The standalone helper is now intentionally minimal and page-safe: no floating overlay by default, no page-wide CSS, no media/player mutation, and no global click interception. It uses the userscript menu to copy current-item and playlist commands for Best, MP4, MP3, and OPUS, plus custom playlist ranges such as `1:10`, `1,3,5`, `5:`, and `:20`.

When Universal Media Toolkit v3+ is enabled, the standalone helper detects the toolkit and stays dormant so the same yt-dlp functionality is not injected twice.

## Mobile compatibility

- Universal Media Toolkit: adaptive desktop/mobile UI; Android/Termux support.
- Standalone yt-dlp Helper: desktop/mobile-safe menu workflow; Android/Termux support.
- Efficient YouTube Age Restriction Bypass: includes `m.youtube.com` support.
- Fast-Start Lite: includes desktop, mobile YouTube, and YouTube Music matching while leaving the player UI native.
- Smart Queue Sorter: designed around YouTube's playlist-panel queue DOM. It is safe to use on touch devices and works when that queue DOM is available, including desktop-site mode on mobile; unsupported mobile layouts simply do not get a sorter panel.
- Streaming Site Helper: adaptive desktop/mobile design, though individual streaming sites can change player behavior and may require site-specific updates.

## yt-dlp playlist helper

The integrated toolkit and optional standalone helper can copy commands for either the current item or an entire playlist. Playlist commands use playlist folders and numbered filenames so downloads stay organized. Custom playlist item ranges are also supported.

The scripts do not attempt to defeat DRM. yt-dlp features depend on what the site and yt-dlp can access.

## Credits

The Efficient YouTube Age Restriction Bypass is derived from ideas/code paths in:
- Simple YouTube Age Restriction Bypass by Zerody — MIT License
- YouTube Restriction Bypass (Advanced Config) by EmersonxD — MIT License

See the individual userscript headers for attribution.
