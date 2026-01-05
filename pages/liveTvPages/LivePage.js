function LivePage() {
  // Create and show custom live page loader immediately (using HomePage loader styles)
  const liveLoader = document.createElement("div");
  liveLoader.id = "home-page-loader";
  liveLoader.innerHTML = `
    <div class="home-loader-content">
      <div class="home-loader-spinner"></div>
    </div>
  `;
  document.body.appendChild(liveLoader);

  let filteredStreams = [];
  let selectedCategoryId = "All";

  // Navigation State
  let focusedSection = "sidebar"; // Start with sidebar focused (User Request)
  let sidebarIndex = 0;
  let channelIndex = 0;
  let buttonFocusIndex = -1; // -1 = no button focused, 0 = heart, 1 = remove
  let playerSubFocus = 0; // 0 = Video Border, 1 = Play/Pause, 2 = Aspect Ratio
  let headerSubFocus = 0; // 0 = Search, 1 = Menu

  // CLEVER APPROACH: playerVisualFocus maintains player's red border independently
  // This allows the video to always display (when focusedSection="player") while
  // still allowing navigation to other sections. The player keeps its visual focus
  // (red border) even when focusedSection changes, ensuring video remains visible.
  let playerVisualFocus = true; // Separate variable to track player visual focus (red border)

  let epgIndex = -1; // -1 = Header (Favorite), 0+ = List Items
  let currentEpgData = [];
  let currentPlayingStream = null;
  let lastToggleTime = 0;

  // Search State
  let categorySearchQuery = "";
  let channelSearchQuery = "";
  let currentSortOption = "default";

  // Chunking State
  let categoryChunk = 1;
  let channelChunk = 1;
  const categoryPageSize = 20;
  const channelPageSize = 20;

  // DOM Elements
  let container;

  // Get current playlist - MOVED UP to avoid reference error
  const getCurrentPlaylist = () => {
    try {
      const currentPlaylistName = JSON.parse(
        localStorage.getItem("selectedPlaylist") || "{}"
      ).playlistName;
      const playlistsData = JSON.parse(
        localStorage.getItem("playlistsData") || "[]"
      );
      return playlistsData.find(
        (pl) => pl.playlistName === currentPlaylistName
      );
    } catch (e) {
      return null;
    }
  };

  // Parental Control State
  const unlockedLiveAdultCatIds = new Set();
  const unlockedLiveAdultChannelsInAll = new Set();
  const unlockedLiveAdultChannelsInFavorites = new Set();
  const unlockedLiveAdultChannelsInHistory = new Set();

  // Adult category detection
  const isLiveAdultCategory = (name) => {
    const normalized = (name || "").trim().toLowerCase();
    const configured = Array.isArray(window.adultsCategories)
      ? window.adultsCategories
      : [];
    if (configured.includes(normalized)) return true;
    return /(adult|xxx|18\+|18\s*plus|sex|porn|nsfw)/i.test(normalized);
  };

  // Initialize
  setTimeout(() => {
    if (window.cleanupLivePage) {
      window.cleanupLivePage();
    }
    init();
  }, 0);

  // Cross-browser fullscreen detection helper
  const checkIsFullscreen = () => {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  };

  // Add this function after state variables, before cleanup function
  const toggleFullscreen = () => {
    const playerContainer = document.getElementById("lp-player-container");
    if (!playerContainer) return;

    if (!checkIsFullscreen()) {
      // Enter fullscreen
      if (playerContainer.requestFullscreen) {
        playerContainer.requestFullscreen();
      } else if (playerContainer.mozRequestFullScreen) {
        playerContainer.mozRequestFullScreen();
      } else if (playerContainer.webkitRequestFullscreen) {
        playerContainer.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
      } else if (playerContainer.msRequestFullscreen) {
        playerContainer.msRequestFullscreen();
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  };

  const cleanup = () => {
    const searchInput = document.getElementById("search-input");
    const searchIcon = document.querySelector(".nav-search-bar");
    if (searchInput) searchInput.style.display = "";
    if (searchIcon) searchIcon.style.display = "";

    document.removeEventListener("keydown", handleKeydown);
    document.removeEventListener("sortChanged", handleSortChange);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener(
      "webkitfullscreenchange",
      handleFullscreenChange
    );
    document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
    document.removeEventListener("msfullscreenchange", handleFullscreenChange);

    const grid = document.getElementById("lp-channels-grid");
    if (grid) {
      grid.removeEventListener("scroll", handleScroll);
    }

    if (
      typeof LiveVideoJsComponent !== "undefined" &&
      LiveVideoJsComponent.cleanup
    ) {
      LiveVideoJsComponent.cleanup();
    } else if (window.livePlayer) {
      try {
        window.livePlayer.dispose();
      } catch (e) {}
      window.livePlayer = null;
    }

    localStorage.removeItem("navigationFocus");
    window.cleanupLivePage = null;
  };

  const init = () => {
    // Explicitly reset state on init
    focusedSection = "header"; // Start with header focused (User Request)
    sidebarIndex = 0;
    channelIndex = 0;
    buttonFocusIndex = -1;
    playerSubFocus = 0;
    headerSubFocus = 0; // 0 = Search, 1 = Menu
    playerVisualFocus = true; // Player should have visual focus initially
    epgIndex = -1;
    currentPlayingStream = null;
    lastToggleTime = 0;
    categorySearchQuery = "";
    channelSearchQuery = "";
    selectedCategoryId = "All";
    categoryChunk = 1;
    channelChunk = 1;

    console.log("LivePage init called");

    container = document.querySelector(".lp-main-container");
    if (!container) return;

    const searchInput = document.getElementById("search-input");
    const searchIcon = document.querySelector(".nav-search-bar");
    if (searchInput) searchInput.style.display = "none";
    if (searchIcon) searchIcon.style.display = "none";

    render();
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("sortChanged", handleSortChange);

    // Add fullscreen event listeners
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    window.cleanupLivePage = cleanup;
    // Listen for focus changes from Navbar
    window.addEventListener(
      "navigation-focus-change",
      handleNavigationFocusChange
    );
  };

  const handleNavigationFocusChange = () => {
    const navFocus = localStorage.getItem("navigationFocus");
    if (navFocus === "sidebarSearch") {
      focusedSection = "sidebarSearch";
      updateFocus();
    }
  };

  const checkIsCategoryLocked = (catId) => {
    const currentPlaylist = getCurrentPlaylist();
    const parentalEnabled =
      currentPlaylist && !!currentPlaylist.parentalPassword;
    if (!parentalEnabled) return false;
    if (unlockedLiveAdultCatIds.has(String(catId))) return false;

    if (catId === "All") {
      return (window.allLiveStreams || []).some((s) => {
        const c = (window.liveCategories || []).find(
          (lc) => lc.category_id === s.category_id
        );
        return c && isLiveAdultCategory(c.category_name);
      });
    }

    if (catId === "favorites") {
      const favs = currentPlaylist.favoritesLiveTV || [];
      return favs.some((f) => {
        const c = (window.liveCategories || []).find(
          (lc) => lc.category_id === f.category_id
        );
        return c && isLiveAdultCategory(c.category_name);
      });
    }

    if (catId === "channelHistory") return false;

    const currentCat = (window.liveCategories || []).find(
      (c) => String(c.category_id) === String(catId)
    );
    return currentCat && isLiveAdultCategory(currentCat.category_name);
  };

  // Helper to manage Arrow Indicator visibility
  const updateArrowIndicator = () => {
    const arrowRight = document.getElementById("lp-channels-arrow-right");
    const arrowLeft = document.getElementById("lp-channels-arrow-left");
    // if (!arrowRight || !arrowLeft) return; // Allow arrowLeft to be missing

    const grid = document.getElementById("lp-channels-grid");
    if (!grid) return;

    // NEW: Hide arrows if category is locked
    if (checkIsCategoryLocked(selectedCategoryId)) {
      arrowRight.classList.remove("visible");
      arrowLeft.classList.remove("visible");
      return;
    }

    // Logic for Right Arrow
    // Only run if arrowRight exists
    if (arrowRight) {
      const totalChannels = filteredStreams.length;
      const currentRendered =
        document.querySelectorAll(".lp-channel-card").length;
      const canScrollRight =
        grid.scrollWidth > grid.clientWidth + grid.scrollLeft + 10;
      const hasMoreToLoad = currentRendered < totalChannels;

      if (canScrollRight || hasMoreToLoad) {
        arrowRight.classList.add("visible");
      } else {
        arrowRight.classList.remove("visible");
      }
    }

    // Logic for Left Arrow
    if (arrowLeft) {
      if (grid.scrollLeft > 10) {
        arrowLeft.classList.add("visible");
      } else {
        arrowLeft.classList.remove("visible");
      }
    }
  };

  const getFilteredCategories = () => {
    let cats = [
      {
        category_id: "All",
        category_name: "All Channels",
      },
      {
        category_id: "favorites",
        category_name: "Favorite Channels",
      },
      {
        category_id: "channelHistory",
        category_name: "Channels History",
      },
    ];

    if (window.liveCategories) {
      cats = [...cats, ...window.liveCategories];
    }

    if (categorySearchQuery) {
      cats = cats.filter((c) =>
        c.category_name
          .toLowerCase()
          .includes(categorySearchQuery.toLowerCase())
      );
    }

    // Return only the current chunk
    const start = 0;
    const end = categoryChunk * categoryPageSize;
    return cats.slice(start, end);
  };

  const getAllFilteredCategories = () => {
    let cats = [
      {
        category_id: "All",
        category_name: "All Channels",
      },
      {
        category_id: "favorites",
        category_name: "Favorite Channels",
      },
      {
        category_id: "channelHistory",
        category_name: "Channels History",
      },
    ];

    if (window.liveCategories) {
      cats = [...cats, ...window.liveCategories];
    }

    if (categorySearchQuery) {
      cats = cats.filter((c) =>
        c.category_name
          .toLowerCase()
          .includes(categorySearchQuery.toLowerCase())
      );
    }

    return cats;
  };

  const getFilteredChannels = () => {
    let streams = [];

    if (selectedCategoryId === "All") {
      streams = window.allLiveStreams || [];
    } else if (selectedCategoryId === "favorites") {
      // Always get fresh data from localStorage
      const currentPlaylist = getCurrentPlaylist();
      streams = currentPlaylist ? currentPlaylist.favoritesLiveTV || [] : [];
    } else if (selectedCategoryId === "channelHistory") {
      // Always get fresh data from localStorage
      const currentPlaylist = getCurrentPlaylist();
      streams = currentPlaylist ? currentPlaylist.ChannelListLive || [] : [];
    } else {
      streams = (window.allLiveStreams || []).filter(
        (s) => String(s.category_id) === String(selectedCategoryId)
      );
    }

    if (channelSearchQuery) {
      streams = streams.filter((s) =>
        (s.name || "").toLowerCase().includes(channelSearchQuery.toLowerCase())
      );
    }

    // Apply Sorting
    if (currentSortOption === "az") {
      streams.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (currentSortOption === "za") {
      streams.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    } else if (currentSortOption === "recent") {
      streams.sort((a, b) => {
        const timeA = a.added ? parseInt(a.added) : 0;
        const timeB = b.added ? parseInt(b.added) : 0;
        return timeB - timeA;
      });
    }

    return streams;
  };

  const getCategoryCount = (catId) => {
    if (catId === "All") return (window.allLiveStreams || []).length;
    if (catId === "favorites") {
      const currentPlaylist = getCurrentPlaylist();
      return currentPlaylist && currentPlaylist.favoritesLiveTV
        ? currentPlaylist.favoritesLiveTV.length
        : 0;
    }
    if (catId === "channelHistory") {
      const currentPlaylist = getCurrentPlaylist();
      return currentPlaylist && currentPlaylist.ChannelListLive
        ? currentPlaylist.ChannelListLive.length
        : 0;
    }
    return (window.allLiveStreams || []).filter(
      (s) => String(s.category_id) === String(catId)
    ).length;
  };

  const render = () => {
    container.innerHTML = `
      <div class="movies-header" style="margin-bottom: 60px;">
        <div class="first-movies-header">
          <img src="assets/app-logo.png" alt="Logo" class="setting-header-logo" style="height: 120px; width: auto;"/>
          <div class="movies-header-right">
          ${DateTimeComponent()}
          </div>
        </div>
        <div class="second-movies-header">
          <p class="movies-header-title">Live TV</p>
          <div class="second-movies-header-div">
            <div class="movies-header-search">
              <input type="text" placeholder="Search Channels" id="live-header-search" class="movies-header-search-input"/>
              <img src="assets/search-icon.png" alt="search" class="movies-header-search-icon"/>
            </div>
            <div class="movies-header-menu">
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

      <div class="lp-body-wrapper" style="display: flex; flex: 1; overflow: hidden; width: 100%;">
        <div class="lp-sidebar">
            <!-- <div class="lp-search-box" id="lp-cat-search-box">
            <input type="text" class="lp-search-input" id="lp-cat-search-input" placeholder="Search Categories" value="${categorySearchQuery}">
            <i class="fas fa-search lp-search-icon" style="color: #aaa; margin-right: 10px;"></i>
        
            </div> -->
            <ul class="lp-category-list" id="lp-category-list"></ul>
        </div>
        <div class="lp-content">
            <div class="lp-top-section">
            <div class="lp-player-container" id="lp-player-container">
                <div class="lp-video-wrapper">
                <div style="width:100%; height:100%; zoom:1.4; background:black; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#666;">
                    <i class="fas fa-play-circle" style="font-size: 50px; margin-bottom:10px;"></i>
                    <p>Select a channel to play</p>
                </div>
                </div>
            </div>
            <div class="lp-epg-container" id="lp-epg-container">
                <div class="lp-epg-header"><span>Program Guide</span></div>
                <div class="lp-epg-list" id="lp-epg-list">
                <div style="padding:20px; color:#aaa; text-align:center; zoom:1.4;">
                    Select a channel to view program information
                </div>
                </div>
            </div>
            </div>
            <div class="lp-channels-section">
     
            <div class="lp-channels-grid" id="lp-channels-grid"></div>
            <!-- <div class="lp-channels-arrow-indicator lp-arrow-left" id="lp-channels-arrow-left">
              <i class="fas fa-chevron-left"></i>
            </div> -->
            <div class="lp-channels-arrow-indicator lp-arrow-right" id="lp-channels-arrow-right">
              <i class="fas fa-chevron-right"></i>
            </div>
            </div>
        </div>
      </div>
    `;

    renderCategories();
    renderChannels();

    setTimeout(() => {
      setupInputListeners();
      setupScrollListener();
      setupClickListeners();

      // Apply initial focus
      updateFocus();

      // Ensure loader is hidden after all initial setup is done
      const loaderElement = document.getElementById("home-page-loader");
      if (loaderElement) {
        loaderElement.classList.add("fade-out");
        setTimeout(() => {
          if (loaderElement && loaderElement.parentNode) {
            loaderElement.parentNode.removeChild(loaderElement);
          }
        }, 500); // Allow time for fade-out animation
      }
    }, 100);
  };

  const renderCategories = () => {
    const list = document.getElementById("lp-category-list");
    if (!list) return;

    const cats = getFilteredCategories();

    if (cats.length === 0) {
      list.innerHTML =
        '<div style="padding:20px; color:#aaa; zoom:1.7; text-align:center;">No category found</div>';
      return;
    }

    list.innerHTML = cats
      .map((cat, idx) => {
        let isAdult = isLiveAdultCategory(cat.category_name);
        const currentPlaylist = getCurrentPlaylist();
        const parentalEnabled =
          currentPlaylist && !!currentPlaylist.parentalPassword;

        // special check for Favorites
        if (cat.category_id === "favorites" && parentalEnabled) {
          const favs = currentPlaylist.favoritesLiveTV || [];
          const hasAdultFav = favs.some((f) => {
            const c = (window.liveCategories || []).find(
              (lc) => lc.category_id === f.category_id
            );
            return c && isLiveAdultCategory(c.category_name);
          });
          if (hasAdultFav) {
            isAdult = true;
          }
        }

        // special check for All Channels
        if (cat.category_id === "All" && parentalEnabled) {
          const hasAdultInAll = (window.allLiveStreams || []).some((s) => {
            const c = (window.liveCategories || []).find(
              (lc) => lc.category_id === s.category_id
            );
            return c && isLiveAdultCategory(c.category_name);
          });
          if (hasAdultInAll) {
            isAdult = true;
          }
        }

        const isLocked = checkIsCategoryLocked(cat.category_id);
        const showLock = parentalEnabled && isLocked;

        return `
        <li class="lp-category-item ${
          String(selectedCategoryId) === String(cat.category_id)
            ? "lp-selected"
            : ""
        } ${showLock ? "lp-category-locked" : ""}" data-id="${
          cat.category_id
        }" data-index="${idx}" style="position: relative; overflow: hidden;">
          <div class="lp-category-name-wrapper" style="${
            showLock ? "filter: blur(5px);" : ""
          }">
            <span class="lp-category-name">${cat.category_name}</span>
          </div>
          <span class="lp-category-count" style="${
            showLock ? "filter: blur(5px);" : ""
          }">${getCategoryCount(cat.category_id)}</span>
           ${
             showLock
               ? '<div style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; z-index:10;"><i class="fas fa-lock" style="font-size: 20px; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.5);"></i></div>'
               : ""
           }
        </li>
      `;
      })
      .join("");
  };

  const renderChannels = (append = false) => {
    const grid = document.getElementById("lp-channels-grid");
    if (!grid) return;

    filteredStreams = getFilteredChannels();
    console.log(
      `Rendering channels. Category: ${selectedCategoryId}, Count: ${filteredStreams.length}`
    );

    if (filteredStreams.length === 0) {
      grid.innerHTML =
        '<div style="padding:20px; color:#aaa; zoom:1.4; text-align:center;">No channels found</div>';
      return;
    }

    // Lock Check for Message Display
    const isCategoryLocked = checkIsCategoryLocked(selectedCategoryId);

    if (isCategoryLocked) {
      grid.style.display = "flex"; // Switch to flex for perfect centering
      grid.innerHTML = `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; gap: 20px; padding: 40px; text-align: center; height: 100%; min-height: 300px;">
                    <i class="fas fa-lock" style="font-size: 80px; opacity: 0.5;"></i>
                    <h2 style="font-size: 32px; margin: 0;">This category is Locked</h2>
                    <p style="font-size: 20px; opacity: 0.7; margin: 0;">Please unlock it using your PIN to view channels</p>
                </div>
            `;
      updateArrowIndicator(); // Ensure arrow is hidden
      return;
    }

    grid.style.display = "grid"; // Restore grid layout

    // Calculate which channels to show
    const endIdx = Math.min(
      channelChunk * channelPageSize,
      filteredStreams.length
    );

    let channelsToRender = [];
    if (append) {
      // Append Mode: Render only new items
      const currentCount = grid.querySelectorAll(".lp-channel-card").length;
      channelsToRender = filteredStreams.slice(currentCount, endIdx);
    } else {
      // Full Render: Clear and render from 0
      channelsToRender = filteredStreams.slice(0, endIdx);
      grid.innerHTML = "";
    }

    const fragment = document.createDocumentFragment();

    channelsToRender.forEach((stream, idx) => {
      // Offset index for appended items
      const actualIdx = append ? grid.children.length + idx : idx; // Actually grid.children count + loop idx?
      // Wait, slice gives new items.
      // But we need the GLOBAL index for dataset.index.
      // Global index = (endIdx - channelsToRender.length) + idx ?
      // No. slice(start, end).
      // If start = 20. idx 0 is item 20.
      // So global index = start + idx.
      const startOffset = append
        ? grid.querySelectorAll(".lp-channel-card").length
        : 0;
      const globalIndex = startOffset + idx;

      const currentPlaylistObj = getCurrentPlaylist();
      const playlistUsername = currentPlaylistObj
        ? currentPlaylistObj.playlistName
        : null;
      const isFav = window.isItemFavoriteForPlaylist
        ? window.isItemFavoriteForPlaylist(
            stream,
            "favoritesLiveTV",
            playlistUsername
          )
        : false;
      const isHistory = selectedCategoryId === "channelHistory";

      // Detect adult channels
      const category = (window.liveCategories || []).find(
        (c) => c.category_id === stream.category_id
      );
      const isAdultChannel = category
        ? isLiveAdultCategory(category.category_name)
        : false;
      const currentPlaylistForParental = getCurrentPlaylist();
      const parentalEnabled =
        currentPlaylistForParental &&
        !!currentPlaylistForParental.parentalPassword;

      // Determine if channel is unlocked
      let isChannelUnlocked = true;
      if (isAdultChannel && parentalEnabled) {
        if (selectedCategoryId === "All") {
          isChannelUnlocked = unlockedLiveAdultChannelsInAll.has(
            String(stream.stream_id)
          );
        } else if (selectedCategoryId === "favorites") {
          isChannelUnlocked = unlockedLiveAdultChannelsInFavorites.has(
            String(stream.stream_id)
          );
        } else if (selectedCategoryId === "channelHistory") {
          isChannelUnlocked = unlockedLiveAdultChannelsInHistory.has(
            String(stream.stream_id)
          );
        } else {
          isChannelUnlocked = unlockedLiveAdultCatIds.has(
            String(selectedCategoryId)
          );
        }
      }

      const card = document.createElement("div");
      card.className = "lp-channel-card";
      card.dataset.streamId = stream.stream_id;
      card.dataset.index = globalIndex;
      card.dataset.isAdult = isAdultChannel;

      card.innerHTML = `
        <div class="lp-channel-row-content">
            <div class="lp-channel-logo-container">
              <img src="${
                stream.stream_icon || "assets/app-logo.png"
              }" class="lp-channel-logo" onerror="this.src='assets/app-logo.png'">
            </div>
            
            <div class="lp-channel-name-wrapper">
                <div class="lp-channel-name">${stream.name}</div>
            </div>

            <div class="lp-channel-buttons">
              <button class="lp-channel-fav-btn" data-stream-id="${
                stream.stream_id
              }" data-button-index="0">
                <i class="${isFav ? "fa-solid" : "fa-regular"} fa-heart"></i>
              </button>
              ${
                isHistory
                  ? `<button class="lp-channel-remove-btn" data-stream-id="${stream.stream_id}" data-button-index="1">
                  <i class="fa-solid fa-xmark"></i>
                </button>`
                  : ""
              }
            </div>
        </div>
        <div class="lp-progress-bar">
            <div class="lp-progress-fill" style="width: ${
              Math.random() * 100
            }%">
                <div class="lp-progress-dot"></div>
            </div>
        </div>
      `;

      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
  };

  const toggleFavorite = (stream, showToast = true) => {
    if (!window.toggleFavoriteItem) {
      console.error("toggleFavoriteItem function not available");
      return;
    }

    const now = Date.now();
    if (now - lastToggleTime < 500) {
      console.warn("Toggle favorite called too quickly, ignoring");
      return;
    }
    lastToggleTime = now;

    // CRITICAL FIX: Get fresh playlist data and check CURRENT favorite state BEFORE toggling
    const freshPlaylist = getCurrentPlaylist();
    const playlistUsername = freshPlaylist ? freshPlaylist.playlistName : null;

    if (!playlistUsername) {
      console.error("No playlist username found");
      if (showToast && window.Toaster && window.Toaster.showToast) {
        window.Toaster.showToast("error", "Failed to update favorites");
      }
      return;
    }

    // Check if the item is CURRENTLY a favorite (before toggling)
    const isCurrentlyFavorite = window.isItemFavoriteForPlaylist
      ? window.isItemFavoriteForPlaylist(
          stream,
          "favoritesLiveTV",
          playlistUsername
        )
      : false;

    // Now perform the toggle operation
    const result = window.toggleFavoriteItem(stream, "favoritesLiveTV");

    // Check if the operation was successful
    if (!result || !result.success) {
      console.error(
        "Failed to toggle favorite:",
        result ? result.message : "unknown error"
      );
      if (showToast && window.Toaster && window.Toaster.showToast) {
        window.Toaster.showToast("error", "Failed to update favorites");
      }
      return;
    }

    // Show toast based on what we INTENDED to do (opposite of current state)
    // If it was a favorite, we removed it. If it wasn't, we added it.
    if (showToast && window.Toaster && window.Toaster.showToast) {
      const actionMessage = isCurrentlyFavorite
        ? "Removed from favorites"
        : "Added to favorites";
      const toastType = isCurrentlyFavorite ? "error" : "success";

      window.Toaster.showToast(toastType, actionMessage);
    }

    // Force refresh of the current playlist data from localStorage after toggle
    const updatedPlaylist = getCurrentPlaylist();

    if (selectedCategoryId === "favorites" && isCurrentlyFavorite) {
      // If we're in favorites view and removed an item, re-render everything
      channelChunk = 1;
      renderChannels();
      renderCategories();
      if (channelIndex >= filteredStreams.length) {
        channelIndex = Math.max(0, filteredStreams.length - 1);
      }
      buttonFocusIndex = -1;
      updateFocus();
    } else {
      // Update the specific card's heart icon based on fresh data
      const card = document.querySelector(
        `.lp-channel-card[data-stream-id="${stream.stream_id}"]`
      );
      if (card) {
        const favBtn = card.querySelector(".lp-channel-fav-btn i");
        if (favBtn) {
          // Check the actual favorite status from fresh playlist data after toggle
          const updatedPlaylistUsername = updatedPlaylist
            ? updatedPlaylist.playlistName
            : null;
          const actualIsFav = window.isItemFavoriteForPlaylist
            ? window.isItemFavoriteForPlaylist(
                stream,
                "favoritesLiveTV",
                updatedPlaylistUsername
              )
            : result.isFav;

          favBtn.className = actualIsFav
            ? "fa-solid fa-heart"
            : "fa-regular fa-heart";
        }
      }

      // If this is the currently playing stream, update EPG heart icon too
      if (
        currentPlayingStream &&
        String(currentPlayingStream.stream_id) === String(stream.stream_id)
      ) {
        updateEPG(stream);
      }

      renderCategories();
    }
  };

  const removeFromHistory = (stream) => {
    const currentPlaylistName = JSON.parse(
      localStorage.getItem("selectedPlaylist")
    ).playlistName;
    const playlistsData = JSON.parse(localStorage.getItem("playlistsData"));
    const currentPlaylistIndex = playlistsData.findIndex(
      (pl) => pl.playlistName === currentPlaylistName
    );

    if (currentPlaylistIndex !== -1) {
      playlistsData[currentPlaylistIndex].ChannelListLive = (
        playlistsData[currentPlaylistIndex].ChannelListLive || []
      ).filter((ch) => String(ch.stream_id) !== String(stream.stream_id));

      localStorage.setItem("playlistsData", JSON.stringify(playlistsData));
    }
    window.Toaster.showToast("error", "Removed from Channel History");
    channelChunk = 1;
    renderChannels();
    renderCategories();

    if (channelIndex >= filteredStreams.length) {
      channelIndex = Math.max(0, filteredStreams.length - 1);
    }
    buttonFocusIndex = -1;
    updateFocus();
  };

  const updateFocus = () => {
    if (localStorage.getItem("navigationFocus") === "navbar") {
      // Remove active focus classes but KEEP permanent player focus (red border)
      document
        .querySelectorAll(".lp-focused")
        .forEach((el) => el.classList.remove("lp-focused"));
      document
        .querySelectorAll(".lp-control-focused")
        .forEach((el) => el.classList.remove("lp-control-focused"));

      // Re-apply permanent red border if playerVisualFocus is true
      if (playerVisualFocus) {
        const player = document.getElementById("lp-player-container");
        if (player) {
          player.classList.add("lp-player-permanent-focus");
        }
      }
      return;
    }
    document
      .querySelectorAll(".lp-focused")
      .forEach((el) => el.classList.remove("lp-focused"));

    // Globally remove control focus
    document
      .querySelectorAll(".lp-control-focused")
      .forEach((el) => el.classList.remove("lp-control-focused"));

    // Globally remove permanent player focus (will be re-added if needed)
    document
      .querySelectorAll(".lp-player-permanent-focus")
      .forEach((el) => el.classList.remove("lp-player-permanent-focus"));

    // Globally hide play/pause icon if not in player section
    const playPauseIcon =
      document.querySelector(".play-pause-icon") ||
      document.getElementById("live-play-pause-btn");

    if (playPauseIcon && focusedSection !== "player") {
      playPauseIcon.style.display = "none";
    }

    // Remove Header Focus Classes
    const headerSearchInput = document.getElementById("live-header-search");
    if (headerSearchInput)
      headerSearchInput.classList.remove("live-header-search-input-focused");

    const headerMenuIcon = document.querySelector(".movies-header-menu");
    if (headerMenuIcon)
      headerMenuIcon.classList.remove("live-header-menu-focused");

    const videoWrapper = document.querySelector(".lp-video-wrapper");
    if (videoWrapper) {
      const video = videoWrapper.querySelector("video");
      if (video && video.src && video.src !== "") {
        // Video is loaded, keep it visible
        video.style.display = "block";
        video.style.visibility = "visible";
        video.style.opacity = "1";
      }
    }

    // Blur all inputs when not in search sections
    if (
      focusedSection !== "sidebarSearch" &&
      focusedSection !== "channelSearch"
    ) {
      const catInput = document.getElementById("lp-cat-search-input");
      const chanInput = document.getElementById("lp-chan-search-input");
      if (catInput) catInput.blur();
      if (chanInput) chanInput.blur();
    }

    if (focusedSection === "epg") {
      const epgList = document.getElementById("lp-epg-list");
      const headerFavBtn = document.getElementById("lp-epg-fav-btn");

      if (epgIndex === -1) {
        if (headerFavBtn) headerFavBtn.classList.add("lp-focused");
      } else {
        const items = document.querySelectorAll(".lp-epg-item");
        if (items[epgIndex]) {
          items[epgIndex].classList.add("lp-focused");
          items[epgIndex].scrollIntoView({
            block: "nearest",
          });
        }
      }
    } else if (focusedSection === "sidebar") {
      const items = document.querySelectorAll(".lp-category-item");
      if (items[sidebarIndex]) {
        items[sidebarIndex].classList.add("lp-focused");
        items[sidebarIndex].scrollIntoView({
          block: "nearest",
        });

        // Conditional Marquee for Category
        const name = items[sidebarIndex].querySelector(".lp-category-name");
        if (name) {
          name.classList.remove("marquee-active");
          if (name.scrollWidth > name.clientWidth) {
            name.classList.add("marquee-active");
          }
        }
      }
    } else if (focusedSection === "header") {
      const searchInput = document.getElementById("live-header-search");
      const menuIcon = document.querySelector(".movies-header-menu");

      if (headerSubFocus === 0) {
        if (searchInput)
          searchInput.classList.add("live-header-search-input-focused");
      } else if (headerSubFocus === 1) {
        if (menuIcon) menuIcon.classList.add("live-header-menu-focused");
      }
    } else if (focusedSection === "sidebarSearch") {
      const box = document.getElementById("lp-cat-search-box");
      if (box) {
        box.classList.add("lp-focused");
        // Don't auto-focus the input, only add the border class
      }
    } else if (focusedSection === "player") {
      const player = document.getElementById("lp-player-container");
      if (player) {
        player.classList.add("lp-player-active"); // Keep controls visible

        const isFullscreen = checkIsFullscreen();

        if (
          !isFullscreen &&
          playerSubFocus !== 0 &&
          playerSubFocus !== 1 &&
          playerSubFocus !== 2
        ) {
          player.classList.add("lp-focused");
        } else {
          player.classList.remove("lp-focused");
        }

        // Check for loader
        const loader = document.querySelector(".live-video-loader");
        const isLoaderVisible = loader && !loader.classList.contains("hidden");

        const playPauseIcon =
          document.querySelector(".play-pause-icon") ||
          document.getElementById("live-play-pause-btn");
        const aspectRatioBtn =
          document.getElementById("videojs-aspect-ratio") ||
          document.getElementById("flow-aspect-ratio");
        const fullscreenBtn = document.getElementById("lp-fullscreen-btn");

        // Check if video is actually playing
        const videoWrapper = document.querySelector(".lp-video-wrapper");
        const hasVideo =
          videoWrapper &&
          !videoWrapper.innerText.includes("Select a channel to play");

        if (isLoaderVisible || !hasVideo) {
          // Force hide controls if loader is visible or NO video
          if (playPauseIcon) playPauseIcon.style.display = "none";
          if (aspectRatioBtn) aspectRatioBtn.style.display = "none";
          if (fullscreenBtn) fullscreenBtn.style.display = "none";
        } else {
          // In fullscreen, always show both controls when player is focused
          if (isFullscreen) {
            if (playPauseIcon) playPauseIcon.style.display = "flex";
            if (
              aspectRatioBtn &&
              (playerSubFocus === 1 || playerSubFocus === 2)
            ) {
              aspectRatioBtn.style.display = "block";
            }
            // Fullscreen button is handled via CSS or explicit check below (hidden in fullscreen)
            if (fullscreenBtn) fullscreenBtn.style.display = "none";
          } else {
            // Non-fullscreen logic
            if (fullscreenBtn) fullscreenBtn.style.display = "flex"; // Show only if video playing & no loader

            if (playPauseIcon) {
              if (playerSubFocus === 1) {
                playPauseIcon.style.display = "flex";
              } else {
                playPauseIcon.style.display = "flex";
              }
            }
          }

          // Apply focus styling
          if (playerSubFocus === 1) {
            if (playPauseIcon)
              playPauseIcon.classList.add("lp-control-focused");
          } else if (playerSubFocus === 2) {
            if (aspectRatioBtn) {
              aspectRatioBtn.classList.add("lp-control-focused");
            }
          } else if (playerSubFocus === 0) {
            if (fullscreenBtn) {
              const icon = fullscreenBtn.querySelector(".lp-fullscreen-icon");
              if (icon) icon.classList.add("lp-control-focused");
            }
          }

          // Ensure Aspect Ratio button is visible when player is focused (BOTH fullscreen and non-fullscreen)
          if (playerSubFocus === 1 || playerSubFocus === 2) {
            if (aspectRatioBtn) aspectRatioBtn.style.display = "block";
          }
        }
      }
      document.activeElement.blur();
    } else {
      // STRICT HIDING: If not in player section, hide controls
      const playPauseIcon =
        document.querySelector(".play-pause-icon") ||
        document.getElementById("live-play-pause-btn");
      const aspectRatioBtn =
        document.getElementById("videojs-aspect-ratio") ||
        document.getElementById("flow-aspect-ratio");
      const fullscreenBtn = document.getElementById("lp-fullscreen-btn");

      if (playPauseIcon) playPauseIcon.style.display = "none";
      if (aspectRatioBtn) aspectRatioBtn.style.display = "none";
      if (fullscreenBtn) fullscreenBtn.style.display = "none";
    }

    // INDEPENDENT PLAYER VISUAL FOCUS: Always show RED border if playerVisualFocus is true
    // This ensures the player maintains its RED border even when focusedSection changes
    if (playerVisualFocus) {
      const player = document.getElementById("lp-player-container");
      // CRITICAL: Do NOT show border in fullscreen mode
      const isFullscreen = checkIsFullscreen();

      if (player && !isFullscreen) {
        player.classList.add("lp-player-permanent-focus"); // Red border always visible
      }
    }

    if (focusedSection === "channelSearch") {
      const box = document.getElementById("lp-chan-search-box");
      if (box) {
        box.classList.add("lp-focused");
      }
    } else if (focusedSection === "channels") {
      const items = document.querySelectorAll(".lp-channel-card");
      if (items[channelIndex]) {
        items[channelIndex].classList.add("lp-focused");

        // Smooth scroll item into view
        items[channelIndex].scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });

        // Conditional Marquee for Channel
        const name = items[channelIndex].querySelector(".lp-channel-name");
        if (name) {
          name.classList.remove("marquee-active");
          if (name.scrollWidth > name.clientWidth) {
            name.classList.add("marquee-active");
          }
        }

        // Handle button focus (if we kept logic for buttons)
        if (buttonFocusIndex >= 0) {
          const buttons = items[channelIndex].querySelectorAll(
            ".lp-channel-fav-btn, .lp-channel-remove-btn"
          );
          if (buttons[buttonFocusIndex]) {
            buttons[buttonFocusIndex].classList.add("lp-focused");
          }
        }
      }
    }

    // Always update arrow indicator state
    updateArrowIndicator();
  };

  const playChannel = (stream) => {
    if (!stream) {
      // Stop Player Logic
      const videoWrapper = document.querySelector(".lp-video-wrapper");
      if (videoWrapper) {
        if (
          typeof LiveVideoJsComponent !== "undefined" &&
          typeof LiveVideoJsComponent.cleanup === "function"
        ) {
          try {
            LiveVideoJsComponent.cleanup();
          } catch (err) {}
        }

        if (window.livePlayer) {
          try {
            window.livePlayer.dispose();
          } catch (e) {}
          window.livePlayer = null;
        }

        videoWrapper.innerHTML = `
          <div style="width:100%; height:100%; background:black; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#666;">
            <i class="fas fa-play-circle" style="font-size: 50px; margin-bottom:10px;"></i>
            <p>Select a channel to play</p>
          </div>
        `;
      }

      // Reset EPG
      const epgList = document.getElementById("lp-epg-list");
      if (epgList) {
        epgList.innerHTML = `
          <div style="padding:20px; text-align:center; color:#aaa; zoom:1.3;">
            Select a channel to view program information
          </div>
        `;
      }
      const epgHeader = document.querySelector(".lp-epg-header");
      if (epgHeader) {
        epgHeader.innerHTML = `<span>Program Guide</span>`;
      }

      currentPlayingStream = null;

      document.querySelectorAll(".lp-channel-card").forEach((c) => {
        c.classList.remove("lp-channel-card-playing");
      });
      return;
    }

    // Show loading indicator
    const videoWrapper = document.querySelector(".lp-video-wrapper");
    if (videoWrapper) {
      videoWrapper.innerHTML = `
        <div style="width:100%; height:100%; background:black; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#fff;">
          <i class="fas fa-spinner fa-spin" style="font-size: 50px; margin-bottom:10px;"></i>
          <p>Loading channel...</p>
        </div>
      `;
    }

    try {
      const currentPlaylistData = JSON.parse(
        localStorage.getItem("currentPlaylistData")
      );
      const playlistLiveExtension = JSON.parse(
        localStorage.getItem("selectedPlaylist")
      );

      if (!currentPlaylistData || !playlistLiveExtension) {
        console.error("Missing playlist data");
        return;
      }

      const liveVideoUrl = `${
        currentPlaylistData.server_info.server_protocol
      }://${currentPlaylistData.server_info.url}:${
        currentPlaylistData.server_info.port
      }/live/${currentPlaylistData.user_info.username}/${
        currentPlaylistData.user_info.password
      }/${stream.stream_id}.${playlistLiveExtension.streamFormat || "m3u8"}`;

      const videoWrapper = document.querySelector(".lp-video-wrapper");
      if (!videoWrapper) return;

      const videoEl = videoWrapper.querySelector("video");
      const currentStreamId = videoEl ? videoEl.dataset.streamId : null;

      if (currentStreamId !== String(stream.stream_id)) {
        if (typeof LiveVideoJsComponent.cleanup === "function") {
          try {
            LiveVideoJsComponent.cleanup();
          } catch (err) {}
        }

        if (window.livePlayer) {
          try {
            window.livePlayer.dispose();
          } catch (e) {}
          window.livePlayer = null;
        }

        const currentPlaylist = getCurrentPlaylist();
        const isTs =
          (currentPlaylist.streamFormat
            ? currentPlaylist.streamFormat
            : ""
          ).toLowerCase() === "ts";

        if (isTs && typeof FlowLivePlayerComponent === "function") {
          videoWrapper.innerHTML = FlowLivePlayerComponent(
            stream.stream_id,
            liveVideoUrl,
            stream.stream_icon,
            "100%",
            stream.name || ""
          );
        } else if (typeof LiveVideoJsComponent === "function") {
          videoWrapper.innerHTML = LiveVideoJsComponent(
            stream.stream_id,
            liveVideoUrl,
            stream.stream_icon,
            "100%",
            stream.name || ""
          );
        } else {
          videoWrapper.innerHTML = `<video src="${liveVideoUrl}" controls autoplay style="width:100%; height:100%;" data-stream-id="${stream.stream_id}"></video>`;
        }
      } else {
        if (window.livePlayer && typeof window.livePlayer.play === "function") {
          window.livePlayer.play();
        }
      }

      document.querySelectorAll(".lp-channel-card").forEach((c) => {
        c.classList.remove("lp-channel-card-playing");
      });

      const playingCard = document.querySelector(
        `.lp-channel-card[data-stream-id="${stream.stream_id}"]`
      );
      if (playingCard) {
        playingCard.classList.add("lp-channel-card-playing");
      }

      // Prevent adding to history if it's an adult channel
      const category = (window.liveCategories || []).find(
        (c) => c.category_id === stream.category_id
      );
      const isAdultChannel = category
        ? isLiveAdultCategory(category.category_name)
        : false;

      if (
        selectedCategoryId !== "channelHistory" &&
        window.addItemToHistory &&
        !isAdultChannel
      ) {
        window.addItemToHistory(stream, "ChannelListLive");
        setTimeout(() => {
          renderCategories();
        }, 100);
      }
      updateEPG(stream);
    } catch (error) {
      console.error("Error playing channel:", error);
    }
  };

  const playNextChannel = () => {
    if (!filteredStreams.length || !currentPlayingStream) return;
    const currentIndex = filteredStreams.findIndex(
      (s) => String(s.stream_id) === String(currentPlayingStream.stream_id)
    );
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= filteredStreams.length) {
      console.log("Already at the last channel.");
      return;
    }

    const nextStream = filteredStreams[nextIndex];
    channelIndex = nextIndex;
    checkLockAndPlay(nextStream);
  };

  const playPreviousChannel = () => {
    if (!filteredStreams.length || !currentPlayingStream) return;
    const currentIndex = filteredStreams.findIndex(
      (s) => String(s.stream_id) === String(currentPlayingStream.stream_id)
    );
    if (currentIndex === -1) return;

    const prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      console.log("Already at the first channel.");
      return;
    }

    const prevStream = filteredStreams[prevIndex];
    channelIndex = prevIndex;
    checkLockAndPlay(prevStream);
  };

  const checkLockAndPlay = (stream) => {
    if (!stream) return;

    const category = (window.liveCategories || []).find(
      (c) => c.category_id === stream.category_id
    );
    const isAdult = category
      ? isLiveAdultCategory(category.category_name)
      : false;
    const currentPlaylist = getCurrentPlaylist();
    const parentalEnabled =
      currentPlaylist && !!currentPlaylist.parentalPassword;

    if (isAdult && parentalEnabled && category) {
      const catId = String(category.category_id);
      if (!unlockedLiveAdultCatIds.has(catId)) {
        ParentalPinDialog(
          () => {
            unlockedLiveAdultCatIds.add(catId);
            renderCategories();
            playChannel(stream);
          },
          () => {
            console.log("Incorrect PIN for Zapping");
          },
          currentPlaylist,
          "liveTvPage"
        );
        return;
      }
    }
    playChannel(stream);
  };

  const updateEPG = (stream) => {
    currentPlayingStream = stream;
    const epgList = document.getElementById("lp-epg-list");
    const epgHeader = document.querySelector(".lp-epg-header");

    if (!epgList || !epgHeader) return;

    // Render Header immediately
    const currentPlaylistObj = getCurrentPlaylist();
    const playlistUsername = currentPlaylistObj
      ? currentPlaylistObj.playlistName
      : null;
    const isFav = window.isItemFavoriteForPlaylist
      ? window.isItemFavoriteForPlaylist(
          stream,
          "favoritesLiveTV",
          playlistUsername
        )
      : false;

    // Only show heart if favorite, and NOT as a button/focusable
    const heartIcon = isFav
      ? `<i class="fa-solid fa-heart" style="color:#ff4444; margin-left: 10px;"></i>`
      : "";

    epgHeader.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px;">
                <img src="${stream.stream_icon || "assets/app-logo.png"}" 
                     style="border-radius: 4px; object-fit: contain;" 
                     onerror="this.src='assets/app-logo.png'">
            </div>
            <div>


            
            ${heartIcon}
        </div>
            </div>
    `;

    epgList.innerHTML = `
      <div style="padding:20px; text-align:center; color:#aaa;">
        <i class="fas fa-spinner fa-spin"></i> Loading EPG...
      </div>
    `;

    if (window.getLiveStreamEpg) {
      window
        .getLiveStreamEpg(stream.stream_id)
        .then((data) => {
          currentEpgData = data && data.epg_listings ? data.epg_listings : [];
          renderEPGList();
        })
        .catch((err) => {
          console.error("EPG Fetch Error", err);
          currentEpgData = [];
          renderEPGList();
        });
    } else {
      currentEpgData = [];
      renderEPGList();
    }
  };

  const decodeBase64 = (str) => {
    try {
      return decodeURIComponent(escape(window.atob(str)));
    } catch (e) {
      return str;
    }
  };

  const resetControlsTimer = () => {
    // Show controls
    const playPauseIcon =
      document.querySelector(".play-pause-icon") ||
      document.getElementById("live-play-pause-btn");
    const aspectRatioBtn =
      document.getElementById("videojs-aspect-ratio") ||
      document.getElementById("flow-aspect-ratio");

    if (playPauseIcon) playPauseIcon.style.display = "flex";
    if (aspectRatioBtn) aspectRatioBtn.style.display = "block";

    // Clear existing timeout
    if (window._controlsTimer) clearTimeout(window._controlsTimer);

    // Set new timeout to hide after 3 seconds
    window._controlsTimer = setTimeout(() => {
      if (playPauseIcon) playPauseIcon.style.display = "none";
      if (aspectRatioBtn) aspectRatioBtn.style.display = "none";
    }, 3000);
  };

  const togglePlayPauseGlobal = () => {
    if (!window.livePlayer) return;

    // Toggle Play/Pause
    if (typeof window.livePlayer.togglePlayPause === "function") {
      window.livePlayer.togglePlayPause();
    } else {
      // Video.js instance
      if (window.livePlayer.paused()) {
        window.livePlayer.play();
      } else {
        window.livePlayer.pause();
      }
    }

    resetControlsTimer();
  };

  const formatTime = (dateStr, format) => {
    let date;
    if (!isNaN(dateStr)) {
      const ts = dateStr.toString().length === 10 ? dateStr * 1000 : dateStr;
      date = new Date(parseInt(ts));
    } else {
      date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) return "";

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
  };

  const renderEPGList = () => {
    const epgList = document.getElementById("lp-epg-list");
    if (!epgList) return;

    if (!currentEpgData || currentEpgData.length === 0) {
      epgList.innerHTML = `
            <div style="padding:20px; text-align:center; color:#666;">
                No Program Information Available
            </div>
          `;
      return;
    }

    // Get Time Format
    const currentPlaylist = getCurrentPlaylist();
    const timeFormatSetting =
      currentPlaylist && currentPlaylist.timeFormat
        ? currentPlaylist.timeFormat
        : "12hrs";

    epgList.innerHTML = currentEpgData
      .map((prog, idx) => {
        let timeDisplay = "";
        if (prog.start && prog.end) {
          const startStr = formatTime(
            prog.start_timestamp || prog.start,
            timeFormatSetting
          );
          const endStr = formatTime(
            prog.stop_timestamp || prog.end,
            timeFormatSetting
          );
          if (startStr && endStr) {
            timeDisplay = `${startStr} - ${endStr}`;
          } else {
            timeDisplay = "Upcoming";
          }
        }

        const title = prog.title ? decodeBase64(prog.title) : "No Title";
        const description = prog.description
          ? decodeBase64(prog.description)
          : prog.descr || "";

        return `
            <div class="lp-epg-item" data-index="${idx}">
>${timeDisplay}
                ${title}
            </div>
          `;
      })
      .join("");
  };

  const isVideoPlaceholderVisible = () => {
    const videoWrapper = document.querySelector(".lp-video-wrapper");
    if (!videoWrapper) return false;
    // Check if the placeholder text exists
    return videoWrapper.innerText.includes("Select a channel to play");
  };

  const handleFullscreenChange = () => {
    const playerContainer = document.getElementById("lp-player-container");
    if (!playerContainer) return;

    // Cross-browser fullscreen detection
    const isFullscreen = checkIsFullscreen();

    const playPauseIcon =
      document.querySelector(".play-pause-icon") ||
      document.getElementById("live-play-pause-btn");

    // Clear auto-hide timer when fullscreen state changes
    if (playPauseIcon && playPauseIcon._hideTimeout) {
      clearTimeout(playPauseIcon._hideTimeout);
      playPauseIcon._hideTimeout = null;
    }

    if (isFullscreen) {
      // Entering fullscreen - hide border and play/pause icon initially
      playerContainer.classList.add("fullscreen-mode"); // Add fullscreen class
      playerContainer.classList.remove("lp-focused");
      playerContainer.classList.remove("lp-player-active");
      const fullscreenBtn = document.getElementById("lp-fullscreen-btn");
      if (fullscreenBtn) fullscreenBtn.style.display = "none";

      if (playPauseIcon) {
        playPauseIcon.style.display = "none";
      }
    } else {
      // Exiting fullscreen - show border and ensure controls are hidden
      playerContainer.classList.remove("fullscreen-mode"); // Remove fullscreen class
      playerContainer.classList.remove("lp-focused"); // Remove yellow border
      playerContainer.classList.remove("lp-player-active");

      // Ensure aspect ratio buttons are hidden immediately
      const arBtns = document.querySelectorAll(
        ".videojs-aspect-ratio-div, .flow-aspect-ratio-div"
      );
      arBtns.forEach((btn) => (btn.style.display = "none"));

      // Ensure video is visible after exiting fullscreen
      const videoWrapper = document.querySelector(".lp-video-wrapper");
      if (videoWrapper) {
        const video = videoWrapper.querySelector("video");
        if (video) {
          video.style.display = "block";
          video.style.visibility = "visible";
          video.style.opacity = "1";
          video.style.width = "100%";
          video.style.height = "100%";
        }
      }

      // Always show play/pause icon when exiting fullscreen
      if (playPauseIcon) {
        playPauseIcon.style.display = "flex";
      }

      const fullscreenBtn = document.getElementById("lp-fullscreen-btn");
      if (fullscreenBtn) fullscreenBtn.style.display = "flex";

      focusedSection = "player";
      playerSubFocus = 1;
      updateFocus();
      resetControlsTimer();

      // CRITICAL FIX: Ensure focus returns to the document body/container so keydowns work
      // Some browsers lose focus completely on exitFullscreen
      if (typeof container !== "undefined" && container) {
        container.focus(); // Ensure container has tabindex="-1" in CSS or HTML if needed, or just focus window
      } else {
        window.focus();
      }
    }
  };

  const handleSortChange = (e) => {
    if (e.detail.page === "liveTvPage") {
      currentSortOption = e.detail.sortType;
      channelChunk = 1;
      renderChannels();
    }
  };

  const handleKeydown = (e) => {
    // Check if sidebar is open
    const sidebar = document.getElementById("sidebar");
    if (sidebar && !sidebar.classList.contains("option-remove")) {
      return; // Let Navbar handle the event
    }

    // Only process keydown events if navigationFocus is on this page
    const navigationFocus = localStorage.getItem("navigationFocus");
    const currentPage = localStorage.getItem("currentPage");

    if (currentPage !== "liveTvPage" || !document.body.contains(container)) {
      return;
    }

    if (
      navigationFocus !== "liveTvPage" &&
      navigationFocus !== "sidebarSearch" &&
      navigationFocus !== "channelSearch"
    ) {
      return; // Don't process keydown events until user navigates into the page
    }

    // Cross-browser fullscreen detection
    const isFullscreen = checkIsFullscreen();

    // Handle Fullscreen Exit
    if (
      ["Escape", "Back", "BrowserBack", "XF86Back", "SoftLeft"].includes(e.key)
    ) {
      if (isFullscreen) {
        e.preventDefault();
        e.stopImmediatePropagation();

        // Cross-browser exit fullscreen
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
        return;
      } else {
        // Not in fullscreen, navigate to dashboard
        e.preventDefault();
        cleanup(); // Dispose of player before leaving
        localStorage.setItem("currentPage", "dashboard");
        Router.showPage("dashboard");
        document.body.style.backgroundImage = "none";
        document.body.style.backgroundColor = "black";
        return;
      }
    }

    // Handle Channel Zapping Keys
    const keyCode = e.keyCode || e.which;
    if (e.key === "XF86RaiseChannel" || keyCode === 427) {
      playNextChannel();
      return;
    }
    if (e.key === "XF86LowerChannel" || keyCode === 428) {
      playPreviousChannel();
      return;
    }

    // If in fullscreen, allow Enter to toggle play/pause and show icon
    if (isFullscreen && e.key === "Enter") {
      e.preventDefault();
      e.stopImmediatePropagation(); // Ensure it doesn't propagate

      // If focused on Aspect Ratio, click it
      if (playerSubFocus === 2) {
        const btn =
          document.getElementById("videojs-aspect-ratio") ||
          document.getElementById("flow-aspect-ratio");
        if (btn) btn.click();
        resetControlsTimer();
        return;
      }

      // Otherwise (Play/Pause focus or general player focus)
      // Toggle play/pause AND Show Controls AND Focus Play/Pause
      const playPauseIcon =
        document.querySelector(".play-pause-icon") ||
        document.getElementById("live-play-pause-btn");
      const aspectRatioBtn =
        document.getElementById("videojs-aspect-ratio") ||
        document.getElementById("flow-aspect-ratio");

      // Show both icons in fullscreen
      if (playPauseIcon) playPauseIcon.style.display = "flex";
      if (aspectRatioBtn) aspectRatioBtn.style.display = "block";

      // Ensure Fullscreen Icon is HIDDEN
      const fullscreenBtn = document.getElementById("lp-fullscreen-btn");
      if (fullscreenBtn) fullscreenBtn.style.display = "none";

      // Toggle Play/Pause
      togglePlayPauseGlobal();

      // Ensure Play/Pause is focused
      if (playerSubFocus !== 1) {
        playerSubFocus = 1;
        updateFocus();
      }

      resetControlsTimer();
      return;
    }

    // In fullscreen, we let navigate functions handle arrows.
    // IMPORTANT: We do NOT call resetControlsTimer() here for arrows,
    // to prevent waking up the UI on random arrow presses.

    // Handle Enter key to focus search inputs
    if (focusedSection === "sidebarSearch" && e.key === "Enter") {
      const catInput = document.getElementById("lp-cat-search-input");
      if (catInput) {
        catInput.focus({
          preventScroll: true,
        });
        e.preventDefault();
        return;
      }
    }

    if (focusedSection === "channelSearch" && e.key === "Enter") {
      const chanInput = document.getElementById("lp-chan-search-input");
      if (chanInput) {
        chanInput.focus({
          preventScroll: true,
        });
        e.preventDefault();
        return;
      }
    }

    // Prevent default for navigation keys
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(
        e.key
      )
    ) {
      e.preventDefault();
      // CRITICAL: Stop propagation for Enter to prevent it from triggering click events
      if (e.key === "Enter") {
        e.stopImmediatePropagation();
      }
    }

    switch (e.key) {
      case "ArrowUp":
        navigateUp();
        break;
      case "ArrowDown":
        navigateDown();
        break;
      case "ArrowLeft":
        if (focusedSection === "player") {
          // In fullscreen, allow navigation between controls
          if (checkIsFullscreen()) {
            // User: "arrow left please play previous channel ... without existin from fullscreen mode"
            playPreviousChannel();
            return;
          } else {
            // Not in fullscreen - original behavior
            if (playerSubFocus === 1) {
              navigateLeft();
            } else {
              navigateLeft();
            }
          }
        } else {
          navigateLeft();
        }
        break;
      case "ArrowRight":
        if (focusedSection === "player") {
          // In fullscreen, allow navigation between controls
          if (checkIsFullscreen()) {
            // User: "arrow right when on full screen please play next channel"
            playNextChannel();
            return;
          } else {
            // Not in fullscreen - go to EPG if available
            if (currentEpgData && currentEpgData.length > 0) {
              focusedSection = "epg";
              epgIndex = 0; // Focus first item directly
            }
          }
        } else {
          navigateRight();
        }
        break;
      case "Enter":
        handleEnter();
        break;
    }

    if (focusedSection === "player" && !checkIsFullscreen()) {
      resetControlsTimer();
    }

    updateFocus();
  };

  const navigateUp = () => {
    // In strict fullscreen mode, if controls are hidden, DO NOT Navigate
    if (focusedSection === "player" && checkIsFullscreen()) {
      const playIcon =
        document.querySelector(".play-pause-icon") ||
        document.getElementById("live-play-pause-btn");
      if (playIcon && playIcon.style.display === "none") return;
      resetControlsTimer(); // If visible and moving, keep them visible
    }
    if (focusedSection === "sidebar") {
      if (sidebarIndex > 0) {
        sidebarIndex--;
      } else {
        // From first category to Header
        focusedSection = "header";
        headerSubFocus = 0; // Go to Search
        updateFocus();
      }
    } else if (focusedSection === "player") {
      if (playerSubFocus === 2) {
        // From Aspect Ratio to Play/Pause
        playerSubFocus = 1;
      } else if (playerSubFocus === 0) {
        // From Fullscreen (0) to Play/Pause (1)
        playerSubFocus = 1;
      } else if (playerSubFocus === 1) {
        // From Play/Pause (1) to Header
        if (!checkIsFullscreen()) {
          focusedSection = "channels";
          buttonFocusIndex = -1;
          updateFocus();
        }
      }
    } else if (focusedSection === "channels") {
      // Horizontal 3-Row Grid Up Navigation
      if (buttonFocusIndex >= 0) {
        buttonFocusIndex = -1;
        updateFocus();
        return;
      }

      if (channelIndex % 3 === 0) {
        // Top Row -> Header (Search Input)
        focusedSection = "header";
        headerSubFocus = 0; // Search
        updateFocus();
      } else {
        channelIndex -= 1; // Move up within same column
        buttonFocusIndex = -1;
      }
    } else if (focusedSection === "epg") {
      if (epgIndex > 0) {
        epgIndex--;
      } else if (epgIndex === 0) {
        // "fomr arrow upagian on channel last ahsiut it"
        // From EPG Top -> Channel (Last Focused)
        focusedSection = "channels";
        // Keep existing channelIndex
        if (channelIndex === -1) channelIndex = 0;
        buttonFocusIndex = -1;
        epgIndex = -1;
        updateFocus();
      }
    } else if (focusedSection === "header") {
      // Already at top
      return;
    }
  };

  const navigateDown = () => {
    // In strict fullscreen mode, if controls are hidden, DO NOT Navigate
    if (focusedSection === "player" && checkIsFullscreen()) {
      const playIcon =
        document.querySelector(".play-pause-icon") ||
        document.getElementById("live-play-pause-btn");
      if (playIcon && playIcon.style.display === "none") return;
      resetControlsTimer(); // If visible and moving, keep them visible
    }

    if (focusedSection === "header") {
      // Req: "blur thr input when on arrow donw and arrow right"
      const searchInput = document.getElementById("live-header-search");
      if (searchInput) searchInput.blur();

      // From Header down to Sidebar or Player
      if (headerSubFocus === 0) {
        // From Search -> Sidebar (Skip Sidebar Search)
        focusedSection = "sidebar";
        sidebarIndex = 0;
      } else {
        // From Menu -> Player (or Sidebar if preferred)
        // Let's go to Player if video exists, else Sidebar
        const videoWrapper = document.querySelector(".lp-video-wrapper");
        const hasVideo =
          videoWrapper &&
          !videoWrapper.innerText.includes("Select a channel to play");

        if (hasVideo) {
          focusedSection = "player";
          playerSubFocus = 0;
        } else {
          focusedSection = "sidebar";
          sidebarIndex = 0;
        }
      }
    } else if (focusedSection === "sidebar") {
      const allCats = getAllFilteredCategories();
      const loadedCats = getFilteredCategories();

      if (sidebarIndex < loadedCats.length - 1) {
        sidebarIndex++;
      } else if (loadedCats.length < allCats.length) {
        // Load more categories
        categoryChunk++;
        renderCategories();
        sidebarIndex++;
      }
    } else if (focusedSection === "player") {
      if (playerSubFocus === 1) {
        // FROM PLAY/PAUSE DOWN TO FULLSCREEN
        if (!checkIsFullscreen()) {
          playerSubFocus = 0; // Focus Fullscreen
        } else {
          playerSubFocus = 2; // In fullscreen, go to Aspect Ratio if available
        }
      } else if (playerSubFocus === 0) {
        // From Fullscreen Button -> Channels
        if (!checkIsFullscreen()) {
          focusedSection = "channels";
          channelIndex = 0;
          buttonFocusIndex = -1;
          updateFocus();
        }
        return;
      } else if (playerSubFocus === 2) {
        // From Aspect Ratio -> Channels
        if (!checkIsFullscreen()) {
          focusedSection = "channels";
          channelIndex = 0;
          buttonFocusIndex = -1;
        } else {
          resetControlsTimer();
        }
      }
    } else if (focusedSection === "epg") {
      if (currentEpgData && epgIndex < currentEpgData.length - 1) {
        epgIndex++;
      }
    } else if (focusedSection === "channels") {
      // Horizontal 3-Row Grid Down Navigation
      const currentCard =
        document.querySelectorAll(".lp-channel-card")[channelIndex];
      const buttons = currentCard
        ? currentCard.querySelectorAll(
            ".lp-channel-fav-btn, .lp-channel-remove-btn"
          )
        : [];

      if (buttonFocusIndex === -1 && buttons.length > 0) {
        buttonFocusIndex = 0;
        updateFocus();
        return;
      }

      if (channelIndex % 3 !== 2 && channelIndex + 1 < filteredStreams.length) {
        // Not at bottom of column AND there is a next item -> Move down
        channelIndex++;
        buttonFocusIndex = -1;
      } else {
        // Bottom of column (or last item) -> Go to EPG or Player
        if (currentEpgData && currentEpgData.length > 0) {
          focusedSection = "epg";
          epgIndex = 0;
        } else {
          focusedSection = "player";
          playerSubFocus = 1; // Play/Pause
        }
        buttonFocusIndex = -1;
      }
      updateFocus();
    }
  };

  const navigateLeft = () => {
    // In strict fullscreen mode, if controls are hidden, DO NOT Navigate
    if (focusedSection === "player" && checkIsFullscreen()) {
      const playIcon =
        document.querySelector(".play-pause-icon") ||
        document.getElementById("live-play-pause-btn");
      if (playIcon && playIcon.style.display === "none") return;
      resetControlsTimer(); // If visible and moving, keep them visible
    }
    if (focusedSection === "epg") {
      // From EPG to Sidebar
      focusedSection = "sidebar";

      // Sync sidebarIndex with the currently selected category
      const cats = getFilteredCategories();
      const sidIdx = cats.findIndex(
        (c) => String(c.category_id) === String(selectedCategoryId)
      );
      if (sidIdx !== -1) {
        sidebarIndex = sidIdx;
      } else if (sidebarIndex === -1) {
        sidebarIndex = 0;
      }

      epgIndex = -1;
      updateFocus();
    } else if (focusedSection === "player") {
      // From Video Player to Category List - ONLY IF NOT FULLSCREEN
      if (!checkIsFullscreen()) {
        focusedSection = "sidebar";
        const cats = getFilteredCategories();
        const sidIdx = cats.findIndex(
          (c) => String(c.category_id) === String(selectedCategoryId)
        );
        if (sidIdx !== -1) sidebarIndex = sidIdx;
        else if (sidebarIndex === -1) sidebarIndex = 0;
      } else {
        playerSubFocus = 0;
      }
      updateFocus();
    } else if (focusedSection === "channels") {
      if (buttonFocusIndex > 0) {
        buttonFocusIndex--;
        updateFocus();
        return;
      }

      if (channelIndex >= 3) {
        // Move left to previous column
        channelIndex -= 3;
        buttonFocusIndex = -1;
      } else {
        // First column -> Focus Sidebar (Category List)
        focusedSection = "sidebar";
        const cats = getFilteredCategories();
        const sidIdx = cats.findIndex(
          (c) => String(c.category_id) === String(selectedCategoryId)
        );
        if (sidIdx !== -1) sidebarIndex = sidIdx;
        else sidebarIndex = 0;
      }
      updateFocus();
    } else if (focusedSection === "header") {
      if (headerSubFocus === 1) {
        headerSubFocus = 0;
        updateFocus();
      }
    }
  };

  const navigateRight = () => {
    // In strict fullscreen mode, if controls are hidden, DO NOT Navigate
    if (focusedSection === "player" && checkIsFullscreen()) {
      const playIcon =
        document.querySelector(".play-pause-icon") ||
        document.getElementById("live-play-pause-btn");
      if (playIcon && playIcon.style.display === "none") return;
      resetControlsTimer(); // If visible and moving, keep them visible
    }
    if (focusedSection === "sidebar" || focusedSection === "sidebarSearch") {
      // Always go to Channels list as per user request
      focusedSection = "channels";
      channelIndex = 0;
      buttonFocusIndex = -1;
      updateFocus();
    } else if (focusedSection === "player") {
      // From Video Player to EPG - ONLY IF NOT FULLSCREEN
      if (!checkIsFullscreen()) {
        // User: "when full screen or play an dpuase is focus focus on epg and arrow up from epg first item then focus on channel first item"
        // This implies Right from Player goes to EPG.
        if (playerSubFocus === 0 || playerSubFocus === 1) {
          if (currentEpgData && currentEpgData.length > 0) {
            focusedSection = "epg";
            epgIndex = 0; // Focus first item directly
          }
        }
      } else {
        // In fullscreen, maybe just go back to border focus
        playerSubFocus = 0;
      }
    } else if (focusedSection === "channels") {
      // Horizontal 3-Row Grid Right Navigation
      const currentCard =
        document.querySelectorAll(".lp-channel-card")[channelIndex];
      const buttons = currentCard
        ? currentCard.querySelectorAll(
            ".lp-channel-fav-btn, .lp-channel-remove-btn"
          )
        : [];

      // 1. Enter Buttons (if Card focused)
      if (buttonFocusIndex === -1 && buttons.length > 0) {
        buttonFocusIndex = 0;
        updateFocus();
        return;
      }

      // 2. Traverse Buttons
      if (buttonFocusIndex !== -1 && buttonFocusIndex < buttons.length - 1) {
        buttonFocusIndex++;
        updateFocus();
        return;
      }

      // 3. Move to Next Column (index + 3)
      const nextIndex = channelIndex + 3;
      // Load more if approaching end of loaded chunks
      // Use horizontal logic for loading: maybe load more if nextIndex is close to loadedCount
      const loadedCount = channelChunk * channelPageSize;

      if (
        nextIndex >= loadedCount - 3 &&
        loadedCount < filteredStreams.length
      ) {
        channelChunk++;
        renderChannels(true); // Append true
      }

      if (nextIndex < filteredStreams.length) {
        channelIndex = nextIndex;
        buttonFocusIndex = -1;
      } else {
        // User Request: If no EPG, focus player.
        // Navigate to EPG if available, otherwise Player
        if (currentEpgData && currentEpgData.length > 0) {
          focusedSection = "epg";
          epgIndex = 0;
        } else {
          focusedSection = "player";
          playerSubFocus = 0;
        }
      }
      updateFocus();
    } else if (focusedSection === "header") {
      // Req: "blur thr input when on arrow donw and arrow right"
      const searchInput = document.getElementById("live-header-search");
      if (searchInput) searchInput.blur();

      if (headerSubFocus === 0) {
        headerSubFocus = 1;
      }
    }
  };

  const selectCategory = (newCategoryId) => {
    console.log(`Category selected: ${newCategoryId}`);

    // Only update if we're actually changing categories
    if (String(selectedCategoryId) !== String(newCategoryId)) {
      selectedCategoryId = newCategoryId;

      // Clear channel search
      channelSearchQuery = "";
      const chanInput = document.getElementById("lp-chan-search-input");
      if (chanInput) chanInput.value = "";

      channelChunk = 1; // Reset pagination
      channelIndex = 0; // Reset channel focus
      buttonFocusIndex = -1;

      // Render categories and channels with the new selection
      renderCategories(); // Update visual selection
      renderChannels(); // Update channel list

      // Stop any playing channel
      playChannel("");
    }

    // Always ensure focus stays on sidebar and the selected category
    // renderCategories() will update sidebarIndex to match selectedCategoryId
    updateFocus();
  };

  const handleEnter = () => {
    if (focusedSection === "sidebar") {
      const cats = getFilteredCategories();

      // CRITICAL FIX: Ensure sidebarIndex is in valid range
      if (sidebarIndex < 0 || sidebarIndex >= cats.length) {
        console.warn(`Invalid sidebarIndex: ${sidebarIndex}, resetting to 0`);
        sidebarIndex = 0;
      }

      if (cats[sidebarIndex]) {
        const selectedCat = cats[sidebarIndex];
        const newCategoryId = selectedCat.category_id;

        const isLocked = checkIsCategoryLocked(newCategoryId);
        const currentPlaylist = getCurrentPlaylist();
        const parentalEnabled =
          currentPlaylist && !!currentPlaylist.parentalPassword;

        if (isLocked && parentalEnabled) {
          // Show PIN Dialog
          ParentalPinDialog(
            () => {
              // PIN Correct
              unlockedLiveAdultCatIds.add(String(newCategoryId));

              // Re-render categories to remove lock visual
              renderCategories();

              // Proceed with selection
              selectCategory(newCategoryId);
            },
            () => {
              // PIN Incorrect
              console.log("Parental PIN incorrect for category");
            },
            currentPlaylist,
            "liveTvPage"
          );
          return;
        }

        // If not locked, proceed
        selectCategory(newCategoryId);
      }
    } else if (focusedSection === "player") {
      // Toggle fullscreen on Enter ONLY if border is focused
      const playerContainer = document.getElementById("lp-player-container");
      if (playerContainer) {
        if (playerSubFocus === 0) {
          // Fullscreen Button - Turn on fullscreen
          toggleFullscreen();
        } else if (playerSubFocus === 1) {
          // Play/Pause focused - Click it
          const btn =
            document.querySelector(".play-pause-icon") ||
            document.getElementById("live-play-pause-btn");
          if (btn) btn.click();
        } else if (playerSubFocus === 2) {
          // Aspect Ratio focused - Click it
          const btn =
            document.getElementById("videojs-aspect-ratio") ||
            document.getElementById("flow-aspect-ratio");
          if (btn) btn.click();
        }
      }
    } else if (focusedSection === "channels") {
      const stream = filteredStreams[channelIndex];
      if (!stream) return;

      if (buttonFocusIndex === 0) {
        // Heart button - show toaster
        toggleFavorite(stream, true);
      } else if (buttonFocusIndex === 1) {
        // Remove button
        removeFromHistory(stream);
      } else {
        // Check for adult content lock (Category Level Check for Favorites/History)
        const category = (window.liveCategories || []).find(
          (c) => c.category_id === stream.category_id
        );
        const isAdultChannel = category
          ? isLiveAdultCategory(category.category_name)
          : false;
        const currentPlaylistForParental = getCurrentPlaylist();
        const parentalEnabled =
          currentPlaylistForParental &&
          !!currentPlaylistForParental.parentalPassword;

        if (isAdultChannel && parentalEnabled && category) {
          // Check if the CATEGORY is unlocked
          const catId = String(category.category_id);
          if (!unlockedLiveAdultCatIds.has(catId)) {
            // Show PIN Dialog to unlock the CATEGORY
            ParentalPinDialog(
              () => {
                // PIN Correct - Unlock the Category
                unlockedLiveAdultCatIds.add(catId);
                // Re-render categories if visible
                renderCategories();
                // Play the channel
                playChannel(stream);
              },
              () => {
                console.log("Incorrect PIN");
              },
              currentPlaylistForParental,
              "liveTvPage"
            );
            return;
          }
        }

        // Play channel if not locked or already unlocked
        playChannel(stream);
      }
    } else if (focusedSection === "header") {
      if (headerSubFocus === 0) {
        // Search Input
        const searchInput = document.getElementById("live-header-search");
        if (searchInput) {
          searchInput.focus({
            preventScroll: true,
          });
        }
      } else if (headerSubFocus === 1) {
        // Menu - Open Sidebar
        const menuIcon = document.querySelector(".movies-header-menu");
        if (menuIcon) {
          if (window.openSidebar) {
            window.openSidebar("liveTvPage");
          }
        }
      }
    }
  };

  const setupClickListeners = () => {
    const categoryList = document.getElementById("lp-category-list");
    if (categoryList) {
      categoryList.addEventListener("click", (e) => {
        const item = e.target.closest(".lp-category-item");
        if (item) {
          const index = parseInt(item.dataset.index, 10);
          if (!isNaN(index)) {
            localStorage.setItem("navigationFocus", "liveTvPage");
            focusedSection = "sidebar";

            const cats = getFilteredCategories();
            if (cats[index]) {
              const newCategoryId = cats[index].category_id;
              let isAdult = isLiveAdultCategory(cats[index].category_name);
              const currentPlaylist = getCurrentPlaylist();
              const parentalEnabled =
                currentPlaylist && !!currentPlaylist.parentalPassword;

              // special check for Favorites
              if (newCategoryId === "favorites" && parentalEnabled) {
                const favs = currentPlaylist.favoritesLiveTV || [];
                const hasAdultFav = favs.some((f) => {
                  const c = (window.liveCategories || []).find(
                    (lc) => lc.category_id === f.category_id
                  );
                  return c && isLiveAdultCategory(c.category_name);
                });
                if (hasAdultFav) {
                  isAdult = true;
                }
              }

              // special check for All Channels
              if (newCategoryId === "All" && parentalEnabled) {
                const hasAdultInAll = (window.allLiveStreams || []).some(
                  (s) => {
                    const c = (window.liveCategories || []).find(
                      (lc) => lc.category_id === s.category_id
                    );
                    return c && isLiveAdultCategory(c.category_name);
                  }
                );
                if (hasAdultInAll) {
                  isAdult = true;
                }
              }

              if (
                isAdult &&
                parentalEnabled &&
                !unlockedLiveAdultCatIds.has(String(newCategoryId))
              ) {
                // Show PIN Dialog
                ParentalPinDialog(
                  () => {
                    // PIN Correct
                    unlockedLiveAdultCatIds.add(String(newCategoryId));
                    renderCategories();
                    selectCategory(newCategoryId);
                  },
                  () => {
                    console.log("Parental PIN incorrect for category");
                  },
                  currentPlaylist,
                  "liveTvPage"
                );
              } else {
                selectCategory(newCategoryId);
              }
            }
          }
        }
      });
    }

    const channelGrid = document.getElementById("lp-channels-grid");
    if (channelGrid) {
      channelGrid.addEventListener("click", (e) => {
        const card = e.target.closest(".lp-channel-card");
        if (card) {
          localStorage.setItem("navigationFocus", "liveTvPage");
          const index = parseInt(card.dataset.index, 10);
          if (!isNaN(index)) {
            focusedSection = "channels";
            channelIndex = index;
            updateFocus();

            const favBtn = e.target.closest(".lp-channel-fav-btn");
            const removeBtn = e.target.closest(".lp-channel-remove-btn");

            const stream = filteredStreams[channelIndex];
            if (stream) {
              if (favBtn) {
                e.stopPropagation();
                toggleFavorite(stream, true);
              } else if (removeBtn) {
                e.stopPropagation();
                removeFromHistory(stream);
              } else {
                // Check for adult content lock (Category Level Check for Favorites/History)
                const category = (window.liveCategories || []).find(
                  (c) => c.category_id === stream.category_id
                );
                const isAdultChannel = category
                  ? isLiveAdultCategory(category.category_name)
                  : false;
                const currentPlaylistForParental = getCurrentPlaylist();
                const parentalEnabled =
                  currentPlaylistForParental &&
                  !!currentPlaylistForParental.parentalPassword;

                if (isAdultChannel && parentalEnabled && category) {
                  // Check if the CATEGORY is unlocked
                  const catId = String(category.category_id);
                  if (!unlockedLiveAdultCatIds.has(catId)) {
                    // Show PIN Dialog to unlock the CATEGORY
                    ParentalPinDialog(
                      () => {
                        // PIN Correct - Unlock the Category
                        unlockedLiveAdultCatIds.add(catId);
                        // Re-render categories if visible
                        renderCategories();
                        // Play the channel
                        playChannel(stream);
                      },
                      () => {
                        console.log("Incorrect PIN");
                      },
                      currentPlaylistForParental,
                      "liveTvPage"
                    );
                    return;
                  }
                }

                // Play channel if not locked or already unlocked
                playChannel(stream);
              }
            }
          }
        }
      });
    }
  };

  const setupInputListeners = () => {
    const catInput = document.getElementById("lp-cat-search-input");
    if (catInput) {
      catInput.addEventListener("input", (e) => {
        categorySearchQuery = e.target.value;
        categoryChunk = 1;
        sidebarIndex = 0; // Reset focus to top when searching
        renderCategories();
      });
      catInput.addEventListener("focus", () => {
        localStorage.setItem("navigationFocus", "liveTvPage");
        focusedSection = "sidebarSearch";
        updateFocus();
      });
    }

    const chanInput = document.getElementById("lp-chan-search-input");
    if (chanInput) {
      chanInput.addEventListener("input", (e) => {
        channelSearchQuery = e.target.value;
        channelChunk = 1;
        renderChannels();
      });
      chanInput.addEventListener("focus", () => {
        localStorage.setItem("navigationFocus", "liveTvPage");
        focusedSection = "channelSearch";
        updateFocus();
      });
    }

    // Setup Header Search Listener
    const headerSearchInput = document.getElementById("live-header-search");
    if (headerSearchInput) {
      headerSearchInput.addEventListener("input", (e) => {
        channelSearchQuery = e.target.value;
        channelChunk = 1;
        renderChannels();
      });
      headerSearchInput.addEventListener("focus", () => {
        // When clicked or focused via script
        focusedSection = "header";
        headerSubFocus = 0;
        updateFocus();
      });
    }
  };

  const setupScrollListener = () => {
    const grid = document.getElementById("lp-channels-grid");
    if (!grid) return;

    grid.removeEventListener("scroll", handleScroll);
    grid.addEventListener("scroll", handleScroll);
  };

  const handleScroll = () => {
    const grid = document.getElementById("lp-channels-grid");
    if (!grid) return;

    // Use Horizontal Scroll properties
    const scrollPosition = grid.scrollLeft + grid.clientWidth;
    const scrollWidth = grid.scrollWidth;

    if (scrollPosition >= scrollWidth - 100) {
      const loadedChannels = channelChunk * channelPageSize;
      if (loadedChannels < filteredStreams.length) {
        channelChunk++;
        renderChannels(true); // Append true to preserve focus/dom
      }
    }
    updateArrowIndicator();
  };

  return `<div class="lp-main-container">
      <div class="movies-header" style="margin-bottom: 60px;">
        <div class="first-movies-header">
          <img src="assets/app-logo.png" alt="Logo" class="setting-header-logo" style="height: 120px; width: auto;"/>
          <div class="movies-header-right">
          ${DateTimeComponent()}
          </div>
        </div>
        <div class="second-movies-header">
          <p class="movies-header-title">Live TV</p>
          <div class="second-movies-header-div">
            <div class="movies-header-search">
              <input type="text" placeholder="Search Channels" id="live-header-search" class="movies-header-search-input"/>
              <img src="assets/search-icon.png" alt="search" class="movies-header-search-icon"/>
            </div>
            <div class="movies-header-menu">
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

      <div class="lp-body-wrapper" style="display: flex; flex: 1; overflow: hidden; width: 100%;">
        <div class="lp-sidebar">
            <!-- <div class="lp-search-box" id="lp-cat-search-box">
            <input type="text" class="lp-search-input" id="lp-cat-search-input" placeholder="Search Categories" value="${categorySearchQuery}">
            <i class="fas fa-search lp-search-icon" style="color: #aaa; margin-right: 10px;"></i>
        
            </div> -->
            <ul class="lp-category-list" id="lp-category-list"></ul>
        </div>
        <div class="lp-content">
            <div class="lp-top-section">
            <div class="lp-player-container" id="lp-player-container">
                <div class="lp-video-wrapper">
                <div style="width:100%; height:100%; zoom:1.4; background:black; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#666;">
                    <i class="fas fa-play-circle" style="font-size: 50px; margin-bottom:10px;"></i>
                    <p>Select a channel to play</p>
                </div>
                </div>
            </div>
            <div class="lp-epg-container" id="lp-epg-container">
                <div class="lp-epg-header"><span>Program Guide</span></div>
                <div class="lp-epg-list" id="lp-epg-list">
                <div style="padding:20px; color:#aaa; text-align:center; zoom:1.4;">
                    Select a channel to view program information
                </div>
                </div>
            </div>
            </div>
            <div class="lp-channels-section">
  
            <div class="lp-channels-grid" id="lp-channels-grid"></div>
            <div class="lp-channels-arrow-indicator lp-arrow-left" id="lp-channels-arrow-left">
              <i class="fas fa-chevron-left"></i>
            </div>
            <div class="lp-channels-arrow-indicator lp-arrow-right" id="lp-channels-arrow-right">
              <i class="fas fa-chevron-right"></i>
            </div>
            </div>
        </div>
      </div>
    </div>`;
}
