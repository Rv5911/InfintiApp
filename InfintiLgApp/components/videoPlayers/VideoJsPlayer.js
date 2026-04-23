function VideoJsPlayer(poster = "") {
  const srcUrl =
    window.selectedVideoItemUrl ||
    localStorage.getItem("selectedVideoItemUrl") ||
    "";

  let isYouTube = srcUrl.includes("youtube.com") || srcUrl.includes("youtu.be");
  const isWebOS = typeof webOS !== "undefined";
  const useWebOSVideoTag = isWebOS;
  const useWebOSNativePlayer = useWebOSVideoTag && !isYouTube;

  const previousCleanup = VideoJsPlayer.cleanup;
  if (previousCleanup) {
    // Use setTimeout to ensure cleanup happens after current execution
    setTimeout(() => {
      try {
        previousCleanup();
      } catch (err) {
        console.warn("Previous cleanup error:", err);
      }
    }, 0);
  }

  const fromValue = localStorage.getItem("from");
  const playingItemData =
    JSON.parse(localStorage.getItem("playingItemData")) || {};
  const titleText = playingItemData.title || playingItemData.name;

  const currentPlaylistName = JSON.parse(
    localStorage.getItem("selectedPlaylist"),
  ).playlistName;
  const currentPlaylist = JSON.parse(
    localStorage.getItem("playlistsData"),
  ).filter((pl) => pl.playlistName === currentPlaylistName)[0];

  const continueWatchingMoviesData = currentPlaylist.continueWatchingMovies
    ? currentPlaylist.continueWatchingMovies
    : [];
  const continueWatchingSeriesData = currentPlaylist.continueWatchingSeries
    ? currentPlaylist.continueWatchingSeries
    : [];

  const isLive = localStorage.getItem("isLive") === "true";

  let player = null;
  let playbackVideoElement = null;
  let overlayTimeout;
  let errorActive = false;
  let currentTimeEl = null;
  let durationEl = null;
  let lastKnownPlaybackTime = 0;
  let lastKnownPlaybackDuration = 0;
  let shouldAutoPlayAfterBuffering = false;

  // 🔴 Track focus states
  let isSeekBarFocused = false;
  let isPlayPauseFocused = true;
  let isAspectRatioFocused = false;

  // 🔴 Track if user is actively dragging seek bar
  let isSeekBarDragging = false;

  // 🔴 Track play state before seeking
  let wasPlayingBeforeSeek = false;

  // 🔴 Track if user manually paused
  let userManuallyPaused = false;

  // 🔴 Debouncing variables for seek operations
  let pendingSeekTimeout = null;
  let accumulatedSeekOffset = 0;
  let lastSeekTime = 0;
  let pendingResumeTimeout = null;
  let pendingResumeTime = 0;
  let resumeTimeApplied = false;
  let resumeSeekRetryTimeout = null;

  // 🔴 Track if video has started playing for the first time
  let hasStartedPlayingOnce = false;

  // 🔴 Timeout for hiding controls
  let controlsHideTimeout = null;

  // Format time function
  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00:00";

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins < 10 ? "0" : ""}${mins}:${
        secs < 10 ? "0" : ""
      }${secs}`;
    } else {
      return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    }
  }

  function getPlaybackVideoElement() {
    return useWebOSNativePlayer
      ? document.getElementById("videojs-player-tag")
      : document.querySelector("#videojs-player-tag_html5_api") ||
          document.getElementById("videojs-player-tag");
  }

  function createWebOSNativePlayer(videoElement) {
    const listeners = [];

    const nativePlayer = {
      on(eventName, handler) {
        videoElement.addEventListener(eventName, handler);
        listeners.push({ eventName, handler });
        return nativePlayer;
      },
      off(eventName, handler) {
        videoElement.removeEventListener(eventName, handler);
      },
      paused() {
        return !!videoElement.paused;
      },
      play() {
        return videoElement.play();
      },
      pause() {
        return videoElement.pause();
      },
      currentTime(value) {
        if (typeof value === "number") {
          videoElement.currentTime = value;
        }
        return videoElement.currentTime || 0;
      },
      duration() {
        return Number.isFinite(videoElement.duration) ? videoElement.duration : 0;
      },
      buffered() {
        return videoElement.buffered || { length: 0 };
      },
      seeking() {
        return !!videoElement.seeking;
      },
      error() {
        return videoElement.error || null;
      },
      dispose() {
        listeners.splice(0).forEach(({ eventName, handler }) => {
          videoElement.removeEventListener(eventName, handler);
        });
        try {
          videoElement.pause();
        } catch (err) {
          console.warn("Native player pause error during dispose:", err);
        }
      },
    };

    return nativePlayer;
  }

  function getMediaErrorMessage(mediaError) {
    if (!mediaError) return "Something went wrong";

    switch (mediaError.code) {
      case 1:
        return "Playback was interrupted";
      case 2:
        return "A network error occurred while loading the video";
      case 3:
        return "The video could not be decoded";
      case 4:
        return "The video format is not supported";
      default:
        return mediaError.message || `Error Code: ${mediaError.code}`;
    }
  }

  function isGenuineNativeMediaError(mediaError) {
    return !!mediaError && typeof mediaError.code === "number" && mediaError.code !== 1;
  }

  function hasAnyControlFocused() {
    return isSeekBarFocused || isAspectRatioFocused;
  }

  function updateLastKnownPlaybackProgress() {
    const videoEl = playbackVideoElement || getPlaybackVideoElement();
    if (!videoEl) return;

    const currentTime = Number(videoEl.currentTime);
    const duration = Number(videoEl.duration);

    if (Number.isFinite(currentTime) && currentTime >= 0) {
      lastKnownPlaybackTime = currentTime;
    }

    if (Number.isFinite(duration) && duration > 0) {
      lastKnownPlaybackDuration = duration;
    }
  }

  function getPlaybackProgress() {
    let currentTime = lastKnownPlaybackTime;
    let duration = lastKnownPlaybackDuration;

    try {
      if (player && typeof player.currentTime === "function") {
        const playerCurrentTime = Number(player.currentTime());
        if (Number.isFinite(playerCurrentTime) && playerCurrentTime >= 0) {
          currentTime = playerCurrentTime;
        }
      }
      if (player && typeof player.duration === "function") {
        const playerDuration = Number(player.duration());
        if (Number.isFinite(playerDuration) && playerDuration > 0) {
          duration = playerDuration;
        }
      }
    } catch (err) {
      // Fall back to the cached/native element values below.
    }

    const videoEl = playbackVideoElement || getPlaybackVideoElement();
    if (videoEl) {
      const elementCurrentTime = Number(videoEl.currentTime);
      const elementDuration = Number(videoEl.duration);

      if (Number.isFinite(elementCurrentTime) && elementCurrentTime >= 0) {
        currentTime = elementCurrentTime;
      }

      if (Number.isFinite(elementDuration) && elementDuration > 0) {
        duration = elementDuration;
      }
    }

    return { currentTime, duration };
  }

  function hidePlaybackOverlays() {
    const playOverlay = document.querySelector(".video-action-overlay.center");
    const forwardOverlay = document.querySelector(".video-action-overlay.right");
    const backwardOverlay = document.querySelector(".video-action-overlay.left");

    [playOverlay, forwardOverlay, backwardOverlay].forEach((overlay) => {
      if (overlay) overlay.classList.add("hidden");
    });
  }

  function showLoadingState() {
    const loadingEl = document.querySelector(".video-buffer-loader");
    
    // Don't show loader if player is paused (user manually paused) AND not seeking
    if (player && userManuallyPaused && !player.seeking()) {
      if (loadingEl) loadingEl.classList.add("hidden");
      return;
    }

    if (loadingEl) {
      loadingEl.classList.remove("hidden");
    }
    hidePlaybackOverlays();
  }

  function clearResumeSeekRetry() {
    if (resumeSeekRetryTimeout) {
      clearTimeout(resumeSeekRetryTimeout);
      resumeSeekRetryTimeout = null;
    }
  }

  function applyResumeTimeToPlayback() {
    if (!pendingResumeTime || resumeTimeApplied || errorActive) return false;

    const playbackTarget =
      useWebOSNativePlayer && playbackVideoElement ? playbackVideoElement : player;
    if (!playbackTarget || typeof playbackTarget.currentTime !== "function") {
      return false;
    }

    const targetDuration =
      typeof playbackTarget.duration === "function"
        ? Number(playbackTarget.duration())
        : Number(playbackTarget.duration);
    const targetReadyState =
      playbackTarget.readyState != null ? playbackTarget.readyState : 0;

    if (
      useWebOSNativePlayer &&
      (targetReadyState < 1 || !Number.isFinite(targetDuration) || targetDuration <= 0)
    ) {
      return false;
    }

    try {
      if (pendingResumeTime < targetDuration || !Number.isFinite(targetDuration)) {
        playbackTarget.currentTime(pendingResumeTime);
        pendingResumeTime = 0;
        resumeTimeApplied = true;
        clearResumeSeekRetry();
        updateLastKnownPlaybackProgress();
        return true;
      }
    } catch (err) {
      console.log("Resume seek application failed:", err);
    }

    return false;
  }

  function scheduleResumeSeekRetry() {
    if (!pendingResumeTime || resumeTimeApplied || errorActive) return;
    clearResumeSeekRetry();
    resumeSeekRetryTimeout = setTimeout(() => {
      const applied = applyResumeTimeToPlayback();
      if (!applied) {
        scheduleResumeSeekRetry();
      }
    }, 250);
  }

  function showControls() {
    const controlsBar = document.querySelector(".custom-video-controls");
    const titleBar = document.querySelector(".video-title-bar");
    if (controlsBar) controlsBar.classList.remove("hidden");
    if (titleBar) {
      titleBar.style.display = "flex";
      titleBar.classList.remove("hidden");
    }
    if (controlsHideTimeout) {
      clearTimeout(controlsHideTimeout);
      controlsHideTimeout = null;
    }
    hideControlsWithDelay(5000);
  }

  // Show controls on any arrow interaction and default focus to Play/Pause
  function showControlsAndDefaultFocus() {
    const controlsBar = document.querySelector(".custom-video-controls");
    const wasHidden = !controlsBar || controlsBar.classList.contains("hidden");
    showControls();

    // Only snap to play/pause when controls were hidden or nothing is focused.
    // This keeps seek/aspect ratio navigation from getting overridden.
    if (wasHidden || !hasAnyControlFocused()) {
      focusPlayPause();
    }
  }

  function hideControlsWithDelay(delay = 5000) {
    if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
    controlsHideTimeout = setTimeout(() => {
      // Hide controls after inactivity unless we're in an error state
      if (player && !errorActive) {
        const controlsBar = document.querySelector(".custom-video-controls");
        const titleBar = document.querySelector(".video-title-bar");
        const overlays = document.querySelectorAll(".video-action-overlay");

        if (controlsBar) controlsBar.classList.add("hidden");
        if (titleBar) {
          titleBar.style.display = "none";
          titleBar.classList.add("hidden");
        }

        // Hide all action overlays
        overlays.forEach((overlay) => overlay.classList.add("hidden"));

        // Clear all focus states and visual focus borders
        unfocusAll();
      }
    }, delay);
  }

  // 🔴 Debounced seek function to prevent buffer overload on low-RAM devices
  function debouncedSeek(offset) {
    showControls(); // Show controls immediately when seeking requested
    const shouldPauseDuringSeek = !useWebOSNativePlayer;

    // Clear any pending seek operation
    if (pendingSeekTimeout) {
      clearTimeout(pendingSeekTimeout);
      pendingSeekTimeout = null;
    }

    // Clear any pending resume timeout
    if (pendingResumeTimeout) {
      clearTimeout(pendingResumeTimeout);
      pendingResumeTimeout = null;
    }

    // Accumulate the seek offset
    accumulatedSeekOffset += offset;

    // Store play state before seeking (only once per seek session)
    const isFirstSeek = pendingSeekTimeout === null;
    if (isFirstSeek) {
      wasPlayingBeforeSeek = !player.paused();
      if (shouldPauseDuringSeek && wasPlayingBeforeSeek && !userManuallyPaused) {
        player.pause();
      }
    }

    // 🔴 IMMEDIATELY update seek bar for smooth visual feedback
    const seekBar = document.getElementById("customSeek");

    // Show loading indicator immediately when seeking starts
    showLoadingState();

    // Hide center play/pause overlay during seeking
    const playOverlay = document.querySelector(".video-action-overlay.center");
    if (playOverlay) {
      playOverlay.classList.add("hidden");
    }

    if (useWebOSNativePlayer) {
      const forwardOverlay = document.querySelector(".video-action-overlay.right");
      const backwardOverlay = document.querySelector(".video-action-overlay.left");
      [forwardOverlay, backwardOverlay].forEach((el) => {
        if (el) el.classList.add("hidden");
      });
    }

    if (seekBar && player && player.currentTime) {
      try {
        const currentTime = player.currentTime();
        const duration = player.duration();
        const newTime = Math.max(
          0,
          Math.min(duration, currentTime + accumulatedSeekOffset),
        );
        seekBar.value = newTime;

        // Update time display immediately too
        if (currentTimeEl) {
          currentTimeEl.textContent = formatTime(newTime);
        }

        // Update seek bar background gradient
        const percent = (newTime / duration) * 100;
        let bufferedPercent = 0;
        if (player.buffered().length > 0) {
          bufferedPercent =
            (player.buffered().end(player.buffered().length - 1) / duration) *
            100;
        }
        seekBar.style.background = `linear-gradient(to right,
          var(--gold) 0%, var(--gold) ${percent}%,
          rgba(255, 255, 255, 0.4) ${percent}%, rgba(255, 255, 255, 0.4) ${bufferedPercent}%,
          rgba(255, 255, 255, 0.15) ${bufferedPercent}%, rgba(255, 255, 255, 0.15) 100%)`;
      } catch (err) {
        // Ignore errors during immediate update
      }
    }

    // Set a new timeout to execute the seek after 300ms of no input
    pendingSeekTimeout = setTimeout(() => {
      if (!player || !player.currentTime || errorActive) {
        accumulatedSeekOffset = 0;
        return;
      }

      try {
        const currentTime = player.currentTime();
        const duration = player.duration();
        const newTime = Math.max(
          0,
          Math.min(duration, currentTime + accumulatedSeekOffset),
        );

        // Execute the accumulated seek
        player.currentTime(newTime);

        // Update seek bar
        const seekBar = document.getElementById("customSeek");
        if (seekBar) {
          seekBar.value = newTime;
        }

        // Show appropriate overlay
        if (!useWebOSNativePlayer) {
          if (accumulatedSeekOffset > 0) {
            showOverlay("forward");
          } else if (accumulatedSeekOffset < 0) {
            showOverlay("backward");
          }
        }

        // Reset accumulated offset
        accumulatedSeekOffset = 0;

        // Resume playback if it was playing before
        if (
          shouldPauseDuringSeek &&
          wasPlayingBeforeSeek &&
          !userManuallyPaused
        ) {
          pendingResumeTimeout = setTimeout(() => {
            player.play().catch((err) => {
              console.log("Resume after debounced seek failed:", err);
            });
          }, 200);
        }
      } catch (err) {
        console.warn("Debounced seek error:", err);
        accumulatedSeekOffset = 0;
      }

      pendingSeekTimeout = null;
    }, 300); // Wait 300ms after last input before executing seek
  }

  function updateVolume(direction) {
    if (typeof window.tizen !== "undefined" && window.tizen.tvaudiocontrol) {
      let currentVolume = window.tizen.tvaudiocontrol.getVolume();
      if (direction === "up") {
        currentVolume = Math.min(currentVolume + 1, 100);
      } else if (direction === "down") {
        currentVolume = Math.max(currentVolume - 1, 0);
      }
      window.tizen.tvaudiocontrol.setVolume(currentVolume);
      showVolumeDisplay(currentVolume);
    }
  }

  function toggleMute() {
    if (typeof window.tizen !== "undefined" && window.tizen.tvaudiocontrol) {
      const isMuted =
        window.tizen.tvaudiocontrol.isMute &&
        window.tizen.tvaudiocontrol.isMute();
      window.tizen.tvaudiocontrol.setMute(!isMuted);
    }
  }

  function showVolumeDisplay(volume) {
    let volDisplay = document.getElementById("volumeDisplay");
    if (!volDisplay) {
      volDisplay = document.createElement("div");
      volDisplay.id = "volumeDisplay";
      volDisplay.className = "volume-display";
      document.body.appendChild(volDisplay);
    }
    volDisplay.innerText = "Volume: " + volume;
    volDisplay.style.display = "block";

    clearTimeout(window._volDisplayTimeout);
    window._volDisplayTimeout = setTimeout(() => {
      volDisplay.style.display = "none";
    }, 1200);
  }

  function showMuteIcon() {
    let muteIcon = document.getElementById("muteIcon");
    if (!muteIcon) {
      muteIcon = document.createElement("div");
      muteIcon.id = "muteIcon";
      muteIcon.className = "mute-icon";
      muteIcon.innerHTML = `<i class="fa-solid fa-volume-xmark"></i>`;
      document.body.appendChild(muteIcon);
    }
    muteIcon.style.display = "block";
  }

  function hideMuteIcon() {
    const muteIcon = document.getElementById("muteIcon");
    if (muteIcon) muteIcon.style.display = "none";
  }

  function showOverlay(type) {
    if (errorActive) return;

    const playOverlay = document.querySelector(".video-action-overlay.center");
    const forwardOverlay = document.querySelector(
      ".video-action-overlay.right",
    );
    const backwardOverlay = document.querySelector(
      ".video-action-overlay.left",
    );

    // If showing seek overlay, DON'T hide center play/pause ONLY if it's currently focused
    // This allows the focus border to remain visible while seeking
    if (type === "forward" || type === "backward") {
      if (forwardOverlay) forwardOverlay.classList.add("hidden");
      if (backwardOverlay) backwardOverlay.classList.add("hidden");

      if (playOverlay && !isPlayPauseFocused) {
        playOverlay.classList.add("hidden");
      }
    } else {
      // If showing center overlay, hide everything first
      [playOverlay, forwardOverlay, backwardOverlay].forEach((el) => {
        if (el) el.classList.add("hidden");
      });
    }

    let targetOverlay = null;

    switch (type) {
      case "play":
        if (playOverlay) {
          playOverlay.querySelector(".video-action-icon").innerHTML =
            `<i class="fa-solid fa-play"></i>`;
          targetOverlay = playOverlay;
        }
        break;
      case "pause":
        if (playOverlay) {
          playOverlay.querySelector(".video-action-icon").innerHTML =
            `<i class="fa-solid fa-pause"></i>`;
          targetOverlay = playOverlay;
        }
        break;
      case "forward":
        if (forwardOverlay) {
          forwardOverlay.querySelector(".video-action-icon").innerHTML =
            `<i class="fa-solid fa-rotate-right"></i>`;
          targetOverlay = forwardOverlay;
        }
        break;
      case "backward":
        if (backwardOverlay) {
          backwardOverlay.querySelector(".video-action-icon").innerHTML =
            `<i class="fa-solid fa-rotate-left"></i>`;
          targetOverlay = backwardOverlay;
        }
        break;
    }

    if (targetOverlay) {
      targetOverlay.classList.remove("hidden");

      clearTimeout(overlayTimeout);
      // Don't auto-hide pause overlay OR if something is focused
      // Only seek overlays and play overlay (when playing) should hide
      const isPlayButPlaying = type === "play" && player && !player.paused();

      if (
        (type === "forward" || type === "backward" || isPlayButPlaying) &&
        !targetOverlay.classList.contains("focused")
      ) {
        overlayTimeout = setTimeout(() => {
          targetOverlay.classList.add("hidden");
        }, 1000);
      }
    }
  }

  // 🔴 Function to focus on play/pause overlay with white border
  function focusPlayPause() {
    const playOverlay = document.querySelector(".video-action-overlay.center");
    const seekBar = document.getElementById("customSeek");
    const aspectRatioButton = document.getElementById("aspectRatioButton");

    if (playOverlay) {
      isPlayPauseFocused = true;
      isSeekBarFocused = false;
      isAspectRatioFocused = false;

      // Ensure it's visible and focused
      playOverlay.classList.remove("hidden");
      playOverlay.classList.add("focused");

      // Update icon based on player state
      if (player) {
        if (player.paused()) {
          showOverlay("pause");
        } else {
          showOverlay("play");
        }
      }

      // Remove focused class from seek bar and aspect ratio button
      if (seekBar) seekBar.classList.remove("focused");
      if (aspectRatioButton) {
        aspectRatioButton.classList.remove("focused");
        const icon = aspectRatioButton.querySelector("i");
        if (icon) icon.style.color = "white";
      }
    }
  }

  // 🔴 Function to focus on seek bar with red border
  function focusSeekBar() {
    const seekBar = document.getElementById("customSeek");
    const playOverlay = document.querySelector(".video-action-overlay.center");
    const aspectRatioButton = document.getElementById("aspectRatioButton");

    if (seekBar && playOverlay) {
      isSeekBarFocused = true;
      isPlayPauseFocused = false;
      isAspectRatioFocused = false;

      // Add focused class to seek bar and ensure controls visible
      showControls();
      seekBar.classList.add("focused");

      // Remove focused class from play overlay and aspect ratio button
      playOverlay.classList.remove("focused");
      if (aspectRatioButton) {
        aspectRatioButton.classList.remove("focused");
        const icon = aspectRatioButton.querySelector("i");
        if (icon) icon.style.color = "white";
      }
    }
  }

  // 🔴 Function to focus on aspect ratio button
  function focusAspectRatio() {
    const aspectRatioButton = document.getElementById("aspectRatioButton");
    const playOverlay = document.querySelector(".video-action-overlay.center");
    const seekBar = document.getElementById("customSeek");

    if (aspectRatioButton) {
      isAspectRatioFocused = true;
      isPlayPauseFocused = false;
      isSeekBarFocused = false;

      // Add focused class to aspect ratio button and ensure controls visible
      showControls();
      aspectRatioButton.classList.add("focused");
      const icon = aspectRatioButton.querySelector("i");
      if (icon) icon.style.color = "white";

      // Remove focused class from play overlay and seek bar
      if (playOverlay) playOverlay.classList.remove("focused");
      if (seekBar) seekBar.classList.remove("focused");
    }
  }

  // 🔴 Function to remove all focus
  function unfocusAll() {
    isSeekBarFocused = false;
    isPlayPauseFocused = false;
    isAspectRatioFocused = false;

    const seekBar = document.getElementById("customSeek");
    const playOverlay = document.querySelector(".video-action-overlay.center");
    const aspectRatioButton = document.getElementById("aspectRatioButton");

    if (seekBar) seekBar.classList.remove("focused");
    if (playOverlay) {
      playOverlay.classList.remove("focused");
      // If we're unfocusing and video is playing, center overlay should hide
      if (player && !player.paused()) {
        playOverlay.classList.add("hidden");
      }
    }
    if (aspectRatioButton) {
      aspectRatioButton.classList.remove("focused");
      const icon = aspectRatioButton.querySelector("i");
      if (icon) icon.style.color = "white";
    }
  }

  function initPlayer(attempt = 0) {
    const videoElement = document.getElementById("videojs-player-tag");
    if (!videoElement) {
      if (attempt < 10) {
        setTimeout(() => initPlayer(attempt + 1), 100);
      }
      return;
    }

    const options = {
      autoplay: true,
      controls: false,
      preload: "auto",
      fluid: true,
      poster:
        isYouTube &&
        (fromValue === "trailer_movie" || fromValue === "trailer_series")
          ? ""
          : poster || "",
      liveui: isLive,
      techOrder: isYouTube ? ["youtube"] : ["html5"],
      sources: [
        isYouTube
          ? {
              src: srcUrl,
              type: "video/youtube",
            }
          : {
              src:
                srcUrl || "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
              type: srcUrl.endsWith(".m3u8")
                ? "application/x-mpegURL"
                : "video/mp4",
            },
      ],
    };

    let resumeTime = 0;

    if (!isLive) {
      if (fromValue === "movie") {
        const movieId = localStorage.getItem("selectedMovieId");
        const matched = continueWatchingMoviesData.find(
          (item) => item.itemId === movieId,
        );
        if (matched && matched.resumeTime) {
          resumeTime = matched.resumeTime;
        }
      } else {
        const seriesId = localStorage.getItem("selectedSeriesId");
        const episodeId = localStorage.getItem("selectedEpisodeId");

        const matched = continueWatchingSeriesData.find(
          (item) => item.itemId === seriesId && item.episodeId === episodeId,
        );
        if (matched && matched.resumeTime) {
          resumeTime = matched.resumeTime;
        }
      }
    }

    if (useWebOSNativePlayer) {
      const source = options.sources[0] || {};
      playbackVideoElement = videoElement;
      videoElement.autoplay = true;
      videoElement.controls = false;
      videoElement.preload = "auto";
      videoElement.playsInline = true;
      videoElement.setAttribute("playsinline", "playsinline");
      videoElement.setAttribute("webkit-playsinline", "webkit-playsinline");

      if (options.poster) {
        videoElement.poster = options.poster;
      }

      if (source.src) {
        videoElement.src = source.src;
        setTimeout(() => {
          if (typeof videoElement.load === "function") {
            videoElement.load();
          }
        }, 0);
      }

      player = createWebOSNativePlayer(videoElement);
    } else {
      playbackVideoElement = videoElement;
      player = videojs(videoElement, options);
    }

    pendingResumeTime = resumeTime > 0 ? resumeTime : 0;
    resumeTimeApplied = false;

    player.on("seeking", () => {
      console.log("Seeking started...");
      showLoadingState();
      // Hide center play/pause overlay during seeking
      const playOverlay = document.querySelector(".video-action-overlay.center");
      if (playOverlay) {
        playOverlay.classList.add("hidden");
      }
    });

    player.on("seeked", () => {
      console.log("Seek completed");
      updateLastKnownPlaybackProgress();

      // Auto-play after seeking regardless of previous state (as requested)
      if (
        player.paused() &&
        !errorActive &&
        !isSeekBarDragging
      ) {
        if (useWebOSNativePlayer) {
          resumePlaybackAfterSeek();
        } else {
          setTimeout(() => {
            player.play().catch((err) => {
              console.log("Auto-play after seek failed:", err);
            });
          }, 100);
        }
      }
    });

    // Apply resume time after metadata is loaded
    if (pendingResumeTime > 0) {
      player.on("loadedmetadata", () => {
        if (useWebOSNativePlayer) {
          if (!applyResumeTimeToPlayback()) {
            scheduleResumeSeekRetry();
          }
        } else if (pendingResumeTime < player.duration()) {
          player.currentTime(pendingResumeTime);
          resumeTimeApplied = true;
        }
      });
    }

    const seekBar = document.getElementById("customSeek");
    const liveBadge = document.querySelector(".video-live-badge");
    const errorDialog = document.querySelector(".video-error-dialog");
    const errorBackBtn = document.getElementById("errorBackBtn");
    const controlsBar = document.querySelector(".custom-video-controls");
    const overlays = document.querySelectorAll(".video-action-overlay");
    const titleBar = document.querySelector(".video-title-bar");

    currentTimeEl = document.getElementById("currentTime");
    durationEl = document.getElementById("duration");

    function resumePlaybackAfterSeek() {
      if (errorActive || userManuallyPaused || !wasPlayingBeforeSeek) return;

      if (pendingResumeTimeout) {
        clearTimeout(pendingResumeTimeout);
        pendingResumeTimeout = null;
      }

      const playbackTarget =
        useWebOSNativePlayer && playbackVideoElement ? playbackVideoElement : player;
      if (!playbackTarget || typeof playbackTarget.play !== "function") return;

      if (useWebOSNativePlayer) {
        try {
          const result = playbackTarget.play();
          if (result && typeof result.catch === "function") {
            result.catch((err) => {
              console.log("Native autoplay after seek failed:", err);
            });
          }
        } catch (err) {
          console.log("Native autoplay after seek failed:", err);
        }
      } else {
        pendingResumeTimeout = setTimeout(() => {
          playbackTarget.play().catch((err) => {
            console.log("Auto-play after seek failed:", err);
          });
        }, 200);
      }
    }

    if (isLive && liveBadge) {
      liveBadge.classList.remove("hidden");
    }
    if (isLive && seekBar) {
      seekBar.style.display = "none";
    }

    // Show title at start for 3 seconds, then hide if video is playing
    if (titleBar) {
      titleBar.classList.remove("hidden");
      setTimeout(() => {
        if (!player.paused()) {
          titleBar.classList.add("hidden");
        }
      }, 3000);
    }

    // Seek bar event listeners
    if (!isLive && seekBar) {
      seekBar.addEventListener("input", () => {
        if (
          !errorActive &&
          player &&
          typeof player.currentTime === "function"
        ) {
          // Throttle seek bar updates to prevent buffer overload
          const now = Date.now();
          if (now - lastSeekTime < 100) {
            // Ignore updates faster than 100ms
            return;
          }
          lastSeekTime = now;

          isSeekBarDragging = true;

          // Show loading indicator when seeking
          showLoadingState();

          // Store play state before seeking
          wasPlayingBeforeSeek = !player.paused();

          try {
            player.currentTime(parseFloat(seekBar.value));
          } catch (err) {
            console.warn("Seek bar error:", err);
          }
        }
      });

      seekBar.addEventListener("change", () => {
        isSeekBarDragging = false;

        // Only auto-resume if it was playing AND not manually paused
        if (useWebOSNativePlayer) {
          resumePlaybackAfterSeek();
        } else if (wasPlayingBeforeSeek && !userManuallyPaused && !errorActive) {
          setTimeout(() => {
            player.play().catch((err) => {
              console.log("Auto-play after seek bar release failed:", err);
            });
          }, 200);
        }
      });

    player.on("timeupdate", () => {
      if (errorActive) return;
      updateLastKnownPlaybackProgress();

      if (!seekBar.getAttribute("max")) {
        seekBar.setAttribute("max", player.duration() || 0);
        }

        // Only update seek bar value if user is not actively dragging it
        if (!isSeekBarDragging) {
          seekBar.value = player.currentTime();
        }

        // Update current time display
        if (currentTimeEl) {
          currentTimeEl.textContent = formatTime(player.currentTime());
        }

        // Update duration display (only once when available)
        if (
          durationEl &&
          player.duration() &&
          durationEl.textContent === "0:00"
        ) {
          durationEl.textContent = formatTime(player.duration());
        }

        const percent = (player.currentTime() / player.duration()) * 100;
        let bufferedPercent = 0;
        if (player.buffered().length > 0) {
          bufferedPercent =
            (player.buffered().end(player.buffered().length - 1) /
              player.duration()) *
            100;
        }

        seekBar.style.background = `linear-gradient(to right,
          var(--gold) 0%, var(--gold) ${percent}%,
          rgba(255, 255, 255, 0.4) ${percent}%, rgba(255, 255, 255, 0.4) ${bufferedPercent}%,
          rgba(255, 255, 255, 0.15) ${bufferedPercent}%, rgba(255, 255, 255, 0.15) 100%)`;
      });
    }

    player.on("waiting", () => {
      if (!errorActive && !userManuallyPaused) {
        showLoadingState();
        if (useWebOSNativePlayer) {
          hidePlaybackOverlays();
          shouldAutoPlayAfterBuffering = !userManuallyPaused && !player.paused();
        }
        // Hide pause overlay when loading starts
        const playOverlay = document.querySelector(
          ".video-action-overlay.center",
        );
        if (playOverlay) {
          playOverlay.classList.add("hidden");
        }
      }
    });

    player.on("canplay", () => {
      if (!errorActive) {
        const loadingEl = document.querySelector(".video-buffer-loader");
        loadingEl.classList.add("hidden");
        if (useWebOSNativePlayer && pendingResumeTime > 0 && !resumeTimeApplied) {
          if (!applyResumeTimeToPlayback()) {
            scheduleResumeSeekRetry();
          }
        }
        if (useWebOSNativePlayer && shouldAutoPlayAfterBuffering) {
          shouldAutoPlayAfterBuffering = false;
          resumePlaybackAfterSeek();
        }
        // If we're paused after loading completes, show pause overlay again
        if (player.paused() && !isSeekBarDragging) {
          showOverlay("pause");
        }
      }
    });

    player.on("loadeddata", () => {
      if (!errorActive) {
        const loadingEl = document.querySelector(".video-buffer-loader");
        loadingEl.classList.add("hidden");
        if (useWebOSNativePlayer && pendingResumeTime > 0 && !resumeTimeApplied) {
          if (!applyResumeTimeToPlayback()) {
            scheduleResumeSeekRetry();
          }
        }
        if (useWebOSNativePlayer && shouldAutoPlayAfterBuffering) {
          shouldAutoPlayAfterBuffering = false;
          resumePlaybackAfterSeek();
        }
      }
    });

    player.on("canplaythrough", () => {
      if (!errorActive) {
        const loadingEl = document.querySelector(".video-buffer-loader");
        loadingEl.classList.add("hidden");
        if (useWebOSNativePlayer && pendingResumeTime > 0 && !resumeTimeApplied) {
          if (!applyResumeTimeToPlayback()) {
            scheduleResumeSeekRetry();
          }
        }
        if (useWebOSNativePlayer && shouldAutoPlayAfterBuffering) {
          shouldAutoPlayAfterBuffering = false;
          resumePlaybackAfterSeek();
        }
      }
    });

    player.on("stalled", () => {
      if (!errorActive && !userManuallyPaused) {
        showLoadingState();
        if (useWebOSNativePlayer) {
          hidePlaybackOverlays();
          shouldAutoPlayAfterBuffering = !userManuallyPaused && !player.paused();
        }
      }
    });

    player.on("durationchange", () => {
      if (
        !errorActive &&
        durationEl &&
        player.duration() &&
        durationEl.textContent === "0:00"
      ) {
        durationEl.textContent = formatTime(player.duration());
      }
      updateLastKnownPlaybackProgress();
    });

    player.on("loadstart", () => {
      if (!errorActive && !userManuallyPaused) {
        showLoadingState();
        if (useWebOSNativePlayer) {
          hidePlaybackOverlays();
          shouldAutoPlayAfterBuffering = !userManuallyPaused && !player.paused();
        }
      }

      // Always hide poster for YouTube trailers
      if (
        isYouTube &&
        (fromValue === "trailer_movie" || fromValue === "trailer_series")
      ) {
        const posterEl = document.querySelector(".vjs-poster");
        if (posterEl) {
          posterEl.style.opacity = "0";
          posterEl.style.display = "none";
        }
      }
    });

    player.on("ended", () => {
      goBack();
    });

    player.on("playing", () => {
      if (!errorActive) {
        hasStartedPlayingOnce = true; // Mark that video has started playing
        updateLastKnownPlaybackProgress();
        const loadingEl = document.querySelector(".video-buffer-loader");
        loadingEl.classList.add("hidden");
        shouldAutoPlayAfterBuffering = false;
        hideControlsWithDelay(5000); // Auto-hide controls after 5 seconds of inactivity

        // Only show play overlay if we're not seeking
        if (!isSeekBarDragging && !player.seeking()) {
          showOverlay("play");
        }

        // ONLY unfocus if controls are hidden or NO element is currently focused
        // This keeps the red/gold border visible even while the video is playing/seeking
        const isAnythingFocused =
          isSeekBarFocused || isAspectRatioFocused || isPlayPauseFocused;
        if (!isAnythingFocused || controlsBar.classList.contains("hidden")) {
          unfocusAll();
        }

        // Reset manual pause flag when video starts playing
        userManuallyPaused = false;
      }
    });

    player.on("pause", () => {
      // Hide loading indicator when user pauses
      const loadingEl = document.querySelector(".video-buffer-loader");
      if (loadingEl) {
        loadingEl.classList.add("hidden");
      }

      // Always show pause overlay when paused, even during seeking
      if (!errorActive) {
        updateLastKnownPlaybackProgress();
        showControls();
        showOverlay("pause");

        // ONLY pull focus to play/pause if NOTHING else is focused
        if (!isSeekBarFocused && !isAspectRatioFocused) {
          setTimeout(() => focusPlayPause(), 100);
        }

        // Mark that user manually paused (unless it's from seeking)
        if (!player.seeking()) {
          userManuallyPaused = true;
        }
      }
    });

    player.on("error", () => {
      const mediaError = player && typeof player.error === "function"
        ? player.error()
        : null;
      console.log("❌ Player error:", mediaError);

      if (useWebOSNativePlayer && !isGenuineNativeMediaError(mediaError)) {
        return;
      }

      errorActive = true;

      if (loadingEl) loadingEl.classList.add("hidden");
      if (controlsBar) controlsBar.classList.add("hidden");
      if (liveBadge) liveBadge.classList.add("hidden");
      if (titleBar) titleBar.style.display = "none";

      overlays.forEach((o) => o.classList.add("hidden"));

      // Hide Poster
      const poster = document.querySelector(".vjs-poster");
      if (poster) {
        poster.style.opacity = "0"; // Use opacity to hide
        poster.style.display = "none";
      }

      if (
        isYouTube &&
        (fromValue === "trailer_movie" || fromValue === "trailer_series")
      ) {
        const errorMsgEl = document.getElementById("errorDialogMessage");
        if (errorMsgEl) {
          const errorMessage = getMediaErrorMessage(mediaError);
          errorMsgEl.innerText = `⚠️ ${errorMessage}`;
        }
      } else if (useWebOSNativePlayer) {
        const errorMsgEl = document.getElementById("errorDialogMessage");
        if (errorMsgEl) {
          errorMsgEl.innerText = `⚠️ ${getMediaErrorMessage(mediaError)}`;
        }
      }

      if (errorDialog) errorDialog.classList.remove("hidden");
    });

    function goBack() {
      const currentPlaylist = getCurrentPlaylist();
      const allRecentlyWatchedMovies = currentPlaylist.continueWatchingMovies
        ? currentPlaylist.continueWatchingMovies
        : [];
      const allRecentlyWatchedSeries = currentPlaylist.continueWatchingSeries
        ? currentPlaylist.continueWatchingSeries
        : [];
      const selectedMovieId = localStorage.getItem("selectedMovieId");

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

      const currentPlayer = player;

      function disposePlayer() {
        if (player) {
          try {
            player.dispose();
            player = null;
          } catch (e) {
            console.warn("Error disposing player", e);
          }
        }
      }

      if (!isYouTube) {
        if (currentPlayer) {
          let resumeTime = 0;
          let duration = 0;

          try {
            if (!isLive && typeof currentPlayer.currentTime === "function") {
              resumeTime = currentPlayer.currentTime();
            }
            if (typeof currentPlayer.duration === "function") {
              duration = currentPlayer.duration();
            }
          } catch (e) {
            resumeTime = 0;
            duration = 0;
          }

          const isVideoCompleted =
            duration > 0 && Math.abs(resumeTime - duration) < 5; // 5 second buffer

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
        if (typeof currentPlayer.dispose === "function") {
          currentPlayer.dispose();
        }
        if (fromValue == "movie") {
          localStorage.setItem("currentPage", "moviesDetailPage");
          Router.showPage("movieDetail");
        } else {
          localStorage.setItem("currentPage", "seriesDetailPage");
          Router.showPage("seriesDetail");
        }
      }
    }

    // Helper function to remove completed episode from continue watching
    function removeEpisodeFromContinueWatching(completedEpisodeId) {
      try {
        const seriesId = localStorage.getItem("selectedSeriesId");
        const currentPlaylistName = JSON.parse(
          localStorage.getItem("selectedPlaylist"),
        ).playlistName;
        const playlistsData =
          JSON.parse(localStorage.getItem("playlistsData")) || [];
        const currentPlaylist = playlistsData.filter(
          (pl) => pl.playlistName === currentPlaylistName,
        )[0];

        if (!currentPlaylist || !currentPlaylist.continueWatchingSeries) return;

        // Remove the specific episode from continue watching
        const updatedContinueWatching =
          currentPlaylist.continueWatchingSeries.filter(
            (item) =>
              !(
                item.itemId === seriesId &&
                item.episodeId === completedEpisodeId.toString()
              ),
          );

        // Update the playlist
        const updatedPlaylists = playlistsData.map((pl) => {
          if (pl.playlistName === currentPlaylistName) {
            return {
              ...pl,
              continueWatchingSeries: updatedContinueWatching,
            };
          }
          return pl;
        });

        // Save back to localStorage
        localStorage.setItem("playlistsData", JSON.stringify(updatedPlaylists));

        // console.log(
        //   `Removed episode ${completedEpisodeId} from continue watching`,
        // );
      } catch (error) {
        console.warn("Error removing episode from continue watching:", error);
      }
    }

    // Helper function to check if ALL episodes in the series are completed
    function checkIfAllEpisodesCompleted(currentEpisodeId, seriesEpisodes) {
      try {
        const seriesId = localStorage.getItem("selectedSeriesId");
        const currentPlaylistName = JSON.parse(
          localStorage.getItem("selectedPlaylist"),
        ).playlistName;
        const playlistsData =
          JSON.parse(localStorage.getItem("playlistsData")) || [];
        const currentPlaylist = playlistsData.filter(
          (pl) => pl.playlistName === currentPlaylistName,
        )[0];
        const continueWatchingEpisodes = currentPlaylist
          ? currentPlaylist.continueWatchingSeries || []
          : [];

        // Get all episodes from the series
        const allEpisodes = [];
        Object.keys(seriesEpisodes).forEach((seasonKey) => {
          const seasonEpisodes = seriesEpisodes[seasonKey] || [];
          seasonEpisodes.forEach((episode) => {
            allEpisodes.push({
              id: episode.id.toString(),
              season: seasonKey,
              episode_num: episode.episode_num,
            });
          });
        });

        // Check if there are any episodes that are still in continue watching
        // (meaning they're incomplete)
        const hasIncompleteEpisodes = allEpisodes.some((episode) => {
          // Skip the current episode that just got completed (we're about to remove it)
          if (episode.id === currentEpisodeId.toString()) {
            return false;
          }

          // Check if this episode exists in continueWatching (meaning it's incomplete)
          const isInContinueWatching = continueWatchingEpisodes.some(
            (cw) => cw.itemId === seriesId && cw.episodeId === episode.id,
          );

          // If it's in continueWatching, it means it's incomplete
          return isInContinueWatching;
        });

        // If there are NO incomplete episodes, then ALL episodes are completed
        return !hasIncompleteEpisodes;
      } catch (error) {
        console.warn("Error checking if all episodes completed:", error);
        return false;
      }
    }

    if (errorBackBtn) {
      errorBackBtn.addEventListener("click", goBack);
    }

    // Keyboard events
    function togglePlayPause() {
      if (player && typeof player.paused === "function") {
        try {
          if (player.paused()) {
            if (typeof player.play === "function") player.play();
          } else {
            if (typeof player.pause === "function") player.pause();
          }
        } catch (err) {
          console.warn("Player control error:", err);
        }
      }
    }

    function seekBy(offset) {
      if (
        !isLive &&
        player &&
        hasStartedPlayingOnce &&
        typeof player.currentTime === "function"
      ) {
        try {
          debouncedSeek(offset);
          showOverlay(offset > 0 ? "forward" : "backward");
        } catch (err) {
          console.warn("Player seek error:", err);
        }
      }
    }

    function cycleAspectRatio() {
      const videoEl = getPlaybackVideoElement();
      if (videoEl && window.VideoAspectRatio) {
        const newLabel = window.VideoAspectRatio.cycle(videoEl);
        window.VideoAspectRatio.showOverlay(newLabel);
      }
    }

    function videojsPlayerdownHandler(e) {
      if (localStorage.getItem("currentPage") !== "videoJsPlayer") return;

      const key = e.keyCode || e.which;
      const keyChar = e.key;

      // On any arrow press, show controls (seek bar + aspect ratio) and default focus to play/pause
      if (
        !errorActive &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        showControlsAndDefaultFocus();
      }

      // Tizen Volume Controls with keyboard (w/s/m)
      if (typeof window.tizen !== "undefined" && window.tizen.tvaudiocontrol) {
        if (keyChar === "w") {
          updateVolume("up");
          e.stopPropagation();
          return;
        }
        if (keyChar === "s") {
          updateVolume("down");
          e.stopPropagation();
          return;
        }
        if (keyChar === "m") {
          toggleMute();
          setTimeout(() => {
            const isMuted =
              window.tizen &&
              window.tizen.tvaudiocontrol &&
              window.tizen.tvaudiocontrol.isMute &&
              window.tizen.tvaudiocontrol.isMute();
            if (isMuted) showMuteIcon();
            else hideMuteIcon();

            let volDisplay = document.getElementById("volumeDisplay");
            setTimeout(() => hideMuteIcon(), 1000);
          }, 50);
          e.stopPropagation();
          return;
        }
      }

      // Tizen Remote Keys (447/448/449)
      if (typeof window.tizen !== "undefined" && window.tizen.systeminfo) {
        if (key === 447) {
          updateVolume("up");
          setTimeout(() => {
            const isMuted =
              window.tizen &&
              window.tizen.tvaudiocontrol &&
              window.tizen.tvaudiocontrol.isMute &&
              window.tizen.tvaudiocontrol.isMute();
            if (!isMuted) hideMuteIcon();
          }, 50);
          e.stopPropagation();
          return;
        }
        if (key === 448) {
          updateVolume("down");
          setTimeout(() => {
            const isMuted =
              window.tizen &&
              window.tizen.tvaudiocontrol &&
              window.tizen.tvaudiocontrol.isMute &&
              window.tizen.tvaudiocontrol.isMute();
            if (!isMuted) hideMuteIcon();
          }, 50);
          e.stopPropagation();
          return;
        }
        if (key === 449) {
          toggleMute();
          setTimeout(() => {
            let volDisplay = document.getElementById("volumeDisplay");
            if (!volDisplay) {
              volDisplay = document.createElement("div");
              volDisplay.id = "volumeDisplay";
              volDisplay.className = "volume-display";
              document.body.appendChild(volDisplay);
            }
            const isMuted =
              window.tizen &&
              window.tizen.tvaudiocontrol &&
              window.tizen.tvaudiocontrol.isMute &&
              window.tizen.tvaudiocontrol.isMute();
            let volume = isMuted ? 0 : window.tizen.tvaudiocontrol.getVolume();
            volDisplay.innerText = "Volume: " + volume;
            volDisplay.style.display = "block";
            clearTimeout(window._volDisplayTimeout);
            window._volDisplayTimeout = setTimeout(() => {
              volDisplay.style.display = "none";
            }, 1200);
          }, 50);
          e.stopPropagation();
          return;
        }
      }

      // Error handling → Enter & Back keys = goBack()
      if (errorActive) {
        if (e.key === "Enter" || isBackKey(e)) {
          goBack();
        }
        return;
      }

      // 🔴 UPDATED: Aspect ratio button navigation logic
      if (isAspectRatioFocused) {
        const aspectRatioButton = document.getElementById("aspectRatioButton");
        if (aspectRatioButton) {
          switch (e.key) {
            case "ArrowUp":
              // Move focus to seek bar
              focusSeekBar();
              e.preventDefault();
              break;

            case "Enter":
              // Apply aspect ratio change using utility
              cycleAspectRatio();
              e.preventDefault();
              break;

            default:
              if (isBackKey(e)) {
                goBack();
                e.preventDefault();
              }
              break;
          }
        }
        return; // Don't process other keys when aspect ratio button is focused
      }

      // 🔴 UPDATED: Seek bar navigation logic
      if (isSeekBarFocused) {
        const seekBar = document.getElementById("customSeek");
        if (seekBar) {
          switch (e.key) {
            case "ArrowLeft":
              if (
                !isLive &&
                player &&
                hasStartedPlayingOnce &&
                typeof player.currentTime === "function"
              ) {
                seekBy(-10);
              }
              e.preventDefault();
              break;

            case "ArrowRight":
              if (
                !isLive &&
                player &&
                hasStartedPlayingOnce &&
                typeof player.currentTime === "function"
              ) {
                seekBy(10);
              }
              e.preventDefault();
              break;

            case "ArrowUp":
              // Move focus to play/pause overlay
              focusPlayPause();
              e.preventDefault();
              break;

            case "ArrowDown":
              // Move focus to aspect ratio button if it exists, otherwise stay or move elsewhere
              const arBtn = document.getElementById("aspectRatioButton");
              if (arBtn) {
                focusAspectRatio();
              } else {
                // For YouTube or no AR button, maybe just preventDefault
                e.preventDefault();
              }
              e.preventDefault();
              break;

            case "Enter":
              // Just unfocus seek bar, don't play/pause
              focusPlayPause();
              e.preventDefault();
              break;

            default:
              if (isBackKey(e)) {
                goBack();
                e.preventDefault();
              }
              break;
          }
        }
        return; // Don't process other keys when seek bar is focused
      }

      // 🔴 UPDATED: Play/Pause overlay navigation logic
      if (isPlayPauseFocused) {
        switch (e.key) {
          case "ArrowDown":
            // Move focus to seek bar
            focusSeekBar();
            e.preventDefault();
            break;

          case "Enter":
            // Toggle play/pause
            togglePlayPause();
            e.preventDefault();
            break;

          case "ArrowRight":
            if (
              !isLive &&
              player &&
              hasStartedPlayingOnce &&
              typeof player.currentTime === "function"
            ) {
              seekBy(10);
            }
            e.preventDefault(); // Added preventDefault to avoid secondary handlers
            break;

          case "ArrowLeft":
            if (
              !isLive &&
              player &&
              hasStartedPlayingOnce &&
              typeof player.currentTime === "function"
            ) {
              seekBy(-10);
            }
            e.preventDefault(); // Added preventDefault to avoid secondary handlers
            break;

          case "ArrowUp":
            // Keep focus here or just preventDefault to avoid escaping
            e.preventDefault();
            break;
        }

        // If we handled the key in play/pause mode, return
        if (
          ["ArrowDown", "ArrowUp", "Enter", "ArrowRight", "ArrowLeft"].includes(
            e.key,
          )
        ) {
          return;
        }
      }

      // 🔴 Fallback controls (when nothing is focused)
      switch (e.key) {
        case "Enter":
          togglePlayPause();
          break;

        case "ArrowRight":
          if (
            !isLive &&
            player &&
            hasStartedPlayingOnce &&
            typeof player.currentTime === "function"
          ) {
            seekBy(10);
          }
          break;

        case "ArrowLeft":
          if (
            !isLive &&
            player &&
            hasStartedPlayingOnce &&
            typeof player.currentTime === "function"
          ) {
            seekBy(-10);
          }
          break;

        default:
          if (isBackKey(e)) {
            goBack();
          }
          break;
      }
    }

    document.addEventListener("keydown", videojsPlayerdownHandler);

    function videojsPlayerClickHandler(e) {
      if (localStorage.getItem("currentPage") !== "videoJsPlayer") return;

      const target = e.target;
      if (!target) return;

      if (errorActive) {
        if (target.closest("#errorBackBtn")) {
          goBack();
        }
        return;
      }

      if (
        target.closest(".video-action-overlay.center") ||
        target.closest(".video-action-overlay.center .video-action-icon")
      ) {
        showControlsAndDefaultFocus();
        focusPlayPause();
        togglePlayPause();
        return;
      }

      if (target.closest(".video-action-overlay.left")) {
        showControlsAndDefaultFocus();
        focusPlayPause();
        seekBy(-10);
        return;
      }

      if (target.closest(".video-action-overlay.right")) {
        showControlsAndDefaultFocus();
        focusPlayPause();
        seekBy(10);
        return;
      }

      if (target.closest("#aspectRatioButton")) {
        showControls();
        focusAspectRatio();
        cycleAspectRatio();
        return;
      }

      if (target.closest("#customSeek")) {
        showControls();
        focusSeekBar();
        return;
      }

      if (target.closest("#videojs-player-tag") || target.closest(".video-js-player-container")) {
        showControlsAndDefaultFocus();
      }
    }

    document.addEventListener("click", videojsPlayerClickHandler, true);

    VideoJsPlayer.cleanup = function () {
      // Clear any pending timeouts first
      if (pendingSeekTimeout) {
        clearTimeout(pendingSeekTimeout);
        pendingSeekTimeout = null;
      }
      if (pendingResumeTimeout) {
        clearTimeout(pendingResumeTimeout);
        pendingResumeTimeout = null;
      }
      clearResumeSeekRetry();
      pendingResumeTime = 0;
      resumeTimeApplied = false;
      if (controlsHideTimeout) {
        clearTimeout(controlsHideTimeout);
        controlsHideTimeout = null;
      }

      // Remove event listener
      try {
        document.removeEventListener("keydown", videojsPlayerdownHandler);
        document.removeEventListener("click", videojsPlayerClickHandler, true);
      } catch (err) {
        console.warn("Event listener removal error:", err);
      }

      // Reset tracking variables
      isSeekBarDragging = false;
      wasPlayingBeforeSeek = false;
      isSeekBarFocused = false;
      isPlayPauseFocused = true;
      isAspectRatioFocused = false;
      userManuallyPaused = false;
      accumulatedSeekOffset = 0;
      lastSeekTime = 0;
      hasStartedPlayingOnce = false;

      // Store player reference to avoid race conditions
      const currentPlayer = player;
      if (currentPlayer) {
        // Set player to null first to prevent further access
        player = null;

        // Then safely dispose
        try {
          if (typeof currentPlayer.pause === "function") {
            currentPlayer.pause();
          }
        } catch (err) {
          console.warn("Player pause error during cleanup:", err);
        }

        try {
          if (typeof currentPlayer.dispose === "function") {
            currentPlayer.dispose();
          }
        } catch (err) {
          console.warn("Player dispose error during cleanup:", err);
        }
      }
    };
  }

  setTimeout(() => initPlayer(), 0);

  setTimeout(() => {
    const videoHtmlElement = getPlaybackVideoElement();
    if (videoHtmlElement && window.VideoAspectRatio) {
      window.VideoAspectRatio.initialize(videoHtmlElement);
    }
  }, 0);

  return `
  <div class="video-js-player-container">
    <!-- Video Title -->
    <div class="video-title-bar" style="display: none;">
      <span class="video-title-text">${titleText}</span>
    </div>

    <!-- Loader -->
    <div class="video-buffer-loader hidden">
      <div class="spinner"></div>
    </div>

    <div class="video-live-badge hidden">LIVE</div>

    <!-- Error Dialog -->
    <div class="video-error-dialog hidden">
      <div class="error-box">
        <p id="errorDialogMessage">⚠️ Something went wrong</p>
        <button id="errorBackBtn">Go Back</button>
      </div>
    </div>

    <!-- Overlays -->
    <div class="video-action-overlay center hidden">
      <div class="video-action-icon">▶️</div>
    </div>
    <div class="video-action-overlay left hidden">
      <div class="video-action-icon">⏪</div>
    </div>
    <div class="video-action-overlay right hidden">
      <div class="video-action-icon">⏩</div>
    </div>

    <video
      id="videojs-player-tag"
      class="${useWebOSVideoTag ? "videojs-player-class" : "video-js videojs-player-class"}"
      playsinline
    ></video>

    <!-- Custom controls with time displays -->
    <div class="custom-video-controls hidden">
      <div class="seek-bar-container">
        <span id="currentTime" class="time-display">0:00</span>
        <input id="customSeek" type="range" value="0" min="0" step="0.1" />
        <span id="duration" class="time-display">0:00</span>
      </div>
      ${
        isYouTube
          ? ""
          : `<div class="aspect-ratio-container">
        <button class="aspect-ratio-button" id="aspectRatioButton"><i class="fa-solid fa-compress" style="color: ${
          isAspectRatioFocused ? "var(--app-text-color)" : "white"
        }"></i>Aspect Ratio</button>
      </div>`
      }

    </div>
 
    <div id="aspectRatioOverlay" class="aspect-ratio-overlay hidden"></div>

  </div>
`;
}
