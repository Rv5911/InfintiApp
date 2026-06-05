/* LiveAvPlayer.js - Optimized for Live TV on Tizen 5.5 */
/* Follows the AvPlayer.js pattern but tailored for Live Page integration */

function LiveAvPlayer(
    streamId = "",
    srcUrl = "",
    poster = "/assets/placeholder.png",
    height = "100%",
    channelName = "",
) {
    if (!srcUrl) return `<div class="avplay-live-error">No URL provided</div>`;

    var avplay = null;
    var isLoading = true;
    var errorActive = false;
    var controlsHideTimeout = null;
    var areControlsVisible = false;

    // Subtitle & Audio Track States
    var audioTracks = [];
    var subtitleTracks = [];
    var selectedAudioTrackIndex = -1;
    var selectedSubtitleTrackIndex = -2; // -2 = default, -1 = Off
    var isSelectionPending = false;

    // Navigation & Focus (Internal handling for Fullscreen)
    var focusedControl = "play-pause";
    var isSidebarOpen = false;
    var sidebarType = "";
    var sidebarFocusIndex = 0;
    var i18nFallbacks = {
        aspectRatio: "Aspect Ratio",
        audio: "Audio",
        audioTracks: "Audio Tracks",
        cannotSwitchTrackWhilePlayerIs: "Cannot switch track while player is",
        noAudioFound: "No audio found",
        noSubtitlesFound: "No subtitles found",
        noTrackFoundForThisSelection: "No track found for this selection",
        off: "Off",
        subtitles: "Subtitles",
        trackSwitchFailed: "Track switch failed",
    };

    function t(key) {
        if (
            window.i18n &&
            typeof window.i18n.t === "function"
        ) {
            return window.i18n.t(key);
        }
        return i18nFallbacks[key] || key;
    }

    // Helpers to get array position from stored AVPlay index (Mirroring AvPlayer.js)
    function getAudioArrayPos() {
        if (selectedAudioTrackIndex === -1 && audioTracks.length > 0) return 0;
        for (var i = 0; i < audioTracks.length; i++) {
            if (parseInt(audioTracks[i].index) === selectedAudioTrackIndex) return i;
        }
        return 0;
    }

    function getSubtitleArrayPos(tracks) {
        var list = tracks || subtitleTracks;
        if (selectedSubtitleTrackIndex === -2 || selectedSubtitleTrackIndex === -1)
            return -1;
        
        // 1. Match directly
        for (var i = 0; i < list.length; i++) {
            if (parseInt(list[i].index) === selectedSubtitleTrackIndex)
                return i;
        }

        // 2. Resolve deduplication masking
        var selectedTrackName = null;
        for (var j = 0; j < subtitleTracks.length; j++) {
            if (parseInt(subtitleTracks[j].index) === selectedSubtitleTrackIndex) {
                selectedTrackName = getTrackDisplayName(subtitleTracks[j]);
                break;
            }
        }
        
        if (selectedTrackName) {
            for (var k = 0; k < list.length; k++) {
                if (getTrackDisplayName(list[k]) === selectedTrackName) {
                    return k;
                }
            }
        }
        
        return -1;
    }

    function getDeduplicatedTracks(tracks) {
        var lastSeen = {};
        for (var i = 0; i < tracks.length; i++) {
            var name = getTrackDisplayName(tracks[i]);
            lastSeen[name] = tracks[i]; // Overwrite with later duplicates
        }
        var result = [];
        var added = {};
        for (var j = 0; j < tracks.length; j++) {
            var n = getTrackDisplayName(tracks[j]);
            if (!added[n]) {
                added[n] = true;
                result.push(lastSeen[n]); // Push the last seen track for this name
            }
        }
        return result;
    }

    function getRelativeTrackIndexByType(trackType, globalTrackIndex) {
        var list = trackType === "AUDIO" ? audioTracks : subtitleTracks;
        for (var i = 0; i < list.length; i++) {
            var track = list[i];
            var normalizedType = track.type === "SUBTITLE" ? "TEXT" : track.type;
            if (
                normalizedType === trackType &&
                parseInt(track.index) === globalTrackIndex
            ) {
                return i;
            }
        }
        return -1;
    }

    function syncSelectedTrackFromPlayer(sidebarType) {
        if (!avplay || isSelectionPending) return;

        try {
            var currentStreamInfo = avplay.getCurrentStreamInfo() || [];
            var nativeIdx = -1;

            for (var i = 0; i < currentStreamInfo.length; i++) {
                var s = currentStreamInfo[i];
                if (sidebarType === "audio" && s.type === "AUDIO") {
                    nativeIdx = parseInt(s.index, 10);
                    break;
                }
                if (
                    sidebarType === "subtitle" &&
                    (s.type === "TEXT" || s.type === "SUBTITLE")
                ) {
                    nativeIdx = parseInt(s.index, 10);
                    break;
                }
            }

            if (sidebarType === "audio" && nativeIdx !== -1) {
                selectedAudioTrackIndex = nativeIdx;
            }

            if (sidebarType === "subtitle") {
                if (nativeIdx !== -1) {
                    selectedSubtitleTrackIndex = nativeIdx;
                } else if (selectedSubtitleTrackIndex === -2) {
                    selectedSubtitleTrackIndex = -1;
                }
            }
        } catch (e) {
            console.warn("[LiveAvPlayer] syncSelectedTrackFromPlayer failed", e);
        }
    }

    function getCurrentAudioStreamIndex() {
        if (!avplay) return -1;

        try {
            var currentStreamInfo = avplay.getCurrentStreamInfo() || [];
            for (var i = 0; i < currentStreamInfo.length; i++) {
                if (currentStreamInfo[i].type === "AUDIO") {
                    return parseInt(currentStreamInfo[i].index, 10);
                }
            }
        } catch (e) {}

        return -1;
    }

    function applyAudioTrackSelection(track, trackArrayPos) {
        if (!avplay || !track) return false;

        var audioType = track.type === "AUDIO" ? "AUDIO" : track.type;
        var expectedGlobalIndex = parseInt(track.index, 10);
        var relativeIndex = getRelativeTrackIndexByType("AUDIO", expectedGlobalIndex);
        var attempts = [];

        function addAttempt(value) {
            if (value === null || typeof value === "undefined") return;
            var parsed = parseInt(value, 10);
            if (isNaN(parsed) || parsed < 0) return;
            for (var i = 0; i < attempts.length; i++) {
                if (attempts[i] === parsed) return;
            }
            attempts.push(parsed);
        }

        addAttempt(expectedGlobalIndex);
        addAttempt(relativeIndex);
        addAttempt(trackArrayPos);

        var attemptPos = 0;

        function tryNextAttempt() {
            if (attemptPos >= attempts.length) {
                selectedAudioTrackIndex = -1;
                return false;
            }

            var apiIndex = attempts[attemptPos++];
            try {
                if (typeof avplay.setSelectTrack === "function") {
                    avplay.setSelectTrack(audioType, apiIndex);
                } else if (typeof avplay.selectTrack === "function") {
                    avplay.selectTrack(audioType, apiIndex);
                } else {
                    return tryNextAttempt();
                }
            } catch (e) {
                return tryNextAttempt();
            }

            selectedAudioTrackIndex = expectedGlobalIndex;
            setTimeout(function() {
                var activeIndex = getCurrentAudioStreamIndex();
                if (activeIndex === expectedGlobalIndex) {
                    selectedAudioTrackIndex = activeIndex;
                } else {
                    tryNextAttempt();
                }
            }, 150);

            return true;
        }

        return tryNextAttempt();
    }

    var languageCodeMap = {
        eng: "English",
        en: "English",
        spa: "Spanish",
        es: "Spanish",
        fre: "French",
        fra: "French",
        fr: "French",
        ger: "German",
        der: "German",
        deu: "German",
        de: "German",
        ita: "Italian",
        it: "Italian",
        por: "Portuguese",
        pt: "Portuguese",
        rus: "Russian",
        ru: "Russian",
        jpn: "Japanese",
        ja: "Japanese",
        kor: "Korean",
        ko: "Korean",
        chi: "Chinese",
        zho: "Chinese",
        zh: "Chinese",
        hin: "Hindi",
        hi: "Hindi",
        tam: "Tamil",
        ta: "Tamil",
        tel: "Telugu",
        te: "Telugu",
        kan: "Kannada",
        kn: "Kannada",
        mal: "Malayalam",
        ml: "Malayalam",
        ben: "Bengali",
        bn: "Bengali",
        pan: "Punjabi",
        pa: "Punjabi",
        ara: "Arabic",
        ar: "Arabic",
        dut: "Dutch",
        nl: "Dutch",
        pol: "Polish",
        pl: "Polish",
        tur: "Turkish",
        tr: "Turkish",
        vie: "Vietnamese",
        vi: "Vietnamese",
        tha: "Thai",
        th: "Thai",
        ind: "Indonesian",
        id: "Indonesian",
        ukr: "Ukrainian",
        uk: "Ukrainian",
        heb: "Hebrew",
        he: "Hebrew",
        gre: "Greek",
        ell: "Greek",
        el: "Greek",
        swe: "Swedish",
        sv: "Swedish",
        nor: "Norwegian",
        no: "Norwegian",
        dan: "Danish",
        da: "Danish",
        fin: "Finnish",
        fi: "Finnish",
        cze: "Czech",
        cs: "Czech",
        hun: "Hungarian",
        hu: "Hungarian",
        rum: "Romanian",
        ro: "Romanian",
    };

    function makeParentsTransparent(el) {
        var current = el;
        while (current) {
            current.style.backgroundColor = "transparent";
            current.style.backgroundImage = "none";
            if (current === document.documentElement) break;
            current = current.parentElement;
        }
        document.documentElement.style.backgroundColor = "transparent";
        document.body.style.backgroundColor = "transparent";
    }

    var arIndex = 0; // 0: 16:9, 1: 4:3, 2: 2.35:1
    var lastDisplayMethod = null;
    function syncDisplayRect() {
        if (!avplay) return;
        try {
            var isFs = isPlayerFullscreen();
            if (isFs) {
                if (lastDisplayMethod !== "PLAYER_DISPLAY_MODE_LETTER_BOX") {
                    avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
                    lastDisplayMethod = "PLAYER_DISPLAY_MODE_LETTER_BOX";
                }
                
                if (arIndex === 0) avplay.setDisplayRect(0, 0, 1920, 1080);
                else if (arIndex === 1) avplay.setDisplayRect(240, 0, 1440, 1080);
                else if (arIndex === 2) avplay.setDisplayRect(0, 131, 1920, 817);
            } else {
                var videoSurface = document.getElementById("avplay-live-raw");
                if (!videoSurface) return;

                var rect = videoSurface.getBoundingClientRect();
                
                // If dimensions are not valid, retry after layout stabilization
                if (rect.width <= 0 || rect.height <= 0) {
                    setTimeout(syncDisplayRect, 100);
                    return;
                }

                if (lastDisplayMethod !== "PLAYER_DISPLAY_MODE_LETTER_BOX") {
                    avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
                    lastDisplayMethod = "PLAYER_DISPLAY_MODE_LETTER_BOX";
                }

                avplay.setDisplayRect(
                    Math.round(rect.left),
                    Math.round(rect.top),
                    Math.round(rect.width),
                    Math.round(rect.height)
                );
            }
        } catch (e) {
            console.error("[LiveAvPlayer] syncDisplayRect failed", e);
        }
    }

    function fetchTrackInfo() {
        try {
            if (!avplay) return;

            var state = avplay.getState();
            if (state === "NONE" || state === "IDLE" || state === "PREPARING") {
                setTimeout(fetchTrackInfo, 1000);
                return;
            }

            var tracks = [];
            try {
                tracks = avplay.getTotalTrackInfo() || [];
            } catch (err) {
                console.warn(
                    "[LiveAvPlayer] getTotalTrackInfo not ready yet. Retrying...",
                    err,
                );
                setTimeout(fetchTrackInfo, 2000);
                return;
            }

            // console.log("[LiveAvPlayer] Total tracks found:", tracks.length);
            audioTracks = [];
            subtitleTracks = [];
            for (var i = 0; i < tracks.length; i++) {
                var t = tracks[i];
                // console.log(
                //     "[LiveAvPlayer] Track " +
                //     i +
                //     ": type=" +
                //     t.type +
                //     ", index=" +
                //     t.index +
                //     ", extra=" +
                //     (t.extra_info || ""),
                // );
                if (t.type === "AUDIO") {
                    if (getTrackDisplayName(t)) audioTracks.push(t);
                }
                if (t.type === "TEXT" || t.type === "SUBTITLE") {
                    if (getTrackDisplayName(t)) subtitleTracks.push(t);
                }
            }

            // console.log(
            //     "[LiveAvPlayer] After fetch - audio tracks:",
            //     audioTracks.length,
            //     "subtitle tracks:",
            //     subtitleTracks.length,
            // );

            // If tracks are still not found, retry logic like AvPlayer.js
            if (
                (audioTracks.length === 0 || subtitleTracks.length === 0) &&
                (state === "PLAYING" || state === "READY")
            ) {
                setTimeout(fetchTrackInfo, 3000);
            }
        } catch (e) {
            console.error("[LiveAvPlayer] fetchTrackInfo failed", e);
            setTimeout(fetchTrackInfo, 3000);
        }
    }

    function getTrackDisplayName(track) {
        if (!track) return "";

        function resolveName(code) {
            if (!code) return "";
            var codeStr = String(code).trim();
            var lowerCode = codeStr.toLowerCase();
            if (lowerCode === "esa") return "Spanish";

            if (typeof Intl !== "undefined" && Intl.DisplayNames) {
                try {
                    var displayNames = new Intl.DisplayNames(["en"], {
                        type: "language",
                    });
                    var resolved = displayNames.of(lowerCode);
                    if (resolved && resolved.toLowerCase() !== lowerCode) {
                        return resolved.charAt(0).toUpperCase() + resolved.slice(1);
                    }
                } catch (e) {}
            }

            if (
                typeof languageCodeMap !== "undefined" &&
                languageCodeMap[lowerCode]
            ) {
                return languageCodeMap[lowerCode];
            }
            return codeStr.length <= 4 ? codeStr.toUpperCase() : codeStr;
        }

        var label = "";

        // 0. Try track_lang from extra_info (Tizen format)
        if (track.extra_info) {
            try {
                var extraInfo =
                    typeof track.extra_info === "string" ?
                    JSON.parse(track.extra_info) :
                    track.extra_info;
                if (extraInfo.track_lang && extraInfo.track_lang.trim().length > 0) {
                    return resolveName(extraInfo.track_lang);
                }
            } catch (e) {}
        }

        // 1. Try extra_info general keys
        if (track.extra_info) {
            try {
                var info =
                    typeof track.extra_info === "string" ?
                    JSON.parse(track.extra_info) :
                    track.extra_info;
                label =
                    info.language ||
                    info.lang ||
                    info.name ||
                    info.label ||
                    info.title ||
                    info.track_name ||
                    "";
            } catch (e) {
                if (
                    typeof track.extra_info === "string" &&
                    track.extra_info.trim().length > 0 &&
                    track.extra_info.indexOf("{") === -1
                ) {
                    label = track.extra_info.trim();
                }
            }
        }

        // 2. Metadata fallbacks (but NO hardcoded numbering or index)
        if (!label && track.name) label = track.name;
        if (!label && track.language) label = track.language;
        if (!label && track.lang) label = track.lang;

        // 3. Resolve the collected label
        if (label) {
            var resolvedLabel = resolveName(label);
            if (resolvedLabel) return resolvedLabel;
        }

        // [MODIFY] Provide a fallback mechanism so unlabelled tracks are not dropped
        return label || ("Track " + ((track.index || 0) + 1));
    }

    function initPlayer() {
        try {
            if (typeof tizen === "undefined") return;
            avplay = webapis.avplay;
            // console.log("[LiveAvPlayer] Opening stream:", srcUrl);
            avplay.open(srcUrl);

            // [NEW] - Apply 15-second buffer size to survive network/bitrate drops
            try {
                avplay.setBufferingParam("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", 15);
                avplay.setBufferingParam("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", 15);
            } catch (err) {
                console.warn("Failed to set AVPlay buffering params", err);
            }

            var container = document.getElementById("avplay-live-raw");
            if (container) makeParentsTransparent(container);

            avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
            syncDisplayRect();
            setTimeout(syncDisplayRect, 500);

            var listener = {
                onbufferingstart: function() {
                    var l = document.getElementById("av-live-loader");
                    if (l) l.classList.remove("hidden");
                    applyControlsVisibility();
                },
                onbufferingcomplete: function() {
                    var l = document.getElementById("av-live-loader");
                    if (l) l.classList.add("hidden");
                    isLoading = false;
                    syncFullscreenUI();
                },
                oncurrentplaytime: function(ms) {
                    updateSeekProgress(ms);
                },
                onerror: function(err) {
                    console.error("[LiveAvPlayer] AVPlay Error:", err);
                    showError("Playback Error: " + err);
                },
                onsubtitlechange: function(duration, text) {
                    var sd = document.getElementById("av-live-sub-display");
                    if (sd && selectedSubtitleTrackIndex !== -1 && !isSelectionPending) {
                        var subText = (text || "").toString().trim();
                        if (subText.length > 0) {
                            sd.innerHTML = subText;
                            sd.style.display = "block";
                            sd.style.visibility = "visible";
                            sd.style.opacity = "1";
                            if (sd._timer) clearTimeout(sd._timer);
                            sd._timer = setTimeout(
                                function() {
                                    sd.innerHTML = "";
                                    sd.style.display = "none";
                                },
                                duration > 0 && duration < 30000 ? duration : 10000,
                            );
                        } else {
                            if (sd._timer) clearTimeout(sd._timer);
                            sd.innerHTML = "";
                            sd.style.display = "none";
                        }
                    }
                },
            };

            avplay.setListener(listener);
            avplay.prepareAsync(function() {
                try {
                    avplay.setSilentSubtitle(false);
                    avplay.play();
                    isLoading = false;
                    var l = document.getElementById("av-live-loader");
                    if (l) l.classList.add("hidden");
                    // Track fetching deferred until user opens the sidebar via Enter key
                    showControls();
                    syncFullscreenUI();
                } catch (e) {
                    console.error("Post-prepare failed", e);
                }
            });
        } catch (e) {
            console.error("[LiveAvPlayer] Init Error:", e);
            showError("Player Init Error");
        }
    }

    function retryPlayback() {
        errorActive = false;
        isLoading = true;

        var errPnl = document.querySelector(".av-live-error-pnl");
        if (errPnl) errPnl.classList.add("hidden");

        var topInfo = document.querySelector(".av-live-top-info-row");
        if (topInfo) topInfo.classList.remove("hidden");

        var loader = document.getElementById("av-live-loader");
        if (loader) loader.classList.remove("hidden");
        applyControlsVisibility();

        if (avplay) {
            try {
                avplay.stop();
                avplay.close();
            } catch (e) {}
        }
        initPlayer();
    }

    function showError(m) {
        errorActive = true;

        var topInfo = document.querySelector(".av-live-top-info-row");
        if (topInfo) topInfo.classList.add("hidden");
        var loader = document.getElementById("av-live-loader");
        if (loader) loader.classList.add("hidden");
        var b = document.getElementById("av-live-bottom-bar");
        if (b) b.classList.add("hidden");
        var c = document.getElementById("live-play-pause-btn");
        if (c) c.classList.add("hidden");
        var f = document.getElementById("lp-fullscreen-btn");
        if (f) f.classList.add("hidden");

        var pnl = document.querySelector(".av-live-error-pnl");
        if (pnl) {
            pnl.classList.remove("hidden");
            pnl.innerHTML =
                '<div class="av-live-error-content">' +
                '<i class="fa-solid fa-triangle-exclamation"></i>' +
                "<p>Something went wrong, try again</p>" +
                '<div id="av-live-retry-btn">Retry</div>' +
                "</div>";
        }
    }

    function updateSeekProgress(ms) {
        var progress = document.getElementById("av-live-progress-bar");
        var currEl = document.getElementById("av-live-curr-time");
        if (progress && avplay) {
            var dur = avplay.getDuration();
            if (dur > 0) {
                progress.style.width = (ms / dur) * 100 + "%";
                if (currEl) currEl.innerText = formatMs(ms);
            }
        }
    }

    function formatMs(ms) {
        var s = Math.floor(ms / 1000);
        var m = Math.floor(s / 60);
        var h = Math.floor(m / 60);
        s %= 60;
        m %= 60;
        return (
            (h > 0 ? h + ":" : "") +
            (m < 10 && h > 0 ? "0" + m : m) +
            ":" +
            (s < 10 ? "0" + s : s)
        );
    }

    function togglePlayPause() {
        if (!avplay || errorActive) return;
        var s = avplay.getState();
        var icon = document.querySelector("#live-play-pause-btn i");
        if (s === "PLAYING") {
            avplay.pause();
            if (icon) icon.className = "fa-solid fa-play";
        } else {
            avplay.play();
            if (icon) icon.className = "fa-solid fa-pause";
        }
        showControls();
    }

    function toggleFullscreenMode() {
        if (typeof window.toggleFullscreen === "function") {
            window.toggleFullscreen();
        } else {
            var evt = document.createEvent("Event");
            evt.initEvent("lp-avplay-fullscreen-toggle", true, true);
            document.dispatchEvent(evt);
        }
    }

    function isPlayerFullscreen() {
        var container = document.getElementById("lp-player-container");
        return container && container.classList.contains("lp-avplay-fullscreen");
    }

    function getNonFullscreenFocusedControl() {
        var focusedEl = document.querySelector(
            ".av-live-nav-btn.lp-control-focused",
        );
        if (!focusedEl)
            focusedEl = document.querySelector(".av-live-nav-btn.focused");
        return focusedEl ? focusedEl.getAttribute("data-id") : null;
    }

    function applyControlsVisibility() {
        var isFs = isPlayerFullscreen();
        var b = document.getElementById("av-live-bottom-bar");
        var c = document.getElementById("live-play-pause-btn");
        var f = document.getElementById("lp-fullscreen-btn");
        var top = document.querySelector(".av-live-top-info-row");

        // Determine external focus for non-fullscreen from LivePage.js classes
        var cFocusedExt =
            c &&
            (c.classList.contains("lp-control-focused") ||
                c.classList.contains("focused") ||
                c.classList.contains("pp-focused"));
        var fFocusedExt =
            f &&
            (f.classList.contains("lp-control-focused") ||
                f.classList.contains("focused") ||
                f.classList.contains("fs-focused"));

        // Match internal or external focus logic
        var isPpFocused = isFs ? focusedControl === "play-pause" : cFocusedExt;
        var isFsFocused = isFs ?
            focusedControl === "fullscreen-toggle" :
            fFocusedExt;
        var isBrowsingLiveItems =
            !isFs &&
            !!document.querySelector(
                ".lp-channel-card.lp-focused, .lp-epg-item.lp-focused, #lp-epg-fav-btn.lp-focused"
            );
        var shouldShowInlineControls =
            isPpFocused || isFsFocused || isBrowsingLiveItems;

        if (areControlsVisible) {
            // SHOW ALL SYNCHRONOUSLY (Except strict icons)
            if (b) {
                if (isFs) b.classList.remove("hidden");
                else b.classList.add("hidden");
            }
            if (top) top.classList.remove("hidden");
        } else {
            // Auto-hide the secondary controls completely
            if (b) b.classList.add("hidden");
            if (top) top.classList.add("hidden");
        }

        var loader = document.getElementById("av-live-loader");
        var isLoaderVisible = loader && !loader.classList.contains("hidden");
        if (isLoading || isLoaderVisible) {
            if (c) c.classList.add("hidden");
            if (f) f.classList.add("hidden");
            var errPnl = document.querySelector(".av-live-error-pnl");
            if (errPnl && !errPnl.classList.contains("hidden")) return;
            return;
        }

        var playerState = "NONE";
        try {
            if (avplay) playerState = avplay.getState();
        } catch (e) {}
        var isPaused = playerState === "PAUSED";

        // Play/Pause icon: Show both when either is focused in non-fullscreen, show when controls visible in fullscreen
        if (c) {
            if (!isFs) {
                // Non-fullscreen: Show both if either is focused, ALWAYS show if paused
                if (shouldShowInlineControls || isPaused)
                    c.classList.remove("hidden");
                else c.classList.add("hidden");
            } else {
                // Fullscreen: Show when controls are visible, ALWAYS show if paused
                if (areControlsVisible || isPaused) c.classList.remove("hidden");
                else c.classList.add("hidden");
            }
        }

        // Fullscreen icon: Show only on non-fullscreen
        if (f) {
            if (!isFs) {
                if (shouldShowInlineControls) f.classList.remove("hidden");
                else f.classList.add("hidden");
            } else {
                f.classList.add("hidden");
            }
        }
    }

    function handleKey(e) {
        var isFs = isPlayerFullscreen();
        var container = document.getElementById("lp-player-container");
        if (container && !container.classList.contains("lp-focused")) return;

        if (errorActive) {
            if (e.keyCode === 13) {
                retryPlayback();
                e.preventDefault();
                e.stopImmediatePropagation();
            }
            return;
        }

        if (isLoading) return;

        // In non-fullscreen, let LivePage.js handle all navigation, but still refresh UI visibility
        if (!isFs) {
            setTimeout(applyControlsVisibility, 20);
            return;
        }

        if (isSidebarOpen) {
            handleSidebarKeys(e);
            return;
        }

        var bottom = document.getElementById("av-live-bottom-bar");
        if (isFs && bottom && bottom.classList.contains("hidden")) {
            showControls();
        }

        switch (e.keyCode) {
            case 37: // Left
                moveFocus("left", isFs);
                e.preventDefault();
                break;
            case 39: // Right
                moveFocus("right", isFs);
                e.preventDefault();
                break;
            case 38: // Up
                moveFocus("up", isFs);
                e.preventDefault();
                break;
            case 40: // Down
                moveFocus("down", isFs);
                e.preventDefault();
                break;
            case 13: // Enter
                handleEnterAction();
                e.preventDefault();
                e.stopImmediatePropagation();
                break;
            case 10009: // Back
            case 27: // Esc
                if (isFs) {
                    toggleFullscreenMode();
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
                break;
        }
        showControls();
    }

    function moveFocus(dir, isFs) {
        if (!isFs) {
            // Limited focus in non-fullscreen
            if (dir === "left") focusedControl = "play-pause";
            else if (dir === "right") focusedControl = "fullscreen-toggle";
            else if (dir === "up") focusedControl = "play-pause";
            else if (dir === "down") focusedControl = "play-pause";
        } else {
            if (dir === "down") {
                if (
                    focusedControl === "play-pause" ||
                    focusedControl === "fullscreen-toggle"
                )
                    focusedControl = "ar";
            } else if (dir === "up") {
                if (
                    focusedControl === "ar" ||
                    focusedControl === "fullscreen-toggle"
                )
                    focusedControl = "play-pause";
            } else if (dir === "left") {
                if (focusedControl === "fullscreen-toggle")
                    focusedControl = "play-pause";
            } else if (dir === "right") {
                if (focusedControl === "play-pause")
                    focusedControl = "fullscreen-toggle";
            }
        }
        updateFocusUI();
    }

    function handleEnterAction() {
        showControls();
        if (focusedControl === "play-pause") togglePlayPause();
        else if (focusedControl === "fullscreen-toggle") toggleFullscreenMode();
        else if (focusedControl === "ar") cycleAspectRatio();
    }

    function cycleAspectRatio() {
        if (!avplay || isLoading) return;
        arIndex = (arIndex + 1) % 3;
        var labels = ["16:9", "4:3", "2.35:1"];
        syncDisplayRect();
        if (window.Toaster)
            window.Toaster.showToast("info", t("aspectRatio") + ": " + labels[arIndex]);
    }

    function openSidebar(type) {
        if (!avplay) return;
        fetchTrackInfo();
        setTimeout(function() {
            sidebarType = type;
            var tracks = sidebarType === "audio" ? audioTracks : subtitleTracks;
            if (tracks.length === 0) {
                if (window.Toaster) {
                    var msg =
                        sidebarType === "audio"
                            ? t("noAudioFound")
                            : t("noSubtitlesFound");
                    window.Toaster.showToast("error", msg);
                }
                return;
            }

            syncSelectedTrackFromPlayer(sidebarType);

            isSidebarOpen = true;
            if (sidebarType === "audio") {
                if (selectedAudioTrackIndex === -1 && audioTracks.length > 0) {
                    selectedAudioTrackIndex = parseInt(audioTracks[0].index);
                }
                sidebarFocusIndex = getAudioArrayPos();
            } else {
                var deduped = getDeduplicatedTracks(subtitleTracks);
                var pos = getSubtitleArrayPos(deduped);
                sidebarFocusIndex = pos === -1 ? 0 : pos + 1;
            }
            // Hide controls when sidebar opens to prevent navigation jumping
            var b = document.getElementById("av-live-bottom-bar");
            var c = document.getElementById("live-play-pause-btn");
            var f = document.getElementById("lp-fullscreen-btn");
            if (b) b.classList.add("hidden");
            if (c) c.classList.add("hidden");
            if (f) f.classList.add("hidden");
            renderSidebar();
        }, 150);
    }

    function renderSidebar() {
        var s = document.getElementById("av-live-sidebar-panel");
        if (!s) return;
        if (!isSidebarOpen) {
            s.classList.remove("open");
            s.innerHTML = "";
            return;
        }
        s.classList.remove("open");
        s.innerHTML = "";
        s.classList.add("open");

        var rawTracks = sidebarType === "audio" ? audioTracks : subtitleTracks;
        var tracks = sidebarType === "subtitle" ? getDeduplicatedTracks(rawTracks) : rawTracks;
        var html =
            '<div class="av-live-sidebar-title">' +
            (sidebarType === "audio"
              ? t("audioTracks")
              : t("subtitles")) +
            "</div>";
        html += '<div class="av-live-sidebar-list">';

        if (sidebarType === "subtitle") {
            html +=
                '<div class="av-live-sidebar-item' +
                (sidebarFocusIndex === 0 ? " focused" : "") +
                (selectedSubtitleTrackIndex === -1 ? " active" : "") +
                '">' +
                t("off") +
                "</div>";
        }

        for (var i = 0; i < tracks.length; i++) {
            var displayIdx = sidebarType === "subtitle" ? i + 1 : i;
            var isActive =
                sidebarType === "audio" ?
                getAudioArrayPos() === i :
                getSubtitleArrayPos(tracks) === i;
            html +=
                '<div class="av-live-sidebar-item' +
                (sidebarFocusIndex === displayIdx ? " focused" : "") +
                (isActive ? " active" : "") +
                '">' +
                getTrackDisplayName(tracks[i]) +
                "</div>";
        }
        html += "</div>";
        s.innerHTML = html;

        var focused = s.querySelector(".av-live-sidebar-item.focused");
        if (focused)
            focused.scrollIntoView({
                block: "nearest",
            });
    }

    function selectTrackFromSidebar() {
        var rawTracks = sidebarType === "audio" ? audioTracks : subtitleTracks;
        var tracks = sidebarType === "subtitle" ? getDeduplicatedTracks(rawTracks) : rawTracks;
        var trackArrayPos =
            sidebarType === "subtitle" ? sidebarFocusIndex - 1 : sidebarFocusIndex;

        if (sidebarType === "subtitle" && sidebarFocusIndex === 0) {
            selectedSubtitleTrackIndex = -1;
            isSelectionPending = false;
            var sd = document.getElementById("av-live-sub-display");
            if (sd) {
                sd.innerHTML = "";
                sd.style.display = "none";
            }
            setTimeout(function() {
                try {
                    if (avplay) avplay.setSilentSubtitle(true);
                } catch (e) {}
            }, 50);
        } else {
            var track = tracks[trackArrayPos];
            if (!track) {
                if (window.Toaster) {
                    window.Toaster.showToast(
                        "error",
                        t("noTrackFoundForThisSelection"),
                    );
                }
                return;
            }
            var avplayTrackIndex = parseInt(track.index);
            var tType = track.type === "SUBTITLE" ? "TEXT" : track.type;

            if (sidebarType === "audio") selectedAudioTrackIndex = avplayTrackIndex;
            else {
                selectedSubtitleTrackIndex = avplayTrackIndex;
                isSelectionPending = true;
                try {
                    if (avplay) avplay.setSilentSubtitle(true);
                } catch (e) {}
            }

            setTimeout(function() {
                try {
                    var playerState = avplay ? avplay.getState() : "NONE";
                    if (playerState === "PLAYING" || playerState === "PAUSED") {
                        if (sidebarType === "subtitle") {
                            var primaryType = tType;
                            var alternateType = primaryType === "TEXT" ? "SUBTITLE" : "TEXT";
                            var doSelect = function(type, idx) {
                                if (typeof avplay.setSelectTrack === "function") {
                                    avplay.setSelectTrack(type, idx);
                                } else if (typeof avplay.selectTrack === "function") {
                                    avplay.selectTrack(type, idx);
                                }
                            };
                            var subtitleRelativeIndex = getRelativeTrackIndexByType(
                                primaryType,
                                avplayTrackIndex,
                            );
                            var mixedRelativeIndex = -1;
                            var si;
                            for (si = 0; si < subtitleTracks.length; si++) {
                                if (parseInt(subtitleTracks[si].index) === avplayTrackIndex) {
                                    mixedRelativeIndex = si;
                                    break;
                                }
                            }

                            var subtitleAttempts = [
                                [primaryType, avplayTrackIndex],
                                [alternateType, avplayTrackIndex],
                                [primaryType, subtitleRelativeIndex],
                                [alternateType, subtitleRelativeIndex],
                                [primaryType, mixedRelativeIndex],
                                [alternateType, mixedRelativeIndex],
                                [primaryType, trackArrayPos],
                                [alternateType, trackArrayPos],
                            ];
                            var success = false;
                            for (var ai = 0; ai < subtitleAttempts.length; ai++) {
                                var subtitleAttempt = subtitleAttempts[ai];
                                if (subtitleAttempt[1] < 0) continue;
                                try {
                                    doSelect(subtitleAttempt[0], subtitleAttempt[1]);
                                    success = true;
                                    break;
                                } catch (selectErr) {}
                            }

                            if (success) {
                                try {
                                    if (avplay) avplay.setSilentSubtitle(false);
                                } catch (e) {}
                                isSelectionPending = false;
                            } else {
                                selectedSubtitleTrackIndex = -1;
                                isSelectionPending = false;
                            }
                        } else {
                            applyAudioTrackSelection(track, trackArrayPos);
                        }

                        setTimeout(fetchTrackInfo, 600);
                    } else {
                        if (window.Toaster) {
                            window.Toaster.showToast(
                                "error",
                                t("cannotSwitchTrackWhilePlayerIs") + " " + playerState,
                            );
                        }
                    }
                } catch (e) {
                    console.error("[LiveAvPlayer] setSelectTrack failed", e);
                    if (window.Toaster)
                        window.Toaster.showToast("error", t("trackSwitchFailed"));
                }
            }, 120);
        }
    }

    function handleSidebarKeys(e) {
        var tracks = sidebarType === "audio" ? audioTracks : subtitleTracks;
        var max = sidebarType === "subtitle" ? tracks.length : tracks.length - 1;
        if (e.keyCode === 38)
            sidebarFocusIndex = Math.max(0, sidebarFocusIndex - 1);
        if (e.keyCode === 40)
            sidebarFocusIndex = Math.min(max, sidebarFocusIndex + 1);
        if (e.keyCode === 13) {
            selectTrackFromSidebar();
            isSidebarOpen = false;
            // Show controls again when sidebar closes
            showControls();
        }
        if (e.keyCode === 10009 || e.keyCode === 27 || e.keyCode === 461 || e.keyCode === 8) {
            isSidebarOpen = false;
            // Show controls again when sidebar closes
            showControls();
        }
        renderSidebar();
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    function showControls() {
        if (errorActive) return;
        if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
        areControlsVisible = true;
        applyControlsVisibility();

        controlsHideTimeout = setTimeout(function() {
            var playerState = avplay ? avplay.getState() : "NONE";
            // Do not auto-hide controls if a sidebar is open or if player is explicitly paused
            if (!isSidebarOpen && playerState !== "PAUSED") {
                areControlsVisible = false;
                applyControlsVisibility();
            }
        }, 5000); // 5 seconds of inactivity
    }

    function updateFocusUI() {
        var isFs = isPlayerFullscreen();
        var items = document.querySelectorAll(".av-live-nav-btn");
        items.forEach(function(el) {
            // DO NOT remove lp-control-focused; allow LivePage.js to manage it
            el.classList.remove(
                "focused",
                "pp-focused",
                "fs-focused",
                "ar-focused",
                "aud-focused",
                "sub-focused",
            );
            if (isFs && el.getAttribute("data-id") === focusedControl) {
                el.classList.add("focused");
                var id = el.getAttribute("data-id");
                if (id === "play-pause") el.classList.add("pp-focused");
                else if (id === "fullscreen-toggle") el.classList.add("fs-focused");
                else if (id === "ar") el.classList.add("ar-focused");
                else if (id === "audio") el.classList.add("aud-focused");
                else if (id === "subtitle") el.classList.add("sub-focused");
            }
        });
    }

    function syncFullscreenUI() {
        if (errorActive) return;
        var isFs = isPlayerFullscreen();

        // Optimized sync call
        syncDisplayRect();
        
        // Secondary sync to catch finish of CSS transitions
        setTimeout(syncDisplayRect, 300);

        var fsIcon = document.querySelector("#lp-fullscreen-btn i");
        if (fsIcon)
            fsIcon.className = isFs ? "fa-solid fa-compress" : "fa-solid fa-expand";

        if (
            !isFs &&
            focusedControl === "ar"
        ) {
            focusedControl = "play-pause";
        }
        updateFocusUI();
        if (isFs) {
            showControls();
        } else {
            applyControlsVisibility();
        }
    }

    document.addEventListener("lp-avplay-fullscreen-toggle", syncFullscreenUI);
    document.addEventListener("keydown", handleKey);

    window.livePlayer = {
        dispose: function() {
            document.removeEventListener("keydown", handleKey);
            document.removeEventListener(
                "lp-avplay-fullscreen-toggle",
                syncFullscreenUI,
            );
            if (avplay) {
                try {
                    avplay.stop();
                    avplay.close();
                } catch (e) {}
            }
            window.livePlayer = null;
        },
        src: function(urlData) {
            if (!avplay) return;
            var newUrl = typeof urlData === "object" ? urlData.src : urlData;
            try {
                isLoading = true;
                errorActive = false;
                audioTracks = [];
                subtitleTracks = [];
                selectedAudioTrackIndex = -1;
                selectedSubtitleTrackIndex = -2;

                var l = document.getElementById("av-live-loader");
                if (l) l.classList.remove("hidden");
                var errPnl = document.querySelector(".av-live-error-pnl");
                if (errPnl) errPnl.classList.add("hidden");
                applyControlsVisibility();

                avplay.stop();
                avplay.close();
                srcUrl = newUrl;
                // console.log("[LiveAvPlayer] Re-opening stream:", srcUrl);
                avplay.open(srcUrl);
            } catch (e) {
                console.error("[LiveAvPlayer] Appending fast-swap error: ", e);
            }
        },
        load: function() {
            // No-op for AVPlay, handled in prepareAsync
        },
        play: function() {
            if (!avplay) return;
            try {
                avplay.prepareAsync(
                    function() {
                        avplay.play();
                        isLoading = false;
                        var l = document.getElementById("av-live-loader");
                        if (l) l.classList.add("hidden");
                        showControls();
                    },
                    function(err) {
                        console.error("[LiveAvPlayer] Fast-swap prepareAsync error:", err);
                        isLoading = false;
                        errorActive = true;
                        var l = document.getElementById("av-live-loader");
                        if (l) l.classList.add("hidden");
                        var errPnl = document.querySelector(".av-live-error-pnl");
                        if (errPnl) errPnl.classList.remove("hidden");
                        var errTxt = document.getElementById("av-live-err-text");
                        if (errTxt) errTxt.textContent = "Playback Error";
                        showControls();
                    },
                );
            } catch (e) {
                console.error("[LiveAvPlayer] Appending fast-swap play error: ", e);
            }
        },
        togglePlayPause: togglePlayPause,
        cycleAspectRatio: cycleAspectRatio,
        retry: retryPlayback,
        syncFocus: updateFocusUI,
        refreshControlsVisibility: applyControlsVisibility,
        resize: syncDisplayRect,
        showControls: showControls,
        getState: function() {
            try {
                return avplay ? avplay.getState() : "NONE";
            } catch (e) {
                return "NONE";
            }
        },
        isPlaying: function() {
            try {
                return avplay ? avplay.getState() === "PLAYING" : false;
            } catch (e) {
                return false;
            }
        },
        isError: function() {
            return errorActive;
        },
        isLoading: function() {
            return isLoading;
        },
    };

    setTimeout(initPlayer, 100);

    return (
        '<div class="av-live-root-container">' +
        '<div id="av-live-loader" class="av-live-buf-loader"><div class="spinner"></div></div>' +
        '<div class="av-live-error-pnl hidden"><i class="fa-solid fa-triangle-exclamation"></i><p id="av-live-err-text"></p></div>' +
        '<div class="av-live-overlay-pnl">' +
        '<div class="av-live-top-info-row">' +
        '<span class="av-live-badge-red">LIVE</span>' +
        '<span class="av-live-stream-name">' +
        channelName +
        "</span>" +
        "</div>" +
        '<div id="live-play-pause-btn" class="av-live-pp-btn av-live-nav-btn hidden" data-id="play-pause" onclick="if(window.livePlayer && window.livePlayer.togglePlayPause) window.livePlayer.togglePlayPause()"><i class="fa-solid fa-pause"></i></div>' +
        '<div id="lp-fullscreen-btn" class="av-live-fs-btn av-live-nav-btn hidden" data-id="fullscreen-toggle" onclick="if(window.toggleFullscreen) window.toggleFullscreen()"><i class="fa-solid fa-expand"></i></div>' +
        '<div id="av-live-bottom-bar" class="av-live-bottom-ctrls hidden">' +
        '<div class="av-live-seek-row">' +
        '<span id="av-live-curr-time" class="av-live-t">0:00</span>' +
        '<div class="av-live-seek-bg"><div id="av-live-progress-bar" class="av-live-seek-fill"></div></div>' +
        '<span class="av-live-t">LIVE</span>' +
        "</div>" +
        '<div class="av-live-btns-row">' +
        '<div id="lp-tizen-aspect-ratio-btn" class="av-live-opt av-live-nav-btn" data-id="ar" onclick="if(window.livePlayer && window.livePlayer.cycleAspectRatio) window.livePlayer.cycleAspectRatio()"><i class="fa-solid fa-rectangle-list"></i> ' +
        t("aspectRatio") +
        '</div>' +
        "</div>" +
        "</div>" +
        '<div id="av-live-sub-display" class="av-live-subtitles"></div>' +
        "</div>" +
        '<div id="av-live-sidebar-panel" class="av-live-side-menu"></div>' +
        '<object id="avplay-live-raw" type="application/avplayer" style="width:100%; height:100%; display:block; background:transparent"></object>' +
        "</div>"
    );
}
