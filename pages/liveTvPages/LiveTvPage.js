function LiveTvPage() {
  const categories = window.liveCategories || [];
  const allStreams = window.allLiveStreams || [];
  let isEpgDivFocused = false;
  let enterPressTimer = null;
  let isEnterPressed = false;
  const LONG_PRESS_DURATION = 500;
  const selectedCat = [];
  let focusedEpgItemIndex = -1;

  const categoryPageSize = 20;

  const handleChannelChange = (direction) => {
    const cardList = qsa(".channel-card");

    if (cardList.length === 0) {
      Toaster.showToast("error", "No channels available");
      return;
    }

    let newIndex;
    if (direction === "prev") {
      if (focusedCardIndex > 0) {
        newIndex = focusedCardIndex - 1;
      } else {
        // Toaster.showToast("info", "Already at first channel");
        return;
      }
    } else {
      // "next"
      if (focusedCardIndex < cardList.length - 1) {
        newIndex = focusedCardIndex + 1;
      } else {
        // Toaster.showToast("info", "Already at last channel");
        return;
      }
    }

    // Update focus and play the channel
    focusedCardIndex = newIndex;

    const newCard = cardList[focusedCardIndex];

    // Check for adult content lock
    const isAdultChannel = newCard.dataset.isAdult === "true";
    const parentalEnabled = !!currentPlaylist.parentalPassword;
    const streamId = newCard.dataset.streamId;

    // Determine which unlock set to check based on current category
    let isChannelUnlocked = true;
    let unlockSet = null;

    if (isAdultChannel && parentalEnabled) {
      if (selectedCategoryId === "All") {
        isChannelUnlocked = unlockedLiveAdultChannelsInAll.has(
          String(streamId)
        );
        unlockSet = unlockedLiveAdultChannelsInAll;
      } else if (selectedCategoryId === "favorites") {
        isChannelUnlocked = unlockedLiveAdultChannelsInFavorites.has(
          String(streamId)
        );
        unlockSet = unlockedLiveAdultChannelsInFavorites;
      } else if (selectedCategoryId === "channelHistory") {
        isChannelUnlocked = unlockedLiveAdultChannelsInHistory.has(
          String(streamId)
        );
        unlockSet = unlockedLiveAdultChannelsInHistory;
      } else {
        const category = categories.find(
          (cat) => cat.category_id === selectedCategoryId
        );
        isChannelUnlocked = category
          ? unlockedLiveAdultCatIds.has(String(category.category_id))
          : true;
        unlockSet = null;
      }
    }

    if (isAdultChannel && parentalEnabled && !isChannelUnlocked && unlockSet) {
      ParentalPinDialog(
        () => {
          unlockSet.add(String(streamId));
          const logoWrapper = newCard.querySelector(
            ".channel-card-logo-wrapper"
          );
          if (logoWrapper) {
            logoWrapper.classList.remove("channel-card-locked");
          }
          const lockIcon = newCard.querySelector(".channel-card-lock-icon");
          if (lockIcon) lockIcon.remove();
          playChannelCard(newCard);
        },
        () => {
          // PIN incorrect - revert to original card
          if (direction === "prev") {
            focusedCardIndex++;
          } else {
            focusedCardIndex--;
          }
          setFocus(cardList, focusedCardIndex, "channel-card-focused");
        },
        currentPlaylist,
        "liveTvPage"
      );
      return;
    }

    // Play the channel if not locked or already unlocked
    playChannelCard(newCard);

    // Add to history if not in channel history category
    if (selectedCategoryId !== "channelHistory") {
      const selectedChannelItem = allStreams.find(
        (item) => item.stream_id == newCard.dataset.streamId
      );
      if (selectedChannelItem) {
        addItemToHistory(selectedChannelItem, "ChannelListLive");
        setTimeout(() => {
          refreshCategoryCountsOnly();
        }, 50);
      }
    }

    // Ensure the card gets focused class after playing
    setTimeout(() => {
      setFocus(cardList, focusedCardIndex, "channel-card-focused");
    }, 150);
  };
  const invalidateCategoryCache = () => {
    cachedFilteredCategories = null;
    lastSearchQuery = "";
    lastSelectedCategoryId = "";

    // Force refresh the current playlist data
    const currentPlaylistName = JSON.parse(
      localStorage.getItem("selectedPlaylist")
    ).playlistName;
    const playlistsData = JSON.parse(localStorage.getItem("playlistsData"));
    window.allLiveStreams = window.allLiveStreams || []; // Ensure it exists
  };
  const playChannelCard = (card) => {
    const streamId = card.dataset.streamId;
    const currentPlaylistData = JSON.parse(
      localStorage.getItem("currentPlaylistData")
    );
    const playlistLiveExtension = JSON.parse(
      localStorage.getItem("selectedPlaylist")
    );

    const liveVideoUrl = `${
      currentPlaylistData.server_info.server_protocol
    }://${currentPlaylistData.server_info.url}:${
      currentPlaylistData.server_info.port
    }/live/${currentPlaylistData.user_info.username}/${
      currentPlaylistData.user_info.password
    }/${streamId}.${
      playlistLiveExtension.streamFormat
        ? playlistLiveExtension.streamFormat
        : "m3u8"
    }`;

    const videoWrapper = qs(".livetv-video-wrapper2");
    if (videoWrapper) {
      // Only clean up if we're switching to a different stream
      const videoEl = videoWrapper.querySelector("video");
      const currentStreamId = videoEl ? videoEl.dataset.streamId : null;
      if (currentStreamId !== streamId) {
        // CHECK IF PLAYER IS IN FULLSCREEN MODE
        const isFullscreen =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement ||
          (window.livePlayer &&
            typeof window.livePlayer.fullscreen === "function" &&
            window.livePlayer.fullscreen());

        // IF IN FULLSCREEN, CHANGE SOURCE WITHOUT DESTROYING PLAYER
        if (isFullscreen && window.livePlayer) {
          console.log("Changing channel in fullscreen mode without exiting...");

          // Check if player has src method (both FlowPlayer and Video.js support this)
          if (
            window.livePlayer.src &&
            typeof window.livePlayer.src === "function"
          ) {
            try {
              // For FlowPlayer, convert to HLS
              if (window.livePlayer._fp) {
                const hlsUrl = liveVideoUrl.replace(
                  /\.ts(\?.*)?$/i,
                  function (m, q) {
                    return `.m3u8${q || ""}`;
                  }
                );
                window.livePlayer.src({ src: hlsUrl });
              } else {
                // For Video.js
                window.livePlayer.src({
                  src: liveVideoUrl,
                  type: "application/x-mpegURL",
                });
                window.livePlayer.load();
              }

              // Update the video element's dataset if it exists
              if (videoEl) {
                videoEl.dataset.streamId = streamId;
              }

              // Update EPG for the new channel
              if (streamId) {
                getLiveStreamEpg(streamId).then((data) => {
                  const epgData =
                    data && data.epg_listings ? data.epg_listings : [];
                  const epgContainer =
                    document.querySelector(".livetv-player-epg");
                  if (epgContainer) {
                    const playlistsData = JSON.parse(
                      localStorage.getItem("playlistsData")
                    );
                    const selectedPlaylist = JSON.parse(
                      localStorage.getItem("selectedPlaylist")
                    );
                    const currentPlaylist = playlistsData.filter(
                      (pl) => pl.playlistName === selectedPlaylist.playlistName
                    )[0];
                    const timeFormat =
                      currentPlaylist && currentPlaylist.timeFormat
                        ? currentPlaylist.timeFormat
                        : "12hrs";

                    function formatTime(dateStr, format) {
                      let date;
                      if (!isNaN(dateStr)) {
                        const ts =
                          dateStr.toString().length === 10
                            ? dateStr * 1000
                            : dateStr;
                        date = new Date(parseInt(ts));
                      } else {
                        date = new Date(dateStr);
                      }
                      if (isNaN(date)) return dateStr;
                      const options =
                        format === "12hrs"
                          ? { hour: "numeric", minute: "2-digit", hour12: true }
                          : {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            };
                      return new Intl.DateTimeFormat(undefined, options).format(
                        date
                      );
                    }

                    if (!epgData || epgData.length === 0) {
                      epgContainer.innerHTML = `
                        <div class="livetv-player-epg-item">
                          <p class="livetv-player-epg-title">No EPG Found</p>
                          <p class="livetv-player-epg-description">No EPG data available</p>
                        </div>
                      `;
                    } else {
                      epgContainer.innerHTML = epgData
                        .map((epg) => {
                          const startTime = formatTime(epg.start, timeFormat);
                          const endTime = formatTime(epg.end, timeFormat);
                          return `
                            <div class="livetv-player-epg-item">
                              <p class="livetv-player-epg-title">${startTime} - ${endTime} ${
                            decodeBase64(epg.title) || "Untitled"
                          }</p>
                              <p class="livetv-player-epg-description">${
                                decodeBase64(epg.description) ||
                                "No description available"
                              }</p>
                            </div>
                          `;
                        })
                        .join("");
                    }
                  }
                });
              }

              // Update channel name overlay
              const channelNameEl =
                document.querySelector(".live-channel-name");
              if (channelNameEl) {
                channelNameEl.textContent = card.dataset.name || "";
              }
            } catch (err) {
              console.error("Error changing source in fullscreen:", err);
              // If source change fails, fall back to recreating player
              recreatePlayer();
            }
          } else {
            // Player doesn't support src method, recreate
            recreatePlayer();
          }
        } else {
          // NOT IN FULLSCREEN - RECREATE PLAYER AS USUAL
          recreatePlayer();
        }

        function recreatePlayer() {
          // PRESERVE FULLSCREEN STATE BEFORE CHANGING CHANNELS
          const wasFullscreen =
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            (window.livePlayer &&
              typeof window.livePlayer.fullscreen === "function" &&
              window.livePlayer.fullscreen());

          // Clean up existing player before creating new one
          if (typeof LiveVideoJsComponent.cleanup === "function") {
            try {
              LiveVideoJsComponent.cleanup();
            } catch (err) {
              console.warn(
                "LiveVideoJsComponent cleanup error during channel change:",
                err
              );
            }
          }

          // Fallback cleanup for window.livePlayer
          if (window.livePlayer) {
            try {
              window.livePlayer.dispose();
            } catch {}
            window.livePlayer = null;
          }

          const playlistsData = JSON.parse(
            localStorage.getItem("playlistsData")
          );
          const selectedPlaylist = JSON.parse(
            localStorage.getItem("selectedPlaylist")
          );

          const currentPlaylist = playlistsData.filter(
            (pl) => pl.playlistName === selectedPlaylist.playlistName
          )[0];

          console.log(currentPlaylist, "currentPlaylistcurrentPlaylist");
          const isTs =
            (currentPlaylist.streamFormat || "").toLowerCase() === "ts";
          videoWrapper.innerHTML = isTs
            ? FlowLivePlayerComponent(
                card.dataset.streamId,
                liveVideoUrl,
                card.dataset.logo,
                "30vh",
                card.dataset.name || ""
              )
            : LiveVideoJsComponent(
                card.dataset.streamId,
                liveVideoUrl,
                card.dataset.logo,
                "30vh",
                card.dataset.name || ""
              );

          // RESTORE FULLSCREEN STATE AFTER NEW CHANNEL LOADS
          if (wasFullscreen) {
            setTimeout(() => {
              const playerContainer = document.querySelector(
                ".live-video-player-div"
              );

              if (playerContainer) {
                // Wait for player to be ready before entering fullscreen
                const enterFullscreen = () => {
                  try {
                    console.log("Attempting to restore fullscreen mode...");

                    // For Video.js and Flowplayer, request fullscreen on the container element
                    if (playerContainer.requestFullscreen) {
                      playerContainer.requestFullscreen();
                    } else if (playerContainer.webkitRequestFullscreen) {
                      playerContainer.webkitRequestFullscreen();
                    } else if (playerContainer.mozRequestFullScreen) {
                      playerContainer.mozRequestFullScreen();
                    } else if (playerContainer.msRequestFullscreen) {
                      playerContainer.msRequestFullscreen();
                    }
                  } catch (err) {
                    console.warn("Error restoring fullscreen:", err);
                  }
                };

                // For Video.js, wait for 'loadedmetadata' or 'canplay' event
                if (
                  window.livePlayer &&
                  typeof window.livePlayer.on === "function"
                ) {
                  window.livePlayer.one("canplay", enterFullscreen);
                } else {
                  // For Flowplayer or other players, wait longer for initialization
                  setTimeout(enterFullscreen, 1000);
                }
              }
            }, 200);
          }
        }
      } else {
        // Same stream, just ensure player is visible and playing
        if (window.livePlayer && typeof window.livePlayer.play === "function") {
          window.livePlayer.play();
        }
      }
    }

    // Update card visual states - FIXED: Ensure playing channel gets focused class
    qsa(".channel-card").forEach((c) => {
      c.classList.remove("channel-card-selected");
      c.classList.remove("channel-card-focused");
      c.classList.remove("channel-card-playing");
    });

    card.classList.add("channel-card-selected");
    card.classList.add("channel-card-focused"); // ADD THIS LINE
    card.classList.add("channel-card-playing");

    // Update focusedCardIndex to match the playing channel
    const allCards = qsa(".channel-card");
    const cardIndex = Array.from(allCards).indexOf(card);
    if (cardIndex !== -1) {
      focusedCardIndex = cardIndex;
    }

    // Keep the current focus position for channel history
    if (selectedCategoryId === "channelHistory") {
      const cardIndex = Array.from(qsa(".channel-card")).indexOf(card);
      if (cardIndex !== -1) {
        focusedCardIndex = cardIndex;
        focusCards(cardIndex);
      }
    }

    // Ensure the card is properly focused in the UI
    setTimeout(() => {
      focusCards(focusedCardIndex);
    }, 100);

    setTimeout(() => {
      refreshCategoryCountsOnly();
    }, 100);
  };

  const handleFullscreenBorder = () => {
    // Check both document fullscreen AND Flowplayer fullscreen state
    const isDocumentFullscreen =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement;

    // Check if Flowplayer is in fullscreen mode
    const isFlowplayerFullscreen =
      window.livePlayer &&
      typeof window.livePlayer.fullscreen === "function" &&
      window.livePlayer.fullscreen();

    const isFullscreen = isDocumentFullscreen || isFlowplayerFullscreen;

    const playerDiv = document.querySelector(".live-video-player-div");

    if (playerDiv) {
      if (isFullscreen) {
        // Remove border in fullscreen
        playerDiv.style.border = "none";
        // Hide play/pause controls in fullscreen by default
        hidePlayPauseControls();
      } else {
        // CASE 3: When coming back from fullscreen, show controls and focus on play/pause
        playerDiv.style.border = "6px solid var(--gold)";
        showPlayPauseControls();

        // Focus on play/pause button when exiting fullscreen
        setTimeout(() => {
          let playPauseBtn = null;
          const videoJsPlayPause = document.querySelector(".play-pause-icon");
          const flowPlayerPlayPause = document.getElementById(
            "live-play-pause-btn"
          );

          if (videoJsPlayPause) {
            playPauseBtn = videoJsPlayPause;
          } else if (flowPlayerPlayPause) {
            playPauseBtn = flowPlayerPlayPause;
          }

          if (playPauseBtn) {
            playPauseBtn.classList.add("play-pause-btn-focused");
            setFlags(false, false, false, false, false);
          }

          // DON'T auto-hide when coming back from fullscreen - keep controls visible
          // Remove or comment out this line:
          // setTimeout(autoHideAllControls, 5000);
        }, 100);
      }
    }
  };

  const refreshCategoryCountsOnly = () => {
    // Force cache invalidation to get fresh data
    cachedFilteredCategories = null;

    const filtered = getFilteredCategories();
    const categoryList = qs(".livetv-channels-list");
    if (categoryList) {
      const allCategories = qsa(".livetv-channel-category");

      allCategories.forEach((catEl) => {
        const catId = catEl.dataset.categoryId;
        const category = filtered.find((c) => c.category_id === catId);
        if (category) {
          const countEl = catEl.querySelector(".livetv-channel-category-count");
          if (countEl) {
            let channelCount = category.channels.length;

            // For special categories, always get fresh counts
            if (catId === "favorites") {
              const currentPlaylistName = JSON.parse(
                localStorage.getItem("selectedPlaylist")
              ).playlistName;
              const freshPlaylistData = JSON.parse(
                localStorage.getItem("playlistsData")
              ).find((pl) => pl.playlistName === currentPlaylistName);
              channelCount =
                freshPlaylistData && freshPlaylistData.favoritesLiveTV
                  ? freshPlaylistData.favoritesLiveTV.length
                  : 0;
            } else if (catId === "channelHistory") {
              const currentPlaylistName = JSON.parse(
                localStorage.getItem("selectedPlaylist")
              ).playlistName;
              const freshPlaylistData = JSON.parse(
                localStorage.getItem("playlistsData")
              ).find((pl) => pl.playlistName === currentPlaylistName);
              const continueLimit =
                parseInt(
                  freshPlaylistData ? freshPlaylistData.continueLimit : 0
                ) || 0;
              const fullHistory = freshPlaylistData
                ? freshPlaylistData.ChannelListLive
                : [];
              channelCount =
                continueLimit > 0 && fullHistory
                  ? Math.min(continueLimit, fullHistory.length)
                  : fullHistory
                  ? fullHistory.length
                  : 0;
            }

            countEl.textContent = channelCount;
          }
        }
      });
    }
  };
  const showPlayPauseControls = () => {
    // Don't show controls if video is loading
    const loadingEl = document.querySelector(".live-video-loader");
    const isVideoLoading = loadingEl && !loadingEl.classList.contains("hidden");
    if (isVideoLoading) {
      return;
    }

    // Check if we're in fullscreen
    const isFullscreen =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      (window.livePlayer &&
        typeof window.livePlayer.fullscreen === "function" &&
        window.livePlayer.fullscreen());

    // Show Video.js play/pause button
    const videoJsPlayPause = document.querySelector(".play-pause-icon");
    if (videoJsPlayPause) {
      videoJsPlayPause.style.display = "block";
    }

    // Show Flowplayer play/pause button
    const flowPlayerPlayPause = document.getElementById("live-play-pause-btn");
    if (flowPlayerPlayPause) {
      flowPlayerPlayPause.style.display = "block";
    }

    // Show Flowplayer controls
    const flowplayerControls = document.querySelector(".fp-controls");
    if (flowplayerControls) {
      flowplayerControls.style.visibility = "visible";
    }

    // CASE 2: Only show aspect ratio buttons when NOT in fullscreen
    if (!isFullscreen) {
      const videoJsAspectBtn = document.getElementById("videojs-aspect-ratio");
      if (videoJsAspectBtn) {
        videoJsAspectBtn.style.display = "block";
      }

      const flowAspectBtn = document.getElementById("flow-aspect-ratio");
      if (flowAspectBtn) {
        flowAspectBtn.style.display = "block";
      }
    } else {
      // In fullscreen, show aspect ratio buttons when controls are manually shown
      const videoJsAspectBtn = document.getElementById("videojs-aspect-ratio");
      if (videoJsAspectBtn) {
        videoJsAspectBtn.style.display = "block";
      }

      const flowAspectBtn = document.getElementById("flow-aspect-ratio");
      if (flowAspectBtn) {
        flowAspectBtn.style.display = "block";
      }
    }
  };
  const hidePlayPauseControls = () => {
    // Hide Video.js play/pause button
    const videoJsPlayPause = document.querySelector(".play-pause-icon");
    if (videoJsPlayPause) {
      videoJsPlayPause.style.display = "none";
    }

    // Hide Flowplayer play/pause button
    const flowPlayerPlayPause = document.getElementById("live-play-pause-btn");
    if (flowPlayerPlayPause) {
      flowPlayerPlayPause.style.display = "none";
    }

    // Hide Flowplayer controls
    const flowplayerControls = document.querySelector(".fp-controls");
    if (flowplayerControls) {
      flowplayerControls.style.visibility = "hidden";
    }

    // ALWAYS HIDE ASPECT RATIO BUTTONS WHEN HIDING CONTROLS
    const videoJsAspectBtn = document.getElementById("videojs-aspect-ratio");
    if (videoJsAspectBtn) {
      videoJsAspectBtn.style.display = "none";
    }

    const flowAspectBtn = document.getElementById("flow-aspect-ratio");
    if (flowAspectBtn) {
      flowAspectBtn.style.display = "none";
    }
  };

  const hideAllControls = () => {
    // Hide Video.js play/pause button
    const videoJsPlayPause = document.querySelector(".play-pause-icon");
    if (videoJsPlayPause) {
      videoJsPlayPause.style.display = "none";
    }

    // Hide Flowplayer play/pause button
    const flowPlayerPlayPause = document.getElementById("live-play-pause-btn");
    if (flowPlayerPlayPause) {
      flowPlayerPlayPause.style.display = "none";
    }

    // Hide Flowplayer controls
    const flowplayerControls = document.querySelector(".fp-controls");
    if (flowplayerControls) {
      flowplayerControls.style.visibility = "hidden";
    }

    // HIDE ASPECT RATIO BUTTONS - ADD THIS
    const videoJsAspectBtn = document.getElementById("videojs-aspect-ratio");
    if (videoJsAspectBtn) {
      videoJsAspectBtn.style.display = "none";
    }

    const flowAspectBtn = document.getElementById("flow-aspect-ratio");
    if (flowAspectBtn) {
      flowAspectBtn.style.display = "none";
    }

    // Remove focus from all buttons
    document
      .querySelectorAll(
        ".play-pause-btn-focused, .videojs-aspect-ratio-btn-focused, .flow-aspect-ratio-btn-focused"
      )
      .forEach((btn) => {
        btn.classList.remove(
          "play-pause-btn-focused",
          "videojs-aspect-ratio-btn-focused",
          "flow-aspect-ratio-btn-focused"
        );
      });
  };

  const disposeLivePlayer = () => {
    if (window.livePlayer) {
      try {
        window.livePlayer.dispose();
      } catch (error) {
        console.log("Error disposing live player:", error);
      }
      window.livePlayer = null;
    }
  };
  const handleEnterRelease = () => {
    clearTimeout(enterPressTimer);
    isEnterPressed = false;
  };
  const removeVolumeHandlers = () => {
    if (window._liveTvVolumeHandler) {
      document.removeEventListener("keydown", window._liveTvVolumeHandler);
      window._liveTvVolumeHandler = null;
    }
    window._liveTvVolumeHandlerAttached = false;
  };

  const currentPlaylistName = JSON.parse(
    localStorage.getItem("selectedPlaylist")
  ).playlistName;
  const currentPlaylist = JSON.parse(
    localStorage.getItem("playlistsData")
  ).filter((pl) => pl.playlistName === currentPlaylistName)[0];

  const allFavoritesLiveTV = currentPlaylist.favoritesLiveTV;

  const unlockedLiveAdultCatIds = new Set(); // For regular category unlocking
  const unlockedLiveAdultChannelsInAll = new Set(); // For channels unlocked in "All"
  const unlockedLiveAdultChannelsInFavorites = new Set(); // For channels unlocked in "Favorites"
  const unlockedLiveAdultChannelsInHistory = new Set(); // For channels unlocked in "Channel History"

  const isLiveAdultCategory = (name) => {
    const normalized = (name || "").trim().toLowerCase();
    const configured = Array.isArray(adultsCategories) ? adultsCategories : [];
    if (configured.includes(normalized)) return true;
    return /(adult|xxx|18\+|18\s*plus|sex|porn|nsfw)/i.test(normalized);
  };

  let selectedCategoryId = "All";

  let focusedCategoryIndex = 0,
    focusedCardIndex = 0;
  let inChannelList = true,
    inCardList = false,
    inSearch = false,
    inMenu = false,
    inVideoPlayer = false;
  let isRetryButton = false;
  let searchQuery = "",
    currentChunk = 1,
    categoryChunk = 1;
  const pageSize = 20;
  let cachedFilteredCategories = null;
  let lastSearchQuery = "";
  let lastSelectedCategoryId = "";
  const qsa = (s) => [...document.querySelectorAll(s)];
  const qs = (s) => document.querySelector(s);

  const setFlags = (ch, se, me, ca, vp) => {
    inChannelList = ch;
    inSearch = se;
    inMenu = me;
    inCardList = ca;
    inVideoPlayer = vp;
  };

  const scrollToElement = (el) => {
    const container =
      el.closest(".livetv-channels-list-container") ||
      el.closest(".livetv-channels-list");
    if (container)
      container.scrollTop =
        el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
  };

  const setFocus = (list, idx, cls) => {
    const arr = Array.isArray(list) ? list : [list];
    arr.forEach((el) => el.classList.remove(cls));
    if (arr[idx]) {
      arr[idx].classList.add(cls);
      arr[idx].scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }
  };

  const clearHeaderFocus = () => {
    qs("#livetv-header-search").classList.remove(
      "livetv-header-search-focused"
    );
    qs(".livetv-header-menu").classList.remove("livetv-header-menu-focused");
  };

  const focusSearch = () => {
    qsa(".channel-card, .livetv-channel-category-focused").forEach((e) =>
      e.classList.remove(
        "channel-card-focused",
        "livetv-channel-category-focused"
      )
    );
    clearHeaderFocus();
    setFlags(false, true, false, false, false);
    qs("#livetv-header-search").classList.add("livetv-header-search-focused");
  };
  const focusMenu = () => {
    clearHeaderFocus();
    setFlags(false, false, true, false, false);
    qs(".livetv-header-menu").classList.add("livetv-header-menu-focused");
  };
  const focusCategories = (idx = 0) => {
    clearHeaderFocus();
    setFlags(true, false, false, false, false);
    qsa(".channel-card").forEach((e) =>
      e.classList.remove("channel-card-focused")
    );
    const cats = qsa(".livetv-channel-category");
    focusedCategoryIndex = Math.max(0, Math.min(idx, cats.length - 1));
    setFocus(cats, focusedCategoryIndex, "livetv-channel-category-focused");
  };
  const focusCards = (idx = 0) => {
    clearHeaderFocus();
    setFlags(false, false, false, true, false);
    qsa(".livetv-channel-category").forEach((e) =>
      e.classList.remove("livetv-channel-category-focused")
    );
    const cards = qsa(".channel-card");
    focusedCardIndex = Math.max(0, Math.min(idx, cards.length - 1));
    setFocus(cards, focusedCardIndex, "channel-card-focused");
  };

  const showVideoPlayerControls = () => {
    if (document.querySelector(".play-pause-icon")) {
      document.querySelector(".play-pause-icon").style.display = "block";
    }
    if (document.querySelector("#live-play-pause-btn")) {
      document.querySelector("#live-play-pause-btn").style.display = "block";
    }
    // Show Flow Player controls
    if (document.querySelector(".fp-controls")) {
      document.querySelector(".fp-controls").style.visibility = "visible";
    }
  };

  // const focusVideoPlayer = () => {
  //   clearHeaderFocus();
  //   qsa(".channel-card, .livetv-channel-category").forEach((e) =>
  //     e.classList.remove(
  //       "channel-card-focused",
  //       "livetv-channel-category-focused"
  //     )
  //   );
  //   setFlags(false, false, false, false, true);
  //   const fullscreenBtn = qs("#live-fullscreen-btn");
  //   if (fullscreenBtn) {
  //     fullscreenBtn.classList.add("live-control-btn-focused");
  //   }
  // };

  const getFilteredCategories = () => {
    if (
      selectedCategoryId === "favorites" ||
      selectedCategoryId === "channelHistory"
    ) {
      cachedFilteredCategories = null;
    }

    if (
      cachedFilteredCategories &&
      (selectedCategoryId === "favorites" ||
        selectedCategoryId === "channelHistory")
    ) {
      cachedFilteredCategories = null;
    }

    if (
      cachedFilteredCategories &&
      searchQuery === lastSearchQuery &&
      selectedCategoryId === lastSelectedCategoryId
    ) {
      return cachedFilteredCategories;
    }

    // Always get fresh playlist data to ensure we have the latest favorites and history
    const currentPlaylistName = JSON.parse(
      localStorage.getItem("selectedPlaylist")
    ).playlistName;
    const currentPlaylist = JSON.parse(
      localStorage.getItem("playlistsData")
    ).find((pl) => pl.playlistName === currentPlaylistName);

    const freshPlaylistData = JSON.parse(
      localStorage.getItem("playlistsData")
    ).find((pl) => pl.playlistName === currentPlaylistName);
    const updatedFavorites = freshPlaylistData
      ? freshPlaylistData.favoritesLiveTV
      : [];

    const continueLimit = parseInt(currentPlaylist.continueLimit) || 0;
    let channelHistory = currentPlaylist.ChannelListLive || [];

    if (continueLimit > 0) {
      channelHistory = channelHistory.slice(0, continueLimit);
    }
    const seenCategoryIds = new Set();

    const filteredCategories = categories
      .filter((c) => {
        if (!c) return false;
        // Remove duplicates by checking category_id
        if (seenCategoryIds.has(c.category_id)) {
          return false;
        }
        seenCategoryIds.add(c.category_id);
        return true;
      })
      .map((c) => {
        let categoryChannels =
          allStreams.filter((s) => s.category_id === c.category_id) || [];

        if (searchQuery.trim() && selectedCategoryId === c.category_id) {
          categoryChannels = categoryChannels.filter((ch) =>
            (ch.name || "").toLowerCase().includes(searchQuery.toLowerCase())
          );
        }

        return {
          ...c,
          channels: categoryChannels || [],
        };
      });

    const allLiveStreams =
      searchQuery.trim() && selectedCategoryId === "All"
        ? window.allLiveStreams.filter((ch) =>
            (ch.name || "").toLowerCase().includes(searchQuery.toLowerCase())
          )
        : window.allLiveStreams;

    const favoritesChannels =
      searchQuery.trim() && selectedCategoryId === "favorites"
        ? updatedFavorites.filter((ch) =>
            (ch.name || "").toLowerCase().includes(searchQuery.toLowerCase())
          )
        : updatedFavorites;

    const historyChannels =
      searchQuery.trim() && selectedCategoryId === "channelHistory"
        ? channelHistory.filter((ch) =>
            (ch.name || "").toLowerCase().includes(searchQuery.toLowerCase())
          )
        : channelHistory;

    const result = [
      {
        category_id: "All",
        category_name: "All",
        channels: allLiveStreams || [],
      },
      {
        category_id: "favorites",
        category_name: "Favorites",
        channels: favoritesChannels || [],
      },
      {
        category_id: "channelHistory",
        category_name: "Channel History",
        channels: historyChannels || [],
      },
      ...filteredCategories,
    ];

    // Cache the result
    cachedFilteredCategories = result;
    lastSearchQuery = searchQuery;
    lastSelectedCategoryId = selectedCategoryId;

    return result;
  };

  // Define showChannelHistoryDialog function
  const showChannelHistoryDialog = (item, isFav, card) => {
    // Create
    if (localStorage.getItem("currentPage") !== "liveTvPage") return;

    const dialog = document.createElement("div");
    dialog.className = "channel-history-dialog";
    dialog.innerHTML = `
    <div class="dialog-overlay"></div>
    <div class="dialog-content">
      <h3>${item.name ? item.name : "N/A"}</h3>
      <div class="dialog-option" data-action="toggleFavorite">
      ${
        isFav
          ? `<i class="fa-regular fa-heart" style="color: #ff0000;"></i>`
          : `<i class="fa-solid fa-heart" style="color: #ff0000;"></i>`
      }
        <span>${isFav ? "Remove from" : "Add to"} Favorites</span>
      </div>
      <div class="dialog-option" data-action="removeFromHistory">
        <i class="fa-solid fa-trash " style="color: white;"></i>
        <span>Remove from Channel History</span>
      </div>
    </div>
  `;

    document.body.appendChild(dialog);

    const clickHandler = (e) => {
      const option = e.target.closest(".dialog-option");
      if (option) {
        const action = option.dataset.action;
        if (action === "toggleFavorite") {
          const result = window.toggleFavoriteItem(item, "favoritesLiveTV");
          const favBtn = card.querySelector(".channel-fav-btn");
          if (favBtn) {
            favBtn.innerHTML = result.isFav
              ? `<i class="fa-solid fa-heart"></i>`
              : `<i class="fa-regular fa-heart"></i>`;
          }

          invalidateCategoryCache();
          renderChannels();
          refreshCategoryCountsOnly();
          setTimeout(() => refreshCategoryCountsOnly(), 150);
          Toaster.showToast(
            result.isFav ? "success" : "error",
            result.isFav ? "Added to favoritesddd" : "Removed from favoritesddd"
          );
        } else if (action === "removeFromHistory") {
          window.removeFromChannelHistory(item.stream_id);
          invalidateCategoryCache();
          renderChannels();
          refreshCategoryCountsOnly();
          setTimeout(() => refreshCategoryCountsOnly(), 150);
        }
        closeDialog();
      } else if (e.target.closest(".dialog-overlay")) {
        closeDialog();
      }
    };

    const keyHandler = (e) => {
      const backKeys = [10009, "Escape", "Back", "BrowserBack", "XF86Back"];
      if (backKeys.includes(e.key) || backKeys.includes(e.keyCode)) {
        closeDialog();
      } else if (e.key === "Enter") {
        const focusedOption = dialog.querySelector(".dialog-option.focused");
        if (focusedOption) {
          focusedOption.click();
        }
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const options = dialog.querySelectorAll(".dialog-option");
        const focusedOption = dialog.querySelector(".dialog-option.focused");
        let index = 0;

        if (focusedOption) {
          focusedOption.classList.remove("focused");
          index = Array.from(options).indexOf(focusedOption);
          index =
            e.key === "ArrowUp"
              ? (index - 1 + options.length) % options.length
              : (index + 1) % options.length;
        }

        options[index].classList.add("focused");
      }
    };

    // Focus the first option by default
    const options = dialog.querySelectorAll(".dialog-option");
    if (options.length > 0) {
      options[0].classList.add("focused");
    }

    // Add event listeners
    document.addEventListener("click", clickHandler);
    document.addEventListener("keydown", keyHandler);

    // Function to close the dialog
    const closeDialog = () => {
      document.removeEventListener("click", clickHandler);
      document.removeEventListener("keydown", keyHandler);
      document.body.removeChild(dialog);
      // Refocus the card
      if (card) {
        card.focus();
      }
    };
  };

  // const updateCategoryCounts = () => {
  //   const filtered = getFilteredCategories();
  //   const categoryList = qs(".livetv-channels-list");
  //   if (categoryList) {
  //     const categoriesToShow = filtered.slice(0, categoryChunk * categoryPageSize);

  //     // Build HTML string for better performance
  //     let categoryHTML = '';
  //     categoriesToShow.forEach(c => {
  //       // ALWAYS get fresh counts for special categories
  //       let channelCount = c.channels ? c.channels.length : c.channels.length;

  //       if (c.category_id === "favorites") {
  //         const currentPlaylistName = JSON.parse(localStorage.getItem("selectedPlaylist")).playlistName;
  //         const freshPlaylistData = JSON.parse(localStorage.getItem("playlistsData")).find(pl => pl.playlistName === currentPlaylistName);
  //         channelCount = freshPlaylistData ? freshPlaylistData.favoritesLiveTV.length : 0;
  //       } else if (c.category_id === "channelHistory") {
  //         const currentPlaylistName = JSON.parse(localStorage.getItem("selectedPlaylist")).playlistName;
  //         const freshPlaylistData = JSON.parse(localStorage.getItem("playlistsData")).find(pl => pl.playlistName === currentPlaylistName);
  //         const continueLimit = parseInt(freshPlaylistData ? freshPlaylistData.continueLimit : 0) || 0;
  //         const fullHistory = freshPlaylistData ? freshPlaylistData.ChannelListLive : [];
  //         channelCount = continueLimit > 0 ? Math.min(continueLimit, fullHistory.length) : fullHistory.length;
  //       }

  //       categoryHTML += `
  //         <div class="livetv-channel-category-container">
  //           <div class="livetv-channel-category"
  //                data-category-id="${c.category_id}"
  //                data-category-name="${c.category_name}">
  //             <p class="livetv-channel-category-name">${c.category_name}</p>
  //             <p class="livetv-channel-category-count">${channelCount}</p>
  //           </div>
  //         </div>`;
  //     });

  //     categoryList.innerHTML = categoryHTML;
  //     highlightActiveCategory();
  //   }
  // };

  const handleLongPressEnter = (card) => {
    const streamId = card.dataset.streamId;
    const item = {
      stream_id: streamId,
      name: card.dataset.name,
      direct_source: card.dataset.url,
      stream_icon: card.dataset.logo,
    };

    const isFav = window.isItemFavoriteForPlaylist(item, "favoritesLiveTV");

    if (selectedCategoryId === "channelHistory") {
      showChannelHistoryDialog(item, isFav, card);
    } else {
      // STORE CURRENT FOCUS STATE BEFORE MAKING CHANGES
      const currentFocusedCardIndex = focusedCardIndex;
      const allCardsBefore = qsa(".channel-card");

      const result = window.toggleFavoriteItem(item, "favoritesLiveTV");
      cachedFilteredCategories = null;

      const favBtn = card.querySelector(".channel-fav-btn");
      if (favBtn) {
        favBtn.innerHTML = result.isFav
          ? `<i class="fa-solid fa-heart"></i>`
          : `<i class="fa-regular fa-heart"></i>`;
      }

      invalidateCategoryCache();

      Toaster.showToast(
        result.isFav ? "success" : "error",
        `Channel ${result.isFav ? "added" : "removed"} from favorites2`
      );

      // CRITICAL FIX: Handle card removal from favorites category
      if (selectedCategoryId === "favorites" && !result.isFav) {
        // Card should be removed from favorites category
        card.remove();

        // Update focus properly after removal
        const allCardsAfter = qsa(".channel-card");

        if (allCardsAfter.length > 0) {
          // If we removed the last card, go to the new last card
          if (currentFocusedCardIndex >= allCardsAfter.length) {
            focusedCardIndex = allCardsAfter.length - 1;
          } else {
            // Otherwise maintain position but account for the removed card
            focusedCardIndex = Math.min(
              currentFocusedCardIndex,
              allCardsAfter.length - 1
            );
          }
          focusCards(focusedCardIndex);
        } else {
          // No cards left, go back to categories
          focusCategories(focusedCategoryIndex);
        }
      } else {
        // For other categories or when adding to favorites, just update UI
        focusCards(currentFocusedCardIndex);
      }

      refreshCategoryCountsOnly();
      setTimeout(() => refreshCategoryCountsOnly(), 150);
    }
  };

  const highlightActiveCategory = () => {
    const allCategories = qsa(".livetv-channel-category");
    allCategories.forEach((el) => {
      // Remove active class from ALL categories first
      el.classList.remove("livetv-channel-category-active");
      // Add active class ONLY to the currently selected category
      if (el.dataset.categoryId === String(selectedCategoryId)) {
        el.classList.add("livetv-channel-category-active");
      }
    });
  };

  const loadMoreCategories = () => {
    const filtered = getFilteredCategories();
    const categoryList = qs(".livetv-channels-list");
    if (!categoryList) return;

    const alreadyLoaded = (categoryChunk - 1) * categoryPageSize;
    const categoriesToLoad = filtered.slice(
      alreadyLoaded,
      categoryChunk * categoryPageSize
    );

    if (categoriesToLoad.length === 0) return;

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    categoriesToLoad.forEach((c) => {
      if (!c) return;

      const isAdult = isLiveAdultCategory(c.category_name);
      const parentalEnabled = !!currentPlaylist.parentalPassword;
      const isUnlocked = unlockedLiveAdultCatIds.has(String(c.category_id));

      const container = document.createElement("div");
      container.className = "livetv-channel-category-container";

      container.innerHTML = `
      <div class="livetv-channel-category" 
           data-category-id="${c.category_id}" 
           data-category-name="${c.category_name}">
        ${
          parentalEnabled && isAdult && !isUnlocked
            ? '<i class="fas fa-lock livetv-category-lock-icon"></i>'
            : ""
        }
        <p class="livetv-channel-category-name">${c.category_name}</p>
        <p class="livetv-channel-category-count">${
          c.channels ? c.channels.length : 0
        }</p>
      </div>
    `;
      fragment.appendChild(container);
    });

    categoryList.appendChild(fragment);
  };

  const renderChannels = (isAppend = false, categoryChangeOnly = false) => {
    const container = qs(".livetv-content-container");
    if (!container) return;

    // Show full page loading spinner (excluding header) on initial load or category change
    if (!isAppend && !categoryChangeOnly) {
      container.innerHTML = `
      <div class="livetv-fullpage-loading">
      <div class="spinner"></div>
      </div>`;

      // Load categories and channels in background
      setTimeout(() => {
        renderChannelsContent(isAppend, categoryChangeOnly);
      }, 50);
      return;
    } else if (categoryChangeOnly) {
      // Show loading overlay for category changes
      const existingOverlay = qs(".livetv-loading-overlay");
      if (existingOverlay) existingOverlay.remove();

      const loadingOverlay = document.createElement("div");
      loadingOverlay.className = "livetv-loading-overlay";
      loadingOverlay.innerHTML = `
      <div class="livetv-loading-content">
       <div class="spinner"></div>
      </div>
    `;
      container.appendChild(loadingOverlay);

      setTimeout(() => {
        renderChannelsContent(isAppend, categoryChangeOnly);
      }, 50);
      return;
    }

    // For append operations, just render content directly
    renderChannelsContent(isAppend, categoryChangeOnly);
  };

  const renderChannelsContent = (
    isAppend = false,
    categoryChangeOnly = false
  ) => {
    const container = qs(".livetv-content-container");
    if (!container) return;

    // Remove loading overlays
    const fullPageLoading = qs(".livetv-fullpage-loading");
    const loadingOverlay = qs(".livetv-loading-overlay");
    if (fullPageLoading) fullPageLoading.remove();
    if (loadingOverlay) loadingOverlay.remove();

    const filtered = getFilteredCategories();

    // Handle empty state - no categories found
    if (!filtered.length) {
      container.innerHTML = `
      <div class="livetv-channels-list"></div>
      <div class="livetv-channels-list-container">
        <div class="livetv-no-data-channel">
          <p>No Items Found For "${searchQuery}"</p>
        </div>
      </div>
      <div class="livetv-video-wrapper2">
        ${LiveVideoJsComponent("", "", "", "30vh", "No Channel")}
      </div>`;
      return;
    }

    // Find the best category to select
    let selectedCat = filtered.find(
      (c) => c.category_id === selectedCategoryId
    );
    if (!selectedCat) {
      selectedCat = filtered[0];
      selectedCategoryId = selectedCat.category_id;
    }

    // Rebuild container structure if needed - ONLY on initial load
    if (!isAppend && !categoryChangeOnly) {
      container.innerHTML = `<div class="livetv-channels-list"></div><div class="livetv-channels-list-container"></div><div class="livetv-video-wrapper2"></div>`;
    }

    const categoryList = qs(".livetv-channels-list");
    if (categoryList && (!isAppend || searchQuery.trim())) {
      const filtered = getFilteredCategories();
      const categoriesToShow = filtered.slice(
        0,
        categoryChunk * categoryPageSize
      );

      // Store current focus before rendering
      const currentFocusedId = selectedCategoryId;

      // Build HTML string
      let categoryHTML = "";
      categoriesToShow.forEach((c) => {
        // FIX: Remove active class logic from here too - just render basic category
        categoryHTML += `
      <div class="livetv-channel-category-container">
        <div class="livetv-channel-category" 
             data-category-id="${c.category_id}" 
             data-category-name="${c.category_name}">
          ${
            !!currentPlaylist.parentalPassword &&
            isLiveAdultCategory(c.category_name) &&
            !unlockedLiveAdultCatIds.has(String(c.category_id))
              ? '<i class="fas fa-lock livetv-category-lock-icon"></i>'
              : ""
          }
          <p class="livetv-channel-category-name">${c.category_name}</p>
<p class="livetv-channel-category-count">${
          c.channels ? c.channels.length : 0
        }</p>
        </div>
      </div>`;
      });

      categoryList.innerHTML = categoryHTML;

      // Update focusedCategoryIndex to match the current selected category
      const displayedCategories = categoriesToShow.map((c) => c.category_id);
      focusedCategoryIndex = displayedCategories.indexOf(currentFocusedId);

      // If current category not found in displayed list, use first one
      if (focusedCategoryIndex === -1 && displayedCategories.length > 0) {
        focusedCategoryIndex = 0;
        selectedCategoryId = displayedCategories[0];
      }

      // FIX: Call highlightActiveCategory to set the active class properly
      highlightActiveCategory();

      if (inChannelList) {
        const updatedCategories = qsa(".livetv-channel-category");
        if (updatedCategories.length > 0) {
          setFocus(
            updatedCategories,
            focusedCategoryIndex,
            "livetv-channel-category-focused"
          );
        }
      }
    }

    const listContainer = qs(".livetv-channels-list-container");

    // Handle empty channels in selected category
    if (!selectedCat.channels || selectedCat.channels.length === 0) {
      if (listContainer) {
        listContainer.innerHTML = `
        <div class="livetv-no-data-channel-category">
          <p>No channels found in this category</p>
        </div>`;
      }

      const videoWrapper = qs(".livetv-video-wrapper2");
      if (videoWrapper) {
        disposeLivePlayer();
        videoWrapper.innerHTML = LiveVideoJsComponent(
          "",
          "",
          "",
          "30vh",
          "No Channel"
        );
      }

      highlightActiveCategory();
      if (inChannelList) {
        setFocus(
          qsa(".livetv-channel-category"),
          focusedCategoryIndex,
          "livetv-channel-category-focused"
        );
      }
      return;
    }

    // Clear container for channel cards (only if not appending)
    if (!isAppend && listContainer) {
      listContainer.innerHTML = "";
    }

    // Render channel cards in chunks
    const alreadyLoaded = (currentChunk - 1) * pageSize;
    const sortValue = localStorage.getItem("movieSortValue") || "default";
    const sortedChannels = (() => {
      switch (sortValue) {
        case "recent":
          return [...selectedCat.channels].sort((a, b) => {
            const tA = new Date(a.added || a.created_at || 0).getTime();
            const tB = new Date(b.added || b.created_at || 0).getTime();
            return tB - tA;
          });
        case "az":
          return [...selectedCat.channels].sort((a, b) =>
            (a.name || "").localeCompare(b.name || "")
          );
        case "za":
          return [...selectedCat.channels].sort((a, b) =>
            (b.name || "").localeCompare(a.name || "")
          );
        case "top":
          return [...selectedCat.channels].sort(
            (a, b) => (b.rating_5based || 0) - (a.rating_5based || 0)
          );
        default:
          return selectedCat.channels;
      }
    })();

    const newChannels = sortedChannels.slice(
      alreadyLoaded,
      currentChunk * pageSize
    );

    newChannels.forEach((ch) => {
      const isFav = window.isItemFavoriteForPlaylist(ch, "favoritesLiveTV");
      const isAdultChannel = isLiveAdultCategory(ch.name);
      const parentalEnabled = !!currentPlaylist.parentalPassword;

      // DETERMINE WHICH UNLOCK SET TO CHECK BASED ON CURRENT CATEGORY
      let isChannelUnlocked = true;

      if (isAdultChannel && parentalEnabled) {
        if (selectedCategoryId === "All") {
          isChannelUnlocked = unlockedLiveAdultChannelsInAll.has(
            String(ch.stream_id)
          );
        } else if (selectedCategoryId === "favorites") {
          isChannelUnlocked = unlockedLiveAdultChannelsInFavorites.has(
            String(ch.stream_id)
          );
        } else if (selectedCategoryId === "channelHistory") {
          isChannelUnlocked = unlockedLiveAdultChannelsInHistory.has(
            String(ch.stream_id)
          );
        } else {
          // For regular categories, check category unlocking
          const category = categories.find(
            (cat) => cat.category_id === selectedCategoryId
          );
          isChannelUnlocked = category
            ? unlockedLiveAdultCatIds.has(String(category.category_id))
            : true;
        }
      }

      const card = document.createElement("div");
      card.className = "channel-card";
      card.dataset.name = ch.name;
      card.dataset.url = ch.direct_source;
      card.dataset.logo = ch.stream_icon || "/assets/placeholder.png";
      card.dataset.streamId = ch.stream_id;
      card.dataset.isAdult = isAdultChannel;

      card.innerHTML = `
    <div class="channel-card-logo-wrapper ${
      isAdultChannel && parentalEnabled && !isChannelUnlocked
        ? "channel-card-locked"
        : ""
    }">
      <img class="channel-card-logo" onerror="this.onerror=null; this.src='/assets/noImageFound.png';" src="${
        ch.stream_icon || "/assets/noImageFound.png"
      }" alt="${ch.name}"/>
      ${
        isAdultChannel && parentalEnabled && !isChannelUnlocked
          ? '<i class="fas fa-lock channel-card-lock-icon"></i>'
          : ""
      }
    </div>
    <div class="channel-card-info">
      <p class="channel-card-name">${ch.name}</p>
      <div class="channel-card-buttons">
        ${
          selectedCategoryId === "channelHistory"
            ? `<button class="channel-fav-btn" data-stream-id="${ch.stream_id}">
            ${
              isFav
                ? `<i class="fa-solid fa-heart"></i>`
                : `<i class="fa-regular fa-heart"></i>`
            }
          </button>
          <button class="channel-remove-btn" data-stream-id="${ch.stream_id}">
            <i class="fa-solid fa-xmark" style="font-weight: 900; font-size: 14px;"></i>
          </button>`
            : `<button class="channel-fav-btn" data-stream-id="${ch.stream_id}">
            ${
              isFav
                ? `<i class="fa-solid fa-heart"></i>`
                : `<i class="fa-regular fa-heart"></i>`
            }
          </button>`
        }
      </div>
    </div>`;

      if (listContainer) {
        listContainer.appendChild(card);
      }
    });

    if (!isAppend && categoryChangeOnly) {
      const videoWrapper = qs(".livetv-video-wrapper2");
      if (videoWrapper) {
        disposeLivePlayer();
        videoWrapper.innerHTML = LiveVideoJsComponent(
          "",
          "",
          "",
          "50vh",
          "Please select any channel to play"
        );
      }
    }

    if (!isAppend && !categoryChangeOnly && newChannels.length > 0) {
      const videoWrapper = qs(".livetv-video-wrapper2");
      const hasActiveVideo =
        videoWrapper &&
        (videoWrapper.querySelector("video") ||
          videoWrapper.querySelector(".flowplayer") ||
          window.livePlayer);

      if (videoWrapper && !hasActiveVideo) {
        videoWrapper.innerHTML = LiveVideoJsComponent(
          "",
          "",
          "",
          "50vh",
          "Please select any channel to play"
        );
      }
    }

    // Update focus states
    highlightActiveCategory();
    if (inChannelList) {
      setFocus(
        qsa(".livetv-channel-category"),
        focusedCategoryIndex,
        "livetv-channel-category-focused"
      );
    }
    if (inCardList) {
      if (!isAppend && !categoryChangeOnly) {
        focusedCardIndex = 0;
      }
      setFocus(qsa(".channel-card"), focusedCardIndex, "channel-card-focused");
    }
    setTimeout(() => {
      refreshCategoryCountsOnly();
    }, 50);
  };

  setTimeout(() => {
    if (LiveTvPage.cleanup) LiveTvPage.cleanup();

    removeVolumeHandlers();

    // Prevent Enter key from triggering play/pause when video container is focused
    const preventVideoEnter = (e) => {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;

      if (e.key === "Enter" || e.keyCode === 13) {
        const videoContainer = document.querySelector(".live-video-player-div");
        if (
          videoContainer &&
          videoContainer.style.border === "6px solid var(--gold)"
        ) {
          const isPlayPauseFocused = document.getElementById(
            "live-play-pause-btn"
          )
            ? document
                .getElementById("live-play-pause-btn")
                .classList.contains("play-pause-btn-focused")
            : false;

          // If video container has gold border AND play/pause is NOT focused, prevent Enter
          if (!isPlayPauseFocused) {
            e.stopPropagation();
            e.preventDefault();

            // Trigger fullscreen instead
            const fullscreenBtn = document.getElementById(
              "live-fullscreen-btn"
            );
            if (fullscreenBtn) {
              fullscreenBtn.click();
            }
            return;
          }
        }
      }
    };

    document.addEventListener("keydown", preventVideoEnter, true); // Capture phase

    function clickHandler(e) {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;

      const cat = e.target.closest(".livetv-channel-category");
      if (cat) {
        const catId = String(cat.dataset.categoryId);
        const catName = cat.dataset.categoryName || "";
        const isAdult = isLiveAdultCategory(catName);
        const parentalEnabled = !!currentPlaylist.parentalPassword;
        const isUnlocked = unlockedLiveAdultCatIds.has(catId);

        if (isAdult && parentalEnabled && !isUnlocked) {
          ParentalPinDialog(
            () => {
              unlockedLiveAdultCatIds.add(catId);
              selectedCategoryId = catId;
              focusedCategoryIndex = qsa(".livetv-channel-category").indexOf(
                cat
              );
              currentChunk = 1;
              // INVALIDATE CACHE
              cachedFilteredCategories = null;
              const lockEl = cat.querySelector(".livetv-category-lock-icon");
              if (lockEl) lockEl.remove();
              renderChannels(false, true);
              // FIX: highlightActiveCategory will be called in renderChannels
              setTimeout(() => focusCategories(focusedCategoryIndex), 50);
            },
            () => {
              focusCategories(focusedCategoryIndex);
            },
            currentPlaylist,
            "liveTvPage"
          );
          return;
        }

        selectedCategoryId = catId;
        focusedCategoryIndex = qsa(".livetv-channel-category").indexOf(cat);
        currentChunk = 1;

        // INVALIDATE CACHE
        cachedFilteredCategories = null;

        renderChannels(false, true);
        setTimeout(() => focusCategories(focusedCategoryIndex), 50);
        return;
      }

      const removeBtn = e.target.closest(".channel-remove-btn");
      if (removeBtn) {
        e.stopPropagation();
        e.preventDefault();

        const card = removeBtn.closest(".channel-card");
        const streamId = card.dataset.streamId;

        // Get current playlist data
        const currentPlaylistName = JSON.parse(
          localStorage.getItem("selectedPlaylist")
        ).playlistName;
        const playlistsData = JSON.parse(localStorage.getItem("playlistsData"));
        const currentPlaylistIndex = playlistsData.findIndex(
          (pl) => pl.playlistName === currentPlaylistName
        );

        if (currentPlaylistIndex !== -1) {
          // Remove from channel history immediately
          playlistsData[currentPlaylistIndex].ChannelListLive = (
            playlistsData[currentPlaylistIndex].ChannelListLive || []
          ).filter((ch) => String(ch.stream_id) !== String(streamId));

          localStorage.setItem("playlistsData", JSON.stringify(playlistsData));

          invalidateCategoryCache();
          Toaster.showToast("error", "Channel removed from history");

          // Remove card immediately from DOM
          card.remove();

          // Update focus
          const remainingCards = qsa(".channel-card");
          if (remainingCards.length > 0) {
            focusedCardIndex = Math.min(
              focusedCardIndex,
              remainingCards.length - 1
            );
            focusCards(focusedCardIndex);
          } else {
            focusCategories(focusedCategoryIndex);
          }

          refreshCategoryCountsOnly();
          setTimeout(() => refreshCategoryCountsOnly(), 100); // Double update
        }
        return;
      }
      const favBtn = e.target.closest(".channel-fav-btn");
      if (favBtn) {
        const card = favBtn.closest(".channel-card");
        const item = {
          stream_id: card.dataset.streamId,
          name: card.dataset.name,
          direct_source: card.dataset.url,
          stream_icon: card.dataset.logo,
        };

        // Store current focus state
        const currentFocusedCardIndex = focusedCardIndex;
        const allCardsBefore = qsa(".channel-card");

        // FORCE COMPLETE CACHE INVALIDATION
        cachedFilteredCategories = null;
        lastSearchQuery = "";
        lastSelectedCategoryId = "";

        // Toggle favorite
        const result = window.toggleFavoriteItem(item, "favoritesLiveTV");

        // Update button UI immediately
        favBtn.innerHTML = result.isFav
          ? `<i class="fa-solid fa-heart"></i>`
          : `<i class="fa-regular fa-heart"></i>`;

        Toaster.showToast(
          result.isFav ? "success" : "error",
          `Channel ${result.isFav ? "added" : "removed"} from favorites`
        );

        // Handle removal from favorites category
        if (selectedCategoryId === "favorites" && !result.isFav) {
          // Remove card from DOM
          card.remove();

          // Update focus after removal
          const allCardsAfter = qsa(".channel-card");
          if (allCardsAfter.length > 0) {
            focusedCardIndex = Math.min(
              currentFocusedCardIndex,
              allCardsAfter.length - 1
            );
            focusCards(focusedCardIndex);
          } else {
            focusCategories(focusedCategoryIndex);
          }
        } else {
          // For other categories, just update UI state
          focusCards(currentFocusedCardIndex);
          highlightActiveCategory();
        }

        // Refresh category counts with proper timing
        setTimeout(() => {
          refreshCategoryCountsOnly();
          setTimeout(refreshCategoryCountsOnly, 100);
        }, 50);

        e.stopPropagation();
        return;
      }

      const card = e.target.closest(".channel-card");
      const allCards = qsa(".channel-card");
      const clickedIndex = Array.from(allCards).indexOf(card);
      if (clickedIndex !== -1) {
        focusedCardIndex = clickedIndex;
      }
      if (card) {
        const isAdultChannel = card.dataset.isAdult === "true";
        const parentalEnabled = !!currentPlaylist.parentalPassword;
        const streamId = card.dataset.streamId;

        // DETERMINE WHICH UNLOCK SET TO CHECK BASED ON CURRENT CATEGORY
        let isChannelUnlocked = true;
        let unlockSet = null;

        if (isAdultChannel && parentalEnabled) {
          if (selectedCategoryId === "All") {
            isChannelUnlocked = unlockedLiveAdultChannelsInAll.has(
              String(streamId)
            );
            unlockSet = unlockedLiveAdultChannelsInAll;
          } else if (selectedCategoryId === "favorites") {
            isChannelUnlocked = unlockedLiveAdultChannelsInFavorites.has(
              String(streamId)
            );
            unlockSet = unlockedLiveAdultChannelsInFavorites;
          } else if (selectedCategoryId === "channelHistory") {
            isChannelUnlocked = unlockedLiveAdultChannelsInHistory.has(
              String(streamId)
            );
            unlockSet = unlockedLiveAdultChannelsInHistory;
          } else {
            // For regular categories, check category unlocking
            const category = categories.find(
              (cat) => cat.category_id === selectedCategoryId
            );
            isChannelUnlocked = category
              ? unlockedLiveAdultCatIds.has(String(category.category_id))
              : true;
            unlockSet = null; // Category unlocking handled differently
          }
        }

        if (
          isAdultChannel &&
          parentalEnabled &&
          !isChannelUnlocked &&
          unlockSet
        ) {
          ParentalPinDialog(
            () => {
              // Unlock this specific channel in this specific category only
              unlockSet.add(String(streamId));

              // Remove lock from only this specific card's logo wrapper
              const logoWrapper = card.querySelector(
                ".channel-card-logo-wrapper"
              );
              if (logoWrapper) {
                logoWrapper.classList.remove("channel-card-locked");
              }
              const lockIcon = card.querySelector(".channel-card-lock-icon");
              if (lockIcon) lockIcon.remove();

              // Now proceed with playing the channel
              playChannelCard(card);
            },
            () => {
              // PIN incorrect - maintain focus on the card
              focusCards(focusedCardIndex);
            },
            currentPlaylist,
            "liveTvPage"
          );
          return;
        }

        playChannelCard(card);
      }
    }

    function keyHandler(e) {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;

      const isFullscreen =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        (window.livePlayer &&
          typeof window.livePlayer.fullscreen === "function" &&
          window.livePlayer.fullscreen());

      if (isFullscreen) {
        // Handle channel change keys in fullscreen mode
        if (
          e.key === "XF86RaiseChannel" ||
          e.keyCode === 427 ||
          e.keyCode === 50
        ) {
          handleChannelChange("next");
          e.preventDefault();
          return;
        }

        if (
          e.key === "XF86LowerChannel" ||
          e.keyCode === 428 ||
          e.keyCode === 51
        ) {
          handleChannelChange("prev");
          e.preventDefault();
          return;
        }
        const backKeys = [10009, "Escape", "Back", "BrowserBack", "XF86Back"];
        const isEnter = e.key === "Enter" || e.keyCode === 13;
        const isUp = e.key === "ArrowUp" || e.keyCode === 38;
        const isDown = e.key === "ArrowDown" || e.keyCode === 40;

        // Handle back/escape keys for exiting fullscreen
        if (backKeys.includes(e.key) || backKeys.includes(e.keyCode)) {
          setPageOpen(false);

          // Enhanced fullscreen detection for Flowplayer
          const isDocumentFullscreen =
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;

          const isFlowplayerFullscreen =
            window.livePlayer &&
            typeof window.livePlayer.fullscreen === "function" &&
            window.livePlayer.fullscreen();

          if (isDocumentFullscreen || isFlowplayerFullscreen) {
            if (window.livePlayer && window.livePlayer.exitFullscreen) {
              window.livePlayer.exitFullscreen();
            } else if (
              window.livePlayer &&
              typeof window.livePlayer.fullscreen === "function"
            ) {
              // Flowplayer might use a different method - try toggling fullscreen
              window.livePlayer.fullscreen(false);
            } else {
              // Fallback to document exitFullscreen
              if (document.exitFullscreen) {
                document.exitFullscreen();
              } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
              } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
              } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
              }
            }

            // Remove focus from video player div to prevent it from being focused
            setTimeout(() => {
              const playerDiv = document.querySelector(
                ".live-video-player-div"
              );
              if (playerDiv) {
                playerDiv.blur();
                // Ensure the div doesn't receive focus
                playerDiv.style.outline = "none";
              }
            }, 150);

            e.preventDefault();
            return;
          }

          // If not in fullscreen, proceed with normal back navigation
          disposeLivePlayer();

          if (window.livePlayer) {
            try {
              window.livePlayer.dispose();
              disposeLivePlayer();
            } catch {}
            window.livePlayer = null;
          }

          localStorage.setItem("currentPage", "dashboard");
          Router.showPage("dashboard");
          return;
        }

        const autoHideAllControls = () => {
          if (window.livePlayer) {
            // Check if we're in fullscreen
            const isFullscreen =
              document.fullscreenElement ||
              document.webkitFullscreenElement ||
              document.mozFullScreenElement ||
              document.msFullscreenElement ||
              (window.livePlayer &&
                typeof window.livePlayer.fullscreen === "function" &&
                window.livePlayer.fullscreen());

            // Only auto-hide if we're in fullscreen
            if (isFullscreen) {
              // Check if video is playing
              let isPlaying = false;

              // For Video.js player
              if (typeof window.livePlayer.paused === "function") {
                isPlaying = !window.livePlayer.paused();
              }
              // For Flowplayer
              else if (
                window.livePlayer.playing &&
                typeof window.livePlayer.playing === "function"
              ) {
                isPlaying = window.livePlayer.playing();
              }

              // Hide ALL controls if video is playing AND we're in fullscreen
              if (isPlaying && isFullscreen) {
                hideAllControls();
              }
            }
            // Don't auto-hide when NOT in fullscreen - controls should stay visible
          }
        };

        // Handle Enter key in fullscreen - FIXED: Proper play/pause behavior
        // Handle Enter key in fullscreen - FIXED: Show controls on Enter when hidden
        if (isEnter) {
          // Check if aspect ratio button is focused
          const focusedVideoJsAspect = document.querySelector(
            "#videojs-aspect-ratio.videojs-aspect-ratio-btn-focused"
          );
          const focusedFlowAspect = document.querySelector(
            "#flow-aspect-ratio.flow-aspect-ratio-btn-focused"
          );
          const isAspectRatioFocused =
            focusedVideoJsAspect || focusedFlowAspect;

          if (isAspectRatioFocused) {
            // If aspect ratio button is focused, trigger its click action
            if (focusedVideoJsAspect) {
              focusedVideoJsAspect.click();
            } else if (focusedFlowAspect) {
              focusedFlowAspect.click();
            }

            // Auto-hide ALL controls after 3 seconds
            setTimeout(autoHideAllControls, 5000);
            e.preventDefault();
            return;
          }

          // Check if play/pause button is focused
          const focusedPlayPause = document.querySelector(
            ".play-pause-btn-focused"
          );
          const isPlayPauseFocused = document.getElementById(
            "live-play-pause-btn"
          )
            ? document
                .getElementById("live-play-pause-btn")
                .classList.contains("play-pause-btn-focused")
            : false;

          if (focusedPlayPause || isPlayPauseFocused) {
            // If play/pause is focused, trigger click
            if (focusedPlayPause) {
              focusedPlayPause.click();
            } else if (document.getElementById("live-play-pause-btn")) {
              document.getElementById("live-play-pause-btn").click();
            }

            // Auto-hide ALL controls after 3 seconds
            setTimeout(autoHideAllControls, 5000);
          } else {
            // CASE 1: If no focus AND we're in fullscreen, toggle play/pause AND show controls
            if (isFullscreen) {
              // Directly toggle play/pause on the player
              if (window.livePlayer) {
                if (window.livePlayer.paused && window.livePlayer.paused()) {
                  window.livePlayer.play();
                } else {
                  window.livePlayer.pause();
                }
              }

              // SHOW CONTROLS (including aspect ratio in fullscreen for visibility)
              showPlayPauseControls();

              // Focus on play/pause button
              let playPauseBtn = null;
              const videoJsPlayPause =
                document.querySelector(".play-pause-icon");
              const flowPlayerPlayPause = document.getElementById(
                "live-play-pause-btn"
              );

              if (videoJsPlayPause) {
                playPauseBtn = videoJsPlayPause;
                playPauseBtn.classList.add("play-pause-btn-focused");
              } else if (flowPlayerPlayPause) {
                playPauseBtn = flowPlayerPlayPause;
                playPauseBtn.classList.add("play-pause-btn-focused");
              }

              setFlags(false, false, false, false, false);

              // Auto-hide ALL controls after 3 seconds
              setTimeout(autoHideAllControls, 5000);
            } else {
              // If not in fullscreen, show controls and focus on play/pause
              showPlayPauseControls();

              let playPauseBtn = null;
              const videoJsPlayPause =
                document.querySelector(".play-pause-icon");
              const flowPlayerPlayPause = document.getElementById(
                "live-play-pause-btn"
              );

              if (videoJsPlayPause) {
                playPauseBtn = videoJsPlayPause;
              } else if (flowPlayerPlayPause) {
                playPauseBtn = flowPlayerPlayPause;
              }

              if (playPauseBtn) {
                playPauseBtn.classList.add("play-pause-btn-focused");
                setFlags(false, false, false, false, false);
              }

              // Auto-hide ALL controls after 3 seconds
              setTimeout(autoHideAllControls, 5000);
            }
          }

          e.preventDefault();
          return;
        }

        // Handle Arrow Down
        if (isDown) {
          // Show ALL controls when navigating
          showPlayPauseControls();

          // Remove focus from play/pause button
          const focusedPlayPause = document.querySelector(
            ".play-pause-btn-focused"
          );
          if (focusedPlayPause) {
            focusedPlayPause.classList.remove("play-pause-btn-focused");
          }

          // Focus on aspect ratio button
          const videoJsAspectBtn = document.getElementById(
            "videojs-aspect-ratio"
          );
          const flowAspectBtn = document.getElementById("flow-aspect-ratio");

          if (videoJsAspectBtn) {
            videoJsAspectBtn.classList.add("videojs-aspect-ratio-btn-focused");
            setFlags(false, false, false, false, false);
          } else if (flowAspectBtn) {
            flowAspectBtn.classList.add("flow-aspect-ratio-btn-focused");
            setFlags(false, false, false, false, false);
          }

          // Auto-hide ALL controls after 3 seconds
          setTimeout(autoHideAllControls, 5000);
          e.preventDefault();
          return;
        }

        // Handle Arrow Up
        if (isUp) {
          // Show ALL controls when navigating
          showPlayPauseControls();

          // Remove focus from aspect ratio buttons
          const focusedVideoJsAspect = document.querySelector(
            "#videojs-aspect-ratio.videojs-aspect-ratio-btn-focused"
          );
          const focusedFlowAspect = document.querySelector(
            "#flow-aspect-ratio.flow-aspect-ratio-btn-focused"
          );

          if (focusedVideoJsAspect)
            focusedVideoJsAspect.classList.remove(
              "videojs-aspect-ratio-btn-focused"
            );
          if (focusedFlowAspect)
            focusedFlowAspect.classList.remove("flow-aspect-ratio-btn-focused");

          // Focus on play/pause button
          let playPauseBtn = null;
          const videoJsPlayPause = document.querySelector(".play-pause-icon");
          const flowPlayerPlayPause = document.getElementById(
            "live-play-pause-btn"
          );

          if (videoJsPlayPause) {
            playPauseBtn = videoJsPlayPause;
          } else if (flowPlayerPlayPause) {
            playPauseBtn = flowPlayerPlayPause;
          }

          if (playPauseBtn) {
            playPauseBtn.classList.add("play-pause-btn-focused");
            setFlags(false, false, false, false, false);
          }

          // Auto-hide ALL controls after 3 seconds
          setTimeout(autoHideAllControls, 5000);
          e.preventDefault();
          return;
        }

        // Block all other keys when in fullscreen
        const allowedKeys = [
          "ArrowUp",
          "ArrowDown",
          "Enter",
          "VolumeUp",
          "VolumeDown",
          "AudioVolumeUp",
          "AudioVolumeDown",
        ];
        if (
          !allowedKeys.includes(e.key) &&
          !backKeys.includes(e.key) &&
          !backKeys.includes(e.keyCode)
        ) {
          e.preventDefault();
        }
        return;
      }
      if (document.querySelector(".channel-history-dialog")) {
        return;
      }

      const channelList = qsa(".livetv-channel-category"),
        cardList = qsa(".channel-card"),
        searchInput = qs("#livetv-header-search");

      const backKeys = [10009, "Escape", "Back", "BrowserBack", "XF86Back"];

      if (backKeys.includes(e.key) || backKeys.includes(e.keyCode)) {
        setPageOpen(false);
        // First check if player is in fullscreen mode - check both document and player
        const isDocumentFullscreen =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement;

        // Check if video.js player is in fullscreen
        const isPlayerFullscreen =
          window.livePlayer &&
          window.livePlayer.isFullscreen &&
          window.livePlayer.isFullscreen();

        if (isDocumentFullscreen || isPlayerFullscreen) {
          // Exit fullscreen but don't navigate away
          if (window.livePlayer && window.livePlayer.exitFullscreen) {
            // Use video.js player's exitFullscreen method
            window.livePlayer.exitFullscreen();
          } else {
            // Fallback to document exitFullscreen
            if (document.exitFullscreen) {
              document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
              document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
              document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
              document.msExitFullscreen();
            }
          }
          e.preventDefault();
          return;
        }

        // If not in fullscreen, proceed with normal back navigation
        disposeLivePlayer();

        if (window.livePlayer) {
          try {
            window.livePlayer.dispose();
            disposeLivePlayer();
          } catch {}
          window.livePlayer = null;
        }

        localStorage.setItem("currentPage", "dashboard");
        Router.showPage("dashboard");
        return;
      }

      // Handle channel change keys in non-fullscreen mode
      if (
        e.key === "XF86RaiseChannel" ||
        e.keyCode === 427 ||
        e.keyCode === 50
      ) {
        handleChannelChange("next");
        e.preventDefault();
        return;
      }

      if (
        e.key === "XF86LowerChannel" ||
        e.keyCode === 428 ||
        e.keyCode === 51
      ) {
        handleChannelChange("prev");
        e.preventDefault();
        return;
      }

      const isUp = e.key === "ArrowUp" || e.keyCode === 38;
      const isDown = e.key === "ArrowDown" || e.keyCode === 40;
      const isLeft = e.key === "ArrowLeft" || e.keyCode === 37;
      const isRight = e.key === "ArrowRight" || e.keyCode === 39;
      const isEnter = e.key === "Enter" || e.keyCode === 13;

      if (isUp) {
        const focusedFav = qs(".channel-fav-btn-focused");
        const focusedRemove = qs(".channel-remove-btn-focused");

        const focusedPlayPause = qs(".play-pause-btn-focused");
        const isPlayPauseFocused = document.getElementById(
          "live-play-pause-btn"
        )
          ? document
              .getElementById("live-play-pause-btn")
              .classList.contains("play-pause-btn-focused")
          : false;

        // Check for focused aspect ratio buttons
        const focusedVideoJsAspect = qs(
          "#videojs-aspect-ratio.videojs-aspect-ratio-btn-focused"
        );
        const focusedFlowAspect = qs(
          "#flow-aspect-ratio.flow-aspect-ratio-btn-focused"
        );
        const isAspectRatioFocused = focusedVideoJsAspect || focusedFlowAspect;

        // Handle navigation from aspect ratio button to play/pause
        if (isAspectRatioFocused) {
          // Remove focus from aspect ratio button
          if (focusedVideoJsAspect) {
            focusedVideoJsAspect.classList.remove(
              "videojs-aspect-ratio-btn-focused"
            );
          }
          if (focusedFlowAspect) {
            focusedFlowAspect.classList.remove("flow-aspect-ratio-btn-focused");
          }

          // Focus on play/pause button
          let playPauseBtn = null;

          // Check for Video.js player play/pause button
          const videoJsPlayPause = document.querySelector(".play-pause-icon");
          if (videoJsPlayPause) {
            playPauseBtn = videoJsPlayPause;
          }

          // Check for Flowplayer play/pause button
          const flowPlayerPlayPause = document.getElementById(
            "live-play-pause-btn"
          );
          if (flowPlayerPlayPause) {
            playPauseBtn = flowPlayerPlayPause;
          }

          if (playPauseBtn) {
            playPauseBtn.classList.add("play-pause-btn-focused");
            setFlags(false, false, false, false, false);
            // Keep play/pause controls visible
            showPlayPauseControls();
          }

          e.preventDefault();
          return;
        }

        if (isEpgDivFocused) {
          const epgItems = qsa(".livetv-player-epg-item");
          if (epgItems.length > 0 && focusedEpgItemIndex >= 0) {
            epgItems.forEach((item) =>
              item.classList.remove("livetv-player-epg-item-focused")
            );

            if (focusedEpgItemIndex === 0) {
              isEpgDivFocused = false;
              focusedEpgItemIndex = -1;

              // Focus on aspect ratio button when coming from EPG
              const videoJsAspectBtn = document.getElementById(
                "videojs-aspect-ratio"
              );
              const flowAspectBtn =
                document.getElementById("flow-aspect-ratio");

              if (videoJsAspectBtn) {
                videoJsAspectBtn.classList.add(
                  "videojs-aspect-ratio-btn-focused"
                );
                setFlags(false, false, false, false, false);
                showPlayPauseControls();
              } else if (flowAspectBtn) {
                flowAspectBtn.classList.add("flow-aspect-ratio-btn-focused");
                setFlags(false, false, false, false, false);
                showPlayPauseControls();
              } else {
                // If no aspect ratio button, focus on play/pause
                setFlags(false, false, false, false, true);
                const fullscreenBtn = qs("#live-fullscreen-btn");
                if (fullscreenBtn) {
                  fullscreenBtn.classList.add("live-control-btn-focused");
                  document.querySelector(
                    ".live-video-player-div"
                  ).style.border = "6px solid var(--gold)";
                }
                // Only show play/pause controls if video is not loading
                const loadingEl = document.querySelector(".live-video-loader");
                const isVideoLoading =
                  loadingEl && !loadingEl.classList.contains("hidden");
                if (!isVideoLoading) {
                  showPlayPauseControls();
                }
              }
            } else {
              // Move to previous EPG item
              focusedEpgItemIndex--;
              setFocus(
                epgItems,
                focusedEpgItemIndex,
                "livetv-player-epg-item-focused"
              );
            }
          } else {
            // Fallback for EPG div without items
            const epgDiv = document.querySelector(".livetv-player-epg");
            if (epgDiv) {
              epgDiv.style.border = "none";
            }
            isEpgDivFocused = false;

            // Focus on aspect ratio button when coming from EPG
            const videoJsAspectBtn = document.getElementById(
              "videojs-aspect-ratio"
            );
            const flowAspectBtn = document.getElementById("flow-aspect-ratio");

            if (videoJsAspectBtn) {
              videoJsAspectBtn.classList.add(
                "videojs-aspect-ratio-btn-focused"
              );
              setFlags(false, false, false, false, false);
              showPlayPauseControls();
            } else if (flowAspectBtn) {
              flowAspectBtn.classList.add("flow-aspect-ratio-btn-focused");
              setFlags(false, false, false, false, false);
              showPlayPauseControls();
            } else {
              setFlags(false, false, false, false, true);
              const fullscreenBtn = qs("#live-fullscreen-btn");
              if (fullscreenBtn) {
                fullscreenBtn.classList.add("live-control-btn-focused");
                document.querySelector(".live-video-player-div").style.border =
                  "6px solid var(--gold)";
              }
              // Only show play/pause controls if video is not loading
              const loadingEl = document.querySelector(".live-video-loader");
              const isVideoLoading =
                loadingEl && !loadingEl.classList.contains("hidden");
              if (!isVideoLoading) {
                showPlayPauseControls();
              }
            }
          }
          e.preventDefault();
          return;
        }

        if (focusedPlayPause || isPlayPauseFocused) {
          // Remove focus from play/pause button
          const playPauseBtn =
            document.querySelector(".play-pause-btn-focused") ||
            document.getElementById("live-play-pause-btn");
          if (playPauseBtn) {
            playPauseBtn.classList.remove("play-pause-btn-focused");
          }

          // Restore focus to video player
          setFlags(false, false, false, false, true);
          const fullscreenBtn = qs("#live-fullscreen-btn");
          if (fullscreenBtn) {
            fullscreenBtn.classList.add("live-control-btn-focused");
            document.querySelector(".live-video-player-div").style.border =
              "6px solid var(--gold)";
          }
          e.preventDefault();
          return;
        }

        // Handle retry button focused state
        if (isRetryButton) {
          // Remove focus from retry button
          const retryButtonEl = document.querySelector(".retry-btn");
          if (retryButtonEl) {
            retryButtonEl.classList.remove("retry-btn-focused");
          }
          isRetryButton = false;

          // Restore focus to video player
          setFlags(false, false, false, false, true);
          const fullscreenBtn = qs("#live-fullscreen-btn");
          if (
            !window.livePlayer &&
            !window.livePlayer.isFullscreen &&
            !window.livePlayer.isFullscreen()
          ) {
            if (fullscreenBtn) {
              fullscreenBtn.classList.add("live-control-btn-focused");
              document.querySelector(".live-video-player-div").style.border =
                "6px solid var(--gold)";
            }
          }

          e.preventDefault();
          return;
        }

        // If favorite or remove button is focused, navigate to previous channel
        if (focusedFav || focusedRemove) {
          // Remove focus from buttons
          if (focusedFav)
            focusedFav.classList.remove("channel-fav-btn-focused");
          if (focusedRemove)
            focusedRemove.classList.remove("channel-remove-btn-focused");

          setFlags(false, false, false, true, false);

          if (focusedCardIndex > 0) {
            focusedCardIndex--;
            focusCards(focusedCardIndex);
          } else {
            focusCards(focusedCardIndex);
          }
          e.preventDefault();
          return;
        }

        if (inChannelList && focusedCategoryIndex > 0) {
          setFocus(
            channelList,
            --focusedCategoryIndex,
            "livetv-channel-category-focused"
          );
        } else if (inCardList && focusedCardIndex > 0) {
          setFocus(cardList, --focusedCardIndex, "channel-card-focused");
        } else if (inVideoPlayer) {
          // Move from video player to search
          hidePlayPauseControls();
          focusSearch();
          qsa(".live-control-btn").forEach((btn) =>
            btn.classList.remove("live-control-btn-focused")
          );
          document.querySelector(".live-video-player-div").style.border =
            "none";
        } else {
          focusSearch();
        }
        e.preventDefault();
        return;
      }
      if (isDown) {
        const focusedFav = qs(".channel-fav-btn-focused");
        const focusedRemove = qs(".channel-remove-btn-focused");

        const focusedPlayPause = qs(".play-pause-btn-focused");
        const isPlayPauseFocused = document.getElementById(
          "live-play-pause-btn"
        )
          ? document
              .getElementById("live-play-pause-btn")
              .classList.contains("play-pause-btn-focused")
          : false;

        // Check for focused aspect ratio buttons
        const focusedVideoJsAspect = qs(
          "#videojs-aspect-ratio.videojs-aspect-ratio-btn-focused"
        );
        const focusedFlowAspect = qs(
          "#flow-aspect-ratio.flow-aspect-ratio-btn-focused"
        );
        const isAspectRatioFocused = focusedVideoJsAspect || focusedFlowAspect;
        const isFullscreen =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement ||
          (window.livePlayer &&
            typeof window.livePlayer.fullscreen === "function" &&
            window.livePlayer.fullscreen());

        if (inVideoPlayer && !isFullscreen) {
          showPlayPauseControls();

          // Remove focus from video player controls
          qsa(".live-control-btn").forEach((btn) =>
            btn.classList.remove("live-control-btn-focused")
          );

          const playerDiv = document.querySelector(".live-video-player-div");
          if (playerDiv) {
            playerDiv.style.border = "none";
          }
        }

        // Handle navigation from aspect ratio button to EPG
        if (isAspectRatioFocused) {
          // Remove focus from aspect ratio button
          hidePlayPauseControls();
          if (focusedVideoJsAspect) {
            focusedVideoJsAspect.classList.remove(
              "videojs-aspect-ratio-btn-focused"
            );
          }
          if (focusedFlowAspect) {
            focusedFlowAspect.classList.remove("flow-aspect-ratio-btn-focused");
          }

          // KEEP play/pause controls visible when aspect ratio was focused
          // Don't hide them here

          const epgItems = qsa(".livetv-player-epg-item");
          if (epgItems.length > 0) {
            // Focus on first EPG item
            focusedEpgItemIndex = 0;
            setFocus(
              epgItems,
              focusedEpgItemIndex,
              "livetv-player-epg-item-focused"
            );
            isEpgDivFocused = true;
            setFlags(false, false, false, false, false);
          } else {
            // Fallback to EPG div if no items
            const epgDiv = document.querySelector(".livetv-player-epg");
            if (epgDiv) {
              epgDiv.style.border = "6px solid var(--gold)";
              isEpgDivFocused = true;
              setFlags(false, false, false, false, false);
            }
          }
          e.preventDefault();
          return;
        }

        if (focusedPlayPause || isPlayPauseFocused) {
          const playPauseBtn =
            document.querySelector(".play-pause-btn-focused") ||
            document.getElementById("live-play-pause-btn");
          if (playPauseBtn) {
            playPauseBtn.classList.remove("play-pause-btn-focused");
          }

          const videoJsAspectBtn = document.getElementById(
            "videojs-aspect-ratio"
          );
          const flowAspectBtn = document.getElementById("flow-aspect-ratio");

          if (videoJsAspectBtn) {
            videoJsAspectBtn.classList.add("videojs-aspect-ratio-btn-focused");
            setFlags(false, false, false, false, false);
            showPlayPauseControls();
          } else if (flowAspectBtn) {
            flowAspectBtn.classList.add("flow-aspect-ratio-btn-focused");
            setFlags(false, false, false, false, false);
            showPlayPauseControls();
          } else {
            const epgItems = qsa(".livetv-player-epg-item");
            if (epgItems.length > 0) {
              focusedEpgItemIndex = 0;
              setFocus(
                epgItems,
                focusedEpgItemIndex,
                "livetv-player-epg-item-focused"
              );
              isEpgDivFocused = true;
              setFlags(false, false, false, false, false);
            } else {
              const epgDiv = document.querySelector(".livetv-player-epg");
              if (epgDiv) {
                epgDiv.style.border = "6px solid var(--gold)";
                isEpgDivFocused = true;
                setFlags(false, false, false, false, false);
              }
            }
          }
          e.preventDefault();
          return;
        }

        // Handle navigation from play/pause to aspect ratio button
        if (focusedPlayPause || isPlayPauseFocused) {
          const playPauseBtn =
            document.querySelector(".play-pause-btn-focused") ||
            document.getElementById("live-play-pause-btn");
          if (playPauseBtn) {
            playPauseBtn.classList.remove("play-pause-btn-focused");
          }

          // Hide play/pause controls when moving away from them
          hidePlayPauseControls();

          // Try to focus on aspect ratio button first
          const videoJsAspectBtn = document.getElementById(
            "videojs-aspect-ratio"
          );
          const flowAspectBtn = document.getElementById("flow-aspect-ratio");

          if (videoJsAspectBtn) {
            // Focus on Video.js aspect ratio button
            videoJsAspectBtn.classList.add("videojs-aspect-ratio-btn-focused");
            setFlags(false, false, false, false, false);
          } else if (flowAspectBtn) {
            // Focus on Flowplayer aspect ratio button
            flowAspectBtn.classList.add("flow-aspect-ratio-btn-focused");
            setFlags(false, false, false, false, false);
          } else {
            // If no aspect ratio button, go directly to EPG
            const epgItems = qsa(".livetv-player-epg-item");
            if (epgItems.length > 0) {
              // Focus on first EPG item
              focusedEpgItemIndex = 0;
              setFocus(
                epgItems,
                focusedEpgItemIndex,
                "livetv-player-epg-item-focused"
              );
              isEpgDivFocused = true;
              setFlags(false, false, false, false, false);
            } else {
              // Fallback to EPG div if no items
              const epgDiv = document.querySelector(".livetv-player-epg");
              if (epgDiv) {
                epgDiv.style.border = "6px solid var(--gold)";
                isEpgDivFocused = true;
                setFlags(false, false, false, false, false);
              }
            }
          }
          e.preventDefault();
          return;
        }

        // Handle EPG item navigation
        if (isEpgDivFocused) {
          const epgItems = qsa(".livetv-player-epg-item");
          if (epgItems.length > 0) {
            if (focusedEpgItemIndex < epgItems.length - 1) {
              focusedEpgItemIndex++;
              setFocus(
                epgItems,
                focusedEpgItemIndex,
                "livetv-player-epg-item-focused"
              );
            }
            // Stay on last item if at the end
            e.preventDefault();
            return;
          }
        }

        if (isRetryButton) {
          const retryButtonEl = document.querySelector(".retry-btn");
          if (retryButtonEl) {
            retryButtonEl.classList.remove("retry-btn-focused");
          }
          isRetryButton = false;

          setFlags(false, false, false, false, true);
          const fullscreenBtn = qs("#live-fullscreen-btn");
          if (fullscreenBtn) {
            fullscreenBtn.classList.add("live-control-btn-focused");
            document.querySelector(".live-video-player-div").style.border =
              "6px solid var(--gold)";
          }
          e.preventDefault();
          return;
        }

        if (focusedFav || focusedRemove) {
          if (focusedFav)
            focusedFav.classList.remove("channel-fav-btn-focused");
          if (focusedRemove)
            focusedRemove.classList.remove("channel-remove-btn-focused");

          setFlags(false, false, false, true, false);

          if (focusedCardIndex < cardList.length - 1) {
            focusedCardIndex++;
            focusCards(focusedCardIndex);
          } else {
            focusCards(focusedCardIndex);
          }
          e.preventDefault();
          return;
        }

        if (inVideoPlayer) {
          // Check if video is loading - don't allow navigation if loading
          const loadingEl = document.querySelector(".live-video-loader");
          const isVideoLoading =
            loadingEl && !loadingEl.classList.contains("hidden");

          if (isVideoLoading) {
            // When video is loading, directly focus on EPG items
            const epgItems = qsa(".livetv-player-epg-item");
            if (epgItems.length > 0) {
              // Focus on first EPG item
              focusedEpgItemIndex = 0;
              setFocus(
                epgItems,
                focusedEpgItemIndex,
                "livetv-player-epg-item-focused"
              );
              isEpgDivFocused = true;
              setFlags(false, false, false, false, false);
            } else {
              // Fallback to EPG div if no items
              const epgDiv = document.querySelector(".livetv-player-epg");
              if (epgDiv) {
                epgDiv.style.border = "6px solid var(--gold)";
                isEpgDivFocused = true;
                setFlags(false, false, false, false, false);
              }
            }
            e.preventDefault();
            return;
          }

          // Remove focus from video player controls
          qsa(".live-control-btn").forEach((btn) =>
            btn.classList.remove("live-control-btn-focused")
          );

          const playerDiv = document.querySelector(".live-video-player-div");
          if (playerDiv) {
            playerDiv.style.border = "none";
          }

          // CHECK FOR RETRY BUTTON FIRST (highest priority)
          const retryButtonEl = document.querySelector(".retry-btn");
          if (
            retryButtonEl &&
            retryButtonEl.style.display !== "none" &&
            retryButtonEl.offsetParent !== null
          ) {
            console.log("Retry button found and visible, focusing on it");
            retryButtonEl.classList.add("retry-btn-focused");
            isRetryButton = true;
            setFlags(false, false, false, false, false);
            e.preventDefault();
            return;
          }

          // Only if no retry button AND video is not loading, then try to focus on play/pause button
          let playPauseBtn = null;

          // Check for Video.js player play/pause button
          const videoJsPlayPause = document.querySelector(".play-pause-icon");
          if (videoJsPlayPause) {
            playPauseBtn = videoJsPlayPause;
          }

          // Check for Flowplayer play/pause button
          const flowPlayerPlayPause = document.getElementById(
            "live-play-pause-btn"
          );
          if (flowPlayerPlayPause) {
            playPauseBtn = flowPlayerPlayPause;
          }

          if (playPauseBtn) {
            playPauseBtn.classList.add("play-pause-btn-focused");
            setFlags(false, false, false, false, false);
            isRetryButton = false;
            e.preventDefault();
            return;
          }

          // If neither retry nor play/pause button exists, focus on EPG
          const epgItems = qsa(".livetv-player-epg-item");
          if (epgItems.length > 0) {
            // Focus on first EPG item
            focusedEpgItemIndex = 0;
            setFocus(
              epgItems,
              focusedEpgItemIndex,
              "livetv-player-epg-item-focused"
            );
            isEpgDivFocused = true;
            setFlags(false, false, false, false, false);
          } else {
            // Fallback to EPG div if no items
            const epgDiv = document.querySelector(".livetv-player-epg");
            if (epgDiv) {
              epgDiv.style.border = "6px solid var(--gold)";
              isEpgDivFocused = true;
              setFlags(false, false, false, false, false);
            }
          }
          e.preventDefault();
          return;
        }

        if (inSearch || inMenu) {
          searchInput.blur();
          focusCategories(0);
        } else if (inChannelList) {
          const currentChannelList = qsa(".livetv-channel-category");

          // Check if we can navigate to next category in current view
          if (focusedCategoryIndex < currentChannelList.length - 1) {
            // Normal navigation to next category - NO API CALL
            focusedCategoryIndex++;
            setFocus(
              currentChannelList,
              focusedCategoryIndex,
              "livetv-channel-category-focused"
            );
            // Update selected category to the newly focused one
            selectedCategoryId =
              currentChannelList[focusedCategoryIndex].dataset.categoryId;
          } else {
            // Only call getFilteredCategories when we actually need to check for more categories
            const filtered = getFilteredCategories();
            const totalAvailable = filtered.length;
            const currentlyLoaded = categoryChunk * categoryPageSize;

            if (currentlyLoaded < totalAvailable) {
              // Load more categories
              categoryChunk++;
              loadMoreCategories();

              // After loading, focus the first category of the newly loaded batch
              setTimeout(() => {
                const updatedChannelList = qsa(".livetv-channel-category");
                if (updatedChannelList.length > focusedCategoryIndex + 1) {
                  focusedCategoryIndex++;
                  setFocus(
                    updatedChannelList,
                    focusedCategoryIndex,
                    "livetv-channel-category-focused"
                  );
                  selectedCategoryId =
                    updatedChannelList[focusedCategoryIndex].dataset.categoryId;
                }
              }, 50);
            } else {
              // No more categories to load, stay on current
              setFocus(
                currentChannelList,
                focusedCategoryIndex,
                "livetv-channel-category-focused"
              );
            }
          }
        } else if (inCardList) {
          if (focusedCardIndex < cardList.length - 1) {
            focusedCardIndex++;
            setFocus(cardList, focusedCardIndex, "channel-card-focused");
          } else {
            const filtered = getFilteredCategories();
            const selectedCat = filtered.find(
              (c) => c.category_id === selectedCategoryId
            );

            if (
              selectedCat &&
              currentChunk * pageSize < selectedCat.channels.length
            ) {
              currentChunk++;
              const currentPosition = focusedCardIndex;

              renderChannels(true);

              setTimeout(() => {
                const updatedCardList = qsa(".channel-card");
                if (updatedCardList.length > currentPosition) {
                  focusedCardIndex = currentPosition + 1;
                  setFocus(
                    updatedCardList,
                    focusedCardIndex,
                    "channel-card-focused"
                  );
                }
              }, 100);
            } else {
              setFocus(cardList, focusedCardIndex, "channel-card-focused");
            }
          }
        }
        e.preventDefault();
        return;
      }

      if (isRight) {
        const focusedFav = qs(".channel-fav-btn-focused");
        const focusedRemove = qs(".channel-remove-btn-focused");

        // Check if aspect ratio buttons are focused
        const focusedVideoJsAspect = qs(
          "#videojs-aspect-ratio.videojs-aspect-ratio-btn-focused"
        );
        const focusedFlowAspect = qs(
          "#flow-aspect-ratio.flow-aspect-ratio-btn-focused"
        );
        const isAspectRatioFocused = focusedVideoJsAspect || focusedFlowAspect;

        if (inCardList && selectedCategoryId === "channelHistory") {
          const focusedCard = cardList[focusedCardIndex];
          const favBtn = focusedCard.querySelector(".channel-fav-btn");
          const removeBtn = focusedCard.querySelector(".channel-remove-btn");

          // If heart button is focused, move to cross button
          if (favBtn && favBtn.classList.contains("channel-fav-btn-focused")) {
            favBtn.classList.remove("channel-fav-btn-focused");
            if (removeBtn) {
              removeBtn.classList.add("channel-remove-btn-focused");
            }
            e.preventDefault();
            return;
          }
        }
        // Check if video player is in "Please select any channel to play" state
        const videoWrapper = qs(".livetv-video-wrapper2");
        const isVideoPlayerEmpty =
          videoWrapper &&
          videoWrapper.textContent.includes(
            "Please select any channel to play"
          );

        // Handle navigation from heart button to remove button (channel history only)
        if (focusedFav && selectedCategoryId === "channelHistory") {
          const focusedCard = cardList[focusedCardIndex];
          const removeBtn = focusedCard.querySelector(".channel-remove-btn");
          if (removeBtn) {
            focusedFav.classList.remove("channel-fav-btn-focused");
            removeBtn.classList.add("channel-remove-btn-focused");
            e.preventDefault();
            return;
          }
        }

        if (
          focusedFav &&
          selectedCategoryId !== "channelHistory" &&
          !isVideoPlayerEmpty
        ) {
          focusedFav.classList.remove("channel-fav-btn-focused");
          const fullscreenBtn = qs("#live-fullscreen-btn");
          if (fullscreenBtn) {
            setFlags(false, false, false, false, true);
            qsa(".live-control-btn").forEach((btn) =>
              btn.classList.remove("live-control-btn-focused")
            );
            qsa(".channel-card-focused").forEach((btn) =>
              btn.classList.remove("channel-card-focused")
            );
            fullscreenBtn.classList.add("live-control-btn-focused");
            document.querySelector(".live-video-player-div").style.border =
              "6px solid var(--gold)";
            showPlayPauseControls(); // Use helper function
          }
          e.preventDefault();
          return;
        }

        if (focusedRemove && !isVideoPlayerEmpty) {
          focusedRemove.classList.remove("channel-remove-btn-focused");
          const fullscreenBtn = qs("#live-fullscreen-btn");
          if (fullscreenBtn) {
            setFlags(false, false, false, false, true);
            qsa(".live-control-btn").forEach((btn) =>
              btn.classList.remove("live-control-btn-focused")
            );
            fullscreenBtn.classList.add("live-control-btn-focused");
            document.querySelector(".live-video-player-div").style.border =
              "6px solid var(--gold)";
            showPlayPauseControls(); // Use helper function
          }
          e.preventDefault();
          return;
        }

        // If video player is empty, don't allow navigation to video controls
        if ((focusedFav || focusedRemove) && isVideoPlayerEmpty) {
          e.preventDefault();
          return;
        }

        // ADDED: Show play/pause controls when aspect ratio gets focused during navigation
        if (isAspectRatioFocused) {
          showPlayPauseControls();
        }

        if (inChannelList) {
          const catEl = document.querySelector(
            ".livetv-channel-category-active"
          );
          const countElement = catEl.querySelector(
            ".livetv-channel-category-count"
          );

          const countValue = countElement.textContent.trim();
          const catCount = Number(countValue);

          if (catCount == 0) {
            focusSearch();
            return;
          } else {
            if (catEl) {
              const catId = String(catEl.dataset.categoryId);
              const catName = catEl.dataset.categoryName || "";
              const isAdult = isLiveAdultCategory(catName);
              const parentalEnabled = !!currentPlaylist.parentalPassword;
              const isUnlocked = unlockedLiveAdultCatIds.has(catId); // Use category unlocking here

              if (isAdult && parentalEnabled && !isUnlocked) {
                ParentalPinDialog(
                  () => {
                    unlockedLiveAdultCatIds.add(catId); // Use category unlocking here
                    selectedCategoryId = catId;
                    currentChunk = 1;
                    // Remove lock icon immediately from this category, if present
                    const lockEl = catEl.querySelector(
                      ".livetv-category-lock-icon"
                    );
                    if (lockEl) lockEl.remove();
                    renderChannels(false, true);
                    setTimeout(() => focusCards(0), 0);
                  },
                  () => {
                    focusCategories(focusedCategoryIndex);
                  },
                  currentPlaylist,
                  "liveTvPage"
                );
                e.preventDefault();
                return;
              }
            }

            focusCards(0);
            e.preventDefault();
          }
          return;
        }

        if (inCardList) {
          // move focus to first button (heart for all categories)
          const focusedCard = cardList[focusedCardIndex];
          const favBtn = focusedCard.querySelector(".channel-fav-btn");
          if (favBtn) {
            setFlags(false, false, false, false, false);
            favBtn.classList.add("channel-fav-btn-focused");
          }
          e.preventDefault();
          return;
        }

        if (inSearch) {
          searchInput.blur();
          focusMenu();
          e.preventDefault();
          return;
        }

        if (inVideoPlayer) {
          // ADDED: Show play/pause controls when aspect ratio gets focused in video player navigation
          if (isAspectRatioFocused) {
            showPlayPauseControls();
          }
          e.preventDefault();
          return;
        }
      }

      if (isLeft) {
        const focusedFav = qs(".channel-fav-btn-focused");
        const focusedRemove = qs(".channel-remove-btn-focused");

        const focusedPlayPause = qs(".play-pause-btn-focused");
        const isPlayPauseFocused = document.getElementById(
          "live-play-pause-btn"
        )
          ? document
              .getElementById("live-play-pause-btn")
              .classList.contains("play-pause-btn-focused")
          : false;

        if (isEpgDivFocused) {
          const epgItems = qsa(".livetv-player-epg-item");
          if (epgItems.length > 0 && focusedEpgItemIndex >= 0) {
            // Remove focus from EPG items
            epgItems.forEach((item) =>
              item.classList.remove("livetv-player-epg-item-focused")
            );
            isEpgDivFocused = false;
            focusedEpgItemIndex = -1;

            // Focus back on the selected channel card
            setFlags(false, false, false, true, false);
            focusCards(focusedCardIndex);
          } else {
            // Fallback for EPG div without items
            const epgDiv = document.querySelector(".livetv-player-epg");
            if (epgDiv) {
              epgDiv.style.border = "none";
            }
            isEpgDivFocused = false;

            // Focus back on the selected channel card
            setFlags(false, false, false, true, false);
            focusCards(focusedCardIndex);
          }
          e.preventDefault();
          return;
        }

        if (focusedPlayPause || isPlayPauseFocused) {
          // Remove focus from play/pause button
          const playPauseBtn =
            document.querySelector(".play-pause-btn-focused") ||
            document.getElementById("live-play-pause-btn");
          if (playPauseBtn) {
            playPauseBtn.classList.remove("play-pause-btn-focused");
          }

          // Restore focus to video player
          setFlags(false, false, false, false, true);
          const fullscreenBtn = qs("#live-fullscreen-btn");
          if (fullscreenBtn) {
            fullscreenBtn.classList.add("live-control-btn-focused");
            document.querySelector(".live-video-player-div").style.border =
              "6px solid var(--gold)";
          }
          e.preventDefault();
          return;
        }

        // Handle retry button focused state
        if (isRetryButton) {
          // Remove focus from retry button
          const retryButtonEl = document.querySelector(".retry-btn");
          if (retryButtonEl) {
            retryButtonEl.classList.remove("retry-btn-focused");
          }
          isRetryButton = false;

          // Restore focus to video player
          setFlags(false, false, false, false, true);
          const fullscreenBtn = qs("#live-fullscreen-btn");
          if (fullscreenBtn) {
            fullscreenBtn.classList.add("live-control-btn-focused");
            document.querySelector(".live-video-player-div").style.border =
              "6px solid var(--gold)";
          }
          e.preventDefault();
          return;
        }

        // Navigation from remove button back to heart button (channel history)
        if (focusedRemove && selectedCategoryId === "channelHistory") {
          const focusedCard = cardList[focusedCardIndex];
          const favBtn = focusedCard.querySelector(".channel-fav-btn");
          if (favBtn) {
            focusedRemove.classList.remove("channel-remove-btn-focused");
            favBtn.classList.add("channel-fav-btn-focused");
            e.preventDefault();
            return;
          }
        }

        // Navigation from heart button back to channel card
        if (focusedFav) {
          focusedFav.classList.remove("channel-fav-btn-focused");
          setFlags(false, false, false, true, false);
          focusCards(focusedCardIndex);
          e.preventDefault();
          return;
        }

        if (inVideoPlayer) {
          const focusedBtn = qs(".live-control-btn-focused");
          const fullscreenBtn = qs("#live-fullscreen-btn");
          const prevBtn = qs("#live-prev-btn");
          const nextBtn = qs("#live-next-btn");

          // Get the video player div and check if it has gold border
          const playerDiv = document.querySelector(".live-video-player-div");
          const hasGoldBorder =
            playerDiv && playerDiv.style.border === "6px solid var(--gold)";

          // Check if ANY video player is active by looking for video elements or Flowplayer
          const hasVideoPlayer =
            document.querySelector("video") ||
            (window.livePlayer &&
              typeof window.livePlayer.fullscreen === "function");

          // If fullscreen button is focused OR video player has gold border (indicating it's focused)
          // OR if we have any video player and video player is focused
          if (
            (focusedBtn && fullscreenBtn && focusedBtn === fullscreenBtn) ||
            (!focusedBtn && hasGoldBorder) ||
            (hasVideoPlayer && hasGoldBorder)
          ) {
            // Remove focus from video player completely
            qsa(".live-control-btn").forEach((btn) =>
              btn.classList.remove("live-control-btn-focused")
            );
            document.querySelector(".live-video-player-div").style.border =
              "none";

            // Hide play/pause controls when leaving video player
            hidePlayPauseControls();

            // Focus on the current channel card's appropriate button
            setFlags(false, false, false, false, false); // Clear all flags

            const currentCard = cardList[focusedCardIndex];
            if (currentCard) {
              // For channel history category, focus on remove button first (rightmost)
              if (selectedCategoryId === "channelHistory") {
                const removeBtn = currentCard.querySelector(
                  ".channel-remove-btn"
                );
                if (removeBtn) {
                  removeBtn.classList.add("channel-remove-btn-focused");
                }
              } else {
                // For other categories, focus on heart button
                const favBtn = currentCard.querySelector(".channel-fav-btn");
                if (favBtn) {
                  favBtn.classList.add("channel-fav-btn-focused");
                }
              }
            }

            e.preventDefault();
            return;
          }

          // Handle prev/next button cycling only if we're still in video player navigation
          if (focusedBtn) {
            qsa(".live-control-btn").forEach((btn) =>
              btn.classList.remove("live-control-btn-focused")
            );

            if (nextBtn && focusedBtn === nextBtn) {
              fullscreenBtn.classList.add("live-control-btn-focused");
            } else if (fullscreenBtn && focusedBtn === fullscreenBtn) {
              if (prevBtn) prevBtn.classList.add("live-control-btn-focused");
            } else if (prevBtn && focusedBtn === prevBtn) {
              // If prev button is focused and we press left again, focus on card buttons
              document.querySelector(".live-video-player-div").style.border =
                "none";

              // Focus on the current channel card's appropriate button
              const currentCard = cardList[focusedCardIndex];
              if (currentCard) {
                if (selectedCategoryId === "channelHistory") {
                  const removeBtn = currentCard.querySelector(
                    ".channel-remove-btn"
                  );
                  if (removeBtn) {
                    removeBtn.classList.add("channel-remove-btn-focused");
                  }
                } else {
                  const favBtn = currentCard.querySelector(".channel-fav-btn");
                  if (favBtn) {
                    favBtn.classList.add("channel-fav-btn-focused");
                  }
                }
              }
              setFlags(false, false, false, false, false); // Clear all flags
            }
          }
          e.preventDefault();
          return;
        }

        if (inCardList) {
          focusCategories(focusedCategoryIndex);
          e.preventDefault();
          return;
        }

        if (inMenu) {
          focusSearch();
          e.preventDefault();
          return;
        }

        if (inSearch) {
          searchInput.blur();
          focusCategories(0);
          e.preventDefault();
          return;
        }
      }

      if (isEnter) {
        // Check if Flowplayer is in fullscreen
        const isFlowplayerFullscreen =
          window.livePlayer &&
          typeof window.livePlayer.fullscreen === "function" &&
          window.livePlayer.fullscreen();

        // If in fullscreen mode, allow Enter to toggle play/pause
        if (isFlowplayerFullscreen) {
          if (window.livePlayer && window.livePlayer.togglePlayPause) {
            window.livePlayer.togglePlayPause();
          }
          e.preventDefault();
          return;
        }

        // Handle aspect ratio button Enter key
        const focusedVideoJsAspect = qs(
          "#videojs-aspect-ratio.videojs-aspect-ratio-btn-focused"
        );
        const focusedFlowAspect = qs(
          "#flow-aspect-ratio.flow-aspect-ratio-btn-focused"
        );

        if (focusedVideoJsAspect) {
          focusedVideoJsAspect.click();
          // ADDED: Keep play/pause controls visible after clicking aspect ratio
          showPlayPauseControls();
          e.preventDefault();
          return;
        }

        if (focusedFlowAspect) {
          focusedFlowAspect.click();
          // ADDED: Keep play/pause controls visible after clicking aspect ratio
          showPlayPauseControls();
          e.preventDefault();
          return;
        }

        const focusedPlayPause = qs(".play-pause-btn-focused");
        const isPlayPauseFocused = document.getElementById(
          "live-play-pause-btn"
        )
          ? document
              .getElementById("live-play-pause-btn")
              .classList.contains("play-pause-btn-focused")
          : false;

        if (focusedPlayPause || isPlayPauseFocused) {
          focusedPlayPause.click();
          e.preventDefault();
          return;
        }

        if (isRetryButton) {
          const retryButtonEl = document.querySelector(".retry-btn");
          if (retryButtonEl) {
            retryButtonEl.click();

            setTimeout(() => {
              retryButtonEl.classList.remove("retry-btn-focused");
              isRetryButton = false;

              setFlags(false, false, false, false, true);
              const fullscreenBtn = qs("#live-fullscreen-btn");
              if (fullscreenBtn) {
                fullscreenBtn.classList.add("live-control-btn-focused");
                document.querySelector(".live-video-player-div").style.border =
                  "6px solid var(--gold)";
              }
            }, 100);
          }
          e.preventDefault();
          return;
        }

        const focusedRemove = qs(".channel-remove-btn-focused");
        if (focusedRemove) {
          focusedRemove.click();
          e.preventDefault();
          return;
        }

        const focusedFav = qs(".channel-fav-btn-focused");
        if (focusedFav) {
          focusedFav.click();
          e.preventDefault();
          return;
        }

        // Handle Enter key when video player container is focused (gold border) - NON-FULLSCREEN ONLY
        if (inVideoPlayer && !isFlowplayerFullscreen) {
          const focusedBtn = qs(".live-control-btn-focused");

          // If fullscreen button is focused, trigger fullscreen
          if (focusedBtn && focusedBtn.id === "live-fullscreen-btn") {
            focusedBtn.click();
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          // If prev/next buttons are focused
          if (
            focusedBtn &&
            (focusedBtn.id === "live-prev-btn" ||
              focusedBtn.id === "live-next-btn")
          ) {
            focusedBtn.click();
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          // If no specific button focused but video player has gold border, trigger fullscreen
          const fullscreenBtn = qs("#live-fullscreen-btn");
          const playerDiv = document.querySelector(".live-video-player-div");
          const hasGoldBorder =
            playerDiv && playerDiv.style.border === "6px solid var(--gold)";

          if (hasGoldBorder && fullscreenBtn) {
            fullscreenBtn.click();
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          // If we reach here and we're in video player with gold border but no fullscreen button found,
          // still prevent the event from reaching the video player to avoid play/pause
          if (hasGoldBorder) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }

        if (inSearch) {
          searchInput.focus();
          e.preventDefault();
          return;
        }

        if (inMenu) {
          e.preventDefault();
          updateLiveClearAllIcon();
          localStorage.setItem("sidebarPage", "liveTvPage");

          const sidebar = document.querySelector(".sidebar-container-live");

          if (sidebar.style.display === "none") {
            const sidebarContainer = document.querySelector(
              ".sidebar-container-live"
            );
            if (sidebarContainer) {
              sidebarContainer.innerHTML = Sidebar({
                from: "liveTvPage",
                onSort: () => {
                  console.log("Sorting live TV...");
                  // INVALIDATE CACHE
                  cachedFilteredCategories = null;
                  renderChannels(false, true);

                  if (inChannelList) {
                    focusCategories(focusedCategoryIndex);
                  } else if (inCardList) {
                    focusCards(focusedCardIndex);
                  }
                },
              });
            }

            openSidebar("liveTvPage");
          } else {
            closeSidebar("liveTvPage");
          }
          return;
        }

        const card = e.target.closest(".channel-card");
        const allCards = qsa(".channel-card");
        const clickedIndex = Array.from(allCards).indexOf(card);
        if (clickedIndex !== -1) {
          focusedCardIndex = clickedIndex;
        }
        if (card) {
          const isAdultChannel = card.dataset.isAdult === "true";
          const parentalEnabled = !!currentPlaylist.parentalPassword;
          const streamId = card.dataset.streamId;

          // DETERMINE WHICH UNLOCK SET TO CHECK BASED ON CURRENT CATEGORY
          let isChannelUnlocked = true;
          let unlockSet = null;

          if (isAdultChannel && parentalEnabled) {
            if (selectedCategoryId === "All") {
              isChannelUnlocked = unlockedLiveAdultChannelsInAll.has(
                String(streamId)
              );
              unlockSet = unlockedLiveAdultChannelsInAll;
            } else if (selectedCategoryId === "favorites") {
              isChannelUnlocked = unlockedLiveAdultChannelsInFavorites.has(
                String(streamId)
              );
              unlockSet = unlockedLiveAdultChannelsInFavorites;
            } else if (selectedCategoryId === "channelHistory") {
              isChannelUnlocked = unlockedLiveAdultChannelsInHistory.has(
                String(streamId)
              );
              unlockSet = unlockedLiveAdultChannelsInHistory;
            } else {
              // For regular categories, check category unlocking
              const category = categories.find(
                (cat) => cat.category_id === selectedCategoryId
              );
              isChannelUnlocked = category
                ? unlockedLiveAdultCatIds.has(String(category.category_id))
                : true;
              unlockSet = null; // Category unlocking handled differently
            }
          }

          if (
            isAdultChannel &&
            parentalEnabled &&
            !isChannelUnlocked &&
            unlockSet
          ) {
            ParentalPinDialog(
              () => {
                // Unlock this specific channel in this specific category only
                unlockSet.add(String(streamId));

                // Remove lock from only this specific card
                card.classList.remove("channel-card-locked");
                const lockIcon = card.querySelector(".channel-card-lock-icon");
                if (lockIcon) lockIcon.remove();

                // Now proceed with playing the channel
                playChannelCard(card);
              },
              () => {
                // PIN incorrect - maintain focus on the card
                focusCards(focusedCardIndex);
              },
              currentPlaylist,
              "liveTvPage"
            );
            return;
          }

          playChannelCard(card);
        }
        if (inCardList && cardList[focusedCardIndex]) {
          const focusedChannelItem = cardList[focusedCardIndex];
          const isAdultChannel = focusedChannelItem.dataset.isAdult === "true";
          const parentalEnabled = !!currentPlaylist.parentalPassword;
          const streamId = focusedChannelItem.dataset.streamId;

          // DETERMINE WHICH UNLOCK SET TO CHECK BASED ON CURRENT CATEGORY
          let isChannelUnlocked = true;
          let unlockSet = null;

          if (isAdultChannel && parentalEnabled) {
            if (selectedCategoryId === "All") {
              isChannelUnlocked = unlockedLiveAdultChannelsInAll.has(
                String(streamId)
              );
              unlockSet = unlockedLiveAdultChannelsInAll;
            } else if (selectedCategoryId === "favorites") {
              isChannelUnlocked = unlockedLiveAdultChannelsInFavorites.has(
                String(streamId)
              );
              unlockSet = unlockedLiveAdultChannelsInFavorites;
            } else if (selectedCategoryId === "channelHistory") {
              isChannelUnlocked = unlockedLiveAdultChannelsInHistory.has(
                String(streamId)
              );
              unlockSet = unlockedLiveAdultChannelsInHistory;
            } else {
              // For regular categories, check category unlocking
              const category = categories.find(
                (cat) => cat.category_id === selectedCategoryId
              );
              isChannelUnlocked = category
                ? unlockedLiveAdultCatIds.has(String(category.category_id))
                : true;
              unlockSet = null;
            }
          }

          if (
            isAdultChannel &&
            parentalEnabled &&
            !isChannelUnlocked &&
            unlockSet
          ) {
            ParentalPinDialog(
              () => {
                // Unlock this specific channel in this specific category only
                unlockSet.add(String(streamId));

                // Remove lock from only this specific card's logo wrapper
                const logoWrapper = focusedChannelItem.querySelector(
                  ".channel-card-logo-wrapper"
                );
                if (logoWrapper) {
                  logoWrapper.classList.remove("channel-card-locked");
                }
                const lockIcon = focusedChannelItem.querySelector(
                  ".channel-card-lock-icon"
                );
                if (lockIcon) lockIcon.remove();

                // Proceed with playing the channel after unlock
                const focusedChannelStreamId =
                  focusedChannelItem.dataset.streamId;
                const selectedChannelItem = allStreams.find(
                  (item) => item.stream_id == focusedChannelStreamId
                );

                if (selectedCategoryId !== "channelHistory") {
                  addItemToHistory(selectedChannelItem, "ChannelListLive");
                }

                // Update category display if needed
                if (selectedCategoryId !== "channelHistory") {
                  const filtered = getFilteredCategories();
                  const categoryList = qs(".livetv-channels-list");
                  if (categoryList) {
                    const categoriesToShow = filtered.slice(
                      0,
                      categoryChunk * pageSize
                    );

                    categoryList.innerHTML = categoriesToShow
                      .map(
                        (c) =>
                          `<div class="livetv-channel-category-container">
                    <div class="livetv-channel-category ${
                      c.category_id === selectedCategoryId
                        ? "livetv-channel-category-active"
                        : ""
                    }" data-category-id="${
                            c.category_id
                          }" data-category-name="${c.category_name}">
                      <p class="livetv-channel-category-name">${
                        c.category_name
                      }</p>
<p class="livetv-channel-category-count">${
                            c.channels ? c.channels.length : 0
                          }</p>
                    </div>
                  </div>`
                      )
                      .join("");
                  }
                  focusCards(focusedCardIndex);
                }

                // Play the channel
                playChannelCard(focusedChannelItem);
              },
              () => {
                // PIN incorrect - maintain focus on the card
                focusCards(focusedCardIndex);
              },
              currentPlaylist,
              "liveTvPage"
            );
            e.preventDefault();
            return;
          }

          // Original code for non-adult channels or already unlocked categories
          const focusedChannelStreamId = focusedChannelItem.dataset.streamId;
          const selectedChannelItem = allStreams.find(
            (item) => item.stream_id == focusedChannelStreamId
          );

          if (selectedCategoryId !== "channelHistory") {
            addItemToHistory(selectedChannelItem, "ChannelListLive");
            setTimeout(() => {
              refreshCategoryCountsOnly();
            }, 50);
          }

          if (selectedCategoryId !== "channelHistory") {
            const filtered = getFilteredCategories();
            const categoryList = qs(".livetv-channels-list");
            if (categoryList) {
              const categoriesToShow = filtered.slice(
                0,
                categoryChunk * pageSize
              );

              categoryList.innerHTML = categoriesToShow
                .map(
                  (c) =>
                    `<div class="livetv-channel-category-container">
                <div class="livetv-channel-category ${
                  c.category_id === selectedCategoryId
                    ? "livetv-channel-category-active"
                    : ""
                }" data-category-id="${c.category_id}" data-category-name="${
                      c.category_name
                    }">
                  ${
                    !!currentPlaylist.parentalPassword &&
                    isLiveAdultCategory(c.category_name) &&
                    !unlockedLiveAdultCatIds.has(String(c.category_id))
                      ? '<i class="fas fa-lock livetv-category-lock-icon"></i>'
                      : ""
                  }
                  <p class="livetv-channel-category-name">${c.category_name}</p>
<p class="livetv-channel-category-count">${
                      c.channels ? c.channels.length : 0
                    }</p>
                </div>
              </div>`
                )
                .join("");
            }
            focusCards(focusedCardIndex);
          }

          // Use the helper function to play the channel
          playChannelCard(focusedChannelItem);
          e.preventDefault();
          return;
        }

        if (inChannelList && channelList[focusedCategoryIndex]) {
          const catEl = channelList[focusedCategoryIndex];
          const catId = String(catEl.dataset.categoryId);
          const catName = catEl.dataset.categoryName || "";
          const isAdult = isLiveAdultCategory(catName);
          const parentalEnabled = !!currentPlaylist.parentalPassword;
          const isUnlocked = unlockedLiveAdultCatIds.has(catId); // Use category unlocking here

          searchInput.value = "";
          searchQuery = "";
          refreshCategoryCountsOnly();
          if (isAdult && parentalEnabled && !isUnlocked) {
            ParentalPinDialog(
              () => {
                unlockedLiveAdultCatIds.add(catId); // Use category unlocking here
                selectedCategoryId = catId;
                currentChunk = 1;
                const lockEl = catEl.querySelector(
                  ".livetv-category-lock-icon"
                );
                if (lockEl) lockEl.remove();
                renderChannels(false, true);
              },
              () => {
                focusCategories(focusedCategoryIndex);
              },
              currentPlaylist,
              "liveTvPage"
            );
            e.preventDefault();
            return;
          }

          selectedCategoryId = catId;
          currentChunk = 1;
          renderChannels(false, true);
        }
      }
    }

    const scopedClickHandler = (e) => {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;
      clickHandler(e);
    };

    const scopedKeyHandler = (e) => {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;
      keyHandler(e);
    };

    // Also update the long press handlers
    const scopedLongPressKeydownHandler = (e) => {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;
      longPressKeydownHandler(e);
    };

    const scopedLongPressKeyupHandler = (e) => {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;
      longPressKeyupHandler(e);
    };

    // Add the scoped listeners
    document.addEventListener("click", scopedClickHandler);
    document.addEventListener("keydown", scopedKeyHandler);
    document.addEventListener("keydown", scopedLongPressKeydownHandler);
    document.addEventListener("keyup", scopedLongPressKeyupHandler);

    // Listen for channel change events from video player controls
    document.addEventListener("liveChannelChange", (e) => {
      const direction = e.detail.direction;
      const cardList = qsa(".channel-card");

      if (direction === "prev" && focusedCardIndex > 0) {
        focusedCardIndex--;
        setFocus(cardList, focusedCardIndex, "channel-card-focused");
        cardList[focusedCardIndex].click();
        // Move focus back to channel list
        focusCards(focusedCardIndex);
      } else if (
        direction === "next" &&
        focusedCardIndex < cardList.length - 1
      ) {
        focusedCardIndex++;
        setFocus(cardList, focusedCardIndex, "channel-card-focused");
        cardList[focusedCardIndex].click();
        // Move focus back to channel list
        focusCards(focusedCardIndex);
      }
    });

    // ======== ADD THE LONG PRESS CODE RIGHT HERE ========
    // Add these event listeners at the end of the setTimeout callback, before the cleanup
    const longPressKeydownHandler = (e) => {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;

      if (e.key === "Enter" || e.keyCode === 13) {
        if (!isEnterPressed) {
          isEnterPressed = true;
          enterPressTimer = setTimeout(() => {
            // Long press logic will be handled here
            const cardList = qsa(".channel-card");
            if (inCardList && cardList[focusedCardIndex]) {
              handleLongPressEnter(cardList[focusedCardIndex]);
            }
          }, LONG_PRESS_DURATION);
        }
      }
    };

    const longPressKeyupHandler = (e) => {
      if (localStorage.getItem("currentPage") !== "liveTvPage") return;

      if (e.key === "Enter" || e.keyCode === 13) {
        handleEnterRelease();
      }
    };

    document.addEventListener("keydown", longPressKeydownHandler);
    document.addEventListener("keyup", longPressKeyupHandler);
    document.addEventListener("fullscreenchange", handleFullscreenBorder);
    document.addEventListener("webkitfullscreenchange", handleFullscreenBorder);
    document.addEventListener("mozfullscreenchange", handleFullscreenBorder);
    document.addEventListener("MSFullscreenChange", handleFullscreenBorder);

    // Implement the missing removeFromChannelHistory function
    window.removeFromChannelHistory = function (streamId) {
      // Get current playlist data
      const currentPlaylistName = JSON.parse(
        localStorage.getItem("selectedPlaylist")
      ).playlistName;
      const playlistsData = JSON.parse(localStorage.getItem("playlistsData"));
      const currentPlaylistIndex = playlistsData.findIndex(
        (pl) => pl.playlistName === currentPlaylistName
      );

      if (currentPlaylistIndex !== -1) {
        // Remove from channel history
        playlistsData[currentPlaylistIndex].ChannelListLive = (
          playlistsData[currentPlaylistIndex].ChannelListLive || []
        ).filter((ch) => String(ch.stream_id) !== String(streamId));

        // Save updated data
        localStorage.setItem("playlistsData", JSON.stringify(playlistsData));
      }
    };

    // Add this before the cleanup function
    LiveTvPage.cleanup = () => {
      document.removeEventListener("keydown", scopedKeyHandler);
      document.removeEventListener("click", scopedClickHandler);
      document.removeEventListener("keydown", scopedLongPressKeydownHandler);
      document.removeEventListener("keyup", scopedLongPressKeyupHandler);
      document.removeEventListener("liveChannelChange", () => {});

      // Remove the long press event listeners
      document.removeEventListener("keydown", longPressKeydownHandler);
      document.removeEventListener("keyup", longPressKeyupHandler);

      document.removeEventListener("keydown", preventVideoEnter, true);

      // Remove fullscreen listeners
      document.removeEventListener("fullscreenchange", handleFullscreenBorder);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenBorder
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenBorder
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenBorder
      );

      // Dispose player
      disposeLivePlayer();

      // Remove volume handlers
      removeVolumeHandlers();

      // Call LiveVideoJsComponent cleanup if it exists
      if (typeof LiveVideoJsComponent.cleanup === "function") {
        try {
          LiveVideoJsComponent.cleanup();
        } catch (err) {
          console.warn("LiveVideoJsComponent cleanup error:", err);
        }
      }

      // Call FlowLivePlayerComponent cleanup if it exists
      if (typeof FlowLivePlayerComponent.cleanup === "function") {
        try {
          FlowLivePlayerComponent.cleanup();
        } catch (err) {
          console.warn("FlowLivePlayerComponent cleanup error:", err);
        }
      }

      // Fallback cleanup for window.livePlayer
      if (window.livePlayer) {
        try {
          window.livePlayer.dispose();
        } catch {}
        window.livePlayer = null;
      }

      // Reset volume handler so it's re-attached cleanly next time
      window._liveTvVolumeHandlerAttached = false;

      // Clear any pending timers
      if (enterPressTimer) {
        clearTimeout(enterPressTimer);
        enterPressTimer = null;
      }
      isEnterPressed = false;
    };

    qs("#livetv-header-search").addEventListener("input", (e) => {
      searchQuery = e.target.value;
      currentChunk = 1;
      // DON'T reset categoryChunk here - we need to keep all loaded categories
      // categoryChunk = 1;
      allCategoriesLoaded = false;

      // Store current focus state before rendering
      const currentFocusedCategoryId = selectedCategoryId;

      renderChannels();

      // After render, restore focus to the previously selected category
      setTimeout(() => {
        const allCategories = qsa(".livetv-channel-category");
        const currentCategoryIndex = allCategories.findIndex(
          (cat) => cat.dataset.categoryId === currentFocusedCategoryId
        );

        if (currentCategoryIndex !== -1) {
          focusedCategoryIndex = currentCategoryIndex;
          selectedCategoryId = currentFocusedCategoryId;
          setFocus(
            allCategories,
            focusedCategoryIndex,
            "livetv-channel-category-focused"
          );
        } else if (allCategories.length > 0) {
          focusedCategoryIndex = 0;
          selectedCategoryId = allCategories[0].dataset.categoryId;
          setFocus(
            allCategories,
            focusedCategoryIndex,
            "livetv-channel-category-focused"
          );
        }
      }, 100);
    });
    renderChannels();
    window.renderLiveTv = () => renderChannels(false, true);
    setTimeout(() => {
      focusCategories(0);
    }, 50);
  }, 0);

  return `
  <div class="livetvpage-main-container">
    <div class="livetv-header">
      <div class="livetv-series-header">
        <img src="/assets/logo.png" alt="Logo" class="setting-header-logo"/>
        <p class="livetv-header-title">Live</p>
      </div>
      <div class="second-livetv-header">
   ${DateTimeComponent()}
        <div class="second-live-header-div">
          <div class="livetv-header-search">
            <input type="text" placeholder="Search Channels" id="livetv-header-search" class="livetv-header-search-input"/>
            <img src="/assets/search-icon.png" alt="search" class="livetv-header-search-icon"/>
          </div>
          <div class="livetv-header-menu">
            <svg width="14" height="58" viewBox="0 0 14 58" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="7" cy="7" r="7" fill="white"/>
              <circle cx="7" cy="29" r="7" fill="white"/>
              <circle cx="7" cy="51" r="7" fill="white"/>
            </svg>
                <div class="sidebar-container-live" style="display: none;">
  ${Sidebar({ from: "liveTvPage", onSort: () => console.log("Sorting...") })}
  </div>
          </div>
        </div>
      </div>
    </div>
    <div class="livetv-content-container"></div>
  </div>`;
}
