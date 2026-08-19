// ==UserScript==
// @name         Efficient YouTube Age Restriction Bypass
// @namespace    kindred-tech.local
// @version      1.2.0
// @description  Efficient hybrid YouTube age/content restriction bypass. Direct methods first, optional proxy fallback, minimal overhead, faster signed-out/incognito behavior.
// @author       Th3ShadowKitsuneDevil / Kindred config; based on Zerody / EmersonxD scripts
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube-nocookie.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @downloadURL  https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Efficient_YouTube_Age_Restriction_Bypass.user.js
// @updateURL    https://raw.githubusercontent.com/Th3ShadowKitsuneDevil/S.A./main/userscripts/youtube/Efficient_YouTube_Age_Restriction_Bypass.user.js
// ==/UserScript==

(() => {
    'use strict';

    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const PREFIX = 'EYARB_';

    const DEFAULTS = Object.freeze({
        accountProxy: 'https://youtube-proxy.zerody.one',
        videoProxy: 'https://ny.4everproxy.com',
        proxyFallback: true,
        debug: false
    });

    const cfg = {
        accountProxy: GM_getValue(PREFIX + 'accountProxy', DEFAULTS.accountProxy),
        videoProxy: GM_getValue(PREFIX + 'videoProxy', DEFAULTS.videoProxy),
        proxyFallback: GM_getValue(PREFIX + 'proxyFallback', DEFAULTS.proxyFallback),
        debug: GM_getValue(PREFIX + 'debug', DEFAULTS.debug)
    };

    // LOGIN_REQUIRED is intentionally excluded. A genuine mandatory login wall
    // should fail quickly instead of cycling through expensive fallbacks.
    const UNLOCKABLE = new Set([
        'AGE_VERIFICATION_REQUIRED',
        'AGE_CHECK_REQUIRED',
        'CONTENT_CHECK_REQUIRED'
    ]);

    const VALID = new Set([
        'OK',
        'LIVE_STREAM_OFFLINE'
    ]);

    const AUTH_HEADERS = new Set([
        'Authorization',
        'X-Goog-AuthUser',
        'X-Origin'
    ]);

    const authHeaders = new Map();

    const nativeJSONParse = W.JSON.parse;
    const nativeXHROpen = W.XMLHttpRequest.prototype.open;
    const nativeXHRSend = W.XMLHttpRequest.prototype.send;
    const nativeXHRSetHeader = W.XMLHttpRequest.prototype.setRequestHeader;
    const NativeRequest = W.Request;

    let cachedVideoId = null;
    let cachedUnlocked = null;
    let cachedSTS;
    let lastProxiedGoogleVideoParams = null;
    let inUnlock = false;

    const log = (...args) => {
        if (cfg.debug) console.log('[Efficient YT Age Bypass]', ...args);
    };

    const warn = (...args) => {
        if (cfg.debug) console.warn('[Efficient YT Age Bypass]', ...args);
    };

    function saveConfig(name, value) {
        cfg[name] = value;
        GM_setValue(PREFIX + name, value);
    }

    function registerMenus() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        GM_registerMenuCommand(
            `Proxy fallback: ${cfg.proxyFallback ? 'ON' : 'OFF'}`,
            () => {
                saveConfig('proxyFallback', !cfg.proxyFallback);
                alert(`Proxy fallback is now ${cfg.proxyFallback ? 'ON' : 'OFF'}.\n\nReload YouTube to apply.`);
            }
        );

        GM_registerMenuCommand('Set account proxy', () => {
            const value = prompt('Account proxy URL:', cfg.accountProxy);
            if (value) {
                saveConfig('accountProxy', value.replace(/\/$/, ''));
                alert('Account proxy saved.\n\nReload YouTube to apply.');
            }
        });

        GM_registerMenuCommand('Set video proxy', () => {
            const value = prompt('Googlevideo proxy URL:', cfg.videoProxy);
            if (value) {
                saveConfig('videoProxy', value.replace(/\/$/, ''));
                alert('Video proxy saved.\n\nReload YouTube to apply.');
            }
        });

        GM_registerMenuCommand(
            `Debug logs: ${cfg.debug ? 'ON' : 'OFF'}`,
            () => {
                saveConfig('debug', !cfg.debug);
                alert(`Debug logs are now ${cfg.debug ? 'ON' : 'OFF'}.\n\nReload YouTube to apply.`);
            }
        );

        GM_registerMenuCommand('Reset bypass settings', () => {
            for (const [name, value] of Object.entries(DEFAULTS)) {
                saveConfig(name, value);
            }
            alert('Efficient YouTube Age Restriction Bypass settings reset.\n\nReload YouTube to apply.');
        });
    }

    function isObject(value) {
        return value !== null && typeof value === 'object';
    }

    function deepCopy(value) {
        return nativeJSONParse(JSON.stringify(value));
    }

    function getYtcfg(name) {
        try {
            return W.ytcfg && typeof W.ytcfg.get === 'function'
                ? W.ytcfg.get(name)
                : undefined;
        } catch (_) {
            return undefined;
        }
    }

    function isLoggedIn() {
        const loggedIn = getYtcfg('LOGGED_IN');
        if (typeof loggedIn === 'boolean') return loggedIn;
        if (typeof getYtcfg('DELEGATED_SESSION_ID') === 'string') return true;

        const sessionIndex = parseInt(getYtcfg('SESSION_INDEX'));
        return Number.isFinite(sessionIndex) && sessionIndex >= 0;
    }

    function parseUrl(value) {
        try {
            if (value instanceof W.URL) return value;
            if (typeof value !== 'string') return null;
            return new W.URL(value, W.location.origin);
        } catch (_) {
            return null;
        }
    }

    function isYoutubeApi(url) {
        return !!(
            url &&
            url.origin === W.location.origin &&
            url.pathname.startsWith('/youtubei/')
        );
    }

    function isPlayerApi(url) {
        return !!(
            url &&
            ['/youtubei/v1/player', '/youtubei/v1/next'].includes(url.pathname)
        );
    }

    function setContentCheckOk(body) {
        if (typeof body !== 'string' || !body.includes('videoId')) return body;

        try {
            const parsed = nativeJSONParse(body);
            if (!parsed || !parsed.videoId) return body;

            parsed.contentCheckOk = true;
            parsed.racyCheckOk = true;
            return JSON.stringify(parsed);
        } catch (_) {
            return body;
        }
    }

    function getPlayabilityStatus(response) {
        return response && (response.playabilityStatus || response.previewPlayabilityStatus) || null;
    }

    function isRestricted(response) {
        const status = getPlayabilityStatus(response);
        if (!status) return false;
        if (status.desktopLegacyAgeGateReason) return true;
        if (UNLOCKABLE.has(status.status)) return true;

        // Older embedded-player age gate.
        try {
            if (!W.location.pathname.startsWith('/embed/')) return false;
            const runs = status.errorScreen.playerErrorMessageRenderer.reason.runs;
            return Array.isArray(runs) && runs.some(
                run => run?.navigationEndpoint?.urlEndpoint?.url?.includes('/2802167')
            );
        } catch (_) {
            return false;
        }
    }

    function isValid(response) {
        return VALID.has(response?.playabilityStatus?.status);
    }

    function getVideoId(response) {
        const direct = response?.videoDetails?.videoId;
        if (direct) return direct;

        try {
            const vars = getYtcfg('PLAYER_VARS');
            if (vars?.video_id) return vars.video_id;
        } catch (_) {}

        try {
            const u = new W.URL(W.location.href);
            const v = u.searchParams.get('v');
            if (/^[A-Za-z0-9_-]{11}$/.test(v || '')) return v;

            const match = u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
            return match ? match[1] : null;
        } catch (_) {
            return null;
        }
    }

    function getStartTime(videoId) {
        if (!W.location.href.includes(videoId)) return 0;

        try {
            const p = new URLSearchParams(W.location.search);
            const raw = p.get('t') || p.get('start') || p.get('time_continue');
            const n = parseInt(String(raw || '').replace(/s$/i, ''));
            return Number.isFinite(n) ? n : 0;
        } catch (_) {
            return 0;
        }
    }

    // Fast-start behavior: use STS if already available; never synchronously
    // download YouTube's base.js just to obtain it.
    function getSignatureTimestamp() {
        if (cachedSTS !== undefined) return cachedSTS || undefined;

        const sts = Number(getYtcfg('STS'));
        if (Number.isFinite(sts) && sts > 0) {
            cachedSTS = sts;
            return cachedSTS;
        }

        cachedSTS = null;
        return undefined;
    }

    function playbackContext() {
        const sts = getSignatureTimestamp();
        return Number.isFinite(sts)
            ? { contentPlaybackContext: { signatureTimestamp: sts } }
            : undefined;
    }

    function sendInnertubePlayer(payload, useAuth = false) {
        const apiKey = getYtcfg('INNERTUBE_API_KEY');
        if (!apiKey) return null;

        try {
            const xhr = new W.XMLHttpRequest();
            nativeXHROpen.call(
                xhr,
                'POST',
                '/youtubei/v1/player?key=' + encodeURIComponent(apiKey) + '&prettyPrint=false',
                false
            );

            nativeXHRSetHeader.call(xhr, 'Content-Type', 'application/json');

            if (useAuth && isLoggedIn()) {
                xhr.withCredentials = true;
                for (const name of AUTH_HEADERS) {
                    const value = authHeaders.get(name);
                    if (value) nativeXHRSetHeader.call(xhr, name, value);
                }
            }

            nativeXHRSend.call(xhr, JSON.stringify(payload));
            return nativeJSONParse(xhr.responseText);
        } catch (err) {
            warn('Innertube request failed', err);
            return null;
        }
    }

    function makeBasePayload(videoId) {
        const payload = {
            context: {
                client: {
                    clientName: getYtcfg('INNERTUBE_CLIENT_NAME') || 'WEB',
                    clientVersion: getYtcfg('INNERTUBE_CLIENT_VERSION') || '2.20220203.04.00',
                    hl: getYtcfg('HL') || 'en'
                }
            },
            videoId,
            startTimeSecs: getStartTime(videoId),
            racyCheckOk: true,
            contentCheckOk: true
        };

        const pc = playbackContext();
        if (pc) payload.playbackContext = pc;
        return payload;
    }

    function tryContentWarning(videoId, reason) {
        if (!String(reason || '').includes('CHECK_REQUIRED')) return null;
        return sendInnertubePlayer(makeBasePayload(videoId), isLoggedIn());
    }

    function tryTVEmbedded(videoId) {
        const payload = {
            context: {
                client: {
                    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
                    clientVersion: '2.0',
                    clientScreen: 'WATCH',
                    hl: getYtcfg('HL') || 'en'
                },
                thirdParty: {
                    embedUrl: 'https://www.youtube.com/'
                }
            },
            videoId,
            startTimeSecs: getStartTime(videoId),
            racyCheckOk: true,
            contentCheckOk: true
        };

        const pc = playbackContext();
        if (pc) payload.playbackContext = pc;
        return sendInnertubePlayer(payload, false);
    }

    function tryCreatorAuth(videoId) {
        if (!isLoggedIn()) return null;

        const payload = {
            context: {
                client: {
                    clientName: 'WEB_CREATOR',
                    clientVersion: '1.20210909.07.00',
                    hl: getYtcfg('HL') || 'en'
                }
            },
            videoId,
            startTimeSecs: getStartTime(videoId),
            racyCheckOk: true,
            contentCheckOk: true
        };

        const pc = playbackContext();
        if (pc) payload.playbackContext = pc;
        return sendInnertubePlayer(payload, true);
    }

    function tryAccountProxy(videoId, reason) {
        if (
            !cfg.proxyFallback ||
            !cfg.accountProxy ||
            reason === 'LOGIN_REQUIRED'
        ) {
            return null;
        }

        const params = new URLSearchParams({
            videoId,
            reason: reason || '',
            clientName: getYtcfg('INNERTUBE_CLIENT_NAME') || 'WEB',
            clientVersion: getYtcfg('INNERTUBE_CLIENT_VERSION') || '2.20220203.04.00',
            signatureTimestamp: getSignatureTimestamp() || '',
            startTimeSecs: getStartTime(videoId),
            hl: getYtcfg('HL') || 'en',
            isEmbed: W.location.pathname.startsWith('/embed/') ? 1 : 0,
            isConfirmed: 1
        });

        try {
            const xhr = new W.XMLHttpRequest();
            nativeXHROpen.call(
                xhr,
                'GET',
                `${cfg.accountProxy.replace(/\/$/, '')}/getPlayer?${params}&client=js`,
                false
            );
            nativeXHRSend.call(xhr, null);

            const response = nativeJSONParse(xhr.responseText);
            if (isObject(response)) response.proxied = true;
            return response;
        } catch (err) {
            warn('Proxy fallback failed', err);
            return null;
        }
    }

    function fixTrackingParams(response) {
        if (!response || !isValid(response)) return;

        const hasTracking =
            response.trackingParams &&
            response.responseContext?.mainAppWebResponseContext?.trackingParam;

        if (!hasTracking) {
            response.trackingParams = 'CAAQu2kiEwjor8uHyOL_AhWOvd4KHavXCKw=';
            response.responseContext = {
                mainAppWebResponseContext: {
                    trackingParam: 'kx_fmPxhoPZRzgL8kzOwANUdQh8ZwHTREkw2UqmBAwpBYrzRgkuMsNLBwOcCE59TDtslLKPQ-SS'
                }
            };
        }
    }

    function rememberProxiedVideo(response) {
        if (!response?.proxied || !response?.streamingData?.adaptiveFormats) return;

        const formats = response.streamingData.adaptiveFormats;
        const cipher = formats.find(item => item?.signatureCipher)?.signatureCipher;
        const direct = formats.find(item => item?.url)?.url;
        const videoUrl = cipher ? new URLSearchParams(cipher).get('url') : direct;

        try {
            lastProxiedGoogleVideoParams = videoUrl
                ? new W.URL(videoUrl).searchParams
                : null;
        } catch (_) {
            lastProxiedGoogleVideoParams = null;
        }
    }

    // Safe version of Advanced Config's fast status rewrite: only mark the
    // response playable when usable stream data is already present.
    function localFastRepair(response) {
        const status = response?.playabilityStatus;
        const streaming = response?.streamingData;
        const hasStreams = !!(
            streaming?.formats?.length ||
            streaming?.adaptiveFormats?.length
        );

        if (!status || !UNLOCKABLE.has(status.status) || !hasStreams) return false;

        status.status = 'OK';
        status.reason = '';
        try { delete status.errorScreen; } catch (_) {}
        log('Used local fast repair');
        return true;
    }

    function unlockPlayerResponse(response) {
        if (!isObject(response) || !isRestricted(response) || inUnlock) {
            return response;
        }

        if (localFastRepair(response)) return response;

        const videoId = getVideoId(response);
        const reason = getPlayabilityStatus(response)?.status || '';
        if (!videoId) return response;

        if (cachedVideoId === videoId && cachedUnlocked) {
            Object.assign(response, deepCopy(cachedUnlocked));
            if (response.previewPlayabilityStatus && cachedUnlocked.playabilityStatus) {
                response.previewPlayabilityStatus = deepCopy(cachedUnlocked.playabilityStatus);
            }
            return response;
        }

        inUnlock = true;

        try {
            const strategies = [];

            if (String(reason).includes('CHECK_REQUIRED')) {
                strategies.push([
                    'content-check',
                    () => tryContentWarning(videoId, reason)
                ]);
            }

            strategies.push([
                'tv-embedded',
                () => tryTVEmbedded(videoId)
            ]);

            if (isLoggedIn()) {
                strategies.push([
                    'creator-auth',
                    () => tryCreatorAuth(videoId)
                ]);
            }

            if (cfg.proxyFallback && reason !== 'LOGIN_REQUIRED') {
                strategies.push([
                    'account-proxy',
                    () => tryAccountProxy(videoId, reason)
                ]);
            }

            let unlocked = null;

            for (const [name, fn] of strategies) {
                let candidate = null;
                try {
                    candidate = fn();
                } catch (err) {
                    warn(`${name} failed`, err);
                }

                if (isValid(candidate)) {
                    unlocked = candidate;
                    log(`Unlocked with ${name}`);
                    break;
                }
            }

            if (!unlocked) return response;

            fixTrackingParams(unlocked);
            rememberProxiedVideo(unlocked);

            cachedVideoId = videoId;
            cachedUnlocked = deepCopy(unlocked);

            if (response.previewPlayabilityStatus && unlocked.playabilityStatus) {
                response.previewPlayabilityStatus = unlocked.playabilityStatus;
            }

            Object.assign(response, unlocked);
            response.__efficientAgeBypassUnlocked = true;
            return response;
        } finally {
            inUnlock = false;
        }
    }

    function processParsedData(data) {
        if (!isObject(data)) return data;

        if (data.playabilityStatus || data.previewPlayabilityStatus) {
            unlockPlayerResponse(data);
        }

        if (isObject(data.playerResponse)) {
            data.playerResponse = unlockPlayerResponse(data.playerResponse);
        }

        if (isObject(data.response?.playerResponse)) {
            data.response.playerResponse = unlockPlayerResponse(data.response.playerResponse);
        }

        return data;
    }

    function installPlayerResponseInterceptor() {
        const prop = 'playerResponse';
        const dataKey = '__EYARB_playerResponse';
        const existing = W.Object.getOwnPropertyDescriptor(W.Object.prototype, prop);

        if (existing && existing.configurable === false) return;

        const getter = existing?.get || function() {
            return this[dataKey];
        };

        const setter = existing?.set || function(value) {
            this[dataKey] = value;
        };

        try {
            W.Object.defineProperty(W.Object.prototype, prop, {
                configurable: true,
                get() {
                    return getter.call(this);
                },
                set(value) {
                    setter.call(
                        this,
                        isObject(value) ? unlockPlayerResponse(value) : value
                    );
                }
            });
        } catch (err) {
            warn('Could not install playerResponse interceptor', err);
        }
    }

    // Fast path: normal JSON is returned immediately unless the text mentions
    // player/playability fields.
    function installJsonInterceptor() {
        W.JSON.parse = function() {
            const data = nativeJSONParse.apply(this, arguments);
            const text = arguments[0];

            if (
                typeof text === 'string' &&
                !text.includes('playabilityStatus') &&
                !text.includes('playerResponse')
            ) {
                return data;
            }

            return processParsedData(data);
        };
    }

    function shouldProxyGoogleVideo(url) {
        if (
            !url ||
            !cfg.videoProxy ||
            !url.hostname.includes('.googlevideo.com')
        ) {
            return false;
        }

        const gcr = url.searchParams.get('gcr');
        const id = url.searchParams.get('id');

        return !!(
            gcr &&
            lastProxiedGoogleVideoParams &&
            id === lastProxiedGoogleVideoParams.get('id')
        );
    }

    function installXhrHooks() {
        W.XMLHttpRequest.prototype.open = function(method, url) {
            let parsed = parseUrl(url);
            this.__eyarbUrl = parsed;

            if (parsed && shouldProxyGoogleVideo(parsed)) {
                try {
                    W.Object.defineProperty(this, 'withCredentials', {
                        configurable: true,
                        set() {},
                        get() { return false; }
                    });
                } catch (_) {}

                arguments[1] = `${cfg.videoProxy.replace(/\/$/, '')}/direct/${btoa(parsed.toString())}`;
                parsed = parseUrl(arguments[1]);
                this.__eyarbUrl = parsed;
            }

            return nativeXHROpen.apply(this, arguments);
        };

        W.XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            const url = this.__eyarbUrl;
            if (isYoutubeApi(url) && AUTH_HEADERS.has(name)) {
                authHeaders.set(name, value);
            }
            return nativeXHRSetHeader.apply(this, arguments);
        };

        W.XMLHttpRequest.prototype.send = function(body) {
            const url = this.__eyarbUrl;
            if (isPlayerApi(url) && typeof body === 'string') {
                arguments[0] = setContentCheckOk(body);
            }
            return nativeXHRSend.apply(this, arguments);
        };
    }

    function captureHeaders(headers) {
        if (!headers) return;

        try {
            if (typeof headers.forEach === 'function') {
                headers.forEach((value, name) => {
                    for (const wanted of AUTH_HEADERS) {
                        if (wanted.toLowerCase() === String(name).toLowerCase()) {
                            authHeaders.set(wanted, value);
                        }
                    }
                });
                return;
            }

            if (Array.isArray(headers)) {
                for (const pair of headers) {
                    if (!Array.isArray(pair) || pair.length < 2) continue;
                    const [name, value] = pair;
                    for (const wanted of AUTH_HEADERS) {
                        if (wanted.toLowerCase() === String(name).toLowerCase()) {
                            authHeaders.set(wanted, value);
                        }
                    }
                }
                return;
            }

            if (isObject(headers)) {
                for (const [name, value] of Object.entries(headers)) {
                    for (const wanted of AUTH_HEADERS) {
                        if (wanted.toLowerCase() === String(name).toLowerCase()) {
                            authHeaders.set(wanted, value);
                        }
                    }
                }
            }
        } catch (_) {}
    }

    function installRequestHook() {
        if (typeof NativeRequest !== 'function') return;

        W.Request = new W.Proxy(NativeRequest, {
            construct(target, args, newTarget) {
                try {
                    let parsed = parseUrl(args[0]);
                    const options = isObject(args[1]) ? args[1] : (args[1] = {});

                    if (parsed && shouldProxyGoogleVideo(parsed)) {
                        args[0] = `${cfg.videoProxy.replace(/\/$/, '')}/direct/${btoa(parsed.toString())}`;
                        options.credentials = 'omit';
                        parsed = parseUrl(args[0]);
                    }

                    if (isPlayerApi(parsed) && typeof options.body === 'string') {
                        options.body = setContentCheckOk(options.body);
                    }

                    if (isYoutubeApi(parsed)) {
                        captureHeaders(options.headers);
                    }
                } catch (_) {}

                return W.Reflect.construct(target, args, newTarget);
            }
        });
    }

    registerMenus();
    installPlayerResponseInterceptor();
    installJsonInterceptor();
    installXhrHooks();
    installRequestHook();

    log('Initialized', {
        proxyFallback: cfg.proxyFallback,
        accountProxy: cfg.accountProxy,
        videoProxy: cfg.videoProxy
    });
})();
