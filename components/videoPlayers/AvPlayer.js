function AvPlayer() {
    var srcUrl =
        window.selectedVideoItemUrl ||
        localStorage.getItem("selectedVideoItemUrl") ||
        "";
    var isYouTube =
        srcUrl.indexOf("youtube.com") !== -1 || srcUrl.indexOf("youtu.be") !== -1;

    var previousCleanup = AvPlayer.cleanup;
    if (previousCleanup) {
        setTimeout(function() {
            try {
                previousCleanup();
            } catch (err) {
                console.warn("Previous cleanup error:", err);
            }
        }, 0);
    }

    var fromValue = localStorage.getItem("from");
    var playingItemDataStr = localStorage.getItem("playingItemData");
    var playingItemData = {};
    if (playingItemDataStr) {
        try {
            playingItemData = JSON.parse(playingItemDataStr);
        } catch (e) {}
    }
    var titleText =
        playingItemData.title || playingItemData.name || "Video Player";

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

    var cp =
        typeof getCurrentPlaylist === "function" ? getCurrentPlaylist() : null;
    var currentPlaylistName = cp ? cp.playlistName : "";
    var isLive = localStorage.getItem("isLive") === "true";
    var backKeysCodes = [10009, 461, 8, 27, 10079, 100079];

    var avplay = null;
    var player = null;
    var controlsHideTimeout = null;
    var overlayTimeout = null;
    var errorActive = false;
    var isLoading = true; // Added loading state

    // Focus states
    var isPlayPauseFocused = true;
    var isSeekBarFocused = false;
    var isAspectRatioFocused = false;

    // Seeking variables
    var accumulatedSeekOffset = 0;
    var pendingSeekTimeout = null;
    var wasPlayingBeforeSeek = false;
    var hasStartedPlayingOnce = false;

    // Resume time variables
    var pendingResumeTimeMs = 0;
    var targetResumeTimeMs = 0;
    var isInitialResumePending = false;
    var resumeTimeApplied = false;
    var resumeSeekRetryTimeout = null;

    // Sidebar states
    var isSidebarOpen = false;
    var sidebarType = ""; // "audio" or "subtitle"
    var sidebarFocusIndex = 0;
    var isErrorRetryFocused = false;
    var sidebarOpenTimeout = null;
    var isDestroyed = false; // Guard flag to prevent ghost toasts after cleanup

    // Track info
    var audioTracks = [];
    var subtitleTracks = [];
    // Store actual AVPlay track.index values, NOT array positions
    var selectedAudioTrackIndex = -1; // -1 = not yet selected (use default)
    var selectedSubtitleTrackIndex = -1; // -1 = OFF (subtitles off by default on first play)
    var isSelectionPending = false; // Flag to prevent sync overwrites

    // Helpers to get array position from stored AVPlay index
    function getAudioArrayPos(tracks) {
        var list = tracks || audioTracks;
        if (selectedAudioTrackIndex === -1 && list.length > 0) return 0; // default first
        for (var i = 0; i < list.length; i++) {
            if (parseInt(list[i].index) === selectedAudioTrackIndex) return i;
        }
        return 0;
    }

    function getSubtitleArrayPos(tracks) {
        var list = tracks || subtitleTracks;
        if (selectedSubtitleTrackIndex === -1) return -1; // OFF
        
        // 1. Direct match by index
        for (var i = 0; i < list.length; i++) {
            if (parseInt(list[i].index) === selectedSubtitleTrackIndex) return i;
        }
        
        // 2. If track index not found directly, it might be hidden by deduplication. 
        // Find the actual track object name from the full subtitleTracks array.
        var selectedTrackName = null;
        for (var j = 0; j < subtitleTracks.length; j++) {
            if (parseInt(subtitleTracks[j].index) === selectedSubtitleTrackIndex) {
                selectedTrackName = getTrackDisplayName(subtitleTracks[j], j);
                break;
            }
        }
        
        // 3. Match by name in the provided list
        if (selectedTrackName) {
            for (var k = 0; k < list.length; k++) {
                if (getTrackDisplayName(list[k], k) === selectedTrackName) {
                    return k;
                }
            }
        }
        
        // If track index not found in available tracks, treat as OFF
        return -1;
    }

    function getSubtitleRelativeTrackIndexByType(trackType, globalTrackIndex) {
        var normalizedType = trackType === "SUBTITLE" ? "TEXT" : trackType;
        var relativeIndex = 0;

        for (var i = 0; i < subtitleTracks.length; i++) {
            var currentType =
                subtitleTracks[i].type === "SUBTITLE" ? "TEXT" : subtitleTracks[i].type;

            if (currentType !== normalizedType) continue;

            if (parseInt(subtitleTracks[i].index) === globalTrackIndex) {
                return relativeIndex;
            }

            relativeIndex++;
        }

        return -1;
    }

    // Formatter
    function formatTime(ms) {
        if (!ms || isNaN(ms)) return "0:00:00";
        var totalSeconds = Math.floor(ms / 1000);
        var hours = Math.floor(totalSeconds / 3600);
        var mins = Math.floor((totalSeconds % 3600) / 60);
        var secs = totalSeconds % 60;

        if (hours > 0) {
            return (
                hours +
                ":" +
                (mins < 10 ? "0" : "") +
                mins +
                ":" +
                (secs < 10 ? "0" : "") +
                secs
            );
        } else {
            return mins + ":" + (secs < 10 ? "0" : "") + secs;
        }
    }

    function isBackNavigationKey(e) {
        var keyCode = e && (e.keyCode || e.which);
        if (backKeysCodes.indexOf(keyCode) !== -1) return true;
        if (typeof isBackKey === "function") {
            return isBackKey(e);
        }
        return false;
    }

    function syncPlayerAdapter() {
        if (!avplay) {
            player = null;
            return;
        }

        player = {
            paused: function() {
                try {
                    return avplay.getState() !== "PLAYING";
                } catch (e) {
                    return true;
                }
            },
            play: function() {
                return avplay.play();
            },
            pause: function() {
                return avplay.pause();
            },
            currentTime: function() {
                return avplay.getCurrentTime();
            },
            duration: function() {
                return avplay.getDuration();
            },
            seekTo: function(ms) {
                return avplay.seekTo(ms);
            },
            getState: function() {
                return avplay.getState();
            },
            dispose: function() {
                try {
                    avplay.stop();
                } catch (e) {}
                try {
                    avplay.close();
                } catch (e) {}
            },
        };
    }

    function clearResumeSeekRetry() {
        if (resumeSeekRetryTimeout) {
            clearTimeout(resumeSeekRetryTimeout);
            resumeSeekRetryTimeout = null;
        }
    }

    function applyResumeTimeToPlayback() {
        if (!pendingResumeTimeMs || resumeTimeApplied || errorActive || !avplay) return false;

        try {
            var duration = avplay.getDuration();
            if (pendingResumeTimeMs > 0 && pendingResumeTimeMs < duration) {
                avplay.seekTo(pendingResumeTimeMs);
                // console.log("[AvPlayer] Resume seek applied:", pendingResumeTimeMs, "ms");
                pendingResumeTimeMs = 0;
                resumeTimeApplied = true;
                clearResumeSeekRetry();
                return true;
            }
        } catch (e) {
            console.warn("[AvPlayer] Resume seek application failed:", e);
        }
        return false;
    }

    function scheduleResumeSeekRetry() {
        if (!pendingResumeTimeMs || resumeTimeApplied || errorActive || !avplay) return;

        clearResumeSeekRetry();
        resumeSeekRetryTimeout = setTimeout(function() {
            if (!applyResumeTimeToPlayback()) {
                var state = "UNKNOWN";
                try { state = avplay.getState(); } catch (e) {}
                // console.log("[AvPlayer] Resume retry - state:", state, "pending:", pendingResumeTimeMs);
                if (state === "PLAYING" || state === "READY" || state === "PAUSED") {
                    scheduleResumeSeekRetry();
                }
            }
        }, 300);
    }

    function getPlaybackProgress() {
        var currentTime = 0;
        var duration = 0;

        try {
            if (avplay) {
                currentTime = Number(avplay.getCurrentTime());
                duration = Number(avplay.getDuration());
            } else if (player) {
                if (typeof player.currentTime === "function") {
                    currentTime = Number(player.currentTime());
                }
                if (typeof player.duration === "function") {
                    duration = Number(player.duration());
                }
            }
        } catch (e) {}

        return {
            currentTime: isNaN(currentTime) ? 0 : currentTime,
            duration: isNaN(duration) ? 0 : duration,
        };
    }

    function showFatalError(message) {
        // Hide all player UI
        var controls = document.getElementById("av-controls-bar");
        var titleBar = document.getElementById("av-title-bar");
        var sidebar = document.getElementById("av-sidebar");
        if (controls) controls.classList.add("hidden");
        if (titleBar) titleBar.classList.add("hidden");
        if (sidebar) sidebar.classList.remove("open");
        isSidebarOpen = false;

        // Hide action overlays
        var overlays = document.querySelectorAll(".av-action-overlay");
        for (var i = 0; i < overlays.length; i++)
            overlays[i].classList.add("hidden");

        // Show error in loader area
        var loader = document.getElementById("avplay-loader");
        if (loader) {
            loader.classList.remove("hidden");
            loader.style.background = "rgba(0,0,0,0.92)";
            loader.innerHTML =
                '<div class="av-error-display">' +
                '<div class="av-error-icon">\u26a0\ufe0f</div>' +
                "<h3></h3>" +
                "<p>" +
                ( "Something went wrong. Please try again") +
                "</p>" +
                '<div id="av-retry-btn" class="av-retry-btn focused">RETRY</div>' +
                '<p style="font-size: 16px; margin-top: 14px; opacity: 0.65;">Press \u2190 BACK to exit</p>' +
                "</div>";
        }
    }

    function retryPlayback() {
        // console.log("RETRYING PLAYBACK...");
        errorActive = false;
        isErrorRetryFocused = false;
        isLoading = true;

        // Reset resume time state
        clearResumeSeekRetry();
        pendingResumeTimeMs = 0;
        targetResumeTimeMs = 0;
        isInitialResumePending = false;
        resumeTimeApplied = false;

        // Reset loader UI
        var loader = document.getElementById("avplay-loader");
        if (loader) {
            loader.classList.remove("hidden");
            loader.style.background = "";
            loader.innerHTML = '<div class="spinner"></div>';
        }

        try {
            if (avplay) {
                avplay.stop();
                avplay.close();
            }
        } catch (e) {}

        initPlayer();
    }

    function showControls() {
        // If error is active, never show controls
        if (errorActive || (isLoading && !errorActive)) return;

        var controls = document.getElementById("av-controls-bar");
        var titleBar = document.getElementById("av-title-bar");
        if (controls) controls.classList.remove("hidden");
        if (titleBar) titleBar.classList.remove("hidden");

        if (controlsHideTimeout) {
            clearTimeout(controlsHideTimeout);
            controlsHideTimeout = null;
        }
    }

    function hideControlsWithDelay(delay) {
        delay = delay || 3000;
        if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
        controlsHideTimeout = setTimeout(function() {
            if (avplay && avplay.getState() === "PLAYING" && !errorActive) {
                var controls = document.getElementById("av-controls-bar");
                var titleBar = document.getElementById("av-title-bar");
                if (controls) controls.classList.add("hidden");
                if (titleBar) titleBar.classList.add("hidden");
                unfocusAll();
            }
        }, delay);
    }

    function showControlsAndDefaultFocus() {
        if (isLoading && !errorActive) return;

        var controls = document.getElementById("av-controls-bar");
        var wasHidden = !controls || controls.classList.contains("hidden");
        showControls();
        if (wasHidden) {
            focusPlayPause();
        }
    }

    function showOverlay(type) {
        if (errorActive) return;
        var playOverlay = document.querySelector(".av-action-overlay.center");
        var forwardOverlay = document.querySelector(".av-action-overlay.right");
        var backwardOverlay = document.querySelector(".av-action-overlay.left");

        if (type === "forward" || type === "backward") {
            if (forwardOverlay) forwardOverlay.classList.add("hidden");
            if (backwardOverlay) backwardOverlay.classList.add("hidden");
            if (playOverlay && !isPlayPauseFocused)
                playOverlay.classList.add("hidden");
        } else {
            if (playOverlay) playOverlay.classList.add("hidden");
            if (forwardOverlay) forwardOverlay.classList.add("hidden");
            if (backwardOverlay) backwardOverlay.classList.add("hidden");
        }

        var target = null;
        var loader = document.getElementById("avplay-loader");
        var isLoaderVisible = loader && !loader.classList.contains("hidden");

        if (type === "play") {
            if (playOverlay) {
                if (isLoaderVisible) {
                    playOverlay.classList.add("hidden");
                    return;
                }
                playOverlay.querySelector(".av-action-icon").innerHTML =
                    '<i class="fa-solid fa-play"></i>';
                target = playOverlay;
            }
        } else if (type === "pause") {
            if (playOverlay) {
                if (isLoaderVisible) {
                    playOverlay.classList.add("hidden");
                    return;
                }
                playOverlay.querySelector(".av-action-icon").innerHTML =
                    '<i class="fa-solid fa-pause"></i>';
                target = playOverlay;
            }
        } else if (type === "forward") {
            if (forwardOverlay) {
                forwardOverlay.querySelector(".av-action-icon").innerHTML =
                    '<i class="fa-solid fa-rotate-right"></i>';
                target = forwardOverlay;
            }
        } else if (type === "backward") {
            if (backwardOverlay) {
                backwardOverlay.querySelector(".av-action-icon").innerHTML =
                    '<i class="fa-solid fa-rotate-left"></i>';
                target = backwardOverlay;
            }
        }

        if (target) {
            target.classList.remove("hidden");
            clearTimeout(overlayTimeout);
            if (
                (type === "forward" ||
                    type === "backward" ||
                    (type === "play" && avplay && avplay.getState() === "PLAYING")) &&
                !target.classList.contains("focused")
            ) {
                overlayTimeout = setTimeout(function() {
                    target.classList.add("hidden");
                }, 1000);
            }
        }
    }

    // Focus functions
    function focusPlayPause() {
        unfocusAll();
        isPlayPauseFocused = true;
        var playOverlay = document.querySelector(".av-action-overlay.center");
        if (playOverlay) {
            playOverlay.classList.remove("hidden");
            playOverlay.classList.add("focused");
            if (avplay) {
                var state = avplay.getState();
                showOverlay(state === "PAUSED" ? "pause" : "play");
            }
        }
        showControls();
    }

    function focusSeekBar() {
        if (isLive) return;
        unfocusAll();
        isSeekBarFocused = true;
        var seekBar = document.getElementById("av-seek-bar");
        if (seekBar) seekBar.classList.add("focused");
        showControls();
    }

    function focusAspectRatio() {
        unfocusAll();
        isAspectRatioFocused = true;
        var btn = document.getElementById("av-ar-btn");
        if (btn) btn.classList.add("focused");
        showControls();
    }

    function unfocusAll() {
        isPlayPauseFocused = false;
        isSeekBarFocused = false;
        isAspectRatioFocused = false;

        var focusedEls = document.querySelectorAll(".focused");
        for (var i = 0; i < focusedEls.length; i++) {
            focusedEls[i].classList.remove("focused");
        }

        // Also remove focus state from the center play/pause overlay if needed
        var playOverlay = document.querySelector(".av-action-overlay.center");
        if (playOverlay) {
            playOverlay.classList.remove("focused");
            if (avplay && avplay.getState() === "PLAYING") {
                playOverlay.classList.add("hidden");
            }
        }
    }

    // Language code mapping for common subtitle/audio languages
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

    function getTrackDisplayName(track, i, skipEmptyCheck) {
        if (!track) return "Unknown";

        var isSubtitle = track.type === "TEXT" || track.type === "SUBTITLE";
        
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
        var trackNum = null;
        var trackLang = null;

        // 0. Try track_num and track_lang from extra_info
        if (track.extra_info) {
            try {
                var extraInfo =
                    typeof track.extra_info === "string" ?
                    JSON.parse(track.extra_info) :
                    track.extra_info;
                if (extraInfo.track_num !== undefined && extraInfo.track_num !== null) {
                    trackNum = String(extraInfo.track_num).trim();
                }
                if (extraInfo.track_lang !== undefined && extraInfo.track_lang !== null) {
                    trackLang = String(extraInfo.track_lang).trim();
                }
            } catch (e) {}
        }

        // For subtitles: prefer track_lang over track_num
        // track_num is just a number like "0", "1", "2" - display as Track 1, Track 2, etc
        if (isSubtitle) {
            if (trackLang && trackLang.length > 0) {
                label = resolveName(trackLang);
            } else if (trackNum && trackNum.length > 0) {
                // Convert track_num "0" -> "Track 1", "1" -> "Track 2", etc (1-based display)
                var trackNumInt = parseInt(trackNum, 10);
                if (!isNaN(trackNumInt)) {
                    label = "Track " + (trackNumInt + 1);
                } else {
                    label = "Track " + trackNum;
                }
            }
            // If both are empty, return null (will be filtered out)
            if (!label && !skipEmptyCheck) {
                return null;
            }
        }

        // 1. Try extra_info (JSON format) for other tracks or fallback
        if (!label && track.extra_info) {
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
                    info.id ||
                    info.track_name ||
                    "";
            } catch (e) {
                // extra_info might be a plain string (language code)
                if (
                    typeof track.extra_info === "string" &&
                    track.extra_info.trim().length > 0 &&
                    track.extra_info.indexOf("{") === -1
                ) {
                    label = track.extra_info.trim();
                }
            }
        }

        // 2. Fallbacks
        if (!label && track.name) label = track.name;
        if (!label && track.language) label = track.language;
        if (!label && track.lang) label = track.lang;

        // 3. Resolve the collected label
        if (label) {
            var resolvedLabel = resolveName(label);
            if (resolvedLabel) return resolvedLabel;
        }

        // [MODIFY] Provide a fallback mechanism so unlabelled tracks are not dropped
        return label || ("Track " + ((track.index || i || 0) + 1));
    }

    function getDeduplicatedTracks(tracks) {
        var lastSeen = {};
        for (var i = 0; i < tracks.length; i++) {
            var name = getTrackDisplayName(tracks[i], i, true);
            if (name === null) continue;
            lastSeen[name] = tracks[i]; // Overwrite with later duplicates
        }
        var result = [];
        var added = {};
        for (var j = 0; j < tracks.length; j++) {
            var name = getTrackDisplayName(tracks[j], j, true);
            if (name === null) continue;
            if (!added[name]) {
                added[name] = true;
                result.push(lastSeen[name]); // Push the last seen track for this name
            }
        }
        return result;
    }

    function renderSidebar() {
        // Route to the correct sidebar element based on type
        var sidebarId =
            sidebarType === "audio" ? "av-audio-sidebar" : "av-subtitle-sidebar";
        var sidebar = document.getElementById(sidebarId);
        if (!sidebar) return;

        // Close the OTHER sidebar in case it's somehow open
        var otherId =
            sidebarType === "audio" ? "av-subtitle-sidebar" : "av-audio-sidebar";
        var otherSidebar = document.getElementById(otherId);
        if (otherSidebar) {
            otherSidebar.classList.remove("open");
            otherSidebar.style.display = "none"; // Also hide completely
            otherSidebar.innerHTML = "";
        }

        sidebar.style.display = "flex"; // Make sure target sidebar is visible
        sidebar.classList.remove("open");
        sidebar.innerHTML = "";

        // Deduplicate subtitle tracks by display name (keeping the LAST duplicate)
        var rawTracks = sidebarType === "audio" ? audioTracks : subtitleTracks;
        var tracks = sidebarType === "subtitle" ? getDeduplicatedTracks(rawTracks) : rawTracks;

        var sidebarHeader = sidebarType === "audio" ? "🎵 Audio" : "💬 Subtitles";
        var html = '<div class="av-sidebar-title">' + sidebarHeader + "</div>";
        html += '<div class="av-sidebar-list" id="av-sidebar-scroll-list">';

        if (sidebarType === "subtitle") {
            var isOffActive = getSubtitleArrayPos(tracks) === -1;
            html +=
                '<div class="av-sidebar-item' +
                (isOffActive ? " active" : "") +
                (sidebarFocusIndex === 0 ? " focused" : "") +
                '" data-index="-1">Off</div>';
        }

        if (tracks.length === 0) {
            // Show a non-interactive loading row — no toast, no hard stop
            html +=
                '<div class="av-sidebar-item" style="opacity:0.5;">No Data Available</div>';
        } else {
            for (var i = 0; i < tracks.length; i++) {
                var track = tracks[i];
                var name = getTrackDisplayName(track, i);
                if (name === null) continue; // Skip tracks with no valid name
                var posInList = sidebarType === "subtitle" ? i + 1 : i;
                var isActive =
                    sidebarType === "audio" ?
                    getAudioArrayPos(tracks) === i :
                    getSubtitleArrayPos(tracks) === i;
                var isFocused = sidebarFocusIndex === posInList;
                html +=
                    '<div class="av-sidebar-item' +
                    (isActive ? " active" : "") +
                    (isFocused ? " focused" : "") +
                    '" data-index="' +
                    i +
                    '">' +
                    name +
                    "</div>";
            }
        }

        html += "</div>";
        sidebar.innerHTML = html;
        sidebar.classList.add("open");

        // Scroll focused item into view after render
        setTimeout(function() {
            var focusedItem = sidebar.querySelector(".av-sidebar-item.focused");
            var scrollList = sidebar.querySelector(".av-sidebar-list");
            if (focusedItem && scrollList) {
                // Ensure parent exists AND item exists, then try robust scrolling
                try {
                    focusedItem.scrollIntoView({
                        block: "nearest",
                        behavior: "instant"
                    });

                    // Extra check: if scrollIntoView failed to move enough (some Tizen browsers)
                    var containerTop = scrollList.scrollTop;
                    var containerBottom = containerTop + scrollList.clientHeight;
                    var itemTop = focusedItem.offsetTop;
                    var itemBottom = itemTop + focusedItem.offsetHeight;

                    if (itemTop < containerTop) {
                        scrollList.scrollTop = itemTop - 10;
                    } else if (itemBottom > containerBottom) {
                        scrollList.scrollTop = itemBottom - scrollList.clientHeight + 10;
                    }
                } catch (e) {
                    // Pre-ES6/Old Tizen fallback
                    focusedItem.scrollIntoView(false);
                }
            }
        }, 50);
    }

    function openAudioSidebar() {
        if (errorActive) return;
        // Guard: prevent opening if already in process of opening another sidebar
        if (sidebarOpenTimeout) return;

        const subtitleSidebar=document.querySelector("#av-subtitle-sidebar");
        if(subtitleSidebar){
            subtitleSidebar.classList.remove("open");
            subtitleSidebar.style.display = "none"; // Also hide completely
            subtitleSidebar.innerHTML = "";
        }
        
        // Fetch tracks first
        fetchTrackInfo();

        // Show error toast immediately if no audio tracks available after fetch
        sidebarOpenTimeout = setTimeout(function() {
            var timeoutRef = sidebarOpenTimeout;
            sidebarOpenTimeout = null;
            if (isDestroyed) return; // Player already exited ��� do NOT show any toast

            // Sync with native player to detect natively active audio track
            if (
                selectedAudioTrackIndex === -1 &&
                typeof avplay !== "undefined" &&
                avplay
            ) {
                try {
                    var currentStreamInfo = avplay.getCurrentStreamInfo();
                    if (currentStreamInfo) {
                        for (var i = 0; i < currentStreamInfo.length; i++) {
                            if (currentStreamInfo[i].type === "AUDIO") {
                                selectedAudioTrackIndex = parseInt(currentStreamInfo[i].index);
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Could not sync native audio track", e);
                }
            }

            if (audioTracks.length === 0) {
                if (typeof Toaster !== "undefined" && Toaster) {
                    Toaster.showToast("error", "No Audio tracks found");
                }
                return;
            }

            isSidebarOpen = true;
            sidebarType = "audio";
            // Default select first audio track if still not selected
            if (selectedAudioTrackIndex === -1 && audioTracks.length > 0) {
                selectedAudioTrackIndex = parseInt(audioTracks[0].index);
            }
            sidebarFocusIndex = getAudioArrayPos(audioTracks);
            renderSidebar();
        }, 100);
    }

    function openSubtitleSidebar() {
        if (errorActive) return;
        // Guard: prevent opening if already in process of opening another sidebar
        if (sidebarOpenTimeout) return;
                const audioSidebar=document.querySelector("#av-audio-sidebar");
        if(audioSidebar){
            audioSidebar.classList.remove("open");
            audioSidebar.style.display = "none"; // Also hide completely
            audioSidebar.innerHTML = "";
        }
        // Fetch tracks first
        fetchTrackInfo();

        // Open sidebar even if tracks are empty — renderSidebar handles the loading state
        sidebarOpenTimeout = setTimeout(function() {
            var timeoutRef = sidebarOpenTimeout;
            sidebarOpenTimeout = null;
            if (isDestroyed) return; 
       
            var dedupedTracks = getDeduplicatedTracks(subtitleTracks);
            if (dedupedTracks.length === 0) {
                if (typeof Toaster !== "undefined" && Toaster) {
                    Toaster.showToast("error", "No Subtitle tracks found");
                }
                return;
            }

            isSidebarOpen = true;
            sidebarType = "subtitle";

            // Focus on currently selected track instead of always focusing "Off"
            var currentPos = getSubtitleArrayPos(dedupedTracks);
            sidebarFocusIndex = currentPos === -1 ? 0 : currentPos + 1;
            renderSidebar();
        }, 100);
    }

    function closeSidebar() {
        isSidebarOpen = false;
        // Close both sidebar panels
        var audioSb = document.getElementById("av-audio-sidebar");
        var subtitleSb = document.getElementById("av-subtitle-sidebar");
        if (audioSb) {
            audioSb.classList.remove("open");
            audioSb.style.display = "none";
        }
        if (subtitleSb) {
            subtitleSb.classList.remove("open");
            subtitleSb.style.display = "none";
        }
        // NOTE: Do NOT touch setSilentSubtitle here.
        // Subtitle rendering state is managed exclusively by selectTrackFromSidebar:
        //   • User picks a track → setSilentSubtitle(false) + setSelectTrack → subtitles ON
        //   • User picks Off     → setSilentSubtitle(true)                  → subtitles OFF
        // Opening/closing the sidebar must never interfere with that state.
        focusAspectRatio();
    }

    function selectTrackFromSidebar() {
        var rawTracks = sidebarType === "audio" ? audioTracks : subtitleTracks;
        var tracks = sidebarType === "subtitle" ? getDeduplicatedTracks(rawTracks) : rawTracks;

        var trackArrayPos =
            sidebarType === "subtitle" ? sidebarFocusIndex - 1 : sidebarFocusIndex;

        if (sidebarType === "subtitle" && sidebarFocusIndex === 0) {
            // ── TURN SUBTITLES OFF ─────────────────────────────────────────────────────
            selectedSubtitleTrackIndex = -1;
            // Toast hidden as requested
            // if (Toaster) Toaster.showToast("info", "Subtitles: OFF");
            // console.log(
            //     "SUBTITLE OFF — calling setSilentSubtitle(true) to hide native subtitles",
            // );

            // Clear the subtitle overlay immediately
            var subtitleDisplay = document.getElementById("av-subtitle-display");
            if (subtitleDisplay) {
                subtitleDisplay.innerHTML = "";
                subtitleDisplay.style.display = "none";
            }

            // setSilentSubtitle(true) suppresses AVPlay native subtitle rendering
            setTimeout(function() {
                try {
                    if (avplay) avplay.setSilentSubtitle(true);
                } catch (e) {
                    console.warn("setSilentSubtitle(true) for OFF failed:", e);
                }
            }, 50);
        } else {
            // ── SELECT A SUBTITLE OR AUDIO TRACK ───────────────────────────────────────
            var track = tracks[trackArrayPos];
            if (!track) {
                console.warn(
                    "selectTrackFromSidebar: no track at pos",
                    trackArrayPos,
                    "| tracks:",
                    tracks,
                );
                if (Toaster)
                    Toaster.showToast("error", "No track found for this selection");
                closeSidebar();
                return;
            }

            var avplayGlobalIndex = parseInt(track.index);
            var reportedType = track.type;
            var name = getTrackDisplayName(track, trackArrayPos);

            // Capture the sidebar type NOW — closeSidebar() may alter it
            var capturedSidebarType = sidebarType;

            // CRITICAL FIX #1 — Set selectedSubtitleTrackIndex IMMEDIATELY (before the async timeout).
            // The onsubtitlechange callback checks this value. If it's still -1/-2 when AVPlay
            // fires the first subtitle event after setSelectTrack, the subtitle is silently dropped.
            if (capturedSidebarType === "subtitle") {
                isSelectionPending = true;
                selectedSubtitleTrackIndex = avplayGlobalIndex;
                try {
                    if (avplay) avplay.setSilentSubtitle(true);
                } catch (e) {}
            } else {
                selectedAudioTrackIndex = avplayGlobalIndex;
            }

            // console.log(
            //     "SELECTING TRACK — capturedSidebarType:",
            //     capturedSidebarType,
            //     "reportedType:",
            //     reportedType,
            //     "globalIndex:",
            //     avplayGlobalIndex,
            //     "name:",
            //     name,
            // );

            // ── AVPLAY API CALL ──────────────────────────────────────────────────────────
            // Use an IIFE to capture all values in their own scope — closeSidebar() runs
            // synchronously after this setTimeout is scheduled, and may change sidebarType.
            (function(cType, rType, gIdx) {
                setTimeout(function() {
                    try {
                        var playerState = avplay ? avplay.getState() : "NONE";
                        // console.log("Player state before setSelectTrack:", playerState);

                        if (playerState !== "PLAYING" && playerState !== "PAUSED") {
                            console.warn(
                                "setSelectTrack SKIPPED — invalid player state:",
                                playerState,
                            );
                            if (Toaster)
                                Toaster.showToast(
                                    "error",
                                    "Cannot switch track — player not ready (" +
                                    playerState +
                                    ")",
                                );
                            if (cType === "subtitle") isSelectionPending = false;
                            return;
                        }

                        if (cType === "subtitle") {
                            // CRITICAL FIX #3 — Tizen AVPlay setSelectTrack("TEXT", n) on many firmware
                            // versions often expects n to be the 0-based position within the
                            // selected text/subtitle type group, not always the global stream index.
                            var primaryType = rType === "SUBTITLE" ? "TEXT" : rType;
                            var alternateType = primaryType === "TEXT" ? "SUBTITLE" : "TEXT";
                            var typedRelativeIndex = getSubtitleRelativeTrackIndexByType(
                                primaryType,
                                gIdx,
                            );
                            var mixedRelativeIndex = 0;
                            for (var si = 0; si < subtitleTracks.length; si++) {
                                if (parseInt(subtitleTracks[si].index) === gIdx) {
                                    mixedRelativeIndex = si;
                                    break;
                                }
                            }
                            // console.log(
                            //     "Subtitle — globalIndex:",
                            //     gIdx,
                            //     "typedRelativeIndex:",
                            //     typedRelativeIndex,
                            //     "mixedRelativeIndex:",
                            //     mixedRelativeIndex,
                            // );

                            var success = false;

                            // 1. Try global index first (Correct for Tizen 5.0+)
                            try {
                                avplay.setSelectTrack(primaryType, gIdx);
                                // console.log(
                                //     "setSelectTrack OK: type=" +
                                //     primaryType +
                                //     " globalIdx=" +
                                //     gIdx,
                                // );
                                success = true;
                            } catch (e1) {
                                console.log(
                                    "setSelectTrack global index failed for " +
                                    primaryType +
                                    " (probing relative fallbacks)...",
                                );

                                // 2. Try type-relative index (Legacy Tizen requirement)
                                try {
                                    if (typedRelativeIndex !== -1) {
                                        avplay.setSelectTrack(primaryType, typedRelativeIndex);
                                        // console.log(
                                        //     "setSelectTrack OK: type=" +
                                        //     primaryType +
                                        //     " typedRelIdx=" +
                                        //     typedRelativeIndex,
                                        // );
                                    } else {
                                        avplay.setSelectTrack(primaryType, mixedRelativeIndex);
                                        console.log(
                                            "setSelectTrack OK: type=" +
                                            primaryType +
                                            " mixedRelIdx=" +
                                            mixedRelativeIndex,
                                        );
                                    }
                                    success = true;
                                } catch (e2) {
                                    console.log(
                                        "setSelectTrack relative index failed for " +
                                        primaryType +
                                        " (probing alternate type)...",
                                    );

                                    // 3. Try alternate type with global index
                                    try {
                                        avplay.setSelectTrack(alternateType, gIdx);
                                        // console.log(
                                        //     "setSelectTrack OK (alt type): " +
                                        //     alternateType +
                                        //     " globalIdx=" +
                                        //     gIdx,
                                        // );
                                        success = true;
                                    } catch (e3) {
                                        // 4. Try alternate type with relative index
                                        try {
                                            var altRelativeIndex =
                                                getSubtitleRelativeTrackIndexByType(
                                                    alternateType,
                                                    gIdx,
                                                );
                                            if (altRelativeIndex !== -1) {
                                                avplay.setSelectTrack(alternateType, altRelativeIndex);
                                                // console.log(
                                                //     "setSelectTrack OK (alt type): " +
                                                //     alternateType +
                                                //     " typedRelIdx=" +
                                                //     altRelativeIndex,
                                                // );
                                            } else {
                                                avplay.setSelectTrack(
                                                    alternateType,
                                                    mixedRelativeIndex,
                                                );
                                                // console.log(
                                                //     "setSelectTrack OK (alt type): " +
                                                //     alternateType +
                                                //     " mixedRelIdx=" +
                                                //     mixedRelativeIndex,
                                                // );
                                            }
                                            success = true;
                                        } catch (e4) {
                                            console.log(
                                                "All setSelectTrack attempts failed for subtitle track",
                                            );
                                        }
                                    }
                                }
                            }

                            if (!success) {
                                // Revert state so onsubtitlechange guard doesn't accept stale events
                                selectedSubtitleTrackIndex = -1;
                                isSelectionPending = false;
                                if (Toaster)
                                    Toaster.showToast(
                                        "error",
                                        "Subtitle track could not be activated",
                                    );
                            } else {
                                // Once successfully hooked, re-enable delivery of events
                                try { if (avplay) avplay.setSilentSubtitle(false); } catch(e) {}
                                isSelectionPending = false;
                            }
                        } else {
                            // Audio track selection — global index is correct for AUDIO type
                            var audioType = rType === "AUDIO" ? "AUDIO" : rType;
                            // console.log("Audio setSelectTrack — type:", audioType, "index:", gIdx, "indexType:", typeof gIdx);
                            try {
                                avplay.setSelectTrack(audioType, parseInt(gIdx, 10));
                                // console.log("Audio setSelectTrack OK — idx:", gIdx);
                            } catch (e) {
                                console.warn("Audio setSelectTrack failed", e);
                                selectedAudioTrackIndex = -1;
                            }
                        }
                    } catch (apiErr) {
                        console.error("setSelectTrack threw exception:", apiErr);
                        if (cType === "subtitle") isSelectionPending = false;
                        if (Toaster)
                            Toaster.showToast(
                                "error",
                                "Track switch failed: " + String(apiErr),
                            );
                    }
                }, 50);
            })(capturedSidebarType, reportedType, avplayGlobalIndex);
        }

        closeSidebar();
    }

    // Seeking logic
    function debouncedSeek(offset) {
        if (isLive || errorActive || isLoading) return;
        showControls();
        if (pendingSeekTimeout) {
            clearTimeout(pendingSeekTimeout);
        }

        accumulatedSeekOffset += offset;
        var isFirstSeekInBatch = pendingSeekTimeout === null;

        if (isFirstSeekInBatch) {
            var state = avplay ? avplay.getState() : "NONE";
            wasPlayingBeforeSeek = state === "PLAYING";
            if (wasPlayingBeforeSeek) {
                try {
                    avplay.pause();
                } catch (e) {}
            }
        }

        var loader = document.getElementById("avplay-loader");
        if (loader && !errorActive) {
            loader.classList.remove("hidden");
            // Hide active play/pause overlays
            var playOverlay = document.querySelector(".av-action-overlay.center");
            if (playOverlay) {
                playOverlay.classList.remove("focused");
                playOverlay.classList.add("hidden");
            }
        }

        if (avplay) {
            try {
                var currentTime = avplay.getCurrentTime();
                var duration = avplay.getDuration();
                var newTime = Math.max(
                    0,
                    Math.min(duration, currentTime + accumulatedSeekOffset * 1000),
                );

                var seekBar = document.getElementById("av-seek-bar");
                var currentTimeEl = document.getElementById("av-current-time");
                if (seekBar) seekBar.value = newTime;
                if (currentTimeEl) currentTimeEl.textContent = formatTime(newTime);

                var percent = (newTime / duration) * 100;
                if (seekBar)
                    seekBar.style.background =
                    "linear-gradient(to right, #3498db 0%, #3498db " +
                    percent +
                    "%, #444 " +
                    percent +
                    "%, #444 100%)";
            } catch (e) {}
        }

        pendingSeekTimeout = setTimeout(function() {
            if (!avplay || errorActive) return;
            try {
                var currentTime = avplay.getCurrentTime();
                var duration = avplay.getDuration();
                var newTime = Math.max(
                    0,
                    Math.min(duration, currentTime + accumulatedSeekOffset * 1000),
                );

                avplay.seekTo(newTime);

                if (accumulatedSeekOffset > 0) showOverlay("forward");
                else if (accumulatedSeekOffset < 0) showOverlay("backward");

                accumulatedSeekOffset = 0;
                pendingSeekTimeout = null;

                if (wasPlayingBeforeSeek) {
                    setTimeout(function() {
                        try {
                            avplay.play();
                        } catch (e) {}
                    }, 500);
                }
            } catch (e) {
                accumulatedSeekOffset = 0;
                pendingSeekTimeout = null;
            }
        }, 500);
    }

    function showAspectOverlay(label) {
        var overlay = document.getElementById("av-aspect-overlay");
        if (overlay) {
            overlay.textContent = label;
            overlay.classList.remove("show");
            // ES5 approach for smoother UI
            setTimeout(function() {
                overlay.classList.add("show");
            }, 0);
            setTimeout(function() {
                overlay.classList.remove("show");
            }, 2000);
        }
    }

    function setAvplayDisplayMode(mode) {
        if (!avplay) return;
        try {
            avplay.setDisplayMethod(mode);
        } catch (e) {
            if (mode !== "PLAYER_DISPLAY_MODE_LETTER_BOX") {
                try {
                    avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
                } catch (fallbackErr) {}
            } else {
                throw e;
            }
        }
    }

    function applyAspectDisplayMode(mode, label) {
        if (!avplay) return;
        try {
            avplay.setDisplayRect(0, 0, 1920, 1080);
            setAvplayDisplayMode(mode);
            setTimeout(function() {
                try {
                    if (avplay) {
                        avplay.setDisplayRect(0, 0, 1920, 1080);
                        setAvplayDisplayMode(mode);
                    }
                } catch (retryErr) {}
            }, 120);
            showAspectOverlay(label);
        } catch (e) {
            console.error(label + " failed", e);
        }
    }

    function setAspectRatioLetterBox() {
        applyAspectDisplayMode("PLAYER_DISPLAY_MODE_LETTER_BOX", "Letter Box");
    }

    function setAspectRatioFullScreen() {
        applyAspectDisplayMode("PLAYER_DISPLAY_MODE_FULL_SCREEN", "Full Screen");
    }

    function setAspectRatioAuto() {
        applyAspectDisplayMode(
            "PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO",
            "Auto Aspect"
        );
    }

    function cycleAspectRatio() {
        if (!avplay || errorActive || isLoading) return;

        window._avAspectRatioIndex = ((window._avAspectRatioIndex || 0) + 1) % 3;

        switch (window._avAspectRatioIndex) {
            case 0:
                setAspectRatioLetterBox();
                break;
            case 1:
                setAspectRatioFullScreen();
                break;
            case 2:
                setAspectRatioAuto();
                break;
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
                console.warn("getTotalTrackInfo not ready yet. Retrying...", err);
                setTimeout(fetchTrackInfo, 2000);
                return;
            }

            // console.log("FETCHED ALL TRACKS:", tracks.length);
            audioTracks = [];
            subtitleTracks = [];
            for (var i = 0; i < tracks.length; i++) {
                // console.log(
                //     "Track " +
                //     i +
                //     ": Type=" +
                //     tracks[i].type +
                //     " Index=" +
                //     tracks[i].index +
                //     " Extra=" +
                //     tracks[i].extra_info,
                // );
                if (tracks[i].type === "AUDIO") audioTracks.push(tracks[i]);
                if (tracks[i].type === "SUBTITLE" || tracks[i].type === "TEXT")
                    subtitleTracks.push(tracks[i]);
            }

            // NOTE: We do NOT sync from getCurrentTrackInfo here — Tizen 5.5 is unreliable.
            // selectedAudioTrackIndex / selectedSubtitleTrackIndex persist across rebuilds.
            // console.log(
            //     "After fetch - audio tracks:",
            //     audioTracks.length,
            //     "subtitle tracks:",
            //     subtitleTracks.length,
            // );
            // console.log(
            //     "Resolved audio array pos:",
            //     getAudioArrayPos(),
            //     "subtitle array pos:",
            //     getSubtitleArrayPos(),
            // );

            // If sidebar is open, trigger a re-render to show newly discovered tracks
            if (isSidebarOpen) {
                renderSidebar();
            }

            // If tracks are still not found, retry
            if (
                (audioTracks.length === 0 || subtitleTracks.length === 0) &&
                (state === "PLAYING" || state === "READY")
            ) {
                setTimeout(fetchTrackInfo, 3000);
            }
        } catch (e) {
            console.error("fetchTrackInfo failed", e);
            setTimeout(fetchTrackInfo, 3000);
        }
    }

    function removeEpisodeFromContinueWatching(completedEpisodeId) {
        try {
            var seriesId = localStorage.getItem("selectedSeriesId");
            var playlists = JSON.parse(localStorage.getItem("playlistsData")) || [];
            var updatedPlaylists = [];
            for (var i = 0; i < playlists.length; i++) {
                var pl = playlists[i];
                if (pl.playlistName === currentPlaylistName) {
                    var updatedCW = [];
                    if (pl.continueWatchingSeries) {
                        for (var j = 0; j < pl.continueWatchingSeries.length; j++) {
                            var item = pl.continueWatchingSeries[j];
                            if (
                                !(
                                    item.itemId === seriesId &&
                                    item.episodeId === completedEpisodeId.toString()
                                )
                            ) {
                                updatedCW.push(item);
                            }
                        }
                    }
                    pl.continueWatchingSeries = updatedCW;
                }
                updatedPlaylists.push(pl);
            }
            localStorage.setItem("playlistsData", JSON.stringify(updatedPlaylists));
        } catch (error) {
            console.warn("Error removing episode from continue watching:", error);
        }
    }

    function checkIfAllEpisodesCompleted(currentEpisodeId, seriesEpisodes) {
        try {
            var seriesId = localStorage.getItem("selectedSeriesId");
            var cp =
                typeof getCurrentPlaylist === "function" ? getCurrentPlaylist() : null;
            var continueWatchingEpisodes = cp ? cp.continueWatchingSeries || [] : [];

            var allEpisodes = [];
            var seasons = Object.keys(seriesEpisodes);
            for (var i = 0; i < seasons.length; i++) {
                var seasonEpisodes = seriesEpisodes[seasons[i]] || [];
                for (var j = 0; j < seasonEpisodes.length; j++) {
                    allEpisodes.push({
                        id: seasonEpisodes[j].id.toString(),
                    });
                }
            }

            var hasIncompleteEpisodes = false;
            for (var k = 0; k < allEpisodes.length; k++) {
                var episode = allEpisodes[k];
                if (episode.id === currentEpisodeId.toString()) continue;
                for (var l = 0; l < continueWatchingEpisodes.length; l++) {
                    var cw = continueWatchingEpisodes[l];
                    if (cw.itemId === seriesId && cw.episodeId === episode.id) {
                        hasIncompleteEpisodes = true;
                        break;
                    }
                }
                if (hasIncompleteEpisodes) break;
            }

            return !hasIncompleteEpisodes;
        } catch (error) {
            return false;
        }
    }


    function goBack() {
      isDestroyed = true;
      isSidebarOpen = false;
      isLoading = true;
      errorActive = false;
      audioTracks = [];
      subtitleTracks = [];
      selectedAudioTrackIndex = -1;
      selectedSubtitleTrackIndex = -1;
      isSelectionPending = false;

      if (sidebarOpenTimeout) {
        clearTimeout(sidebarOpenTimeout);
        sidebarOpenTimeout = null;
      }
      clearResumeSeekRetry();
      closeSidebar();

      var audioSb = document.getElementById("av-audio-sidebar");
      var subtitleSb = document.getElementById("av-subtitle-sidebar");
      if (audioSb) {
        audioSb.classList.remove("open");
        audioSb.style.display = "none";
        audioSb.innerHTML = "";
      }
      if (subtitleSb) {
        subtitleSb.classList.remove("open");
        subtitleSb.style.display = "none";
        subtitleSb.innerHTML = "";
      }

      var subtitleDisplay = document.getElementById("av-subtitle-display");
      if (subtitleDisplay) {
        subtitleDisplay.innerHTML = "";
        subtitleDisplay.style.display = "none";
      }

      const currentPlaylist = getCurrentPlaylist();
      const allRecentlyWatchedMovies = currentPlaylist.continueWatchingMovies
        ? currentPlaylist.continueWatchingMovies
        : [];
      const allRecentlyWatchedSeries = currentPlaylist.continueWatchingSeries
        ? currentPlaylist.continueWatchingSeries
        : [];
      const selectedMovieId = localStorage.getItem("selectedMovieId");
      const currentPlayer = player;
      const currentAvplay = avplay;

      const navbarEl = document.querySelector("#navbar-root");
      if (navbarEl) {
        navbarEl.style.display = "block";
      }

      // Simple return for trailers
      if (fromValue === "trailer_series") {
        document.body.style.backgroundImage = "none";
        document.body.style.backgroundColor = "black";
        disposePlayer();
        localStorage.setItem("currentPage", "seriesDetailPage");
        Router.showPage("seriesDetail");
        return;
      }
      if (fromValue === "trailer_movie") {
        document.body.style.backgroundImage = "none";
        document.body.style.backgroundColor = "black";
        disposePlayer();
        localStorage.setItem("currentPage", "moviesDetailPage");
        Router.showPage("movieDetail");
        return;
      }

      if (fromValue === "series") {
        const episodeId = localStorage.getItem("selectedEpisodeId");
        localStorage.setItem("lastPlayedEpisodeId", episodeId);
      }

      function disposePlayer() {
        // First stop subtitle rendering
        try {
          if (currentAvplay) {
            try { currentAvplay.setSilentSubtitle(true); } catch(e) {}
          }
        } catch (e) {}
        
        if (currentPlayer) {
          try {
            currentPlayer.pause();
          } catch (e) {}
          try {
            currentPlayer.dispose();
          } catch (e) {
            console.warn("Error disposing player", e);
          }
        }
        
        // Also try to stop/close avplay directly
        if (currentAvplay) {
          try {
            currentAvplay.stop();
          } catch (e) {}
          try {
            currentAvplay.close();
          } catch (e) {}
        }
        player = null;
        avplay = null;
      }

      if (!isYouTube) {
        if (currentPlayer) {
          let resumeTime = 0;
          let duration = 0;

          try {
            if (!isLive && typeof currentPlayer.currentTime === "function") {
              resumeTime = Math.floor(Number(currentPlayer.currentTime()) / 1000);
            }
            if (typeof currentPlayer.duration === "function") {
              duration = Math.floor(Number(currentPlayer.duration()) / 1000);
            }
          } catch (e) {
            resumeTime = 0;
            duration = 0;
          }

          const isVideoCompleted =
            duration > 0 && Math.abs(resumeTime - duration) < 5; // 5-second buffer

          // If video is completed, focus on next episode (for series)
          if (isVideoCompleted) {
            if (fromValue === "series") {
              const currentEpisodeId =
                localStorage.getItem("selectedEpisodeId");
              const seriesEpisodes =
                JSON.parse(localStorage.getItem("seriesEpisodesData")) || {};
              const currentSeason =
                localStorage.getItem("selectedSeason") || "1";

              // Find current episode and get next one
              const seasonEpisodes = seriesEpisodes[currentSeason] || [];
              const currentEpisodeIndex = seasonEpisodes.findIndex(
                (ep) => ep.id.toString() === currentEpisodeId,
              );

              if (
                currentEpisodeIndex !== -1 &&
                currentEpisodeIndex < seasonEpisodes.length - 1
              ) {
                // Focus on next episode
                const nextEpisodeId =
                  seasonEpisodes[currentEpisodeIndex + 1].id;
                localStorage.setItem(
                  "lastPlayedEpisodeId",
                  nextEpisodeId.toString(),
                );
              } else {
                // No next episode, remove the focus marker
                localStorage.removeItem("lastPlayedEpisodeId");
              }

              // Remove the completed episode from continue watching
              removeEpisodeFromContinueWatching(currentEpisodeId);

              // Only remove from continue watching if ALL episodes in the series are completed
              const allEpisodesCompleted = checkIfAllEpisodesCompleted(
                currentEpisodeId,
                seriesEpisodes,
              );
              if (allEpisodesCompleted) {
                removeItemFromHistoryById(
                  localStorage.getItem("selectedSeriesId"),
                  "continueWatchingSeries",
                );
              }
            } else if (fromValue === "movie") {
              // MOVIES: Remove from continue watching when completed
              removeItemFromHistoryById(
                localStorage.getItem("selectedMovieId"),
                "continueWatchingMovies",
              );
            }
            // If there are still incomplete episodes, keep the series in continue watching
          } else if (resumeTime > 5 && !isVideoCompleted) {
            const continueWatchingItem = {
              itemId: playingItemData.season
                ? localStorage.getItem("selectedSeriesId")
                : localStorage.getItem("selectedMovieId"),
              episodeId: playingItemData.season
                ? localStorage.getItem("selectedEpisodeId")
                : null,
              resumeTime,
              duration,
              type: playingItemData.season ? "series" : "movie",
            };

            // Load playlists
            let playlists =
              JSON.parse(localStorage.getItem("playlistsData")) || [];

            playlists = playlists.map((pl) => {
              if (pl.playlistName !== currentPlaylistName) return pl;

              if (continueWatchingItem.type === "series") {
                // Remove old entry for same series+episode
                let updatedSeries = (pl.continueWatchingSeries || []).filter(
                  (item) =>
                    !(
                      item.itemId === continueWatchingItem.itemId &&
                      item.episodeId === continueWatchingItem.episodeId
                    ),
                );
                pl = {
                  ...pl,
                  continueWatchingSeries: updatedSeries,
                };
              } else {
                // Remove old entry for same movie
                let updatedMovies = (pl.continueWatchingMovies || []).filter(
                  (item) => item.itemId !== continueWatchingItem.itemId,
                );
                pl = {
                  ...pl,
                  continueWatchingMovies: updatedMovies,
                };
              }

              return pl;
            });

            // Save cleaned playlists back to localStorage
            localStorage.setItem("playlistsData", JSON.stringify(playlists));

            // Finally, add updated item via your function
            if (continueWatchingItem.type === "series") {
              addItemToHistory(continueWatchingItem, "continueWatchingSeries");
            } else {
              addItemToHistory(continueWatchingItem, "continueWatchingMovies");
            }
          }

          // Set player to null first to prevent further access
          player = null;

          // Then safely dispose
          try {
            if (typeof currentPlayer.pause === "function") {
              currentPlayer.pause();
            }
          } catch (err) {
            console.warn("Player pause error:", err);
          }

          try {
            if (typeof currentPlayer.dispose === "function") {
              currentPlayer.dispose();
            }
          } catch (err) {
            console.warn("Player dispose error:", err);
          }
          avplay = null;
        } else if (currentAvplay) {
          disposePlayer();
        }

        if (fromValue == "movie") {
          const isContinueWatchingMovie = allRecentlyWatchedMovies.some(
            (movie) =>
              movie && movie.itemId === localStorage.getItem("selectedMovieId"),
          );

          localStorage.setItem(
            "isContinueWatchingMovie",
            isContinueWatchingMovie == false ? "true" : "false",
          );

          // buildDynamicSidebarOptions();
          localStorage.setItem("currentPage", "moviesDetailPage");
          Router.showPage("movieDetail");
        } else {
          const isContinueWatchingSeries = allRecentlyWatchedSeries.some(
            (series) =>
              series &&
              series.itemId === localStorage.getItem("selectedSeriesId"),
          );

          localStorage.setItem(
            "isContinueWatchingSeries",
            isContinueWatchingSeries === false ? "true" : "false",
          );
          // buildDynamicSidebarOptions();
          localStorage.setItem("currentPage", "seriesDetailPage");
          Router.showPage("seriesDetail");
        }
      } else {
        if (currentPlayer && typeof currentPlayer.dispose === "function") {
          currentPlayer.dispose();
        } else if (currentAvplay) {
          disposePlayer();
        }
        avplay = null;
        if (fromValue == "movie") {
          localStorage.setItem("currentPage", "moviesDetailPage");
          Router.showPage("movieDetail");
        } else {
          localStorage.setItem("currentPage", "seriesDetailPage");
          Router.showPage("seriesDetail");
        }
      }
    }

    // Delay init
    function initPlayer() {
        if (!srcUrl) return;
        var ap = window.webapis && window.webapis.avplay;
        if (!ap) {
            var loaderObj = document.getElementById("avplay-loader");
            if (loaderObj) loaderObj.innerHTML = "❌ AVPlay not supported";
            return;
        }
        avplay = ap;
        syncPlayerAdapter();

        var loader = document.getElementById("avplay-loader");
        var seekBar = document.getElementById("av-seek-bar");
        var currentTimeEl = document.getElementById("av-current-time");
        var totalTimeEl = document.getElementById("av-total-time");

        try {
            // console.log("OPENING STREAM:", srcUrl);
            avplay.open(srcUrl);

            // [NEW] - Apply 15-second buffer size to survive network/bitrate drops
            try {
                avplay.setBufferingParam("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", 15);
                avplay.setBufferingParam("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", 15);
            } catch (err) {
                console.warn("Failed to set AVPlay buffering params", err);
            }

            // EXPLICIT FOR HLS COMPATIBILITY & USER-AGENT SPOOFING
            try {
                // Standard User-Agent to avoid server blocking
                avplay.setStreamingProperty(
                    "USER_AGENT",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",
                );

                if (srcUrl.indexOf(".m3u8") !== -1) {
                    // Note: Increasing bitrate range for better compatibility
                    avplay.setStreamingProperty("ADAPTIVE_INFO", "FIXED_BITRATE|0");
                }
            } catch (ae) {
                console.warn("setStreamingProperty failed", ae);
            }

            window._avAspectRatioIndex = 0; // Reset aspect ratio on open
            setAvplayDisplayMode("PLAYER_DISPLAY_MODE_LETTER_BOX");
            avplay.setDisplayRect(0, 0, 1920, 1080);
            avplay.setListener({
                onbufferingstart: function() {
                    if (!avplay) return;
                    isLoading = true; // Set loading state
                    if (loader && !errorActive) {
                        loader.classList.remove("hidden");
                        if (isInitialResumePending) {
                            loader.style.background = "black";
                        }
                        var playOverlay = document.querySelector(
                            ".av-action-overlay.center",
                        );
                        if (playOverlay) playOverlay.classList.add("hidden");
                    }
                },
                onbufferingcomplete: function() {
                    if (!avplay) return;
                    // [MODIFIED] - If we are in initial resume seek, do NOT hide the loader yet.
                    // Let oncurrentplaytime or applyResumeTimeToPlayback handle the visibility.
                    if (isInitialResumePending) {
                        console.log(
                            "[AvPlayer] Buffering complete, but resume is pending. Keeping loader.",
                        );
                        return;
                    }

                    isLoading = false; // Reset loading state
                    if (loader) {
                        loader.classList.add("hidden");
                        loader.style.backgroundColor = "";
                    }
                    // Re-enforce visibility on buff complete
                    var container = document.getElementById("avplay-container");
                    if (container) makeParentsTransparent(container);
                },
                onsubtitlechange: function(duration, text, data3, data4) {
                    if (!avplay) return;
                    var subtitleDisplay = document.getElementById("av-subtitle-display");
                    if (subtitleDisplay && selectedSubtitleTrackIndex !== -1) {
                        var subText = (text || "").toString().trim();
                        if (subText.length > 0) {
                            // console.log("Subtitle received (" + duration + "ms):", subText);
                            subtitleDisplay.innerHTML = subText;
                            subtitleDisplay.style.display = "block";
                            subtitleDisplay.style.visibility = "visible";
                            subtitleDisplay.style.opacity = "1";

                            // Clear previous hide timer
                            if (subtitleDisplay._hideTimeout)
                                clearTimeout(subtitleDisplay._hideTimeout);

                            // Use duration from AVPlay if provided, else default 10s (increased for stability)
                            var hideDuration =
                                duration > 0 && duration < 30000 ? duration : 10000;
                            subtitleDisplay._hideTimeout = setTimeout(function() {
                                subtitleDisplay.style.display = "none";
                                subtitleDisplay.innerHTML = "";
                            }, hideDuration);
                        } else {
                            if (subtitleDisplay._hideTimeout)
                                clearTimeout(subtitleDisplay._hideTimeout);
                            subtitleDisplay.style.display = "none";
                            subtitleDisplay.innerHTML = "";
                        }
                    }
                },
                onstreamcompleted: function() {
                    if (!avplay) return;
                    goBack();
                },
                onerror: function(errorObj) {
                    console.error("AVPlay Error (Hardware Error Code):", errorObj);

                    var errorType = errorObj;
                    if (typeof errorObj === "object" && errorObj !== null) {
                        errorType = errorObj.message || errorObj.name || String(errorObj);
                        if (errorObj.message === "PLAYER_ERROR_NOT_SUPPORTED_FORMAT") {
                            errorType = "PLAYER_ERROR_NOT_SUPPORTED_FORMAT";
                        }
                    }

                    // Save resume time to continue watching before showing error
                    try {
                        var playbackProgress = getPlaybackProgress();
                        var resumeTime = Math.floor(playbackProgress.currentTime / 1000);
                        var duration = Math.floor(playbackProgress.duration / 1000);

                        if (!isYouTube && !isLive && resumeTime > 5 && duration > 0) {
                            var isNearCompletion = Math.abs(resumeTime - duration) < 5;
                            var continueWatchingItem = {
                                itemId: playingItemData.season
                                    ? localStorage.getItem("selectedSeriesId")
                                    : localStorage.getItem("selectedMovieId"),
                                episodeId: playingItemData.season
                                    ? localStorage.getItem("selectedEpisodeId")
                                    : null,
                                resumeTime: resumeTime,
                                duration: duration,
                                type: playingItemData.season ? "series" : "movie",
                            };

                            let playlists =
                                JSON.parse(localStorage.getItem("playlistsData")) || [];

                            playlists = playlists.map((pl) => {
                                if (pl.playlistName !== currentPlaylistName) return pl;

                                if (continueWatchingItem.type === "series") {
                                    let updatedSeries = (pl.continueWatchingSeries || []).filter(
                                        (item) =>
                                            !(
                                                item.itemId === continueWatchingItem.itemId &&
                                                item.episodeId === continueWatchingItem.episodeId
                                            ),
                                    );
                                    pl = {
                                        ...pl,
                                        continueWatchingSeries: updatedSeries,
                                    };
                                } else {
                                    let updatedMovies = (pl.continueWatchingMovies || []).filter(
                                        (item) => item.itemId !== continueWatchingItem.itemId,
                                    );
                                    pl = {
                                        ...pl,
                                        continueWatchingMovies: updatedMovies,
                                    };
                                }

                                return pl;
                            });

                            localStorage.setItem("playlistsData", JSON.stringify(playlists));

                            if (!isNearCompletion) {
                                if (continueWatchingItem.type === "series") {
                                    addItemToHistory(continueWatchingItem, "continueWatchingSeries");
                                } else {
                                    addItemToHistory(continueWatchingItem, "continueWatchingMovies");
                                }
                            }
                        }
                    } catch (saveErr) {
                        console.warn("Failed to save resume time on error:", saveErr);
                    }

                    // UNKNOWN_ERROR_EVENT_FROM_PLAYER is a transient Tizen 5.5 event.
                    // It does NOT always mean fatal failure — attempt recovery first.
                    if (errorType === "UNKNOWN_ERROR_EVENT_FROM_PLAYER") {
                        console.warn("Transient error received. Attempting recovery...");
                        setTimeout(function() {
                            if (!avplay || errorActive) return;
                            try {
                                var state = avplay.getState();
                                // console.log("Recovery check - player state:", state);
                                if (state === "PAUSED") {
                                    avplay.play();
                                } else if (state === "IDLE" || state === "NONE") {
                                    // Fatal after all — show error
                                    errorActive = true;
                                    showFatalError(
                                        "Stream interrupted. Please go back and retry.",
                                    );
                                }
                                // If PLAYING, it recovered on its own — do nothing
                            } catch (re) {
                                console.error("Recovery failed:", re);
                                errorActive = true;
                                showFatalError("Stream interrupted. Please go back and retry.");
                            }
                        }, 1500);
                        return; // Do NOT set errorActive or show error screen yet
                    }

                    // Fatal errors — show error screen
                    errorActive = true;
                    clearResumeSeekRetry();
                    pendingResumeTimeMs = 0;
                    resumeTimeApplied = false;
                    var readableError = String(errorType);
                    if (errorType === "PLAYER_ERROR_NOT_SUPPORTED_FORMAT")
                        readableError = "Format Not Supported by this TV";
                    else if (errorType === "PLAYER_ERROR_CONNECTION_FAILED")
                        readableError = "Network Connection Failed";
                    else if (errorType === "PLAYER_ERROR_NO_SUCH_FILE")
                        readableError = "Stream URL Not Found (404)";
                    else if (errorType === "PLAYER_ERROR_INVALID_STATE")
                        readableError = "Player entered invalid state";
                    showFatalError(readableError);
                },
                oncurrentplaytime: function(ms) {
                    if (!avplay || pendingSeekTimeout || errorActive) return;

                    // [NEW] - If we were waiting for an initial resume, hide loader once we actually start playing at/near target
                    if (isInitialResumePending) {
                        // Check if we reached the target or passed a safe fallback threshold (5s)
                        if (ms >= targetResumeTimeMs - 1000 || ms > 5000) {
                            // console.log(
                            //     "[AvPlayer] Playback reached resume target or fallback. Hiding special resume loader.",
                            // );
                            isInitialResumePending = false;
                            isLoading = false;
                            if (loader) {
                                loader.classList.add("hidden");
                                loader.style.background = "";
                            }
                            var container = document.getElementById("avplay-container");
                            if (container) makeParentsTransparent(container);
                        }
                    }

                    if (seekBar) seekBar.value = ms;
                    if (currentTimeEl) currentTimeEl.textContent = formatTime(ms);
                    var duration = avplay.getDuration();
                    if (duration > 0) {
                        var percent = (ms / duration) * 100;
                        if (seekBar)
                            seekBar.style.background =
                            "linear-gradient(to right, #3498db 0%, #3498db " +
                            percent +
                            "%, #444 " +
                            percent +
                            "%, #444 100%)";
                    }
                },
            });

            // [NEW] - Detect resume time early to prevent flicker
            if (!isLive) {
                var matched = null;
                var currentPlaylist = typeof getCurrentPlaylist === "function" ? getCurrentPlaylist() : null;

                if (currentPlaylist) {
                    var isMovieContent = fromValue === "movie" || (!playingItemData.season && fromValue !== "series");
                    if (isMovieContent) {
                        var movieTargetId = playingItemData.id || playingItemData.stream_id || playingItemData.itemId || localStorage.getItem("selectedMovieId");
                        var movieTargetIdStr = movieTargetId ? String(movieTargetId) : null;
                        var movieCVData = currentPlaylist.continueWatchingMovies || [];
                        for (var i = 0; i < movieCVData.length; i++) {
                            if (movieCVData[i].itemId && String(movieCVData[i].itemId) === movieTargetIdStr) {
                                matched = movieCVData[i];
                                break;
                            }
                        }
                    } else {
                        var seriesEpId = playingItemData.id || playingItemData.episode_id || localStorage.getItem("selectedEpisodeId");
                        var seriesEpIdStr = seriesEpId ? String(seriesEpId) : null;
                        var seriesCVData = currentPlaylist.continueWatchingSeries || [];
                        for (var j = 0; j < seriesCVData.length; j++) {
                            if (seriesCVData[j].episodeId && String(seriesCVData[j].episodeId) === seriesEpIdStr) {
                                matched = seriesCVData[j];
                                break;
                            }
                        }
                    }
                }

                if (matched && matched.resumeTime) {
                    pendingResumeTimeMs = matched.resumeTime * 1000;
                    targetResumeTimeMs = pendingResumeTimeMs;
                    isInitialResumePending = true;
                    // console.log("[AvPlayer] Early resume detection:", matched.resumeTime, "s");
                    if (loader) {
                        loader.classList.remove("hidden");
                        loader.style.background = "black";
                    }
                }
            }

            avplay.prepareAsync(function() {
                var duration = avplay.getDuration();
                if (seekBar) {
                    seekBar.max = duration;
                    seekBar.value = 0;
                }
                if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);

                fetchTrackInfo();

                // Handle resume time application
                if (pendingResumeTimeMs > 0 && pendingResumeTimeMs < duration) {
                    if (!applyResumeTimeToPlayback()) {
                        scheduleResumeSeekRetry();
                    }
                } else {
                    // No resume or invalid resume time, clear flag
                    isInitialResumePending = false;
                }

                // Handle show/hide title on start
                var titleBar = document.getElementById("av-title-bar");
                if (titleBar) {
                    titleBar.classList.remove("hidden");
                    setTimeout(function() {
                        if (avplay && avplay.getState() === "PLAYING") {
                            titleBar.classList.add("hidden");
                        }
                    }, 3000);
                }

                // AGGRESSIVE AUTOPLAY — guard with state check
                setTimeout(function() {
                    try {
                        if (!avplay || errorActive) return;
                        var state = avplay.getState();
                        // console.log("Pre-play state check:", state);
                        if (state !== "READY" && state !== "PAUSED") {
                            console.warn("Cannot play: unexpected state", state);
                            return;
                        }

                        var container = document.getElementById("avplay-container");
                        if (container && !isInitialResumePending) makeParentsTransparent(container);

                        avplay.play();
                        hasStartedPlayingOnce = true;

                        // Subtitles default to OFF — suppress native rendering on startup.
                        // User must manually select a subtitle track from the sidebar.
                        try {
                            avplay.setSilentSubtitle(true);
                        } catch (e) {}
                        console.log("Player started. Subtitles OFF by default.");

                        // Fetch track info AGAIN after play to catch delayed track registration
                        setTimeout(fetchTrackInfo, 1000);
                        setTimeout(fetchTrackInfo, 3000);
                        setTimeout(fetchTrackInfo, 5000);
                    } catch (pErr) {
                        console.error("Autoplay attempt failed", pErr);
                        // Only retry if player is still in a recoverable state
                        setTimeout(function() {
                            try {
                                if (!avplay || errorActive) return;
                                var s = avplay.getState();
                                if (s === "READY" || s === "PAUSED") avplay.play();
                            } catch (e) {
                                console.error("Retry play also failed:", e);
                            }
                        }, 800);
                    }
                }, 200);

                hideControlsWithDelay(3000);
            });
        } catch (e) {
            console.error("AVPlay Exception", e);
        }

        // Auto-hide controls after 5 seconds of inactivity
        var inactivityTimeout = null;

        function resetInactivityTimer() {
            if (inactivityTimeout) clearTimeout(inactivityTimeout);
            inactivityTimeout = setTimeout(function() {
                if (!errorActive && !isSidebarOpen) {
                    var controls = document.getElementById("av-controls-bar");
                    var titleBar = document.getElementById("av-title-bar");
                    if (controls) controls.classList.add("hidden");
                    if (titleBar) titleBar.classList.add("hidden");
                    unfocusAll();
                }
            }, 5000);
        }

        var avKeyHandler = function(e) {
            if (localStorage.getItem("currentPage") !== "videoJsPlayer") return;

            // Reset inactivity timer on every key press
            resetInactivityTimer();

            if (isSidebarOpen) {
                switch (e.keyCode) {
                    case 38: // Up
                        if (sidebarFocusIndex > 0) {
                            sidebarFocusIndex--;
                            renderSidebar();
                        }
                        e.preventDefault();
                        return;
                    case 40: // Down
                        var maxCount = 0;
                        if (sidebarType === "audio") {
                            maxCount = audioTracks.length - 1;
                        } else {
                            // Subtitles have "Off" at index 0, then deduped tracks
                            maxCount = getDeduplicatedTracks(subtitleTracks).length;
                        }

                        if (sidebarFocusIndex < maxCount) {
                            sidebarFocusIndex++;
                            renderSidebar();
                        }
                        e.preventDefault();
                        return;
                    case 13: // Enter
                        selectTrackFromSidebar();
                        e.preventDefault();
                        return;
                    default:
                        if (isBackNavigationKey(e)) {
                            closeSidebar();
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            return;
                        }
                        break;
                }
                return;
            }

            if (errorActive) {
                if (e.keyCode === 13) {
                    retryPlayback();
                } else if (isBackNavigationKey(e)) {
                    e.preventDefault();
                    goBack();
                }
                return;
            }

            // Guard controls access by isLoading
            if ([37, 38, 39, 40, 13].indexOf(e.keyCode) !== -1) {
                if (isLoading && !errorActive) {
                    // Do not show controls until loading finished
                    e.preventDefault();
                    resetInactivityTimer();
                    return;
                }

                var controls = document.getElementById("av-controls-bar");
                var wasHidden = !controls || controls.classList.contains("hidden");
                if (wasHidden) {
                    showControlsAndDefaultFocus();
                    e.preventDefault();
                    resetInactivityTimer();
                    return;
                }
            }

            if (isPlayPauseFocused) {
                switch (e.keyCode) {
                    case 40:
                        if (!isLive) focusSeekBar();
                        else focusAspectRatio();
                        e.preventDefault();
                        break;
                    case 13:
                        var state = avplay.getState();
                        if (state === "PLAYING") {
                            avplay.pause();
                            showOverlay("pause");
                        } else {
                            avplay.play();
                            showOverlay("play");
                            hideControlsWithDelay(3000);
                        }
                        e.preventDefault();
                        break;
                    case 37:
                        debouncedSeek(-10);
                        e.preventDefault();
                        break;
                    case 39:
                        debouncedSeek(10);
                        e.preventDefault();
                        break;
                }
            } else if (isSeekBarFocused) {
                switch (e.keyCode) {
                    case 38:
                        focusPlayPause();
                        e.preventDefault();
                        break;
                    case 40:
                        focusAspectRatio();
                        e.preventDefault();
                        break;
                    case 37:
                        debouncedSeek(-10);
                        e.preventDefault();
                        break;
                    case 39:
                        debouncedSeek(10);
                        e.preventDefault();
                        break;
                    case 13:
                        focusPlayPause();
                        e.preventDefault();
                        break;
                }
            } else if (isAspectRatioFocused) {
                switch (e.keyCode) {
                    case 38:
                        if (!isLive) focusSeekBar();
                        else focusPlayPause();
                        e.preventDefault();
                        break;
                    case 37:
                        if (!isLive) focusSeekBar();
                        else focusPlayPause();
                        e.preventDefault();
                        break;
                    case 13:
                        cycleAspectRatio();
                        e.preventDefault();
                        break;
                }
            }

            switch (e.keyCode) {
                default:
                    if (isBackNavigationKey(e)) {
                        e.preventDefault();
                        goBack();
                    }
                    break;
                case 10252: // PlayPause
                    var s = avplay.getState();
                    if (s === "PLAYING") {
                        avplay.pause();
                        showOverlay("pause");
                    } else {
                        avplay.play();
                        showOverlay("play");
                        hideControlsWithDelay(3000);
                    }
                    break;
                case 415:
                    avplay.play();
                    showOverlay("play");
                    break;
                case 19:
                    avplay.pause();
                    showOverlay("pause");
                    break;
            }
            hideControlsWithDelay(3000);
        };

        document.addEventListener("keydown", avKeyHandler);

        AvPlayer.cleanup = function() {
            isDestroyed = true; // Prevent any pending timeout callbacks from firing toasts
            document.removeEventListener("keydown", avKeyHandler);
            if (pendingSeekTimeout) clearTimeout(pendingSeekTimeout);
            if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
            if (inactivityTimeout) clearTimeout(inactivityTimeout);
            if (sidebarOpenTimeout) {
                clearTimeout(sidebarOpenTimeout);
                sidebarOpenTimeout = null;
            }
            // Clear resume time retries
            clearResumeSeekRetry();
            pendingResumeTimeMs = 0;
            resumeTimeApplied = false;
            
            // Reset all player state for fresh restart
            isSidebarOpen = false;
            sidebarType = "";
            sidebarFocusIndex = 0;
            isPlayPauseFocused = true;
            isSeekBarFocused = false;
            isAspectRatioFocused = false;
            audioTracks = [];
            subtitleTracks = [];
            selectedAudioTrackIndex = -1;
            selectedSubtitleTrackIndex = -1;
            isSelectionPending = false;
            isLoading = true;
            errorActive = false;
            hasStartedPlayingOnce = false;
            accumulatedSeekOffset = 0;
            
            // Close and clear sidebars
            var audioSb = document.getElementById("av-audio-sidebar");
            var subtitleSb = document.getElementById("av-subtitle-sidebar");
            if (audioSb) {
                audioSb.classList.remove("open");
                audioSb.style.display = "none";
                audioSb.innerHTML = "";
            }
            if (subtitleSb) {
                subtitleSb.classList.remove("open");
                subtitleSb.style.display = "none";
                subtitleSb.innerHTML = "";
            }
            
            // Hide subtitle display
            var subtitleDisplay = document.getElementById("av-subtitle-display");
            if (subtitleDisplay) {
                subtitleDisplay.innerHTML = "";
                subtitleDisplay.style.display = "none";
            }
            
            // Ensure player is fully stopped
            try {
                if (avplay) {
                    // Try to stop subtitle rendering first
                    try { avplay.setSilentSubtitle(true); } catch(e) {}
                    avplay.stop();
                    avplay.close();
                }
            } catch (e) {}
            
            // Reset avplay reference
            avplay = null;
            player = null;
            
            // Clear error display
            var errorDisplay = document.querySelector(".av-error-display");
            if (errorDisplay) {
                errorDisplay.parentElement && errorDisplay.parentElement.remove();
            }
            
            AvPlayer.cleanup = null;
        };

        // Start inactivity timer immediately
        resetInactivityTimer();
    }

    setTimeout(initPlayer, 100);

    // Subtitle display div is now included directly in the returned HTML string
    // to ensure it stays in the correct stacking context within #avplay-container.

    return (
        '<div id="avplay-container">' +
        '<div id="av-title-bar" class="av-title-bar hidden">' +
        '<span class="av-title-text">' +
        titleText +
        "</span>" +
        "</div>" +
        '<div id="avplay-loader" class="av-buffer-loader">' +
        '<div class="spinner"></div>' +
        "</div>" +
        '<div class="av-action-overlay center hidden">' +
        '<div class="av-action-icon"><i class="fa-solid fa-play"></i></div>' +
        "</div>" +
        '<div class="av-action-overlay left hidden">' +
        '<div class="av-action-icon"><i class="fa-solid fa-rotate-left"></i></div>' +
        "</div>" +
        '<div class="av-action-overlay right hidden">' +
        '<div class="av-action-icon"><i class="fa-solid fa-rotate-right"></i></div>' +
        "</div>" +
        '<div id="av-controls-bar" class="av-controls hidden">' +
        (!isLive ?
            '<div class="av-seek-bar-container">' +
            '<span id="av-current-time" class="av-time-display">0:00</span>' +
            '<input id="av-seek-bar" class="av-seek-bar" type="range" min="0" value="0" step="1" />' +
            '<span id="av-total-time" class="av-time-display">0:00</span>' +
            "</div>" :
            '<div class="av-live-badge" style="color:red; font-weight:bold; font-size:24px; margin-bottom:10px;">LIVE</div>') +
        '<div class="av-buttons-row">' +
        '<button id="av-ar-btn" class="av-control-btn">' +
        '<i class="fa-solid fa-expand"></i> Aspect Ratio' +
        "</button>" +
        "</div>" +
        "</div>" +
        '<div id="av-audio-sidebar" class="av-sidebar av-audio-sidebar"></div>' +
        '<div id="av-subtitle-sidebar" class="av-sidebar av-subtitle-sidebar"></div>' +
        '<div id="av-subtitle-display" class="av-subtitle-display"></div>' +
        '<div id="av-aspect-overlay" class="av-aspect-overlay"></div>' +
        '<object id="avplay-object" type="application/avplayer"></object>' +
        "</div>"
    );
}
