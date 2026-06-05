function LiveVideoJsComponent(
  streamId = "",
  srcUrl = "",
  poster = "/assets/placeholder.png",
  height = "100%",
  channelName = "",
) {
  const id = "live-videojs-player";
  let epgData = [];
  let aspectRatioChangeHandler = null;
  let fullscreenChangeHandler = null;
  let playPauseClickHandler = null;
  let fullscreenClickHandler = null;
  let retryClickHandler = null;
  let playerContainerClickHandler = null;
  let nativeVideoEventCleanup = [];
  let playbackErrorActive = false;
  // Removed internal aspect ratio logic in favor of window.VideoAspectRatio utility

  function getVideoElement() {
    return document.getElementById(id);
  }

  function getLivePlayerContainer() {
    return document.querySelector(".live-video-player-div");
  }

  function cycleManualAspectRatio() {
    const videoEl = getVideoElement();
    if (videoEl && window.VideoAspectRatio) {
      return window.VideoAspectRatio.cycle(videoEl);
    }
    return null;
  }

  function resetManualAspectRatio() {
    const videoEl = getVideoElement();
    if (videoEl && window.VideoAspectRatio) {
      window.VideoAspectRatio.initialize(videoEl);
    }
  }

  function syncPlayerLayout(isFullscreen) {
    const livePlayerDiv = getLivePlayerContainer();
    if (!livePlayerDiv) return;

    if (isFullscreen) {
      livePlayerDiv.style.removeProperty("aspect-ratio");
      livePlayerDiv.style.width = "100%";
      livePlayerDiv.style.height = "100%";
      livePlayerDiv.style.maxHeight = "none";
    } else {
      livePlayerDiv.style.width = "100%";
      livePlayerDiv.style.height = "auto";
      livePlayerDiv.style.setProperty("aspect-ratio", "16 / 9");
      livePlayerDiv.style.maxHeight = "100%";
    }
  }

  function isPlayerOverlayBlockingControls() {
    const loadingEl = document.querySelector(".live-video-loader");
    const errorEl = document.querySelector(".live-video-error");
    return (
      (loadingEl && !loadingEl.classList.contains("hidden")) ||
      (errorEl && !errorEl.classList.contains("hidden"))
    );
  }

  function setOverlayState({ loading = false, error = false } = {}) {
    const loadingEl = document.querySelector(".live-video-loader");
    const errorEl = document.querySelector(".live-video-error");

    if (loadingEl) {
      loadingEl.classList.toggle("hidden", !loading);
    }
    if (errorEl) {
      errorEl.classList.toggle("hidden", !error);
    }

    if (loading || error) {
      setFullscreenControlsVisible(false);
    }
    updateAspectRatioButtonVisibility();
  }

  function syncLoaderFromMedia(videoEl) {
    if (!videoEl) return;

    const haveCurrentData =
      typeof HTMLMediaElement !== "undefined" &&
      typeof HTMLMediaElement.HAVE_CURRENT_DATA === "number"
        ? HTMLMediaElement.HAVE_CURRENT_DATA
        : 2;

    const isError = playbackErrorActive || !!videoEl.error;
    const isPaused = videoEl.paused;
    const isBuffering =
      !isPaused && (videoEl.seeking || videoEl.readyState < haveCurrentData);

    if (isError) {
      setOverlayState({
        loading: false,
        error: true,
      });
    } else if (isBuffering) {
      setOverlayState({
        loading: true,
        error: false,
      });
    } else {
      setOverlayState({
        loading: false,
        error: false,
      });
    }
  }

  function clearPlaybackError() {
    playbackErrorActive = false;
  }

  function showPlaybackError() {
    playbackErrorActive = true;
    setOverlayState({
      loading: false,
      error: true,
    });
  }

  // Store reference to previous cleanup to avoid race conditions
  const previousCleanup = LiveVideoJsComponent.cleanup;
  if (previousCleanup) {
    // Use setTimeout to ensure cleanup happens after current execution
    setTimeout(() => {
      try {
        previousCleanup();
      } catch (err) {
        console.warn("Previous LiveVideoJsComponent cleanup error:", err);
      }
    }, 0);
  }

  const currentPlaylistName = JSON.parse(
    localStorage.getItem("selectedPlaylist"),
  ).playlistName;
  const currentPlaylist = JSON.parse(
    localStorage.getItem("playlistsData"),
  ).filter((pl) => pl.playlistName === currentPlaylistName)[0];

  const timeFormat = currentPlaylist.timeFormat
    ? currentPlaylist.timeFormat
    : "12hrs";

  //API call to fetch EPG data
  if (streamId) {
    getLiveStreamEpg(streamId).then((data) => {
      epgData = data.epg_listings ? data.epg_listings : [];
      renderEpg(epgData);
    });
  }

  function formatTime(dateStr, format) {
    let date;

    // Handle UNIX timestamp (seconds or ms) or string
    if (!isNaN(dateStr)) {
      const ts = dateStr.toString().length === 10 ? dateStr * 1000 : dateStr;
      date = new Date(parseInt(ts));
    } else {
      date = new Date(dateStr);
    }

    if (isNaN(date)) return dateStr; // fallback if invalid

    // Use Intl.DateTimeFormat for proper local timezone formatting
    const options =
      format === "12hrs"
        ? {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }
        : {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
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
          <p class="livetv-player-epg-title">
            ${startTime} - ${endTime} ${decodeBase64(epg.title) || "Untitled"}
          </p>
          <p class="livetv-player-epg-description">
            ${decodeBase64(epg.description) || "No description available"}
          </p>
        </div>
      `;
      })
      .join("");
  }

  function updateVolume(direction) {
    try {
      if (typeof tizen !== "undefined" && tizen.tvaudiocontrol) {
        let vol = tizen.tvaudiocontrol.getVolume();
        // Always increment/decrement by 1
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
          hideMuteIcon();
        } else {
          tizen.tvaudiocontrol.setMute(true);
          showMuteIcon();
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

  function togglePlayPause() {
    const videoEl = document.getElementById(id);
    if (!videoEl) return;

    try {
      // Native HTML5 video
      if (videoEl.paused) {
        videoEl.play();
        updatePlayPauseIcon(true);
      } else {
        videoEl.pause();
        updatePlayPauseIcon(false);
      }
    } catch (err) {
      console.warn("Play/Pause toggle failed:", err);
    }
  }

  function handlePlayPauseClick(event) {
    if (!event) return;
    event.preventDefault();
    event.stopPropagation();
    wakeClickControls();
    togglePlayPause();
  }

  function updatePlayPauseIcon(isPlaying) {
    const playPauseIcon = document.querySelector(".play-pause-icon i");
    if (playPauseIcon) {
      if (isPlaying) {
        playPauseIcon.className = "fa-solid fa-pause";
      } else {
        playPauseIcon.className = "fa-solid fa-play";
      }
    }
  }

  function syncPlayPauseIconFromMedia(videoEl) {
    if (!videoEl) return;

    const isPlaying = !videoEl.paused && !videoEl.ended && !videoEl.error;
    updatePlayPauseIcon(isPlaying);
  }

  // Function to update aspect ratio button visibility
  function updateAspectRatioButtonVisibility() {
    const aspectRatioBtn = document.querySelector(".videojs-aspect-ratio-div");
    const loadingEl = document.querySelector(".live-video-loader");
    const errorEl = document.querySelector(".live-video-error");

    if (aspectRatioBtn) {
      // Hide aspect ratio button when loader is visible or error is visible
      const shouldHide =
        (loadingEl && !loadingEl.classList.contains("hidden")) ||
        (errorEl && !errorEl.classList.contains("hidden"));
      aspectRatioBtn.style.display = shouldHide ? "none" : "block";
    }
  }

  function isFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  function setFullscreenControlsVisible(visible) {
    const playPauseIcon = document.querySelector(".play-pause-icon");
    const aspectRatioWrap = document.querySelector(".videojs-aspect-ratio-div");
    const aspectRatioBtn = document.getElementById("videojs-aspect-ratio");
    const fullscreenBtn = document.getElementById("lp-fullscreen-btn");
    const shouldShow = visible && !isPlayerOverlayBlockingControls();
    const isFs = isFullscreenActive();

    if (playPauseIcon) {
      playPauseIcon.style.display = shouldShow ? "flex" : "none";
    }

    if (aspectRatioWrap) {
      // Aspect ratio should be visible only in fullscreen mode.
      aspectRatioWrap.style.display = shouldShow && isFs ? "block" : "none";
    }

    if (aspectRatioBtn) {
      aspectRatioBtn.style.display =
        shouldShow && isFs ? "inline-flex" : "none";
    }

    if (fullscreenBtn) {
      fullscreenBtn.style.display = shouldShow && !isFs ? "flex" : "none";
    }

    if (shouldShow) {
      updateAspectRatioButtonVisibility();
    }
  }

  function wakeFullscreenControls() {
    if (!isFullscreenActive()) return;

    setFullscreenControlsVisible(true);

    clearTimeout(window._liveFullscreenControlsTimer);
    window._liveFullscreenControlsTimer = setTimeout(() => {
      if (isFullscreenActive()) {
        setFullscreenControlsVisible(false);
      }
    }, 5000);
  }

  function wakeClickControls() {
    const inFullscreen = isFullscreenActive();
    setFullscreenControlsVisible(true);

    clearTimeout(window._liveFullscreenControlsTimer);
    window._liveFullscreenControlsTimer = null;

    if (inFullscreen) {
      window._liveFullscreenControlsTimer = setTimeout(() => {
        if (isFullscreenActive()) {
          setFullscreenControlsVisible(false);
        }
      }, 5000);
    }
  }

  // If no URL is provided
  if (!srcUrl || srcUrl.trim() === "") {
    return `
      <div class="live-video-player live-video-player-div" style="width:100%; aspect-ratio:16 / 9; height:auto; overflow:hidden; position:relative;">
        <div class="live-no-url-message">
          <div class="no-url-icon">📺</div>
          <p class="no-url-text">Please select any channel to play</p>
        </div>
        <video id="${id}" playsinline webkit-playsinline style="height:100%; width:100%; display:none;"></video>
      </div>
      <div class="livetv-player-epg"  style="display: none;">
        <div class="livetv-player-epg-item">
          <p class="livetv-player-epg-title">No EPG Found</p>
          <p class="livetv-player-epg-description">No EPG data available</p>
        </div>
      </div>
    `;
  }

  setTimeout(() => {
    const existingVideo = document.getElementById(id);
    if (existingVideo) {
      try {
        existingVideo.pause();
        existingVideo.removeAttribute("src");
        existingVideo.load();
      } catch {}
    }

    if (window.livePlayer) {
      try {
        if (typeof window.livePlayer.pause === "function") {
          window.livePlayer.pause();
        }
      } catch {}
      window.livePlayer = null;
    }

    const loadingEl = document.querySelector(".live-video-loader");
    const errorEl = document.querySelector(".live-video-error");

    if (loadingEl) loadingEl.classList.add("hidden");
    if (errorEl) errorEl.classList.add("hidden");
    playbackErrorActive = false;
    updateAspectRatioButtonVisibility();

    const videoEl = document.getElementById(id);
    if (!videoEl) return;

    videoEl.src = srcUrl;
    videoEl.autoplay = true;
    videoEl.preload = "auto";
    videoEl.playsInline = true;
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("webkit-playsinline", "");
    videoEl.removeAttribute("poster");
    videoEl.style.backgroundColor = "black";
    videoEl.style.objectFit = "contain";
    videoEl.load();

    window.livePlayer = videoEl;
    window.livePlayer.togglePlayPause = togglePlayPause;
    resetManualAspectRatio();
    syncPlayerLayout(isFullscreenActive());

    const startPlayback = () => {
      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((err) => {
          console.warn("Initial play() failed:", err);
          syncLoaderFromMedia(videoEl);
        });
      }
    };

    const handleNativePlaying = () => {
      clearPlaybackError();
      syncLoaderFromMedia(videoEl);
      syncPlayPauseIconFromMedia(videoEl);

      setTimeout(() => {
        const topOverlays = document.querySelector(".live-top-overlays");
        if (topOverlays) {
          topOverlays.style.opacity = "0";
          topOverlays.style.transition = "opacity 0.5s ease";
        }
      }, 5000);
    };

    const handleNativePause = () => {
      clearPlaybackError();
      syncLoaderFromMedia(videoEl);
      syncPlayPauseIconFromMedia(videoEl);
    };

    const handleNativePlay = () => {
      clearPlaybackError();
      syncLoaderFromMedia(videoEl);
      syncPlayPauseIconFromMedia(videoEl);
    };

    const handleNativeError = () => {
      showPlaybackError();
    };

    const nativeMediaEventHandlers = [
      [
        "loadstart",
        () => {
          clearPlaybackError();
          setOverlayState({
            loading: true,
            error: false,
          });
          syncPlayPauseIconFromMedia(videoEl);
        },
      ],
      [
        "waiting",
        () => {
          clearPlaybackError();
          setOverlayState({
            loading: true,
            error: false,
          });
        },
      ],
      [
        "stalled",
        () => {
          clearPlaybackError();
          setOverlayState({
            loading: true,
            error: false,
          });
        },
      ],
      [
        "seeking",
        () => {
          clearPlaybackError();
          setOverlayState({
            loading: true,
            error: false,
          });
        },
      ],
      [
        "loadedmetadata",
        () => {
          clearPlaybackError();
          syncLoaderFromMedia(videoEl);
        },
      ],
      [
        "loadeddata",
        () => {
          clearPlaybackError();
          syncLoaderFromMedia(videoEl);
        },
      ],
      [
        "canplay",
        () => {
          clearPlaybackError();
          syncLoaderFromMedia(videoEl);
        },
      ],
      [
        "canplaythrough",
        () => {
          clearPlaybackError();
          syncLoaderFromMedia(videoEl);
        },
      ],
      [
        "seeked",
        () => {
          clearPlaybackError();
          syncLoaderFromMedia(videoEl);
        },
      ],
      [
        "timeupdate",
        () => {
          clearPlaybackError();
          syncLoaderFromMedia(videoEl);
        },
      ],
      ["playing", handleNativePlaying],
      ["play", handleNativePlay],
      ["pause", handleNativePause],
      ["error", handleNativeError],
    ];

    nativeMediaEventHandlers.forEach(([eventName, handler]) => {
      videoEl.addEventListener(eventName, handler);
      nativeVideoEventCleanup.push(() => {
        videoEl.removeEventListener(eventName, handler);
      });
    });

    syncLoaderFromMedia(videoEl);
    startPlayback();
    syncPlayPauseIconFromMedia(videoEl);

    const retryBtn = document.querySelector(".retry-btn");
    if (retryBtn) {
      retryClickHandler = () => {
        clearPlaybackError();
        setOverlayState({
          loading: true,
          error: false,
        });
        videoEl.src = srcUrl;
        videoEl.load();
        videoEl.play().catch((err) => {
          console.warn("Retry play() failed:", err);
          syncLoaderFromMedia(videoEl);
        });
      };
      retryBtn.addEventListener("click", retryClickHandler);
    }

    const fullscreenBtn = document.getElementById("lp-fullscreen-btn");
    if (fullscreenBtn) {
      fullscreenClickHandler = () => {
        const playerContainer = document.querySelector(
          ".live-video-player-div",
        );

        const isFs =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement;

        if (!isFs) {
          if (playerContainer.requestFullscreen) {
            playerContainer.requestFullscreen();
          } else if (playerContainer.webkitRequestFullscreen) {
            playerContainer.webkitRequestFullscreen();
          } else if (playerContainer.msRequestFullscreen) {
            playerContainer.msRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          } else if (document.webkitCancelFullScreen) {
            document.webkitCancelFullScreen();
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
          }
        }
      };
      fullscreenBtn.addEventListener("click", fullscreenClickHandler);
    }

    const handleFullscreenChange = () => {
      const channelNameEl = document.querySelector(".live-channel-name");
      const liveBadgeEl = document.querySelector(".live-badge");
      const isFs = isFullscreenActive();
      if (channelNameEl) channelNameEl.style.display = isFs ? "none" : "flex";
      if (liveBadgeEl) liveBadgeEl.style.display = "flex";

      if (isFs) {
        syncPlayerLayout(true);
        wakeFullscreenControls();
      } else {
        clearTimeout(window._liveFullscreenControlsTimer);
        window._liveFullscreenControlsTimer = null;
        syncPlayerLayout(false);
        setFullscreenControlsVisible(true);
      }
    };

    fullscreenChangeHandler = handleFullscreenChange;
    document.addEventListener("fullscreenchange", fullscreenChangeHandler);
    document.addEventListener(
      "webkitfullscreenchange",
      fullscreenChangeHandler,
    );
    document.addEventListener("mozfullscreenchange", fullscreenChangeHandler);
    document.addEventListener("MSFullscreenChange", fullscreenChangeHandler);
    handleFullscreenChange();

    const backKeyExitFullscreen = (e) => {
      let isBack = false;
      if (typeof window !== "undefined" && window.isBackKey) {
        isBack = window.isBackKey(e);
      } else if (typeof isBackKey === "function") {
        isBack = isBackKey(e);
      } else {
        const k = e.keyCode || e.which;
        isBack = k === 10009 || k === 461 || k === 8 || k === 27;
      }

      if (isBack) {
        const isFs =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement;

        if (isFs) {
          e.preventDefault();
          e.stopImmediatePropagation();

          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          } else if (document.webkitCancelFullScreen) {
            document.webkitCancelFullScreen();
          } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
          }
        }
      }
    };

    videoEl.addEventListener("keydown", backKeyExitFullscreen);
    const playerDiv = document.querySelector(".live-video-player-div");
    if (playerDiv) {
      playerDiv.addEventListener("keydown", backKeyExitFullscreen);
    }

    const prevBtn = document.getElementById("live-prev-btn");
    const nextBtn = document.getElementById("live-next-btn");

    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        const event = new CustomEvent("liveChannelChange", {
          detail: {
            direction: "prev",
          },
        });
        document.dispatchEvent(event);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const event = new CustomEvent("liveChannelChange", {
          detail: {
            direction: "next",
          },
        });
        document.dispatchEvent(event);
      });
    }

    if (window._liveTvVolumeHandler) {
      document.removeEventListener("keydown", window._liveTvVolumeHandler);
    }

    window._liveTvVolumeHandler = (e) => {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;

      if (isFullscreenActive()) {
        wakeFullscreenControls();
      }

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
        case 10252:
        case 13: // Enter
          togglePlayPause();
          e.preventDefault();
          break;
      }
    };

    document.addEventListener("keydown", window._liveTvVolumeHandler);

    const livePlayerDiv = document.querySelector(".live-video-player-div");
    if (livePlayerDiv) {
      playerContainerClickHandler = (event) => {
        if (localStorage.getItem("currentPage") !== "liveTvPage") return;
        wakeClickControls();

        const clickedPlayPause = event.target.closest(".play-pause-icon");
        const clickedControl = event.target.closest(
          ".play-pause-icon, #lp-fullscreen-btn, #videojs-aspect-ratio, .retry-btn",
        );
        if (
          clickedPlayPause ||
          clickedControl ||
          isPlayerOverlayBlockingControls()
        ) {
          return;
        }

        togglePlayPause();
      };
      livePlayerDiv.addEventListener("click", playerContainerClickHandler);
    }

    // Add click event listener for play/pause icon
    const playPauseIcon = document.querySelector(".play-pause-icon");
    if (playPauseIcon) {
      playPauseClickHandler = handlePlayPauseClick;
      playPauseIcon.addEventListener("click", playPauseClickHandler);
    }

    const handleAspectRatioChange = () => {
      const newLabel = cycleManualAspectRatio();
      if (
        newLabel &&
        window.VideoAspectRatio &&
        window.VideoAspectRatio.showOverlay
      ) {
        window.VideoAspectRatio.showOverlay(newLabel);
      } else {
        console.warn(
          "Aspect ratio handler: No video element or VideoAspectRatio module found",
        );
      }
    };

    const aspectRatioButton = document.getElementById("videojs-aspect-ratio");
    if (aspectRatioButton) {
      aspectRatioChangeHandler = handleAspectRatioChange;
      aspectRatioButton.addEventListener("click", aspectRatioChangeHandler);
      console.log("Aspect ratio button event listener attached");
    }
    // Watchdog timer to ensure player is disposed when not on LivePage
    if (window._livePlayerWatchdog) clearInterval(window._livePlayerWatchdog);
    window._livePlayerWatchdog = setInterval(() => {
      const currentPage = localStorage.getItem("currentPage");
      const sidebarPage = localStorage.getItem("sidebarPage");
      const isLivePage =
        currentPage === "liveTvPage" ||
        (currentPage === "sidebar" && sidebarPage === "liveTvPage") ||
        (currentPage === "sortingDialog" && sidebarPage === "liveTvPage");

      if (!isLivePage) {
        if (LiveVideoJsComponent.cleanup) {
          console.log(
            "Watchdog: Navigated away from LivePage, cleaning up player...",
          );
          LiveVideoJsComponent.cleanup();
        }
      }
    }, 1000);
  }, 50);

  // Add cleanup function to dispose player when component is not open
  LiveVideoJsComponent.cleanup = function () {
    // Clear watchdog timer
    if (window._livePlayerWatchdog) {
      clearInterval(window._livePlayerWatchdog);
      window._livePlayerWatchdog = null;
    }

    // Clean up volume event listener
    if (window._liveTvVolumeHandler) {
      document.removeEventListener("keydown", window._liveTvVolumeHandler);
      window._liveTvVolumeHandler = null;
    }
    const aspectRatioButton = document.getElementById("videojs-aspect-ratio");
    if (aspectRatioButton && aspectRatioChangeHandler) {
      aspectRatioButton.removeEventListener("click", aspectRatioChangeHandler);
    }

    nativeVideoEventCleanup.forEach((cleanupFn) => {
      try {
        cleanupFn();
      } catch (err) {
        console.warn("Native video listener cleanup error:", err);
      }
    });
    nativeVideoEventCleanup = [];

    // Clean up the native video element
    const videoEl = document.getElementById(id);
    if (videoEl) {
      try {
        videoEl.pause();
        videoEl.removeAttribute("src");
        videoEl.load();
      } catch (err) {
        console.warn("LiveVideoJsComponent video cleanup error:", err);
      }
    }

    window.livePlayer = null;

    // Clean up event listeners
    try {
      if (fullscreenChangeHandler) {
        document.removeEventListener(
          "fullscreenchange",
          fullscreenChangeHandler,
        );
        document.removeEventListener(
          "webkitfullscreenchange",
          fullscreenChangeHandler,
        );
        document.removeEventListener(
          "mozfullscreenchange",
          fullscreenChangeHandler,
        );
        document.removeEventListener(
          "MSFullscreenChange",
          fullscreenChangeHandler,
        );
      }

      const playPauseIcon = document.querySelector(".play-pause-icon");
      if (playPauseIcon && playPauseClickHandler) {
        playPauseIcon.removeEventListener("click", playPauseClickHandler);
      }

      const fullscreenBtn = document.getElementById("lp-fullscreen-btn");
      if (fullscreenBtn && fullscreenClickHandler) {
        fullscreenBtn.removeEventListener("click", fullscreenClickHandler);
      }

      const retryBtn = document.querySelector(".retry-btn");
      if (retryBtn && retryClickHandler) {
        retryBtn.removeEventListener("click", retryClickHandler);
      }

      const livePlayerDiv = document.querySelector(".live-video-player-div");
      if (livePlayerDiv && playerContainerClickHandler) {
        livePlayerDiv.removeEventListener("click", playerContainerClickHandler);
      }
    } catch (err) {
      console.warn("Event listener cleanup error:", err);
    }

    // Reset volume handler flag
    window._liveTvVolumeHandlerAttached = false;
    clearTimeout(window._liveFullscreenControlsTimer);
    window._liveFullscreenControlsTimer = null;
  };

  return `
  <div class="livetvPlayer-main-container">
    <div class="live-video-player live-video-player-div" style="width:100%; aspect-ratio:16 / 9; height:auto; overflow: hidden; position: relative;">
      <div class="videojs-aspect-ratio-div">
        <button id="videojs-aspect-ratio" style="display:none;" class="videojs-aspect-ratio-btn"><i class="fa-solid fa-compress" style="color:white"></i>Aspect Ratio </button>
      </div>
      <div class="play-pause-icon" >
        <i class="fa-solid fa-play"></i>

      </div>
      <div class="live-top-overlays">
        <div class="live-channel-name">${channelName || ""}</div>
        <div class="live-badge">LIVE</div>
      </div>
      <div class="live-video-loader hidden"><div class="live-spinner"></div></div>
      <div class="live-video-error hidden">
        <div class="error-icon">⚠️</div>
        <p>Failed to load video</p>
        <!-- <button class="retry-btn">Retry</button> -->
      </div>
      <div class="live-video-controls">
        <div id="lp-fullscreen-btn" class="lp-fullscreen-btn" style="display:none;">
          <i class="fa-sharp fa-solid fa-expand lp-fullscreen-icon" style="color:var(--app-text-color)"></i>
        </div>
      </div>
      <video
        id="${id}"
        playsinline
        webkit-playsinline
        preload="auto"
        autoplay
        src="${srcUrl}"
        style="height:100%; width:100%; background:black; object-fit:contain;"
      ></video>

          <div id="aspectRatioOverlay" class="aspect-ratio-overlay "></div>

    </div>
          <div class="livetv-player-epg" style="display: none;">
        <div class="livetv-player-epg-item">
          <p class="livetv-player-epg-title">Loading EPG...</p>
        </div>
      </div>
    </div>
  `;
}
