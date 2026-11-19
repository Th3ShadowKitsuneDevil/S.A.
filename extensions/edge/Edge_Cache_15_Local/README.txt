EDGE CACHE 15 — UNPACKED MICROSOFT EDGE EXTENSION

PURPOSE
* Automatically clears this Edge profile's browser-wide HTTP resource cache about every 15 minutes while Edge is running.
* Optionally clears the Cache Storage API used by websites and PWAs, including Hulu.
* Never requests access to or deletes cookies, passwords, history, localStorage, IndexedDB, or service-worker registrations.
* Doesn't close or reload browser tabs, reinstall browsers, or touch your network settings.

INSTALL
1. Unzip Edge_Cache_15_Extension.zip into a PERMANENT folder such as C:\Tools\Edge_Cache_15_Extension.
2. In Microsoft Edge open: edge://extensions
3. Enable 'Developer mode'.
4. Click 'Load unpacked', and select the folder containing manifest.json.
5. Pin the Edge Cache 15 extension if desired. Click its icon to view status, pause it, or clear immediately.
6. For Hulu's service-worker Cache Storage, optionally turn on 'Also clear website Cache Storage'. Default is OFF because other PWAs rely on this data.

BEHAVIOR / LIMITATIONS
* The first automatic cleanup is scheduled for roughly 15 minutes after installation; subsequent runs are roughly every 15 minutes. Sleeping or closing Edge can delay the alarm; catch-up is not guaranteed.
* The 'Clear cache now' button runs even when automatic cleanup is paused.
* Removing HTTP cache and Cache Storage repeatedly increases network traffic and may disrupt web apps or streaming. It will NOT cure ongoing ERR_CONNECTION_RESET, blocked requests, failed CDN responses, or extensions/scripts interfering with the website.
* Cache Storage includes offline/app data and may affect functionality even though login cookies remain untouched.
* This is browser-profile-wide (including websites in that Edge profile), not Chrome or other browsers. An Edge-installed web app using the same profile should share its cache-clearing scope.
* Does not unregister service workers: doing so every 15 minutes would be disruptive to installed apps.
* This extension operates entirely locally and does not send data to external servers.
* To stop it, uncheck automatic clearing in its popup, or disable/remove it at edge://extensions.

TECHNICAL
Manifest V3. APIs: chrome.alarms, chrome.browsingData.remove, chrome.storage.local. No host permissions.
