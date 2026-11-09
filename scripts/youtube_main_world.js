/**
 * Nabla Ad Shield — Layer 3A: YouTube Main-World Root Ad Blocker
 * Runs in MAIN world at document_start on *.youtube.com.
 *
 * Implements the proven 2025/2026 uBlock Origin (quick-fixes) & AdGuard (specific.txt)
 * root-level YouTube adblocking pipeline:
 *  1. Outbound /youtubei/v1/player request parameter signing (eAFgAQ / 8AUB / CHANNEL / pyv)
 *     so YouTube's server serves clean ad-free streams without triggering UNPLAYABLE.
 *  2. Inbound streaming generator (.next), jspbResponseCtor, Fetch, and XHR payload pruning
 *     (strips adPlacements, adSlots, playerAds before the player ever sees them).
 *  3. Node.prototype.appendChild proxy to prevent YouTube's about:blank iframe fetch bypass.
 *  4. Promise.prototype.then proxy to disarm onAbnormalityDetected anti-adblock checks.
 *  5. 17000ms native-code setTimeout delay defuser (nano-stb / adjust-setTimeout).
 *  6. Automatic ytd-watch-flexy[player-unavailable] attribute removal & loadVideoById recovery.
 *  7. Server-Side Ad Pod (ssap) instant timestamp jump & native movie_player.skipAd() fallback.
 */

(function initYouTubeMainWorld() {
  'use strict';

  function isShieldDisabled() {
    try {
      const rootData = document.documentElement?.dataset;
      if (rootData && (rootData.nablaDisabled === 'true' || rootData.nablaYoutubeDisabled === 'true')) {
        return true;
      }
      return sessionStorage.getItem('__nabla_off') === '1';
    } catch (e) {
      return false;
    }
  }

  if (isShieldDisabled()) return;

  // 0. Clean stale anti-adblock flags and repair muted state left by previous extension versions
  try {
    sessionStorage.removeItem('yt-player-ad-block');
    sessionStorage.removeItem('yt-remote-session-app');
  } catch (e) {}
  function clearPersistentMute() {
    try {
      const volStr = localStorage.getItem('yt-player-volume');
      if (volStr && volStr.includes('"muted":true')) {
        localStorage.setItem('yt-player-volume', volStr.replace('"muted":true', '"muted":false'));
      }
    } catch (e) {}
    try {
      const sessVol = sessionStorage.getItem('yt-player-volume');
      if (sessVol && sessVol.includes('"muted":true')) {
        sessionStorage.setItem('yt-player-volume', sessVol.replace('"muted":true', '"muted":false'));
      }
    } catch (e) {}
  }
  clearPersistentMute();
  document.addEventListener('yt-navigate-start', clearPersistentMute, { passive: true });

  let lastLogTime = 0;
  function emitMainLog(message, details = {}) {
    const now = performance.now();
    if (now - lastLogTime < 1000) return;
    lastLogTime = now;
    try {
      window.dispatchEvent(
        new CustomEvent('nabla-yt-main-log', {
          detail: { message, details }
        })
      );
    } catch (e) {}
  }

  // 1. Defuse YouTube's 17-second artificial anti-adblock delay timer (uBO nano-stb / AdGuard adjust-setTimeout)
  try {
    const setTimeoutHandler = {
      apply(target, thisArg, args) {
        const fn = args[0];
        const delay = args[1];
        if (
          typeof fn === 'function' &&
          (delay === 17000 || (delay >= 13000 && delay <= 20000)) &&
          Function.prototype.toString.call(fn).includes('[native code]')
        ) {
          args[1] = Math.max(1, Math.floor(delay * 0.001));
        }
        return Reflect.apply(target, thisArg, args);
      }
    };
    window.setTimeout = new Proxy(window.setTimeout, setTimeoutHandler);
  } catch (e) {}

  // 2. Prevent YouTube from bypassing window.fetch / window.Request via hidden about:blank iframes (AdGuard line 383 / uBO line 50)
  try {
    const appendChildHandler = {
      apply(target, thisArg, args) {
        const res = Reflect.apply(target, thisArg, args);
        try {
          if (res instanceof HTMLIFrameElement && res.src === 'about:blank' && res.contentWindow) {
            res.contentWindow.fetch = window.fetch;
            res.contentWindow.Request = window.Request;
          }
        } catch (e) {}
        return res;
      }
    };
    Node.prototype.appendChild = new Proxy(Node.prototype.appendChild, appendChildHandler);
  } catch (e) {}

  // 3. Disarm onAbnormalityDetected + Hook streaming .next() & jspbResponseCtor (AdGuard lines 378, 396, 397, 400)
  try {
    let initialDataCloned = false;

    const nextChunkProxyHandler = {
      apply(target, thisArg, args) {
        const chunk = args[0];
        if (typeof chunk?.value === 'string' && (chunk.value.includes('playerResponse') || chunk.value.includes('adPlacements') || chunk.value.includes('adSlots') || chunk.value.includes('muteOnStart'))) {
          try {
            let str = chunk.value;
            if (str.includes('"muteOnStart":true')) {
              str = str.replace(/"muteOnStart":\s*true/g, '"muteOnStart":false');
              if (str.includes('"youThereRenderer":')) {
                str = str.replace('"youThereRenderer":', '"no_youThereRenderer":');
              }
            }
            if (/"(adPlacements|adSlots|playerAds)":/.test(str)) {
              str = str.replace(/"(adPlacements|adSlots|playerAds)":/g, '"no_ads":');
              emitMainLog('Blocked YouTube ad payload in streaming response', { source: 'stream-next' });
            }
            chunk.value = str;
            args[0] = chunk;
          } catch (e) {}
        }
        return Reflect.apply(target, thisArg, args);
      }
    };

    const jspbProxyHandler = {
      apply(target, thisArg, args) {
        const res = Reflect.apply(target, thisArg, args);
        if (res?.responseContext) {
          try {
            if (res.adPlacements || res.adSlots || res.playerAds) {
              delete res.adPlacements;
              delete res.adSlots;
              delete res.playerAds;
              emitMainLog('Blocked YouTube ad payload in JSPB constructor', { source: 'jspbResponseCtor' });
            }
            if (res.playerConfig?.audioConfig?.muteOnStart) {
              delete res.playerConfig.audioConfig.muteOnStart;
              if (res.messages?.[0]?.youThereRenderer) {
                delete res.messages[0].youThereRenderer;
              }
            }
            if (res.audioConfig?.muteOnStart) {
              delete res.audioConfig.muteOnStart;
            }
          } catch (e) {}
        }
        return res;
      }
    };

    const promiseThenHandler = {
      apply(target, thisArg, args) {
        try {
          if (!initialDataCloned && window.ytInitialData) {
            window.ytInitialData = JSON.parse(JSON.stringify(window.ytInitialData));
            initialDataCloned = true;
          }
        } catch (e) {}

        const fn = args[0];
        if (typeof fn === 'function') {
          try {
            const fnStr = Function.prototype.toString.call(fn);
            if (fnStr.includes('onAbnormalityDetected')) {
              args[0] = function () {};
            } else if (fnStr.includes('.next(')) {
              args[0] = new Proxy(fn, nextChunkProxyHandler);
            } else if (fnStr.includes('jspbResponseCtor')) {
              args[0] = new Proxy(fn, jspbProxyHandler);
            }
          } catch (e) {}
        }
        return Reflect.apply(target, thisArg, args);
      }
    };

    window.Promise.prototype.then = new Proxy(window.Promise.prototype.then, promiseThenHandler);
  } catch (e) {}

  // 4. Intercept Response.prototype.text & Response.prototype.json to strip adPlacements / adSlots / playerAds
  function stripAdKeysFromString(str) {
    if (typeof str !== 'string') return str;
    let modified = str;
    if (
      modified.includes('"adPlacements"') ||
      modified.includes('"adSlots"') ||
      modified.includes('"playerAds"')
    ) {
      emitMainLog('Blocked YouTube ad payload in network response', { source: 'fetch-text' });
      modified = modified.replace(/"(adPlacements|adSlots|playerAds)"/g, '"no_ads"');
    }
    if (modified.includes('"muteOnStart":true') || modified.includes('"muteOnStart": true')) {
      modified = modified.replace(/"muteOnStart":\s*true/g, '"muteOnStart":false');
    }
    return modified;
  }

  function pruneAdObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      let pruned = false;
      if (!obj.streamingData?.serverAbrStreamingUrl) {
        if ('adPlacements' in obj) { delete obj.adPlacements; pruned = true; }
        if ('adSlots' in obj) { delete obj.adSlots; pruned = true; }
        if ('playerAds' in obj) { delete obj.playerAds; pruned = true; }
      }
      if (obj.playerConfig?.audioConfig?.muteOnStart) {
        delete obj.playerConfig.audioConfig.muteOnStart;
      }
      if (obj.audioConfig?.muteOnStart) {
        delete obj.audioConfig.muteOnStart;
      }
      if (obj.playerResponse && typeof obj.playerResponse === 'object') {
        pruneAdObject(obj.playerResponse);
      }
      if (obj.auxiliaryUi?.messageRenderers?.bkaEnforcementMessageViewModel) {
        delete obj.auxiliaryUi.messageRenderers.bkaEnforcementMessageViewModel;
        pruned = true;
      }
      if (obj.auxiliaryUi?.messageRenderers?.enforcementMessageViewModel) {
        delete obj.auxiliaryUi.messageRenderers.enforcementMessageViewModel;
        pruned = true;
      }
      if (pruned) {
        emitMainLog('Pruned YouTube ad object before player init', { source: 'object-prune' });
      }
    } catch (e) {}
    return obj;
  }

  try {
    if (typeof window.Response !== 'undefined') {
      if (Response.prototype.text) {
        Response.prototype.text = new Proxy(Response.prototype.text, {
          apply(target, thisArg, args) {
            return Reflect.apply(target, thisArg, args).then((text) => stripAdKeysFromString(text));
          }
        });
      }
      if (Response.prototype.json) {
        Response.prototype.json = new Proxy(Response.prototype.json, {
          apply(target, thisArg, args) {
            return Reflect.apply(target, thisArg, args).then((data) => pruneAdObject(data));
          }
        });
      }
    }
  } catch (e) {}

  // 5. Outbound /youtubei/v1/player Request Signing & Automatic UNPLAYABLE Recovery (AdGuard lines 390 & 391)
  try {
    const STRATEGIES = ['param_first', 'param_second', 'pyv', 'client_screen', 'ad_type'];
    const S_PYV = 'pyv';
    const S_PARAM1 = 'param_first';
    const S_PARAM2 = 'param_second';
    const S_CLIENT = 'client_screen';
    const S_ADTYPE = 'ad_type';
    const S_NONE = 'none';
    const P_EAFG = 'eAFgAQ';
    const P_8AUB = '8AUB';
    const P_YAHI = 'YAHI';
    const SCREEN_CHANNEL = 'CHANNEL';

    let currentStrategy = STRATEGIES[0];
    let currentVideoId = null;
    let forcedChannelScreen = false;
    const recoveredVideos = new Set();

    const isShortsOrTv = () => location.href.includes('/shorts/') || location.href.includes('youtube.com/tv');
    const isEmbed = () => location.pathname.startsWith('/embed/');
    const origVisDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');

    const forceVisibleState = () => {
      try {
        Object.defineProperty(document, 'visibilityState', {
          get: () => 'visible',
          configurable: true
        });
      } catch (e) {}
    };

    const restoreVisibleState = () => {
      try {
        if (origVisDesc) Object.defineProperty(document, 'visibilityState', origVisDesc);
      } catch (e) {}
    };

    const setStrategy = (s) => {
      currentStrategy = s;
    };

    const cleanAppInstallData = (reqObj) => {
      if (reqObj.playbackContext || reqObj.playerRequest) {
        delete reqObj.context?.client?.configInfo?.appInstallData;
      }
    };

    const applyChannelScreen = (reqObj) => {
      if (reqObj.context.client.clientScreen !== SCREEN_CHANNEL) {
        forcedChannelScreen = true;
        reqObj.context.client.clientScreen = SCREEN_CHANNEL;
      }
    };

    const makeRetryCounter = () => {
      let lastVid = null;
      let lastStrat = null;
      let count = 0;
      return (strat, vid) => {
        try {
          if (!strat || !vid) return false;
          if (lastVid === vid && lastStrat === strat) {
            count++;
          } else {
            lastVid = vid;
            lastStrat = strat;
            count = 1;
          }
          if (count >= 2) {
            count = 0;
            return true;
          }
          return false;
        } catch (e) {
          return false;
        }
      };
    };

    let shouldAdvanceStrategy = makeRetryCounter();

    const trackVideoChange = (reqObj) => {
      const vid = reqObj?.videoId || reqObj?.playerRequest?.videoId;
      if (vid) {
        if (currentVideoId && currentVideoId !== vid) {
          setStrategy(STRATEGIES[0]);
          forcedChannelScreen = false;
          shouldAdvanceStrategy = makeRetryCounter();
          recoveredVideos.clear();
        }
        currentVideoId = vid;
      }
    };

    const patchOutboundRequest = (reqObj, pbCtx, strat) => {
      try {
        if (!reqObj?.context?.client || !pbCtx || typeof pbCtx !== 'object' || !strat) return;
        if ('vis' in pbCtx || 'lactMilliseconds' in pbCtx) return;

        const playerStatus = document.getElementById('movie_player')?.getPlayerResponse?.()?.playabilityStatus?.status;
        if (playerStatus === 'CONTENT_CHECK_REQUIRED' || new URLSearchParams(location.search).get('rco') === '1') {
          reqObj.racyCheckOk = true;
          if (reqObj.playerRequest) reqObj.playerRequest.racyCheckOk = true;
        }

        trackVideoChange(reqObj);
        strat = currentStrategy;

        const targets = [reqObj, reqObj.playerRequest, pbCtx];
        if (reqObj.context.client.clientScreen === SCREEN_CHANNEL && targets.some((x) => x?.params === P_8AUB)) {
          forcedChannelScreen = true;
        }
        for (const t of targets) {
          if (t?.params === P_EAFG || t?.params === P_8AUB) {
            delete t.params;
          }
        }
        const adPb = pbCtx.adPlaybackContext;
        if (adPb?.pyv === true) delete adPb.pyv;
        if (adPb?.adType === 'AD_TYPE_INSTREAM') delete adPb.adType;
        if (adPb && Object.keys(adPb).length === 0) delete pbCtx.adPlaybackContext;

        const canPatchScreen = reqObj.context.client.clientScreen !== SCREEN_CHANNEL || forcedChannelScreen;
        if (playerStatus === 'LOGIN_REQUIRED' || (playerStatus === 'CONTENT_CHECK_REQUIRED' && !reqObj?.racyCheckOk)) {
          strat = S_NONE;
        }

        if (strat === S_PARAM1 && canPatchScreen && !reqObj.params?.startsWith(P_YAHI)) {
          reqObj.params = P_EAFG;
          pbCtx.params = P_EAFG;
          if (reqObj.playerRequest && reqObj.playerRequest.params !== P_EAFG) reqObj.playerRequest.params = P_EAFG;
          if (reqObj.playbackContext && reqObj.playbackContext.params !== P_EAFG) reqObj.playbackContext.params = P_EAFG;
          if (pbCtx.contentPlaybackContext && typeof pbCtx.contentPlaybackContext === 'object') {
            pbCtx.contentPlaybackContext.lactMilliseconds = String(Date.now());
          }
          forceVisibleState();
          cleanAppInstallData(reqObj);
          return;
        }

        if (strat === S_PARAM2 && canPatchScreen && !reqObj.params?.startsWith(P_YAHI)) {
          pbCtx.params = P_8AUB;
          if (reqObj.params !== P_8AUB) reqObj.params = P_8AUB;
          if (reqObj.playerRequest && reqObj.playerRequest.params !== P_8AUB) reqObj.playerRequest.params = P_8AUB;
          if (reqObj.playbackContext && reqObj.playbackContext.params !== P_8AUB) reqObj.playbackContext.params = P_8AUB;
          if (!reqObj.playlistId) applyChannelScreen(reqObj);
          if (pbCtx.contentPlaybackContext && typeof pbCtx.contentPlaybackContext === 'object') {
            pbCtx.contentPlaybackContext.lactMilliseconds = String(Date.now());
          }
          forceVisibleState();
          cleanAppInstallData(reqObj);
          return;
        }

        if (strat === S_PYV && canPatchScreen && !pbCtx.params?.startsWith(P_EAFG) && !pbCtx.params?.startsWith(P_8AUB)) {
          pbCtx.adPlaybackContext = { ...pbCtx.adPlaybackContext, pyv: true };
          if (pbCtx.contentPlaybackContext && typeof pbCtx.contentPlaybackContext === 'object') {
            pbCtx.contentPlaybackContext.lactMilliseconds = String(Date.now());
          }
          forceVisibleState();
          cleanAppInstallData(reqObj);
          return;
        }

        if (strat === S_CLIENT && reqObj.context?.client?.clientName === 'WEB') {
          applyChannelScreen(reqObj);
          if (pbCtx.contentPlaybackContext && typeof pbCtx.contentPlaybackContext === 'object') {
            pbCtx.contentPlaybackContext.lactMilliseconds = String(Date.now());
          }
          forceVisibleState();
          cleanAppInstallData(reqObj);
          return;
        }

        if (strat === S_ADTYPE) {
          pbCtx.adPlaybackContext = { ...pbCtx.adPlaybackContext, adType: 'AD_TYPE_INSTREAM' };
          if (pbCtx.contentPlaybackContext && typeof pbCtx.contentPlaybackContext === 'object') {
            pbCtx.contentPlaybackContext.lactMilliseconds = String(Date.now());
          }
          forceVisibleState();
          cleanAppInstallData(reqObj);
          return;
        }

        if (strat === S_NONE) {
          restoreVisibleState();
        }
      } catch (e) {}
    };

    const origStringify = window.JSON.stringify;
    const ERROR_MARKERS = ['playerErrorMessageRenderer', 'UNPLAYABLE'];

    // JSON.parse Proxy (handles Shorts ads, initial ad pruning, and strategy rotation on UNPLAYABLE)
    window.JSON.parse = new Proxy(window.JSON.parse, {
      apply(target, thisArg, args) {
        let parsed = Reflect.apply(target, thisArg, args);
        if (!parsed || typeof parsed !== 'object') return parsed;

        try {
          if (location.pathname.startsWith('/shorts/') && Array.isArray(parsed.entries)) {
            parsed.entries = parsed.entries.filter((r) => !r?.command?.reelWatchEndpoint?.adClientParams?.isAd);
            return parsed;
          }

          pruneAdObject(parsed);

          if (!isShortsOrTv() && currentStrategy !== S_NONE && (parsed.responseContext || parsed.playabilityStatus)) {
            const serialized = origStringify(parsed);
            if (ERROR_MARKERS.some((m) => serialized.includes(m)) && !serialized.includes('CONTENT_CHECK_REQUIRED')) {
              const idx = STRATEGIES.indexOf(currentStrategy);
              setStrategy(idx < 0 ? S_NONE : STRATEGIES[idx + 1] ?? S_NONE);
              return parsed;
            }
            if (parsed.playerConfig?.audioConfig?.muteOnStart) {
              delete parsed.playerConfig.audioConfig.muteOnStart;
              if (parsed.messages?.[0]?.youThereRenderer) {
                delete parsed.messages[0].youThereRenderer;
              }
            }
            if (parsed.audioConfig?.muteOnStart) {
              delete parsed.audioConfig.muteOnStart;
            }
            if (currentStrategy === S_ADTYPE && parsed.playerConfig?.granularVariableSpeedConfig) {
              parsed.playerConfig.granularVariableSpeedConfig.maximumPlaybackRate = 200;
              parsed.playerConfig.granularVariableSpeedConfig.minimumPlaybackRate = 25;
            }
          }
        } catch (e) {}
        return parsed;
      }
    });

    // TextEncoder.prototype.encode Proxy
    if (window.TextEncoder?.prototype?.encode) {
      window.TextEncoder.prototype.encode = new Proxy(window.TextEncoder.prototype.encode, {
        apply(target, thisArg, args) {
          if (isShortsOrTv()) return Reflect.apply(target, thisArg, args);
          try {
            let str = args[0];
            if (typeof str === 'string' && (str.includes('"contentPlaybackContext"') || str.includes('"adSignalsInfo"'))) {
              const obj = JSON.parse(str);
              if (obj?.context?.client) {
                if (obj.playbackContext) patchOutboundRequest(obj, obj.playbackContext, currentStrategy);
                if (obj.playerRequest) patchOutboundRequest(obj, obj.playerRequest.playbackContext, currentStrategy);
                args[0] = origStringify(obj);
              }
            }
          } catch (e) {}
          return Reflect.apply(target, thisArg, args);
        }
      });
    }

    // JSON.stringify Proxy
    window.JSON.stringify = new Proxy(window.JSON.stringify, {
      apply(target, thisArg, args) {
        if (isShortsOrTv()) return Reflect.apply(target, thisArg, args);
        try {
          const obj = args[0];
          if (obj?.context?.client) {
            for (const pb of [obj.playbackContext, obj.playerRequest?.playbackContext]) {
              const adPb = pb?.adPlaybackContext;
              if (pb && (!adPb || adPb.pyv === true || adPb.adType === 'AD_TYPE_INSTREAM')) {
                patchOutboundRequest(obj, pb, currentStrategy);
              }
            }
            args[0] = obj;
          }
        } catch (e) {}
        return Reflect.apply(target, thisArg, args);
      }
    });

    // window.Request Proxy
    if (window.Request) {
      window.Request = new Proxy(window.Request, {
        construct(target, args, newTarget) {
          try {
            const url = args[0];
            let body = args[1]?.body;
            if (typeof url === 'string' && url.includes('youtubei') && !isShortsOrTv() && typeof body === 'string') {
              if (body.includes('"contentPlaybackContext"') || body.includes('"adSignalsInfo"')) {
                const obj = JSON.parse(body);
                if (obj?.context?.client) {
                  if (obj.playbackContext) patchOutboundRequest(obj, obj.playbackContext, currentStrategy);
                  if (obj.playerRequest) patchOutboundRequest(obj, obj.playerRequest.playbackContext, currentStrategy);
                  args[1].body = origStringify(obj);
                }
              }
            }
          } catch (e) {}
          return Reflect.construct(target, args, newTarget);
        }
      });
    }

    // XMLHttpRequest.prototype.send Proxy
    if (window.XMLHttpRequest?.prototype?.send) {
      window.XMLHttpRequest.prototype.send = new Proxy(window.XMLHttpRequest.prototype.send, {
        apply(target, thisArg, args) {
          try {
            const payload = args[0];
            if (payload && !location.href.includes('youtube.com/tv')) {
              const isArr = Array.isArray(payload);
              const str = isArr ? payload[0] : payload;
              if (typeof str === 'string' && (str.includes('"contentPlaybackContext"') || str.includes('"adSignalsInfo"'))) {
                const obj = JSON.parse(str);
                if (obj?.context?.client) {
                  if (obj.playbackContext) patchOutboundRequest(obj, obj.playbackContext, currentStrategy);
                  if (obj.playerRequest) patchOutboundRequest(obj, obj.playerRequest.playbackContext, currentStrategy);
                  const updated = origStringify(obj);
                  if (isArr) args[0][0] = updated;
                  else args[0] = updated;
                }
              }
            }
          } catch (e) {}
          return Reflect.apply(target, thisArg, args);
        }
      });
    }

    // DOM Observer for ytd-watch-flexy[player-unavailable] removal & stream reload recovery (AdGuard line 391)
    const SEL_FLEX_UNAVAILABLE = 'ytd-watch-flexy[player-unavailable]';
    const SEL_YTP_ERROR = '#movie_player > .ytp-error';
    const SEL_ERROR_SCREEN = 'yt-playability-error-supported-renderers#error-screen:has(>*)';
    const SEL_AGE_GATE = 'yt-playability-error-supported-renderers#error-screen a[href^="//support.google.com/youtube/answer/2802245"]';

    const clearInlineDisplayNone = (el) => {
      if (el?.style.getPropertyValue('display') === 'none' && el.style.getPropertyPriority('display') === 'important') {
        el.style.removeProperty('display');
        if (!el.style.length) el.removeAttribute('style');
      }
    };

    const reloadPlayerVideo = (player, { videoId, timeInSeconds }) => {
      if (player && typeof player.loadVideoById === 'function' && videoId) {
        try {
          player.loadVideoById(videoId, timeInSeconds);
          emitMainLog('Recovered YouTube stream with clean playback parameters', { videoId, strategy: currentStrategy });
        } catch (e) {}
      }
    };

    const handleUnavailableRecovery = (player, targetInfo) => {
      if (currentStrategy === S_NONE) {
        const { videoId } = targetInfo;
        if (!videoId || recoveredVideos.has(videoId)) return;
        recoveredVideos.add(videoId);
        reloadPlayerVideo(player, targetInfo);
        return;
      }
      const idx = STRATEGIES.indexOf(currentStrategy);
      const nextStrat = idx < 0 ? S_NONE : STRATEGIES[idx + 1] ?? S_NONE;
      if (shouldAdvanceStrategy(nextStrat, targetInfo.videoId)) {
        setStrategy(nextStrat);
      }
      reloadPlayerVideo(player, targetInfo);
    };

    const checkAndRecoverPlayer = () => {
      const player = document.getElementById('movie_player');
      const vidId =
        new URLSearchParams(location.search).get('v') ||
        (isEmbed() ? location.pathname.split('/')[2] : null) ||
        player?.getVideoData?.()?.video_id;
      if (!vidId) return;

      trackVideoChange({ videoId: vidId });
      const playerResp = player?.getPlayerResponse?.();

      // Always unhide player container if YouTube added [player-unavailable] due to adblock check
      const errScreen = document.querySelector(SEL_ERROR_SCREEN);
      const miniErr = document.querySelector('yt-playability-error-supported-renderers.ytdMiniplayerPlayerContainerPlayabilityError:has(>*)');
      const flexUnavailable = document.querySelector(SEL_FLEX_UNAVAILABLE);
      const ageGate = document.querySelector(SEL_AGE_GATE);

      if (player && !ageGate) {
        const status = playerResp?.playabilityStatus?.status;
        if (status === 'LOGIN_REQUIRED' || status === 'CONTENT_CHECK_REQUIRED') {
          clearInlineDisplayNone(errScreen);
          clearInlineDisplayNone(miniErr);
        } else if (flexUnavailable || miniErr) {
          errScreen?.style.setProperty('display', 'none', 'important');
          miniErr?.style.setProperty('display', 'none', 'important');
          flexUnavailable?.removeAttribute('player-unavailable');
        }
      }

      // Check if stream needs reload via loadVideoById
      const ytpErr = document.querySelector(SEL_YTP_ERROR);
      if (!player || ageGate) return;
      const status = playerResp?.playabilityStatus?.status;
      if (status === 'LOGIN_REQUIRED' || status === 'CONTENT_CHECK_REQUIRED') return;
      const vData = player.getVideoData?.();
      if ((errScreen || flexUnavailable || ytpErr) && vData?.errorCode != null) {
        if ((isEmbed() && !playerResp) || (currentStrategy === S_NONE && recoveredVideos.has(vidId))) return;
        const tParam = new URLSearchParams(location.search).get('t');
        const curVid = vData?.video_id;
        const rawTime = tParam ?? (curVid === vidId ? player?.getCurrentTime?.() : 0);
        handleUnavailableRecovery(player, {
          videoId: vidId,
          timeInSeconds: parseInt(rawTime, 10) || 0
        });
      }
    };

    new MutationObserver(checkAndRecoverPlayer).observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true
    });
  } catch (e) {}

  // 6. Server-Side Ad Insertion (SSAP) Instant Timestamp Jump (AdGuard line 385)
  try {
    let lastHref = document.location.href;
    const ssapSegments = [];
    const ssapIds = [];
    let handledIdsKey = '';
    let activeSsap = false;
    const origPush = Array.prototype.push;

    window.Array.prototype.push = new Proxy(window.Array.prototype.push, {
      apply(target, thisArg, args) {
        try {
          if (
            window.yt?.config_?.EXPERIMENT_FLAGS?.html5_enable_ssap_entity_id &&
            args[0] &&
            args[0] !== window &&
            typeof args[0].start === 'number' &&
            args[0].end &&
            args[0].namespace === 'ssap' &&
            args[0].id
          ) {
            if (!activeSsap && args[0]?.start === 0 && !ssapIds.includes(args[0].id)) {
              ssapSegments.length = 0;
              ssapIds.length = 0;
              activeSsap = true;
              origPush.call(ssapSegments, args[0]);
              origPush.call(ssapIds, args[0].id);
            }
            if (activeSsap && args[0]?.start !== 0 && !ssapIds.includes(args[0].id)) {
              origPush.call(ssapSegments, args[0]);
              origPush.call(ssapIds, args[0].id);
            }
          }
        } catch (e) {}
        return Reflect.apply(target, thisArg, args);
      }
    });

    document.addEventListener('DOMContentLoaded', () => {
      if (!window.yt?.config_?.EXPERIMENT_FLAGS?.html5_enable_ssap_entity_id) return;
      const skipSsapSegment = () => {
        const video = document.querySelector('video');
        if (video && ssapSegments.length) {
          const dur = Math.round(video.duration);
          const lastEnd = Math.round(ssapSegments.at(-1).end / 1000);
          const key = ssapIds.join(',');
          if (
            ((video.loop === false && handledIdsKey !== key) || video.loop === true) &&
            dur &&
            dur === lastEnd
          ) {
            const contentStart = ssapSegments.at(-1).start / 1000;
            if (video.currentTime < contentStart) {
              video.currentTime = contentStart;
              activeSsap = false;
              handledIdsKey = key;
              emitMainLog('Skipped server-side stitched ad segment (SSAP)', { contentStart });
            }
          }
        }
      };
      skipSsapSegment();
      new MutationObserver(() => {
        if (lastHref !== document.location.href) {
          lastHref = document.location.href;
          ssapSegments.length = 0;
          ssapIds.length = 0;
          activeSsap = false;
        }
        skipSsapSegment();
      }).observe(document, { childList: true, subtree: true });
    });
  } catch (e) {}

  // 7. Native Main-World Player Ad Terminators (instant 0ms skipAd if any ad ever enters .ad-showing)
  function terminateAnyActiveAdInMainWorld() {
    try {
      const player = document.getElementById('movie_player');
      if (!player) return;
      if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
        if (typeof player.skipAd === 'function') {
          player.skipAd();
        }
        if (typeof player.finishAd === 'function') {
          player.finishAd();
        }
      }
    } catch (e) {}
  }

  window.addEventListener('nabla-terminate-yt-ad', terminateAnyActiveAdInMainWorld, { passive: true });
})();
