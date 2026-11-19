# Kindred YouTube Smart Queue v4.0.0

This build changes the architecture from visual/CSS sorting to **native YouTube queue sorting**.

## What v4 changes

- Reads YouTube's live temporary queue from `yt-playlist-manager.getPlaylistData()`.
- Reorders the real queue by moving the live queue row and invoking YouTube's own panel `handleDrop()` method.
- Verifies the manager order after sorting and also checks `#movie_player.getPlaylist()` when available.
- Does **not** cancel `ended`, Next, Previous, keyboard, autoplay, or loop events.
- Does **not** use CSS order to pretend the queue is sorted.
- Does **not** use a delayed `location.assign()` correction race.
- Keeps sorting concerns separate from the user's playlist-loop and 1080p scripts.
- Refuses to rewrite a normal saved playlist. It only performs native rewrites on YouTube temporary Queue playlists whose ID begins with `TLPQ`.

## Install / update in Edge

1. Extract this folder somewhere permanent.
2. Open `edge://extensions/`.
3. Enable **Developer mode**.
4. Remove or disable the previous Kindred Smart Queue v3 build.
5. Click **Load unpacked** and select this folder.
6. Disable the old Tampermonkey Smart Queue Sorter v2.5.0.
7. Refresh existing YouTube tabs once.
8. Open a YouTube temporary Queue and click the extension icon.
9. Choose a sort mode and click **Rebuild native order** for the first test.

After a successful sort, YouTube's own queue order and its own Next/autoplay selection should agree with the extension.

## Compatibility

This is a Manifest V3 extension for Chromium browsers such as Microsoft Edge and Google Chrome.

The extension uses a small MAIN-world bridge only for YouTube's own in-page queue objects. Extension storage and UI remain in the normal isolated extension context.

## Acknowledgment

The native queue mechanism was informed by the MIT-licensed `dataterminals/YouTubeQueue` project, which documents and verifies YouTube's `yt-playlist-manager` queue reader and the queue panel's `handleDrop()` reorder path. This extension implements its own sorting/state/UI architecture around those YouTube primitives.
