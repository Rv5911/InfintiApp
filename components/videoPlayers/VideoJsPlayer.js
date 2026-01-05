function VideoJsPlayer(poster = "") {
  const srcUrl =
    window.selectedVideoItemUrl ||
    localStorage.getItem("selectedVideoItemUrl") ||
    "";

  let isYouTube = srcUrl.includes("youtube.com") || srcUrl.includes("youtu.be");

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
    localStorage.getItem("selectedPlaylist")
  ).playlistName;
  const currentPlaylist = JSON.parse(
    localStorage.getItem("playlistsData")
  ).filter((pl) => pl.playlistName === currentPlaylistName)[0];

  const continueWatchingMoviesData = currentPlaylist.continueWatchingMovies
    ? currentPlaylist.continueWatchingMovies
    : [];
  const continueWatchingSeriesData = currentPlaylist.continueWatchingSeries
    ? currentPlaylist.continueWatchingSeries
    : [];

  const isLive = localStorage.getItem("isLive") === "true";

  let player = null;
  let overlayTimeout;
  let controlsTimeout;
  let errorActive = false;
  let currentTimeEl = null;
  let durationEl = null;

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

  // 🔴 Track if video has started playing for the first time
  let hasStartedPlayingOnce = false;

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

  // 🔴 Debounced seek function to prevent buffer overload on low-RAM devices
  function debouncedSeek(offset) {
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
      if (wasPlayingBeforeSeek && !userManuallyPaused) {
        player.pause();
      }
    }

    // Show controls during seeking
    showControls();

    // 🔴 IMMEDIATELY update seek bar for smooth visual feedback
    const seekBar = document.getElementById("customSeek");

    // Show loading indicator immediately when seeking starts
    const loadingEl = document.querySelector(".video-buffer-loader");
    if (loadingEl && !errorActive) {
      loadingEl.classList.remove("hidden");
    }

    if (seekBar && player && player.currentTime) {
      try {
        const currentTime = player.currentTime();
        const duration = player.duration();
        const newTime = Math.max(
          0,
          Math.min(duration, currentTime + accumulatedSeekOffset)
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
          #aaa ${percent}%, #aaa ${bufferedPercent}%,
          #888 ${bufferedPercent}%, #888 100%)`;
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
          Math.min(duration, currentTime + accumulatedSeekOffset)
        );

        // Execute the accumulated seek
        player.currentTime(newTime);

        // Update seek bar
        const seekBar = document.getElementById("customSeek");
        if (seekBar) {
          seekBar.value = newTime;
        }

        // Show appropriate overlay
        if (accumulatedSeekOffset > 0) {
          showOverlay("forward");
        } else if (accumulatedSeekOffset < 0) {
          showOverlay("backward");
        }

        // Reset accumulated offset
        accumulatedSeekOffset = 0;

        // Resume playback if it was playing before
        if (wasPlayingBeforeSeek && !userManuallyPaused) {
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
      ".video-action-overlay.right"
    );
    const backwardOverlay = document.querySelector(
      ".video-action-overlay.left"
    );

    [playOverlay, forwardOverlay, backwardOverlay].forEach((el) => {
      if (el) el.classList.add("hidden");
    });

    let targetOverlay = null;

    switch (type) {
      case "play":
        if (playOverlay) {
          playOverlay.querySelector(
            ".video-action-icon"
          ).innerHTML = `<i class="fa-solid fa-play"></i>`;
          targetOverlay = playOverlay;
        }
        break;
      case "pause":
        if (playOverlay) {
          playOverlay.querySelector(
            ".video-action-icon"
          ).innerHTML = `<i class="fa-solid fa-pause"></i>`;
          targetOverlay = playOverlay;
        }
        break;
      case "forward":
        if (forwardOverlay) {
          forwardOverlay.querySelector(
            ".video-action-icon"
          ).innerHTML = `<i class="fa-solid fa-rotate-right"></i>`;
          targetOverlay = forwardOverlay;
        }
        break;
      case "backward":
        if (backwardOverlay) {
          backwardOverlay.querySelector(
            ".video-action-icon"
          ).innerHTML = `<i class="fa-solid fa-rotate-left"></i>`;
          targetOverlay = backwardOverlay;
        }
        break;
    }

    if (targetOverlay) {
      targetOverlay.classList.remove("hidden");

      clearTimeout(overlayTimeout);
      // Don't auto-hide pause overlay
      if (type !== "pause") {
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

      // Add focused class to play overlay
      playOverlay.classList.add("focused");

      // Remove focused class from seek bar and aspect ratio button
      if (seekBar) seekBar.classList.remove("focused");
      if (aspectRatioButton) aspectRatioButton.classList.remove("focused");
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

      // Add focused class to seek bar
      seekBar.classList.add("focused");

      // Remove focused class from play overlay and aspect ratio button
      playOverlay.classList.remove("focused");
      if (aspectRatioButton) aspectRatioButton.classList.remove("focused");
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

      // Add focused class to aspect ratio button
      aspectRatioButton.classList.add("focused");

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
    if (playOverlay) playOverlay.classList.remove("focused");
    if (aspectRatioButton) aspectRatioButton.classList.remove("focused");
  }

  // 🔴 Function to show controls and reset hide timer
  function showControls() {
    if (errorActive) return;

    const controlsBar = document.querySelector(".custom-video-controls");
    const titleBar = document.querySelector(".video-title-bar");

    if (controlsBar) controlsBar.classList.remove("hidden");
    if (titleBar) titleBar.style.display = "flex";

    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      hideControls();
    }, 5000); // 5 seconds
  }

  // 🔴 Function to hide controls
  function hideControls() {
    // Don't hide if paused, if seek bar is focused, or if error active
    if (
      !player ||
      player.paused() ||
      isSeekBarFocused ||
      isSeekBarDragging ||
      errorActive
    ) {
      return;
    }

    const controlsBar = document.querySelector(".custom-video-controls");
    const titleBar = document.querySelector(".video-title-bar");

    if (controlsBar) controlsBar.classList.add("hidden");
    if (titleBar) titleBar.style.display = "none";
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
          (item) => item.itemId === movieId
        );
        if (matched && matched.resumeTime) {
          resumeTime = matched.resumeTime;
        }
      } else {
        const seriesId = localStorage.getItem("selectedSeriesId");
        const episodeId = localStorage.getItem("selectedEpisodeId");

        const matched = continueWatchingSeriesData.find(
          (item) => item.itemId === seriesId && item.episodeId === episodeId
        );
        if (matched && matched.resumeTime) {
          resumeTime = matched.resumeTime;
        }
      }
    }

    player = videojs(videoElement, options);

    player.on("seeking", () => {
      console.log("Seeking started...");
    });

    player.on("seeked", () => {
      console.log("Seek completed");

      // Only auto-play if video wasn't manually paused AND not dragging
      if (
        player.paused() &&
        !errorActive &&
        !isSeekBarDragging &&
        !userManuallyPaused
      ) {
        setTimeout(() => {
          player.play().catch((err) => {
            console.log("Auto-play after seek failed:", err);
          });
        }, 100);
      }
    });

    // Apply resume time after metadata is loaded
    if (resumeTime > 0) {
      player.on("loadedmetadata", () => {
        if (resumeTime < player.duration()) {
          player.currentTime(resumeTime);
        }
      });
    }

    const loadingEl = document.querySelector(".video-buffer-loader");
    const seekBar = document.getElementById("customSeek");
    const liveBadge = document.querySelector(".video-live-badge");
    const errorDialog = document.querySelector(".video-error-dialog");
    const errorBackBtn = document.getElementById("errorBackBtn");
    const controlsBar = document.querySelector(".custom-video-controls");
    const overlays = document.querySelectorAll(".video-action-overlay");
    const titleBar = document.querySelector(".video-title-bar");

    currentTimeEl = document.getElementById("currentTime");
    durationEl = document.getElementById("duration");

    if (isLive && liveBadge) {
      liveBadge.classList.remove("hidden");
    }
    if (isLive && seekBar) {
      seekBar.style.display = "none";
    }

    // Show title at start for 3 seconds, then hide if video is playing
    if (titleBar) {
      titleBar.classList.remove("hidden");
      titleBar.style.display = "flex";
      controlsBar.classList.remove("hidden");

      controlsTimeout = setTimeout(() => {
        if (!player.paused()) {
          hideControls();
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
          if (loadingEl) {
            loadingEl.classList.remove("hidden");
          }

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
        if (wasPlayingBeforeSeek && !userManuallyPaused && !errorActive) {
          setTimeout(() => {
            player.play().catch((err) => {
              console.log("Auto-play after seek bar release failed:", err);
            });
          }, 200);
        }
      });

      player.on("timeupdate", () => {
        if (errorActive) return;

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
          #aaa ${percent}%, #aaa ${bufferedPercent}%,
          #888 ${bufferedPercent}%, #888 100%)`;
      });
    }

    player.on("waiting", () => {
      if (!errorActive) {
        loadingEl.classList.remove("hidden");
        // Hide pause overlay when loading starts
        const playOverlay = document.querySelector(
          ".video-action-overlay.center"
        );
        if (playOverlay) {
          playOverlay.classList.add("hidden");
        }
      }
    });

    player.on("canplay", () => {
      if (!errorActive) {
        loadingEl.classList.add("hidden");
        // If we're paused after loading completes, show pause overlay again
        if (player.paused() && !isSeekBarDragging) {
          showOverlay("pause");
        }
      }
    });

    player.on("stalled", () => {
      if (!errorActive) {
        loadingEl.classList.remove("hidden");
      }
    });

    player.on("loadstart", () => {
      if (!errorActive) {
        loadingEl.classList.remove("hidden");
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
        loadingEl.classList.add("hidden");

        // Hide controls after 5 seconds of playing
        showControls();

        // Only show play overlay if we're not seeking
        if (!isSeekBarDragging && !player.seeking()) {
          showOverlay("play");
        }

        // Remove focus when playing
        unfocusAll();

        // Reset manual pause flag when video starts playing
        userManuallyPaused = false;
      }
    });

    player.on("pause", () => {
      // Don't show pause UI if video is still loading/buffering
      if (!errorActive && !loadingEl.classList.contains("hidden")) {
        return;
      }

      // Always show pause overlay when paused, even during seeking
      if (!errorActive) {
        controlsBar.classList.remove("hidden");
        titleBar.style.display = "flex";
        showOverlay("pause");
        setTimeout(() => focusPlayPause(), 100);

        // Keep controls visible while paused
        clearTimeout(controlsTimeout);

        // Mark that user manually paused (unless it's from seeking)
        if (!player.seeking()) {
          userManuallyPaused = true;
        }
      }
    });

    player.on("error", () => {
      console.log("❌ Player error:", player.error());
      errorActive = true;

      loadingEl.classList.add("hidden");
      controlsBar.classList.add("hidden");
      liveBadge.classList.add("hidden");
      titleBar.style.display = "none";

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
          const playerError = player.error();
          let errorMessage = "Something went wrong";
          if (playerError) {
            errorMessage =
              playerError.message || `Error Code: ${playerError.code}`;
          }
          errorMsgEl.innerText = `⚠️ ${errorMessage}`;
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
                (ep) => ep.id.toString() === currentEpisodeId
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
                  nextEpisodeId.toString()
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
                seriesEpisodes
              );
              if (allEpisodesCompleted) {
                removeItemFromHistoryById(
                  localStorage.getItem("selectedSeriesId"),
                  "continueWatchingSeries"
                );
              }
            } else if (fromValue === "movie") {
              // MOVIES: Remove from continue watching when completed
              removeItemFromHistoryById(
                localStorage.getItem("selectedMovieId"),
                "continueWatchingMovies"
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
                    )
                );
                pl = {
                  ...pl,
                  continueWatchingSeries: updatedSeries,
                };
              } else {
                // Remove old entry for same movie
                let updatedMovies = (pl.continueWatchingMovies || []).filter(
                  (item) => item.itemId !== continueWatchingItem.itemId
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
              movie && movie.itemId === localStorage.getItem("selectedMovieId")
          );

          localStorage.setItem(
            "isContinueWatchingMovie",
            isContinueWatchingMovie == false ? "true" : "false"
          );

          // buildDynamicSidebarOptions();
          localStorage.setItem("currentPage", "moviesDetailPage");
          Router.showPage("movieDetail");
        } else {
          const isContinueWatchingSeries = allRecentlyWatchedSeries.some(
            (series) =>
              series &&
              series.itemId === localStorage.getItem("selectedSeriesId")
          );

          localStorage.setItem(
            "isContinueWatchingSeries",
            isContinueWatchingSeries === false ? "true" : "false"
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
          localStorage.getItem("selectedPlaylist")
        ).playlistName;
        const playlistsData =
          JSON.parse(localStorage.getItem("playlistsData")) || [];
        const currentPlaylist = playlistsData.filter(
          (pl) => pl.playlistName === currentPlaylistName
        )[0];

        if (!currentPlaylist || !currentPlaylist.continueWatchingSeries) return;

        // Remove the specific episode from continue watching
        const updatedContinueWatching =
          currentPlaylist.continueWatchingSeries.filter(
            (item) =>
              !(
                item.itemId === seriesId &&
                item.episodeId === completedEpisodeId.toString()
              )
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

        console.log(
          `Removed episode ${completedEpisodeId} from continue watching`
        );
      } catch (error) {
        console.warn("Error removing episode from continue watching:", error);
      }
    }

    // Helper function to check if ALL episodes in the series are completed
    function checkIfAllEpisodesCompleted(currentEpisodeId, seriesEpisodes) {
      try {
        const seriesId = localStorage.getItem("selectedSeriesId");
        const currentPlaylistName = JSON.parse(
          localStorage.getItem("selectedPlaylist")
        ).playlistName;
        const playlistsData =
          JSON.parse(localStorage.getItem("playlistsData")) || [];
        const currentPlaylist = playlistsData.filter(
          (pl) => pl.playlistName === currentPlaylistName
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
            (cw) => cw.itemId === seriesId && cw.episodeId === episode.id
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
    function videojsPlayerdownHandler(e) {
      if (localStorage.getItem("currentPage") !== "videoJsPlayer") return;

      const key = e.keyCode || e.which;
      const keyChar = e.key;

      // Show controls on any key press
      showControls();

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
        if (
          e.key === "Enter" ||
          e.key === "Escape" ||
          e.key === "Back" ||
          e.key === "BrowserBack" ||
          e.key === "XF86Back" ||
          key === 10009
        ) {
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
              const videoEl = document.querySelector(
                "#videojs-player-tag_html5_api"
              );
              if (videoEl && window.VideoAspectRatio) {
                const newLabel = window.VideoAspectRatio.cycle(videoEl);
                window.VideoAspectRatio.showOverlay(newLabel);
              }
              e.preventDefault();
              break;

            case "Escape":
            case "Back":
            case "BrowserBack":
            case "XF86Back":
              goBack();
              e.preventDefault();
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
                try {
                  // Use debounced seek to prevent buffer overload
                  debouncedSeek(-10);
                  showOverlay("backward");
                } catch (err) {
                  console.warn("Player seek error:", err);
                }
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
                try {
                  // Use debounced seek to prevent buffer overload
                  debouncedSeek(10);
                  showOverlay("forward");
                } catch (err) {
                  console.warn("Player seek error:", err);
                }
              }
              e.preventDefault();
              break;

            case "ArrowUp":
              // Move focus to play/pause overlay
              focusPlayPause();
              e.preventDefault();
              break;

            case "ArrowDown":
              // Move focus to aspect ratio button
              focusAspectRatio();
              e.preventDefault();
              break;

            case "Enter":
              // Just unfocus seek bar, don't play/pause
              focusPlayPause();
              e.preventDefault();
              break;

            case "Escape":
            case "Back":
            case "BrowserBack":
            case "XF86Back":
              goBack();
              e.preventDefault();
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
            e.preventDefault();
            break;

          case "ArrowRight":
            if (
              !isLive &&
              player &&
              hasStartedPlayingOnce &&
              typeof player.currentTime === "function"
            ) {
              try {
                // Use debounced seek to prevent buffer overload
                debouncedSeek(10);
                showOverlay("forward");
              } catch (err) {
                console.warn("Player seek error:", err);
              }
            }
            break;

          case "ArrowLeft":
            if (
              !isLive &&
              player &&
              hasStartedPlayingOnce &&
              typeof player.currentTime === "function"
            ) {
              try {
                // Use debounced seek to prevent buffer overload
                debouncedSeek(-10);
                showOverlay("backward");
              } catch (err) {
                console.warn("Player seek error:", err);
              }
            }
            break;
        }

        // If we handled the key in play/pause mode, return
        if (["ArrowDown", "Enter"].includes(e.key)) {
          return;
        }
      }

      // 🔴 Fallback controls (when nothing is focused)
      switch (e.key) {
        case "Enter":
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
          break;

        case "ArrowRight":
          if (
            !isLive &&
            player &&
            hasStartedPlayingOnce &&
            typeof player.currentTime === "function"
          ) {
            try {
              // Use debounced seek to prevent buffer overload
              debouncedSeek(10);
              showOverlay("forward");
            } catch (err) {
              console.warn("Player seek error:", err);
            }
          }
          break;

        case "ArrowLeft":
          if (
            !isLive &&
            player &&
            hasStartedPlayingOnce &&
            typeof player.currentTime === "function"
          ) {
            try {
              // Use debounced seek to prevent buffer overload
              debouncedSeek(-10);
              showOverlay("backward");
            } catch (err) {
              console.warn("Player seek error:", err);
            }
          }
          break;

        case "Escape":
        case "Back":
        case "BrowserBack":
        case "XF86Back":
        case 10009:
          goBack();
          break;
      }
    }

    document.addEventListener("keydown", videojsPlayerdownHandler);

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
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
        controlsTimeout = null;
      }

      // Remove event listener
      try {
        document.removeEventListener("keydown", videojsPlayerdownHandler);
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
    const videoHtmlElement = document.querySelector(
      "#videojs-player-tag_html5_api"
    );
    if (videoHtmlElement && window.VideoAspectRatio) {
      window.VideoAspectRatio.initialize(videoHtmlElement);
    }
  }, 0);

  setTimeout(() => {
    const aspectRatioButton = document.getElementById("aspectRatioButton");
    if (aspectRatioButton) {
      aspectRatioButton.addEventListener("click", () => {
        const videoEl = document.querySelector("#videojs-player-tag_html5_api");
        if (videoEl && window.VideoAspectRatio) {
          const newLabel = window.VideoAspectRatio.cycle(videoEl);
          window.VideoAspectRatio.showOverlay(newLabel);
        }
      });
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
      class="video-js videojs-player-class"
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
          isAspectRatioFocused ? "var(--gold)" : "white"
        }"></i>Aspect Ratio</button>
      </div>`
      }

    </div>
 
    <div id="aspectRatioOverlay" class="aspect-ratio-overlay hidden"></div>

  </div>
`;
}
