# Edge Cache 15 — Local

A small Manifest V3 extension for Microsoft Edge that clears browser cache every **15 minutes** while Edge is running.

## Default behavior

- Clears the browser's normal HTTP cache every 15 minutes.
- Provides a **Clear cache now** button.
- Can be enabled or disabled from the popup.
- Optionally clears website **Cache Storage** as well.
- Cache Storage cleanup is **off by default**.

## Deliberately preserved

This extension does **not** clear:

- cookies
- login sessions
- passwords
- browsing history
- download history
- local storage
- IndexedDB
- service-worker registrations

The extension only requests the `alarms`, `browsingData`, and `storage` permissions.

## Install in Microsoft Edge

1. Download or clone the repository.
2. Open `edge://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select `extensions/edge/Edge_Cache_15_Local/`.

Manifest V3 background service workers are event-driven, so Edge may show the service worker as **Inactive** between events. That is normal. The `chrome.alarms` event wakes it when the 15-minute cleanup is due.

## Notes

The original local build was created for the user's Edge/Windows 10 setup to keep browser cache growth under control without repeatedly logging sites out.

This repository copy preserves the recovered behavior of that build. The original generated ZIP was named `Edge_Cache_15_Extension.zip`.
