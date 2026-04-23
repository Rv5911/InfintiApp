function FlowLivePlayerComponent(
    streamId = "",
    srcUrl = "",
    poster = "/assets/placeholder.png",
    height = "100%",
    channelName = ""
) {
    const id = "flowplayer-live";
    const aspectRatioBtn = document.querySelector(".flow-aspect-ratio-div");

    const selectedPlaylist = localStorage.getItem("selectedPlaylist");
    const playlistsData = localStorage.getItem("playlistsData");

    const currentPlaylistName = selectedPlaylist ?
        JSON.parse(selectedPlaylist).playlistName :
        "";
    const currentPlaylist = playlistsData ?
        JSON.parse(playlistsData).filter(
            (pl) => pl.playlistName === currentPlaylistName
        )[0] :
        {};
    const timeFormat =
        currentPlaylist && currentPlaylist.timeFormat ?
        currentPlaylist.timeFormat :
        "12hrs";

    let epgData = [];
    if (streamId) {
        getLiveStreamEpg(streamId).then((data) => {
            epgData = data && data.epg_listings ? data.epg_listings : [];
            renderEpg(epgData);
        });
    }

    function formatTime(dateStr, format) {
        let date;
        if (!isNaN(dateStr)) {
            const ts = dateStr.toString().length === 10 ? dateStr * 1000 : dateStr;
            date = new Date(parseInt(ts));
        } else {
            date = new Date(dateStr);
        }
        if (isNaN(date)) return dateStr;
        const options =
            format === "12hrs" ?
            {
                hour: "numeric",
                minute: "2-digit",
                hour12: true
            } :
            {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            };
        return new Intl.DateTimeFormat(undefined, options).format(date);
    }

    function renderEpg(epgList) {
        const epgContainer = document.querySelector(".livetv-player-epg");
        if (!epgContainer) return;
        if (!epgList || epgList.length === 0) {
            epgContainer.innerHTML = `
        <div class="livetv-player-epg-item">
          <p class="livetv-player-epg-title">No EPG Found</p>
          <p class="livetv-player-epg-description">No EPG data available</p>
        </div>
      `;
            return;
        }
        epgContainer.innerHTML = epgList
            .map((epg) => {
                const startTime = formatTime(epg.start, timeFormat);
                const endTime = formatTime(epg.end, timeFormat);
                return `
          <div class="livetv-player-epg-item">
            <p class="livetv-player-epg-title">${startTime} - ${endTime} ${
          decodeBase64(epg.title) || "Untitled"
        }</p>
            <p class="livetv-player-epg-description">${
              decodeBase64(epg.description) || "No description available"
            }</p>
          </div>
        `;
            })
            .join("");
    }

    function updateVolume(direction) {
        try {
            if (typeof tizen !== "undefined" && tizen.tvaudiocontrol) {
                let vol = tizen.tvaudiocontrol.getVolume();
                vol = Math.max(0, Math.min(100, vol + (direction === "up" ? 1 : -1)));
                tizen.tvaudiocontrol.setVolume(vol);
                showVolumeDisplay(vol);
            }
        } catch (err) {
            console.warn("Volume control failed:", err);
        }
    }

    function showVolumeDisplay(volume) {
        let volEl = document.querySelector(".live-volume-display");
        if (!volEl) {
            volEl = document.createElement("div");
            volEl.className = "live-volume-display";

            // Insert the volume display in the player container
            const playerContainer = document.querySelector(".live-video-player");
            if (playerContainer) {
                playerContainer.appendChild(volEl);
            } else {
                document.body.appendChild(volEl);
            }
        }

        volEl.textContent = `Volume: ${volume}`;
        volEl.style.display = "block";
        clearTimeout(volEl._timeout);
        volEl._timeout = setTimeout(() => (volEl.style.display = "none"), 1500);
    }

    function toggleMute() {
        try {
            if (typeof tizen !== "undefined" && tizen.tvaudiocontrol) {
                if (tizen.tvaudiocontrol.isMute()) {
                    tizen.tvaudiocontrol.setMute(false);
                } else {
                    tizen.tvaudiocontrol.setMute(true);
                }
            }
        } catch (err) {
            console.warn("Mute toggle failed:", err);
        }
    }

    function showMuteIcon() {
        let muteEl = document.querySelector(".live-mute-icon");
        if (!muteEl) {
            muteEl = document.createElement("div");
            muteEl.className = "live-mute-icon";
            muteEl.textContent = "🔇";
            document.body.appendChild(muteEl);
        }
        muteEl.style.display = "block";
    }

    function hideMuteIcon() {
        const muteEl = document.querySelector(".live-mute-icon");
        if (muteEl) muteEl.style.display = "none";
    }

    // Function to update aspect ratio button visibility
    function updateAspectRatioButtonVisibility() {
        const aspectRatioBtn = document.querySelector(".flow-aspect-ratio-div");
        const loadingEl = document.querySelector(".live-video-loader");
        const errorEl = document.querySelector(".live-video-error");

        if (aspectRatioBtn) {
            // Hide aspect ratio button when loader is visible or error is visible
            if (
                (loadingEl && !loadingEl.classList.contains("hidden")) ||
                (errorEl && !errorEl.classList.contains("hidden"))
            ) {
                aspectRatioBtn.style.display = "none";
            }
        }
    }

    if (!srcUrl || srcUrl.trim() === "") {
        return `
      <div class="live-video-player live-video-player-div" style="width:100%; height:100%;">
        <div class="live-no-url-message">
          <div class="no-url-icon">📺</div>
          <p class="no-url-text">Please select any channel to play</p>
        </div>
        <div id="${id}" class="flowplayer" style="height:100%; width:100%; display:none;"></div>
      </div>
      <div class="livetv-player-epg" style="display: none;">
        <div class="livetv-player-epg-item">
          <p class="livetv-player-epg-title">No EPG Found</p>
          <p class="livetv-player-epg-description">No EPG data available</p>
        </div>
      </div>
    `;
    }

    setTimeout(() => {
        if (window.livePlayer) {
            try {
                if (window.livePlayer.dispose) window.livePlayer.dispose();
            } catch {}
            window.livePlayer = null;
        }

        const pageWrapper = document.querySelector(".live-video-player-div");
        const getLoadingEl = function() {
            return pageWrapper ?
                pageWrapper.querySelector(".live-video-loader") :
                null;
        };
        const getErrorEl = function() {
            return pageWrapper ?
                pageWrapper.querySelector(".live-video-error") :
                null;
        };

        const showLoader = function() {
            const el = getLoadingEl();
            if (el) el.classList.remove("hidden");
            const er = getErrorEl();
            if (er) er.classList.add("hidden");
            updateAspectRatioButtonVisibility();
        };
        const hideLoader = function() {
            const el = getLoadingEl();
            if (el) el.classList.add("hidden");
            const er = getErrorEl();
            if (er) er.classList.add("hidden");
            updateAspectRatioButtonVisibility();
        };

        showLoader();

        const hlsUrl = srcUrl.replace(/\.ts(\?.*)?$/i, function(m, q) {
            return `.m3u8${q || ""}`;
        });
        const fpContainer = document.getElementById(id);

        if (fpContainer && typeof flowplayer !== "undefined") {
            const wrapperEl = fpContainer.closest(".live-video-player-div");
            const fp = flowplayer(fpContainer, {
                autoplay: true,
                controls: false,
                ratio: "4:3",
                // ratio: 0,
                clip: {
                    sources: [{
                        type: "application/x-mpegURL",
                        src: hlsUrl
                    }],
                },
            });

            // Play/Pause functionality
            let isPlaying = true; // Start with playing since autoplay is true

            const updatePlayPauseIcon = function() {
                const playPauseBtn = document.getElementById("live-play-pause-btn");
                if (playPauseBtn) {
                    const icon = playPauseBtn.querySelector(".live-play-pause-btn-icon");
                    if (icon) {
                        if (isPlaying) {
                            icon.className = "fa-solid fa-pause live-play-pause-btn-icon";
                        } else {
                            icon.className = "fa-solid fa-play live-play-pause-btn-icon";
                        }
                    }
                }
            };

            const togglePlayPause = function() {
                try {
                    if (isPlaying) {
                        fp.pause();
                        isPlaying = false;
                    } else {
                        fp.resume();
                        isPlaying = true;
                    }
                    updatePlayPauseIcon();
                } catch (error) {
                    console.error("Error toggling play/pause:", error);
                }
            };

            window.livePlayer = {
                _fp: fp,
                isPlaying: function() {
                    return isPlaying;
                },
                togglePlayPause: togglePlayPause,
                isFullscreen: function() {
                    try {
                        return document.fullscreenElement === wrapperEl;
                    } catch {
                        return false;
                    }
                },
                requestFullscreen: function() {
                    try {
                        if (wrapperEl && wrapperEl.requestFullscreen)
                            wrapperEl.requestFullscreen();
                        else if (wrapperEl && wrapperEl.webkitRequestFullscreen)
                            wrapperEl.webkitRequestFullscreen();
                    } catch {}
                },
                exitFullscreen: function() {
                    try {
                        if (document.exitFullscreen) document.exitFullscreen();
                        else if (document.webkitExitFullscreen)
                            document.webkitExitFullscreen();
                    } catch {}
                },
                on: function(ev, handler) {
                    try {
                        fp.on(ev, handler);
                    } catch {}
                },
                src: function({
                    src
                }) {
                    try {
                        fp.load(src);
                    } catch {}
                },
                load: function() {},
                dispose: function() {
                    try {
                        fp.unload();
                    } catch {}
                },
            };

            const fsBtnFocus = function() {
                const fsBtn = document.getElementById("lp-fullscreen-btn");
                if (fsBtn) fsBtn.classList.add("live-control-btn-focused");
            };

            const ppBtnFocus = function() {
                const ppBtn = document.getElementById("live-play-pause-btn");
                if (ppBtn) ppBtn.classList.add("live-control-btn-focused");
            };

            // Event listeners for player state
            fp.on("ready", showLoader);
            fp.on("buffer", showLoader);
            fp.on("resume", function() {
                isPlaying = true;
                updatePlayPauseIcon();
                hideLoader();
                fsBtnFocus();
                ppBtnFocus();

                // Auto-hide top overlays after 5 seconds
                setTimeout(() => {
                    const topOverlays = document.querySelector(".live-top-overlays");
                    if (topOverlays) {
                        topOverlays.style.opacity = "0";
                        topOverlays.style.transition = "opacity 0.5s ease";
                    }
                }, 5000);
            });
            fp.on("play", function() {
                isPlaying = true;
                updatePlayPauseIcon();
                hideLoader();
                fsBtnFocus();
                ppBtnFocus();

                // Auto-hide top overlays after 5 seconds
                setTimeout(() => {
                    const topOverlays = document.querySelector(".live-top-overlays");
                    if (topOverlays) {
                        topOverlays.style.opacity = "0";
                        topOverlays.style.transition = "opacity 0.5s ease";
                    }
                }, 5000);
            });
            fp.on("pause", function() {
                isPlaying = false;
                updatePlayPauseIcon();
                ppBtnFocus();
            });
            fp.on("error", function() {
                hideLoader();
                const er = getErrorEl();
                if (er) er.classList.remove("hidden");
                updateAspectRatioButtonVisibility();
            });

            const html5Video = fpContainer.querySelector("video");
            if (html5Video) {
                html5Video.addEventListener("waiting", showLoader);
                html5Video.addEventListener("stalled", showLoader);
                html5Video.addEventListener("seeking", showLoader);
                const hideAndFocus = function() {
                    hideLoader();
                    fsBtnFocus();
                    ppBtnFocus();
                };
                html5Video.addEventListener("playing", hideAndFocus);
                html5Video.addEventListener("play", hideAndFocus);
                html5Video.addEventListener("canplay", hideAndFocus);
                html5Video.addEventListener("seeked", hideAndFocus);
                html5Video.addEventListener("loadeddata", hideAndFocus);
                html5Video.addEventListener("loadedmetadata", hideAndFocus);
                html5Video.addEventListener("timeupdate", function() {
                    if (!html5Video.paused && html5Video.readyState >= 2) hideLoader();
                });
                if (html5Video.readyState >= 3) hideAndFocus();
            }

            // Add event listeners for control buttons
            const playPauseBtn = document.getElementById("live-play-pause-btn");
            if (playPauseBtn) {
                playPauseBtn.addEventListener("click", togglePlayPause);
            }

            const fullscreenBtn = document.getElementById("lp-fullscreen-btn");
            if (fullscreenBtn) {
                fullscreenBtn.addEventListener("click", function() {
                    if (window.livePlayer.isFullscreen())
                        window.livePlayer.exitFullscreen();
                    else window.livePlayer.requestFullscreen();
                });
            }

            const handleFullscreenChange = function() {
                const channelNameEl = document.querySelector(".live-channel-name");
                const liveBadgeEl = document.querySelector(".live-badge");
                const isFs = window.livePlayer.isFullscreen();
                if (channelNameEl) channelNameEl.style.display = isFs ? "none" : "flex";
                if (liveBadgeEl) liveBadgeEl.style.display = "flex";
            };
            fp.on("fullscreen", handleFullscreenChange);
            document.addEventListener("fullscreenchange", handleFullscreenChange);
            handleFullscreenChange();

            const retryBtn = document.querySelector(".retry-btn");
            if (retryBtn) {
                retryBtn.addEventListener("click", function() {
                    const loadingEl = getLoadingEl();
                    const errorEl = getErrorEl();
                    if (loadingEl) loadingEl.classList.remove("hidden");
                    if (errorEl) errorEl.classList.add("hidden");
                    updateAspectRatioButtonVisibility();
                    window.livePlayer.src({
                        src: hlsUrl
                    });
                });
            }

            // Initialize the play/pause icon
            updatePlayPauseIcon();

            // Initial aspect ratio button visibility check
            updateAspectRatioButtonVisibility();
        }
        // Remove existing listener if any
        if (window._flowLiveTvVolumeHandler) {
            document.removeEventListener("keydown", window._flowLiveTvVolumeHandler);
        }

        // Create new handler function
        window._flowLiveTvVolumeHandler = (e) => {
            if (localStorage.getItem("currentPage") !== "liveTvPage") return;

            switch (e.keyCode) {
                case 447:
                    updateVolume("up");
                    e.preventDefault();
                    break;
                case 448:
                    updateVolume("down");
                    e.preventDefault();
                    break;
                case 449:
                    toggleMute();
                    e.preventDefault();
                    break;
                case 10252: // Play/Pause key
                    if (window.livePlayer && window.livePlayer.togglePlayPause) {
                        window.livePlayer.togglePlayPause();
                    }
                    e.preventDefault();
                    break;
            }
        };

        // Add the event listener
        document.addEventListener("keydown", window._flowLiveTvVolumeHandler);
        const handleAspectRatioChange = () => {
            const videoEl = document.querySelector(".flowplayer .fp-engine");
            if (videoEl && window.VideoAspectRatio) {
                const newLabel = window.VideoAspectRatio.cycle(videoEl);
                window.VideoAspectRatio.showOverlay(newLabel);
            } else {
                console.warn(
                    "Aspect ratio handler: No video element or VideoAspectRatio module found"
                );
            }
        };

        const aspectRatioButton = document.getElementById("flow-aspect-ratio");
        if (aspectRatioButton) {
            aspectRatioButton.addEventListener("click", handleAspectRatioChange);
        }
    }, 50);

    return `
    <div class="livetvPlayer-main-container">
    <div class="live-video-player live-video-player-div" style="width:100%; height:100%;">

            <button id="live-play-pause-btn"  class="play-pause-icon" tabindex="-1">
          <i class="fa-solid fa-pause live-play-pause-btn-icon"></i>
        </button>
      <div class="flow-aspect-ratio-div">
        <button id="flow-aspect-ratio" style="display:none;" class="flow-aspect-ratio-btn"><i class="fa-solid fa-compress" style="color:white"></i>Aspect Ratio </button>
      </div>
      <div class="live-top-overlays">
        <div class="live-channel-name">${channelName || ""}</div>
        <div class="live-badge">LIVE</div>
      </div>
      <div class="live-video-loader"><div class="live-spinner"></div></div>
      <div class="live-video-error hidden">
        <div class="error-icon">⚠️</div>
        <p>Failed to load video</p>
        <!-- <button class="retry-btn">Retry</button> -->
      </div>
      <div class="live-video-controls">

        <div id="lp-fullscreen-btn" class="lp-fullscreen-btn">
          <i class="fa-sharp fa-solid fa-expand lp-fullscreen-icon"></i>
        </div>
      </div>
      <div id="${id}" class="flowplayer" style="height:100%; width:100%;">
        <video class="flowplayer-video-player">
          <source type="application/x-mpegURL" src="${srcUrl.replace(
            /\.ts(\?.*)?$/i,
            function (m, q) {
              return `.m3u8${q || ""}`;
            }
          )}">
        </video>
      </div>
     
                <div id="aspectRatioOverlay" class="aspect-ratio-overlay hidden"></div>

    </div>
     <div class="livetv-player-epg" style="display:none;" >
        <div class="livetv-player-epg-item">
          <p class="livetv-player-epg-title">Loading EPG...</p>
        </div>
      </div>
    </div>
  `;
}