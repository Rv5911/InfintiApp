function SeriesPage() {
  // Prevent duplicate loaders by removing any existing one first
  const existingLoader = document.getElementById("home-page-loader");
  if (existingLoader) {
    existingLoader.remove();
  }

  // Also hide the global loading overlay if it's visible
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.classList.add("hidden");
  }

  // Create and show custom series page loader immediately (using HomePage loader styles)
  const seriesLoader = document.createElement("div");
  seriesLoader.id = "home-page-loader";
  seriesLoader.innerHTML = `
    <div class="home-loader-content">
      <div class="home-loader-spinner"></div>
    </div>
  `;
  document.body.appendChild(seriesLoader);

  let selectedSeriesCategoryId = localStorage.getItem("seriesLastCategoryId")
    ? Number(localStorage.getItem("seriesLastCategoryId"))
    : -3;
  let focusedSeriesChannelIndex = localStorage.getItem("seriesLastChannelIndex")
    ? Number(localStorage.getItem("seriesLastChannelIndex"))
    : 0;
  let focusedSeriesCardIndex = localStorage.getItem("seriesLastCardIndex")
    ? Number(localStorage.getItem("seriesLastCardIndex"))
    : 0;

  // Track if we are returning from detail page
  const isRestoringFocus = localStorage.getItem("seriesLastCardIndex") !== null;
  let inSeriesChannelList = true;
  let inSeriesSearch = false;
  let inSeriesMenu = false;
  let seriesSearchQuery = "";
  const seriesCategoryFocusMap = new Map();
  const unlockedSeriesAdultCategories = new Set();
  let isSeriesLongPressExecuted = false;
  let seriesToShow = [];
  let selectedSeriesCardForDropdown = null;
  let isSeriesDropdownOpen = false;
  let isSeriesSidebarVisible = false; // Default hidden
  let seriesCategorySearchQuery = "";
  let isSeriesCatSearchFocused = false;
  let inSeriesControls = false;
  const SERIES_LONG_PRESS_DURATION = 500;
  let seriesEnterPressTimer = null;
  let isRenderingSeriesCards = false; // Flag to prevent navigation during card rendering
  // let adultsCategories = [];
  let visibleSeriesCount = 100;
  let seriesCategoryChunk = 1;
  const SERIES_PAGE_SIZE = 100;

  // ========= ADD THIS CODE AFTER YOUR VARIABLE DECLARATIONS =========
  let adultsCategories = [
    "adult",
    "adults",
    "18+",
    "adult content",
    "xxx",
    "porn",
    "adulto",
    "erotic",
    "erotica",
    "mature",
    "adult series",
  ].map((cat) => cat.toLowerCase());

  const isSeriesAdultCategory = (name) => {
    const normalized = (name || "").trim().toLowerCase();
    const configured = Array.isArray(adultsCategories) ? adultsCategories : [];
    if (configured.includes(normalized)) return true;
    return /(adult|xxx|18\+|18\s*plus|sex|porn|nsfw)/i.test(normalized);
  };

  const isSeriesAdult = (series) => {
    if (!series) return false;

    // Check if series belongs to any adult category
    const seriesCategoryIds = new Set();
    if (series.category_id != null)
      seriesCategoryIds.add(Number(series.category_id));
    if (Array.isArray(series.category_ids)) {
      for (const cid of series.category_ids) seriesCategoryIds.add(Number(cid));
    }

    // Check if any of the series's categories are adult categories
    for (const catId of seriesCategoryIds) {
      const category = window.seriesCategories.find((c) => c.id === catId);
      if (category && isSeriesAdultCategory(category.name)) {
        return true;
      }
    }

    return false;
  };

  const shouldBlurAdultSeriesCard = (series) => {
    if (!series) return false;

    // Don't blur if series is not adult
    if (!isSeriesAdult(series)) return false;

    const parentalLockEnabled = !!currentPlaylist.parentalPassword;
    if (!parentalLockEnabled) return false;

    // Check if we're in one of the special categories that need PIN protection
    const isSpecialCategory = [-3, -1, -2].includes(selectedSeriesCategoryId); // All, Favorites, Continue Watching

    if (isSpecialCategory) {
      // In special categories, always blur adult series and require PIN
      return true;
    }

    // For normal adult categories, check if category is unlocked
    const currentCategory = window.seriesCategories.find(
      (c) => c.id === selectedSeriesCategoryId,
    );
    if (currentCategory && isSeriesAdultCategory(currentCategory.name)) {
      const isUnlocked = unlockedSeriesAdultCategories.has(
        String(selectedSeriesCategoryId),
      );
      return !isUnlocked; // Only blur if category is locked
    }

    return false;
  };

  const saveSeriesFocusState = () => {
    localStorage.setItem("seriesLastCategoryId", selectedSeriesCategoryId);
    localStorage.setItem("seriesLastChannelIndex", focusedSeriesChannelIndex);
    localStorage.setItem("seriesLastCardIndex", focusedSeriesCardIndex);
    localStorage.setItem("seriesSidebarVisible", isSeriesSidebarVisible);
  };
  const currentPlaylistName = JSON.parse(
    localStorage.getItem("selectedPlaylist"),
  ).playlistName;

  const playlistsData = JSON.parse(localStorage.getItem("playlistsData")) || [];
  const currentPlaylist =
    playlistsData.find((pl) => pl.playlistName === currentPlaylistName) || {};

  const allFavoritesSeriesIds = currentPlaylist.favouriteSeries || [];

  const allFavoritesSeries = window.allSeriesStreams.filter((s) =>
    allFavoritesSeriesIds.includes(s.series_id),
  );

  console.log("All Favorites Series:", window.allSeriesStreams);

  const allContinueWatchSeries = (() => {
    // Check if continueWatchingSeries exists in localStorage
    const continueWatchingData = currentPlaylist.continueWatchingSeries || [];

    if (
      !Array.isArray(continueWatchingData) ||
      continueWatchingData.length === 0
    ) {
      return []; // Return empty array if no continue watching data exists
    }

    // Get the limit from localStorage, default to showing all if not specified
    const continueLimit = parseInt(currentPlaylist.continueLimit) || 0;

    // Process series that are in the continueWatchingSeries array
    const continueSeries = window.allSeriesStreams
      .map((s) => {
        const cw = continueWatchingData.find(
          (item) => Number(item.itemId) === Number(s.series_id),
        );

        if (cw) {
          const duration = Number(cw.duration) || 0;
          const resumeTime = Number(cw.resumeTime) || 0;
          const progress =
            duration > 0
              ? Math.min(100, Math.floor((resumeTime / duration) * 100))
              : 0;

          return {
            ...s,
            progress,
          };
        }
        return null;
      })
      .filter(Boolean);

    // Apply limit only if continueLimit is greater than 0
    if (continueLimit > 0) {
      return continueSeries.slice(0, continueLimit);
    } else {
      return continueSeries; // Return all if no limit or limit is 0
    }
  })();

  const qsa = (s) => [...document.querySelectorAll(s)];
  const qs = (s) => document.querySelector(s);
  const setSeriesFlags = (ch, se, me, co = false) => {
    inSeriesChannelList = ch;
    inSeriesSearch = se;
    inSeriesMenu = me;
    inSeriesControls = co;
  };

  const highlightActiveSeriesCategory = () =>
    qsa(".series-channel-category").forEach((el) =>
      el.classList.toggle(
        "series-channel-category-active",
        Number(el.dataset.categoryId) === Number(selectedSeriesCategoryId),
      ),
    );

  const clearSeriesHeaderFocus = () => {
    const searchEl = qs("#series-header-search");
    const menuEl = qs(".series-header-menu");
    const toggleBtn = qs(".series-cat-toggle-btn");
    const catSearch = qs(".series-cat-search-container");
    const catSearchInput = qs("#series-cat-search-input");

    if (searchEl)
      searchEl.classList.remove("series-header-search-input-focused");
    if (menuEl) menuEl.classList.remove("series-header-menu-focused");
    if (toggleBtn) {
      toggleBtn.classList.remove("focused");
      toggleBtn.blur();
    }
    if (catSearch) catSearch.classList.remove("focused");
    if (catSearchInput) catSearchInput.blur();
  };

  let isSeriesProcessingData = false;
  const SERIES_CHUNK_SIZE = 50;
  const MAX_VISIBLE_SERIES_CARDS = 15;
  const SERIES_SEARCH_DEBOUNCE_DELAY = 300;
  let seriesSearchDebounceTimer = null;
  let seriesRenderAnimationFrame = null;

  async function loadSeriesCategory(categoryId) {
    const category = window.seriesCategories.find((c) => c.id === categoryId);
    if (!category || category.series.length > 0) return category;

    if (categoryId === -1 || categoryId === -2 || categoryId === -3)
      return category;

    const allSeries = Array.isArray(window.allSeriesStreams)
      ? window.allSeriesStreams
      : [];
    const categorySeries = [];

    // Process in smaller chunks to prevent freezing
    const PROCESS_CHUNK = 100;
    for (let i = 0; i < allSeries.length; i += PROCESS_CHUNK) {
      const chunk = allSeries.slice(i, i + PROCESS_CHUNK);

      for (const s of chunk) {
        const ids = new Set();
        if (s.category_id != null) ids.add(Number(s.category_id));
        if (Array.isArray(s.category_ids)) {
          for (const cid of s.category_ids) ids.add(Number(cid));
        }

        if (ids.has(categoryId)) {
          if (!categorySeries.some((x) => x.series_id === s.series_id)) {
            categorySeries.push(s);
          }
        }
      }

      // Yield to browser every chunk
      if (i + PROCESS_CHUNK < allSeries.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    category.series = categorySeries;
    return category;
  }

  function renderSeriesCardsChunked(selectedCategory, targetFocusIndex = -1) {
    isRenderingSeriesCards = true; // Block navigation during rendering
    const currentCardsContainer = qs(".series-cards-list-container");
    if (
      !currentCardsContainer ||
      !selectedCategory ||
      !selectedCategory.series
    ) {
      isRenderingSeriesCards = false;
      return;
    }

    const isAdultSelectedAgain = isSeriesAdultCategory(
      selectedCategory && selectedCategory.name,
    );
    const parentalLockEnabledAgain = !!currentPlaylist.parentalPassword;
    const isUnlockedAgain = unlockedSeriesAdultCategories.has(
      String(selectedSeriesCategoryId),
    );

    if (parentalLockEnabledAgain && isAdultSelectedAgain && !isUnlockedAgain) {
      currentCardsContainer.innerHTML = `
      <div class="series-no-data">
        <p>Locked Category. Enter PIN to unlock.</p>
      </div>`;
      highlightActiveSeriesCategory();
      if (inSeriesChannelList) {
        setSeriesFocus(
          qsa(".series-channel-category"),
          focusedSeriesChannelIndex,
          "series-channel-category-focused",
        );
      } else if (!qsa(".series-card").length) {
        // Fallback if no cards but aiming for cards
        focusSeriesChannels(focusedSeriesChannelIndex);
      }
      isRenderingSeriesCards = false;
      return;
    }

    // CACHE sorted series on the category object to avoid re-sorting
    if (
      !selectedCategory._sortedCache ||
      selectedCategory._lastSortValue !== localStorage.getItem("movieSortValue")
    ) {
      selectedCategory._sortedCache = sortSeries(selectedCategory.series || []);
      selectedCategory._lastSortValue = localStorage.getItem("movieSortValue");
    }

    // FIXED: Handle search results properly
    if (seriesSearchQuery.trim()) {
      seriesToShow = (selectedCategory._sortedCache || []).slice(0, 30);
    } else {
      const limit = Math.max(visibleSeriesCount, MAX_VISIBLE_SERIES_CARDS);
      seriesToShow = selectedCategory._sortedCache.slice(0, limit);
    }

    if (!seriesToShow.length) {
      const container = document.querySelector(".series-cards-list-container");
      if (container) {
        container.style.display = "flex";
        container.innerHTML = `
        <div class="series-no-data">
          <p>No results found for "${
            seriesSearchQuery.trim() || selectedCategory.name
          }"</p>
        </div>
      `;
      }
      // Force focus back to categories since no cards are available
      focusSeriesChannels(focusedSeriesChannelIndex);
      isRenderingSeriesCards = false;
      return;
    }

    const container = document.querySelector(".series-cards-list-container");
    if (container) {
      container.style.display = "grid";
    }

    const showFavHeartIcon = Number(selectedSeriesCategoryId) === -1;

    // Clear container
    currentCardsContainer.innerHTML = "";

    const isUnlockedAdultCategory =
      parentalLockEnabledAgain && isAdultSelectedAgain && isUnlockedAgain;

    // Increased chunk size for better performance
    const SERIES_CARD_CHUNK_SIZE = 8;

    let currentIndex = 0;
    let focusApplied = false;

    const renderNextChunk = () => {
      if (currentIndex >= seriesToShow.length) {
        highlightActiveSeriesCategory();
        // Final fallback if focus wasn't applied during chunking
        if (!focusApplied) {
          if (inSeriesChannelList) {
            focusSeriesChannels(focusedSeriesChannelIndex);
          } else if (
            targetFocusIndex >= 0 &&
            targetFocusIndex < seriesToShow.length
          ) {
            focusSeriesCards(targetFocusIndex);
          }
        }
        isRenderingSeriesCards = false; // Re-enable navigation after rendering completes
        return;
      }

      const chunk = seriesToShow.slice(
        currentIndex,
        currentIndex + SERIES_CARD_CHUNK_SIZE,
      );
      const fragment = document.createDocumentFragment();

      chunk.forEach((s) => {
        // ... (internal card creation logic remains the same)
        const isFav = allFavoritesSeriesIds.includes(s.series_id);
        const showHeart = showFavHeartIcon || isFav;
        const isAdultSeries = isSeriesAdult(s);
        const parentalLockEnabled = !!currentPlaylist.parentalPassword;

        const shouldBlur = parentalLockEnabled && shouldBlurAdultSeriesCard(s);
        const showLockIcon = shouldBlur;

        const cardDiv = document.createElement("div");
        cardDiv.className = "series-card";
        cardDiv.dataset.seriesId = s.series_id;
        cardDiv.dataset.seriesTitle = s.name;

        if (shouldBlur) cardDiv.classList.add("series-card-blurred");

        const imgSrc = s.cover || "/assets/noImageFound.png";
        const rating = isNaN(s.rating_5based)
          ? 0
          : Math.min(5, parseInt(s.rating_5based, 10));
        const progressHtml =
          typeof s.progress === "number"
            ? `<div class="series-progress-overlay"><div class="series-progress-fill" style="width:${s.progress}%;"></div></div>`
            : "";
        const heartHtml = showHeart
          ? '<img src="/assets/heart-icon.png" alt="heart-icon" loading="lazy" class="series-card-heart-icon"/>'
          : "";
        const lockHtml = showLockIcon
          ? '<i class="fas fa-lock series-card-lock-icon"></i>'
          : "";

        cardDiv.innerHTML = `
        <div class="series-card-image-wrapper">
          <img src="${imgSrc}" alt="${s.name}" 
               onerror="this.onerror=null; this.src='/assets/noImageFound.png';" 
               loading="lazy" class="series-card-img ${
                 shouldBlur ? "blurred-image" : ""
               }"/>
          ${progressHtml}
        </div>
        <div class="series-card-bottom-content ${
          shouldBlur ? "blurred-text" : ""
        }">
          <p class="series-card-title"><span data-title="${s.name}">${
            s.name
          }</span></p>
          <p class="series-card-description">${s.name}</p>
        </div>
        <div class="series-card-top-content">
          <p class="series-card-rating ${
            shouldBlur ? "blurred-text" : ""
          }">${rating}</p>
          ${heartHtml}
          ${lockHtml}
        </div>
      `;

        fragment.appendChild(cardDiv);
      });

      currentCardsContainer.appendChild(fragment);

      // RESTORE FOCUS: If the target card is now in the DOM, focus it immediately
      if (
        !focusApplied &&
        !inSeriesChannelList &&
        targetFocusIndex >= 0 &&
        targetFocusIndex < currentIndex + SERIES_CARD_CHUNK_SIZE
      ) {
        const cards = qsa(".series-card");
        if (cards[targetFocusIndex]) {
          focusSeriesCards(targetFocusIndex);
          focusApplied = true;

          // FADE OUT LOADERS after focus is applied
          const seriesLoader = document.getElementById("home-page-loader");
          const globalLoader = document.getElementById("loading-overlay");

          if (globalLoader) {
            globalLoader.classList.add("hidden");
          }

          if (seriesLoader) {
            seriesLoader.classList.add("fade-out");
            setTimeout(() => {
              if (seriesLoader && seriesLoader.parentElement) {
                seriesLoader.remove();
              }
            }, 500);
          }
        }
      }

      currentIndex += SERIES_CARD_CHUNK_SIZE;

      seriesRenderAnimationFrame = requestAnimationFrame(() => {
        setTimeout(renderNextChunk, 10);
      });
    };

    seriesRenderAnimationFrame = requestAnimationFrame(renderNextChunk);
  }

  async function processSeriesData() {
    try {
      if (isSeriesProcessingData) return;
      isSeriesProcessingData = true;

      const rawCategories = Array.isArray(window.allseriesCategories)
        ? window.allseriesCategories
        : [];
      const allSeries = Array.isArray(window.allSeriesStreams)
        ? window.allSeriesStreams
        : [];

      // Just prepare categories without processing series
      const categoriesWithSeries = rawCategories.map((c) => {
        const idNum = Number(c.category_id || c.id);
        return {
          id: idNum,
          name: c.category_name || c.name || `Cat ${idNum}`,
          parent_id: c.parent_id || 0,
          series: [], // Empty initially - will be populated on demand
          _seriesCount: 0, // Track count without loading series
        };
      });

      // Calculate series counts for each category without loading series
      for (const s of allSeries) {
        const ids = new Set();
        if (s.category_id != null) ids.add(Number(s.category_id));
        if (Array.isArray(s.category_ids)) {
          for (const cid of s.category_ids) ids.add(Number(cid));
        }

        for (const cid of ids) {
          const cat = categoriesWithSeries.find((c) => c.id === cid);
          if (cat) {
            cat._seriesCount++;
          }
        }
      }

      // Create special categories
      const favoritesCategory = {
        id: -1,
        name: "Favorites",
        parent_id: 0,
        series: Array.isArray(allFavoritesSeries) ? allFavoritesSeries : [],
        _seriesCount: Array.isArray(allFavoritesSeries)
          ? allFavoritesSeries.length
          : 0,
      };

      const continueCategory = {
        id: -2,
        name: "Continue Watching",
        parent_id: 0,
        series: allContinueWatchSeries, // This now uses the limited array
        _seriesCount: allContinueWatchSeries.length, // This reflects the actual count after limiting
      };

      const allSeriesCategory = {
        id: -3,
        name: "All",
        parent_id: 0,
        series: Array.isArray(window.allSeriesStreams)
          ? window.allSeriesStreams
          : [],
        _seriesCount: Array.isArray(window.allSeriesStreams)
          ? window.allSeriesStreams.length
          : 0,
      };

      const cleanedCategories = categoriesWithSeries.filter(
        (c) => c.id !== -1 && c.id !== -2 && c.id !== -3,
      );

      const specialCategories = [
        allSeriesCategory,
        favoritesCategory,
        continueCategory,
      ];

      window.seriesCategories = [...specialCategories, ...cleanedCategories];
      window.allSeries = allSeries;

      const firstWithSeries = window.seriesCategories.find(
        (c) => c._seriesCount > 0,
      );
      selectedSeriesCategoryId = -3;

      isSeriesProcessingData = false;
    } catch (err) {
      console.error("Error loading series page:", err);
      isSeriesProcessingData = false;

      const container = document.querySelector(".series-content-container");
      if (container) {
        container.innerHTML = `
        <div class="series-no-data">
          <p>Failed to load Series. Please try again.</p>
        </div>`;
      }
    }
  }

  // Helper function to sync favorites data
  function syncSeriesFavoritesData() {
    const playlist = JSON.parse(localStorage.getItem("playlistsData")).find(
      (pl) => pl.playlistName === currentPlaylistName,
    );

    if (playlist) {
      // Update global favorites array
      allFavoritesSeriesIds.length = 0;
      allFavoritesSeriesIds.push(...(playlist.favouriteSeries || []));

      // Update favorites category
      const favCategory = window.seriesCategories.find((c) => c.id === -1);
      if (favCategory) {
        const updatedFavSeries = window.allSeriesStreams.filter((s) =>
          allFavoritesSeriesIds.includes(s.series_id),
        );
        favCategory.series = updatedFavSeries;
        favCategory._seriesCount = updatedFavSeries.length;
        delete favCategory._sortedCache;
        delete favCategory._lastSortValue;
      }
    }
  }

  // ========= Helpers =========
  function scrollToSeriesElement(el, align = "center") {
    const container =
      el.closest(".series-cards-list-container") ||
      el.closest(".series-channels-list");
    if (!container) return;

    if (align === "bottom") {
      // scroll so the element is just visible at the bottom
      container.scrollTop =
        el.offsetTop - container.clientHeight + el.offsetHeight;
    } else {
      // default: center
      container.scrollTop =
        el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
    }
  }

  function setSeriesFocus(list, idx, cls) {
    const allFocused = document.querySelectorAll(`.${cls}`);
    allFocused.forEach((el) => {
      el.classList.remove(cls);
      el.classList.remove("first-row-card");
      // Cleanup marquee from item
      const span = el.querySelector("span.marquee");
      if (span) span.classList.remove("marquee");
    });

    const arr = Array.isArray(list) ? list : [list];
    if (idx >= 0 && arr[idx]) {
      const el = arr[idx];
      el.classList.add(cls);

      // Add first-row-card class if it's a card in the first row
      if (cls === "focused" && el.classList.contains("series-card") && arr[0]) {
        if (el.offsetTop === arr[0].offsetTop) {
          el.classList.add("first-row-card");
        }

        // IMPROVED MARQUEE: Set dynamic duration based on title width
        const titleSpan = el.querySelector(".series-card-title span");
        if (titleSpan) {
          const scrollWidth = titleSpan.scrollWidth;
          const clientWidth = titleSpan.clientWidth;
          if (scrollWidth > clientWidth + 2) {
            // Added 2px buffer
            // "slightly fast" - base speed 45px/s
            const duration = (scrollWidth / 45).toFixed(2);
            titleSpan.style.setProperty("--marquee-duration", `${duration}s`);
            titleSpan.classList.add("marquee");
          } else {
            titleSpan.classList.remove("marquee");
          }
        }
      }

      if (cls === "series-channel-category-focused") {
        const nameSpan = el.querySelector(".series-channel-category-name span");
        if (nameSpan) {
          const scrollWidth = nameSpan.scrollWidth;
          const clientWidth = nameSpan.clientWidth;
          if (scrollWidth > clientWidth + 2) {
            // Added 2px buffer
            const duration = (scrollWidth / 45).toFixed(2);
            nameSpan.style.setProperty("--marquee-duration", `${duration}s`);
            nameSpan.classList.add("marquee");
          } else {
            nameSpan.classList.remove("marquee");
          }
        }
      }

      // Optimized Scrolling: Only scroll if absolutely necessary
      const container =
        el.closest(".series-cards-list-container") ||
        el.closest(".series-channels-list");
      if (container) {
        try {
          el.scrollIntoView({
            block: "nearest",
            behavior: "auto",
            inline: "nearest",
          });
        } catch (e) {
          el.scrollIntoView(true);
        }
      }
    }
  }

  const focusSeriesSearch = () => {
    clearSeriesHeaderFocus();
    setSeriesFlags(false, true, false);
    const searchEl = qs("#series-header-search");
    if (searchEl) searchEl.classList.add("series-header-search-input-focused");
  };

  const focusSeriesMenu = () => {
    clearSeriesHeaderFocus();
    setSeriesFlags(false, false, true);
    const menuEl = qs(".series-header-menu");
    if (menuEl) menuEl.classList.add("series-header-menu-focused");
  };

  // REPLACE THE focusSeriesChannels FUNCTION:
  function focusSeriesChannels(idx = 0) {
    clearSeriesHeaderFocus();
    setSeriesFlags(true, false, false);
    const channelList = qsa(".series-channel-category");
    if (!channelList.length) return;

    // Skip blurred (locked) categories when navigating
    let validIndex = idx;
    const validChannels = channelList.filter((cat, index) => {
      return !cat.classList.contains("series-category-blurred");
    });

    if (validChannels.length > 0) {
      // Find the index in the original array that corresponds to the first valid channel
      validIndex = Array.from(channelList).indexOf(
        validChannels[Math.min(idx, validChannels.length - 1)],
      );
    } else {
      validIndex = 0;
    }

    setSeriesFocus(
      channelList,
      (focusedSeriesChannelIndex = Math.max(
        0,
        Math.min(validIndex, channelList.length - 1),
      )),
      "series-channel-category-focused",
    );
    saveSeriesFocusState();
  }

  // REPLACE THE focusSeriesCards FUNCTION:
  function focusSeriesCards(idx = 0) {
    clearSeriesHeaderFocus();
    setSeriesFlags(false, false, false, false);
    const cards = qsa(".series-card");
    if (!cards.length) return;

    let validIndex = idx;

    // Use session-level focus map as fallback only if idx is the default 0
    // Skip map-based focus memory during restoration
    if (
      !isRestoringFocus &&
      idx === 0 &&
      seriesCategoryFocusMap.has(selectedSeriesCategoryId)
    ) {
      const savedIndex = seriesCategoryFocusMap.get(selectedSeriesCategoryId);
      if (savedIndex >= 0 && savedIndex < cards.length) {
        validIndex = savedIndex;
      }
    }

    if (validIndex >= 0 && validIndex < cards.length) {
      setSeriesFocus(cards, (focusedSeriesCardIndex = validIndex), "focused");
    } else if (!isRestoringFocus) {
      // No cards to focus at the requested index, fallback to first card or categories
      // But only if we are NOT in the middle of restoration (where the card might be in a future chunk)
      if (cards.length > 0) {
        setSeriesFocus(cards, (focusedSeriesCardIndex = 0), "focused");
      } else {
        focusSeriesChannels(focusedSeriesChannelIndex);
      }
    }
    saveSeriesFocusState();
  }

  const focusSeriesToggleBtn = () => {
    clearSeriesHeaderFocus();
    setSeriesFlags(false, false, false, true); // inSeriesControls
    const btn = qs(".series-cat-toggle-btn");
    const searchContainer = qs(".series-cat-search-container");
    if (btn) {
      btn.focus();
      btn.classList.add("focused");
    }
    if (searchContainer) {
      searchContainer.classList.remove("focused");
    }
    isSeriesCatSearchFocused = false;
  };

  const getFilteredSeriesCategories = async () => {
    const cats = window.seriesCategories || [];

    // If no search query, return all categories
    if (!seriesSearchQuery.trim()) return cats;

    if (!selectedSeriesCategoryId) return [];

    const selectedCategory = cats.find(
      (c) => c.id === selectedSeriesCategoryId,
    );
    if (!selectedCategory) return [];

    const q = seriesSearchQuery.toLowerCase().trim();

    try {
      // Ensure we have series loaded for the selected category
      const loadedCategory = await loadSeriesCategory(selectedSeriesCategoryId);
      if (!loadedCategory || !loadedCategory.series) return [];

      // Filter series based on search query
      const filteredSeries = loadedCategory.series.filter(
        (series) =>
          series && series.name && series.name.toLowerCase().includes(q),
      );

      if (filteredSeries.length === 0) return [];

      // Return a temporary category with filtered results
      return [
        {
          ...selectedCategory,
          series: filteredSeries,
          _seriesCount: filteredSeries.length,
        },
      ];
    } catch (error) {
      console.error("Error filtering series categories:", error);
      return [];
    }
  };

  const renderSeriesCategories = (filtered) =>
    (filtered || [])
      .map((c) => {
        const categoryId = String(c.id);
        const isAdultCat = isSeriesAdultCategory(c.name);
        const parentalEnabled = !!currentPlaylist.parentalPassword;
        const isUnlocked = unlockedSeriesAdultCategories.has(categoryId);

        // ADD BLUR LOGIC FOR ADULT CATEGORIES
        const shouldBlur = parentalEnabled && isAdultCat && !isUnlocked;
        const blurClass = shouldBlur ? "series-category-blurred" : "";

        return `
      <div class="series-channel-category-container">
        <div class="series-channel-category ${
          c.id === selectedSeriesCategoryId
            ? "series-channel-category-active"
            : ""
        } ${blurClass}" data-category-id="${c.id}" data-category-name="${
          c.name
        }">
          ${
            parentalEnabled && isAdultCat && !isUnlocked
              ? '<i class="fas fa-lock series-category-lock-icon"></i>'
              : ""
          }
          <p class="series-channel-category-name"><span data-title="${
            c.name
          }">${c.name}</span></p>
          <p class="series-channel-category-count">${
            c._seriesCount || c.series.length
          }</p>
        </div>
      </div>`;
      })
      .join("");

  function sortSeries(series) {
    const sortValue = localStorage.getItem("movieSortValue") || "default";

    // Helper function to categorize series for special character handling
    const categorizeSeries = (seriesName) => {
      if (!seriesName || seriesName.trim().length === 0) return "special";

      const firstChar = seriesName.trim().charAt(0).toLowerCase();

      // Check if it starts with a letter (a-z)
      if (firstChar >= "a" && firstChar <= "z") {
        return "letter";
      }

      // Check if it starts with a number (0-9)
      if (firstChar >= "0" && firstChar <= "9") {
        return "number";
      }

      // Everything else is considered special character
      return "special";
    };

    switch (sortValue) {
      case "recent":
        return [...series].sort((a, b) => {
          const tA = new Date(
            a.last_modified || a.added || a.created_at || 0,
          ).getTime();
          const tB = new Date(
            b.last_modified || b.added || b.created_at || 0,
          ).getTime();
          return tB - tA; // newest first
        });

      case "az":
        return [...series].sort((a, b) => {
          const aName = a.name || "";
          const bName = b.name || "";

          const aCategory = categorizeSeries(aName);
          const bCategory = categorizeSeries(bName);

          // If same category, sort alphabetically within the category
          if (aCategory === bCategory) {
            return aName.localeCompare(bName);
          }

          // Order: letters first, then numbers, then special characters
          const categoryOrder = {
            letter: 1,
            number: 2,
            special: 3,
          };
          return categoryOrder[aCategory] - categoryOrder[bCategory];
        });

      case "za":
        return [...series].sort((a, b) => {
          const aName = a.name || "";
          const bName = b.name || "";

          const aCategory = categorizeSeries(aName);
          const bCategory = categorizeSeries(bName);

          // If same category, sort reverse alphabetically within the category
          if (aCategory === bCategory) {
            return bName.localeCompare(aName);
          }

          // Order: letters first, then numbers, then special characters
          const categoryOrder = {
            letter: 1,
            number: 2,
            special: 3,
          };
          return categoryOrder[aCategory] - categoryOrder[bCategory];
        });

      case "top":
        return [...series].sort(
          (a, b) => (b.rating_5based || 0) - (a.rating_5based || 0),
        );

      default:
        return series;
    }
  }

  const renderSeriesCardDropdown = (cardElement, seriesId) => {
    const isFav = allFavoritesSeriesIds.includes(seriesId);
    const isContinueWatchingCategory = selectedSeriesCategoryId === -2;

    // Check if series is actually in continue watching list
    const isInContinueWatching = (
      currentPlaylist.continueWatchingSeries || []
    ).some((item) => Number(item.itemId) === Number(seriesId));

    const dropdown = document.createElement("div");
    dropdown.className = "series-card-dropdown";

    // Customize dropdown options based on category and favorites status
    if (isContinueWatchingCategory) {
      // In Continue Watching category - show both options
      dropdown.innerHTML = `
      ${
        isFav
          ? `<div class="dropdown-option" data-action="remove-fav">Remove from Favorites</div>`
          : `<div class="dropdown-option" data-action="add-fav">Add to Favorites</div>`
      }
      <div class="dropdown-option" data-action="remove-continue">Remove from Continue Watching</div>
    `;
    } else {
      // In other categories - only show favorites and continue watching if applicable
      let options = [];

      // Always show favorite toggle
      options.push(`
      <div class="dropdown-option" data-action="${
        isFav ? "remove-fav" : "add-fav"
      }">
        ${isFav ? "Remove from Favorites" : "Add to Favorites"}
      </div>
    `);

      // Only show "Remove from Continue Watching" if series is actually in continue watching
      if (isInContinueWatching) {
        options.push(`
        <div class="dropdown-option" data-action="remove-continue">
          Remove from Continue Watching
        </div>
      `);
      }

      dropdown.innerHTML = options.join("");
    }

    // Position dropdown directly below the card
    const rect = cardElement.getBoundingClientRect();
    dropdown.style.position = "absolute";
    dropdown.style.top = `${rect.bottom}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`; // Match card width
    dropdown.style.zIndex = "1000";

    document.body.appendChild(dropdown);

    // Focus management for dropdown
    const options = dropdown.querySelectorAll(".dropdown-option");
    let focusedOptionIndex = 0;
    options[focusedOptionIndex].classList.add("focused");

    const dropdownKeyHandler = (e) => {
      if (!isSeriesDropdownOpen) return;

      const isUp = e.key === "ArrowUp" || e.keyCode === 38;
      const isDown = e.key === "ArrowDown" || e.keyCode === 40;
      const isEnter = e.key === "Enter" || e.keyCode === 13;
      const isBack =
        e.key === "Backspace" ||
        e.keyCode === 8 ||
        e.key === "Escape" ||
        e.keyCode === 27;

      if (isUp || isDown) {
        e.preventDefault();
        options[focusedOptionIndex].classList.remove("focused");

        if (isUp) {
          focusedOptionIndex =
            focusedOptionIndex > 0
              ? focusedOptionIndex - 1
              : options.length - 1;
        } else {
          focusedOptionIndex =
            focusedOptionIndex < options.length - 1
              ? focusedOptionIndex + 1
              : 0;
        }

        options[focusedOptionIndex].classList.add("focused");
        return;
      }

      if (isEnter) {
        e.preventDefault();
        const action = options[focusedOptionIndex].dataset.action;
        handleSeriesDropdownAction(action, seriesId);
        closeSeriesDropdown();
        return;
      }

      if (isBack) {
        e.preventDefault();
        closeSeriesDropdown(); // closeSeriesDropdown now handles restoring focus
        return;
      }
    };

    document.addEventListener("keydown", dropdownKeyHandler);

    // Store reference for cleanup
    dropdown._keyHandler = dropdownKeyHandler;

    return dropdown;
  };

  const closeSeriesDropdown = () => {
    const dropdown = document.querySelector(".series-card-dropdown");
    if (dropdown) {
      if (dropdown._keyHandler) {
        document.removeEventListener("keydown", dropdown._keyHandler);
      }
      dropdown.remove();
    }
    isSeriesDropdownOpen = false;

    // Get current cards after any potential removals
    const currentCards = qsa(".series-card");

    if (currentCards.length > 0) {
      // There are cards available
      if (
        selectedSeriesCardForDropdown &&
        document.body.contains(selectedSeriesCardForDropdown)
      ) {
        // Original card still exists, focus on it
        const cardIndex = Array.from(currentCards).indexOf(
          selectedSeriesCardForDropdown,
        );
        if (cardIndex >= 0) {
          focusedSeriesCardIndex = cardIndex;
          setSeriesFocus(currentCards, focusedSeriesCardIndex, "focused");
          setSeriesFlags(false, false, false);
        }
      } else {
        // Original card was removed, focus on nearest valid card
        focusedSeriesCardIndex = Math.min(
          focusedSeriesCardIndex,
          currentCards.length - 1,
        );
        focusedSeriesCardIndex = Math.max(0, focusedSeriesCardIndex);
        setSeriesFocus(currentCards, focusedSeriesCardIndex, "focused");
        setSeriesFlags(false, false, false);
      }
    } else {
      // No cards left, focus back on categories
      setSeriesFlags(true, false, false);
      const categories = qsa(".series-channel-category");
      if (categories.length > 0) {
        setSeriesFocus(
          categories,
          focusedSeriesChannelIndex,
          "series-channel-category-focused",
        );
      }
    }

    selectedSeriesCardForDropdown = null;
  };

  const handleSeriesDropdownAction = (action, seriesId) => {
    switch (action) {
      case "add-fav":
        toggleSeriesFavoriteItem(seriesId, "favouriteSeries");
        break;
      case "remove-fav":
        toggleSeriesFavoriteItem(seriesId, "favouriteSeries");
        break;
      case "remove-continue":
        removeFromSeriesContinueWatching(seriesId);
        break;
    }

    // Sync data and refresh UI
    syncSeriesFavoritesData();

    // Update the heart icon on the current card
    const currentCards = qsa(".series-card");
    const currentCard = currentCards.find(
      (card) => Number(card.dataset.seriesId) === Number(seriesId),
    );

    if (currentCard) {
      const isFav = allFavoritesSeriesIds.includes(seriesId);
      const heartIcon = currentCard.querySelector(".series-card-heart-icon");
      const topContent = currentCard.querySelector(".series-card-top-content");

      if (isFav && !heartIcon && topContent) {
        // Add heart icon if favorited
        const heartImg = document.createElement("img");
        heartImg.src = "/assets/heart-icon.png";
        heartImg.alt = "heart-icon";
        heartImg.className = "series-card-heart-icon";
        heartImg.loading = "lazy";
        topContent.appendChild(heartImg);
      } else if (!isFav && heartIcon) {
        // Remove heart icon if unfavorited
        heartIcon.remove();
      }
    }

    // Update favorites category count
    const favCategory = window.seriesCategories.find((c) => c.id === -1);
    if (favCategory) {
      const favCatEl = qs('.series-channel-category[data-category-id="-1"]');
      if (favCatEl) {
        const countEl = favCatEl.querySelector(
          ".series-channel-category-count",
        );
        if (countEl) {
          countEl.textContent = favCategory.series.length;
        }
      }
    }
  };

  const removeFromSeriesContinueWatching = (seriesId) => {
    try {
      // Get current playlists data
      const playlistsData = JSON.parse(localStorage.getItem("playlistsData"));
      const playlistIndex = playlistsData.findIndex(
        (pl) => pl.playlistName === currentPlaylistName,
      );

      if (playlistIndex === -1) return;

      const playlist = playlistsData[playlistIndex];

      // Remove from continue watching array
      if (playlist.continueWatchingSeries) {
        const originalLength = playlist.continueWatchingSeries.length;
        playlist.continueWatchingSeries =
          playlist.continueWatchingSeries.filter(
            (item) => Number(item.itemId) !== Number(seriesId),
          );

        // Only proceed if something was actually removed
        if (playlist.continueWatchingSeries.length === originalLength) {
          console.log("Series not found in continue watching list");
          return;
        }
      }

      // Update the specific playlist in the array
      playlistsData[playlistIndex] = playlist;

      // Save back to localStorage
      localStorage.setItem("playlistsData", JSON.stringify(playlistsData));

      // Update the continue watching category in memory
      const continueCategory = window.seriesCategories.find((c) => c.id === -2);
      if (continueCategory) {
        continueCategory.series = continueCategory.series.filter(
          (s) => Number(s.series_id) !== Number(seriesId),
        );
        continueCategory._seriesCount = continueCategory.series.length;
        delete continueCategory._sortedCache;
        delete continueCategory._lastSortValue;

        // Update UI count immediately
        const contCatEl = qs('.series-channel-category[data-category-id="-2"]');
        if (contCatEl) {
          const countEl = contCatEl.querySelector(
            ".series-channel-category-count",
          );
          if (countEl) {
            countEl.textContent = continueCategory.series.length;
          }
        }
      }

      // Update global continue watching array
      const updatedContinueWatch =
        window.allSeriesStreams
          .map((s) => {
            const cw = (playlist.continueWatchingSeries || []).find(
              (item) => Number(item.itemId) === Number(s.series_id),
            );
            if (cw) {
              const duration = Number(cw.duration) || 0;
              const resumeTime = Number(cw.resumeTime) || 0;
              const progress =
                duration > 0
                  ? Math.min(100, Math.floor((resumeTime / duration) * 100))
                  : 0;
              return {
                ...s,
                progress,
              };
            }
            return null;
          })
          .filter(Boolean) || [];

      // Update global variable
      window.allContinueWatchSeries = updatedContinueWatch;

      Toaster.showToast("success", "Removed from Continue Watching");

      const currentPage = localStorage.getItem("currentPage");
      if (currentPage === "sidebar" && sidebarPage === "seriesPage") {
        // Close and reopen sidebar to refresh the content
        closeSidebar("seriesPage");
        setTimeout(() => {
          openSidebar("seriesPage");
        }, 10);
      }

      // If we're currently in continue watching category, refresh immediately
      if (selectedSeriesCategoryId === -2) {
        // Remove the specific card from DOM immediately
        const cardToRemove = qs(`.series-card[data-series-id="${seriesId}"]`);
        if (cardToRemove) {
          const wasFocused = cardToRemove.classList.contains("focused");
          cardToRemove.remove();

          // Handle focus after removal
          const remainingCards = qsa(".series-card");
          if (remainingCards.length > 0 && wasFocused) {
            focusedSeriesCardIndex = Math.min(
              focusedSeriesCardIndex,
              remainingCards.length - 1,
            );
            setSeriesFocus(remainingCards, focusedSeriesCardIndex, "focused");
          } else if (remainingCards.length === 0) {
            // No cards left, show no data message
            const cardsContainer = qs(".series-cards-list-container");
            if (cardsContainer) {
              cardsContainer.style.display = "flex";

              cardsContainer.innerHTML = `
        <div class="series-no-data">
                <p>No series in Continue Watching</p>
              </div>`;
            }
            setSeriesFlags(true, false, false);
            setSeriesFocus(
              qsa(".series-channel-category"),
              focusedSeriesChannelIndex,
              "series-channel-category-focused",
            );
          }
        }

        // Update category count in sidebar
        const continueWatchingEl = qs(
          '.series-channel-category[data-category-id="-2"]',
        );
        if (continueWatchingEl) {
          const countEl = continueWatchingEl.querySelector(
            ".series-channel-category-count",
          );
          if (countEl) countEl.textContent = continueCategory.series.length;
        }
      }
    } catch (error) {
      console.error("Error removing from continue watching:", error);
      Toaster.showToast("error", "Failed to remove from Continue Watching");
    }
  };

  const toggleSeriesSidebar = (visible) => {
    isSeriesSidebarVisible = visible;
    const sidebar = qs(".series-channels-list");
    const cardsContainer = qs(".series-cards-list-container");
    const toggleIcon = qs(".series-cat-toggle-icon");
    const searchContainer = qs(".series-cat-search-container");
    const toggleBtn = qs(".series-cat-toggle-btn");

    if (sidebar)
      sidebar.classList.toggle(
        "series-channels-hidden",
        !isSeriesSidebarVisible,
      );
    if (cardsContainer)
      cardsContainer.classList.toggle(
        "series-cards-full-width",
        !isSeriesSidebarVisible,
      );

    if (toggleBtn) {
      toggleBtn.classList.toggle("sidebar-open", isSeriesSidebarVisible);
    }

    if (toggleIcon) {
      toggleIcon.className = isSeriesSidebarVisible
        ? "fas fa-chevron-up series-cat-toggle-icon"
        : "fas fa-chevron-down series-cat-toggle-icon";
    }

    // Search container is now always visible
  };

  const filterSeriesCategoriesList = () => {
    const cats = window.seriesCategories || [];
    if (!seriesCategorySearchQuery.trim()) return cats;
    const q = seriesCategorySearchQuery.toLowerCase().trim();
    return cats.filter((c) => c.name.toLowerCase().includes(q));
  };

  async function renderSeries() {
    const container = qs(".series-content-container");
    if (!container) return;

    // FIXED: Properly await the filtered categories
    const filtered = await getFilteredSeriesCategories();

    // FIXED: Handle empty search results properly
    if (
      seriesSearchQuery.trim() &&
      (!Array.isArray(filtered) || filtered.length === 0)
    ) {
      const selectedCategory = window.seriesCategories.find(
        (c) => c.id === selectedSeriesCategoryId,
      );
      const categoryName = selectedCategory
        ? selectedCategory.name
        : "this category";

      container.innerHTML = `
      <div class="series-channels-list">
        ${renderSeriesCategories(window.seriesCategories || [])}
      </div>
      <div class="series-cards-list-container" style="display: flex;">
        <div class="series-no-data">
          <p>No results found for "${seriesSearchQuery.trim()}" in ${categoryName}</p>
        </div>
      </div>`;

      highlightActiveSeriesCategory();
      if (inSeriesChannelList) {
        setSeriesFocus(
          qsa(".series-channel-category"),
          focusedSeriesChannelIndex,
          "series-channel-category-focused",
        );
      }
      return;
    }

    // FIXED: Use filtered results when available, otherwise use all categories
    const categoriesToShow =
      Array.isArray(filtered) && filtered.length > 0
        ? filtered
        : window.seriesCategories;
    let selectedCategory = null;

    // Select the appropriate category to display
    if (Array.isArray(categoriesToShow) && categoriesToShow.length > 0) {
      selectedCategory = categoriesToShow.find(
        (c) => c.id === selectedSeriesCategoryId,
      );
      if (!selectedCategory && categoriesToShow.length > 0) {
        selectedCategory = categoriesToShow[0];
        if (selectedCategory) {
          selectedSeriesCategoryId = selectedCategory.id;
        }
      }
    }

    if (!selectedCategory) {
      selectedCategory = window.seriesCategories.find(
        (c) => c.id === selectedSeriesCategoryId,
      );
    }

    let channelsList = qs(".series-channels-list");
    let cardsContainer = qs(".series-cards-list-container");

    // Build DOM if first time OR show spinner while loading
    if (!channelsList || !cardsContainer) {
      const sidebarHiddenClass = !isSeriesSidebarVisible
        ? "series-channels-hidden"
        : "";
      const cardsFullWidthClass = !isSeriesSidebarVisible
        ? "series-cards-full-width"
        : "";

      container.innerHTML = `
      <div class="series-channels-list ${sidebarHiddenClass}">
        ${renderSeriesCategories(categoriesToShow.slice(0, seriesCategoryChunk * SERIES_PAGE_SIZE))}
      </div>
      <div class="series-cards-list-container ${cardsFullWidthClass}">
        <div class="cards-loading-spinner"><div class="spinner"></div></div>
      </div>
    `;
    } else {
      // Update categories list - respect category search query
      const catList = qs(".series-channels-list");
      catList.classList.toggle(
        "series-channels-hidden",
        !isSeriesSidebarVisible,
      );
      catList.innerHTML = renderSeriesCategories(
        filterSeriesCategoriesList().slice(
          0,
          seriesCategoryChunk * SERIES_PAGE_SIZE,
        ),
      );

      const cardsContainer = qs(".series-cards-list-container");
      cardsContainer.classList.toggle(
        "series-cards-full-width",
        !isSeriesSidebarVisible,
      );

      // Show spinner while loading new category
      cardsContainer.innerHTML = `<div class="cards-loading-spinner"><div class="spinner"></div></div>`;
    }

    // Adult category lock check
    const isAdultCurrentlySelected =
      selectedCategory && isSeriesAdultCategory(selectedCategory.name);
    const parentalLockEnabled = !!currentPlaylist.parentalPassword;
    const isSelectedUnlocked = unlockedSeriesAdultCategories.has(
      String(selectedSeriesCategoryId),
    );

    if (
      parentalLockEnabled &&
      isAdultCurrentlySelected &&
      !isSelectedUnlocked
    ) {
      const lockedContainer = qs(".series-cards-list-container");
      if (lockedContainer) {
        lockedContainer.innerHTML = `
        <div class="series-no-data">
          <p>Locked Category. Enter PIN to unlock.</p>
        </div>`;
      }
      highlightActiveSeriesCategory();
      if (inSeriesChannelList) {
        setSeriesFocus(
          qsa(".series-channel-category"),
          focusedSeriesChannelIndex,
          "series-channel-category-focused",
        );
      }
      return;
    }

    // Load series with spinner visible
    const isSearchMode = seriesSearchQuery.trim().length > 0;
    const loadedCategory =
      isSearchMode && selectedCategory
        ? selectedCategory
        : await loadSeriesCategory(selectedSeriesCategoryId);

    // FIX: Ensure the loaded category series are sorted before rendering
    if (loadedCategory && loadedCategory.series) {
      loadedCategory.series = sortSeries(loadedCategory.series);
    }

    const targetFocusIndex = inSeriesChannelList ? -1 : focusedSeriesCardIndex;

    if (window.requestIdleCallback) {
      requestIdleCallback(() => {
        renderSeriesCardsChunked(loadedCategory, targetFocusIndex);
      });
    } else {
      requestAnimationFrame(() => {
        renderSeriesCardsChunked(loadedCategory, targetFocusIndex);
      });
    }
  }
  // expose for Sidebar sorting dialog to re-render on Apply
  window.renderSeries = renderSeries;

  function toggleSeriesFavoriteItem(seriesId, listKey = "favouriteSeries") {
    // Only work on series page
    if (localStorage.getItem("currentPage") !== "seriesPage") return;

    const playlist = JSON.parse(localStorage.getItem("playlistsData")).find(
      (pl) => pl.playlistName === currentPlaylistName,
    );
    if (!playlist) return;

    playlist[listKey] = playlist[listKey] || [];
    const index = playlist[listKey].indexOf(seriesId);
    const isAdding = index === -1;

    if (index > -1) {
      playlist[listKey].splice(index, 1);
    } else {
      playlist[listKey].push(seriesId);
    }

    localStorage.setItem(
      "playlistsData",
      JSON.stringify(
        JSON.parse(localStorage.getItem("playlistsData")).map((pl) =>
          pl.playlistName === currentPlaylistName ? playlist : pl,
        ),
      ),
    );

    allFavoritesSeriesIds.length = 0;
    allFavoritesSeriesIds.push(...playlist[listKey]);

    updateSeriesFavoritesUI(seriesId, isAdding);

    Toaster.showToast(
      isAdding ? "success" : "error",
      isAdding ? "Added to Favorites" : "Removed from Favorites",
    );
  }

  function updateSeriesFavoritesUI(seriesId, isAdding) {
    // Only work on series page
    if (localStorage.getItem("currentPage") !== "seriesPage") return;

    // Update favorites category count - FIXED VERSION
    const favCategory = window.seriesCategories.find((c) => c.id === -1);
    if (favCategory) {
      if (isAdding) {
        const seriesToAdd = window.allSeriesStreams.find(
          (s) => s.series_id === seriesId,
        );
        if (
          seriesToAdd &&
          !favCategory.series.some((s) => s.series_id === seriesId)
        ) {
          favCategory.series.push(seriesToAdd);
        }
      } else {
        favCategory.series = favCategory.series.filter(
          (s) => s.series_id !== seriesId,
        );
      }

      // Update the count property
      favCategory._seriesCount = favCategory.series.length;
      delete favCategory._sortedCache;
      delete favCategory._lastSortValue;

      // Update UI count immediately
      const favCatEl = qs('.series-channel-category[data-category-id="-1"]');
      if (favCatEl) {
        const countEl = favCatEl.querySelector(
          ".series-channel-category-count",
        );
        if (countEl) {
          countEl.textContent = favCategory.series.length;
        }
      }
    }

    const allCurrentCards = qsa(".series-card");
    allCurrentCards.forEach((card) => {
      const cardSeriesId = Number(card.dataset.seriesId);
      if (cardSeriesId === seriesId) {
        const heartIcon = card.querySelector(".series-card-heart-icon");
        const topContent = card.querySelector(".series-card-top-content");

        if (isAdding) {
          if (!heartIcon && topContent) {
            const heartImg = document.createElement("img");
            heartImg.src = "/assets/heart-icon.png";
            heartImg.alt = "heart-icon";
            heartImg.className = "series-card-heart-icon";
            heartImg.loading = "lazy";
            topContent.appendChild(heartImg);
          }
        } else {
          if (heartIcon && selectedSeriesCategoryId !== -1) {
            heartIcon.remove();
          }
        }
      }
    });

    // Always maintain focus after toggle, regardless of category
    const currentCards = qsa(".series-card");
    if (
      currentCards.length > 0 &&
      focusedSeriesCardIndex >= 0 &&
      !inSeriesChannelList &&
      !inSeriesSearch &&
      !inSeriesMenu
    ) {
      // Ensure focused card index is within bounds
      focusedSeriesCardIndex = Math.min(
        focusedSeriesCardIndex,
        currentCards.length - 1,
      );
      setSeriesFocus(currentCards, focusedSeriesCardIndex, "focused");
    }

    if (selectedSeriesCategoryId === -1) {
      // Only update the specific card that was toggled, don't refresh all cards
      if (!isAdding) {
        // Removing from favorites - remove the specific card
        const cardToRemove = qs(`.series-card[data-series-id="${seriesId}"]`);
        if (cardToRemove) {
          const wasFocused = cardToRemove.classList.contains("focused");
          cardToRemove.remove();

          // If the removed card was focused, adjust focus
          if (wasFocused) {
            const remainingCards = qsa(".series-card");
            if (remainingCards.length > 0) {
              focusedSeriesCardIndex = Math.min(
                focusedSeriesCardIndex,
                remainingCards.length - 1,
              );
              setSeriesFocus(remainingCards, focusedSeriesCardIndex, "focused");
            } else {
              // No cards left, show no data message
              const cardsContainer = qs(".series-cards-list-container");
              cardsContainer.style.display = "flex";

              if (cardsContainer) {
                cardsContainer.innerHTML = `
              <div class="series-no-data">
                <p>No favorite series yet</p>
              </div>`;
              }
              setSeriesFlags(true, false, false);
              setSeriesFocus(
                qsa(".series-channel-category"),
                focusedSeriesChannelIndex,
                "series-channel-category-focused",
              );
            }
          }
        }
      }
      // If adding to favorites, the card is already there with heart icon updated above
    }
  }

  function seriesPageClickHandler(e) {
    if (localStorage.getItem("currentPage") !== "seriesPage") return;

    // Category click logic
    const toggleBtn = e.target.closest(".series-cat-toggle-btn");
    if (toggleBtn) {
      toggleSeriesSidebar(!isSeriesSidebarVisible);
      return;
    }

    // Handle category clicks
    const cat = e.target.closest(".series-channel-category");
    if (cat) {
      seriesSearchQuery = "";
      const searchInput = qs("#series-header-search");
      if (searchInput) searchInput.value = "";
      const catId = Number(cat.dataset.categoryId);
      const catName = cat.dataset.categoryName;
      const isAdultCat = isSeriesAdultCategory(catName);
      const parentalLockEnabled = !!currentPlaylist.parentalPassword;
      const isUnlocked = unlockedSeriesAdultCategories.has(String(catId));

      // Handle adult category lock
      if (isAdultCat && parentalLockEnabled && !isUnlocked) {
        ParentalPinDialog(
          async () => {
            unlockedSeriesAdultCategories.add(String(catId));
            selectedSeriesCategoryId = catId;
            focusedSeriesChannelIndex = qsa(".series-channel-category").indexOf(
              cat,
            );
            visibleSeriesCount = SERIES_PAGE_SIZE;
            saveSeriesFocusState();
            // ADD THIS: Clear cache when changing categories
            const newCategory = window.seriesCategories.find(
              (c) => c.id === catId,
            );
            if (newCategory) {
              delete newCategory._sortedCache;
              delete newCategory._lastSortValue;
            }
            // Remove lock icon and blur class immediately
            const lockEl = cat.querySelector(".series-category-lock-icon");
            if (lockEl) lockEl.remove();
            cat.classList.remove("series-category-blurred");

            // Show spinner immediately
            const cardsContainer = qs(".series-cards-list-container");
            if (cardsContainer) {
              cardsContainer.innerHTML = `<div class="cards-loading-spinner"><div class="spinner"></div></div>`;
            }

            // Load the category series data first
            const loadedCategory = await loadSeriesCategory(catId);

            // Ensure the loaded category series are sorted before rendering
            if (loadedCategory && loadedCategory.series) {
              loadedCategory.series = sortSeries(loadedCategory.series);
            }

            // Call renderCardsChunked directly
            await renderSeriesCardsChunked(loadedCategory);

            highlightActiveSeriesCategory();

            // Focus on the first card after unlocking
            setTimeout(() => {
              const cards = qsa(".series-card");
              if (cards.length) {
                focusedSeriesCardIndex = 0;
                setSeriesFocus(cards, focusedSeriesCardIndex, "focused");
                setSeriesFlags(false, false, false);
              } else {
                setSeriesFocus(
                  qsa(".series-channel-category"),
                  focusedSeriesChannelIndex,
                  "series-channel-category-focused",
                );
                setSeriesFlags(true, false, false);
              }
            }, 100);
          },
          () => {
            setSeriesFocus(
              qsa(".series-channel-category"),
              focusedSeriesChannelIndex,
              "series-channel-category-focused",
            );
            setSeriesFlags(true, false, false);
          },
          currentPlaylist,
          "seriesPage",
        );
        return;
      }

      // Normal category navigation
      selectedSeriesCategoryId = catId;
      focusedSeriesChannelIndex = qsa(".series-channel-category").indexOf(cat);
      visibleSeriesCount = SERIES_PAGE_SIZE;
      saveSeriesFocusState();

      // Show spinner immediately
      const cardsContainer = qs(".series-cards-list-container");
      if (cardsContainer) {
        cardsContainer.innerHTML = `<div class="cards-loading-spinner"><div class="spinner"></div></div>`;
      }

      // Render with delay to show spinner
      setTimeout(() => {
        renderSeries();
        highlightActiveSeriesCategory();
        setSeriesFocus(
          qsa(".series-channel-category"),
          focusedSeriesChannelIndex,
          "series-channel-category-focused",
        );
        setSeriesFlags(true, false, false);
      }, 10);
      return;
    }

    // Handle card clicks - FIXED VERSION
    const card = e.target.closest(".series-card");
    if (card && !card.dataset.loading) {
      const seriesId = Number(card.dataset.seriesId);

      console.log("Card clicked - Series ID:", seriesId);

      // Get series data
      const allSeriesData = window.allSeries || [];
      const selectedSeriesObj = allSeriesData.find(
        (s) => Number(s.series_id) === seriesId,
      );

      if (!selectedSeriesObj) {
        console.warn("Series object not found for ID:", seriesId);
        return;
      }

      const parentalLockEnabled = !!currentPlaylist.parentalPassword;
      const isAdultSeries = isSeriesAdult(selectedSeriesObj);

      console.log("Parental lock enabled:", parentalLockEnabled);
      console.log("Is adult series:", isAdultSeries);
      console.log("Current category:", selectedSeriesCategoryId);

      // FIXED: Always ask for PIN for adult series in special categories OR if series is adult
      const shouldAskForPin =
        parentalLockEnabled &&
        isAdultSeries &&
        [-3, -1, -2].includes(selectedSeriesCategoryId); // All, Favorites, Continue Watching

      console.log("Should ask for PIN:", shouldAskForPin);

      if (shouldAskForPin) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Showing parental PIN dialog...");

        ParentalPinDialog(
          () => {
            console.log("PIN verified - navigating to series detail");
            // Store current focus state before navigating
            saveSeriesFocusState();

            localStorage.setItem("selectedSeriesId", seriesId);
            localStorage.setItem("currentPage", "seriesDetailPage");
            localStorage.setItem(
              "selectedSeriesItem",
              JSON.stringify(selectedSeriesObj),
            );
            document.querySelector("#loading-progress").style.display = "none";
            Router.showPage("seriesDetail");
          },
          () => {
            console.log("PIN verification failed/cancelled");
            const currentCards = qsa(".series-card");
            if (currentCards.length > 0) {
              setSeriesFocus(currentCards, focusedSeriesCardIndex, "focused");
            }
          },
          currentPlaylist,
          "seriesPage",
        );
        return;
      } else {
        console.log("No PIN required - direct navigation");
        // SAVE STATE BEFORE NAVIGATION
        saveSeriesFocusState();

        localStorage.setItem("selectedSeriesId", seriesId);
        localStorage.setItem("currentPage", "seriesDetailPage");
        localStorage.setItem(
          "selectedSeriesItem",
          JSON.stringify(selectedSeriesObj),
        );
        document.querySelector("#loading-progress").style.display = "none";
        Router.showPage("seriesDetail");
      }
    }
  }

  // Show UI immediately, then load data
  setTimeout(() => {
    if (SeriesPage.cleanup) SeriesPage.cleanup();

    // Show loading state first
    const container = qs(".series-content-container");
    if (container) {
      container.innerHTML = `
        <div class="series-loading-spinner">
          <div class="spinner"></div>
        </div>
      `;
    }

    // Process data with chunking
    setTimeout(async () => {
      await processSeriesData();

      // Check if we have saved focus state
      const savedCategoryId = localStorage.getItem("seriesLastCategoryId");
      const savedChannelIndex = localStorage.getItem("seriesLastChannelIndex");
      const savedCardIndex = localStorage.getItem("seriesLastCardIndex");

      if (
        savedCategoryId &&
        savedChannelIndex !== null &&
        savedCardIndex !== null
      ) {
        // Restore sidebar state
        const savedSidebarVisible =
          localStorage.getItem("seriesSidebarVisible") === "true";
        if (savedSidebarVisible !== isSeriesSidebarVisible) {
          toggleSeriesSidebar(savedSidebarVisible);
        }

        // Restore saved state
        selectedSeriesCategoryId = Number(savedCategoryId);
        focusedSeriesChannelIndex = Number(savedChannelIndex);
        focusedSeriesCardIndex = Number(savedCardIndex);
        inSeriesChannelList = false; // Ensure we look for cards, not categories

        // Calculate how many cards need to be visible to show the focused card
        const cardsNeeded = focusedSeriesCardIndex + 1;
        visibleSeriesCount = Math.max(
          SERIES_PAGE_SIZE,
          Math.ceil(cardsNeeded / SERIES_PAGE_SIZE) * SERIES_PAGE_SIZE,
        );

        // Render with saved category
        // renderSeries now handles targetFocusIndex internally via global focusedSeriesCardIndex
        await renderSeries();

        // Clear card restoration flag - we only restore once per detail-to-list navigation
        localStorage.removeItem("seriesLastCardIndex");

        // Loader will be removed by the chunked renderer after focus is applied
      } else {
        // First time load - Focus on first card instead of search
        selectedSeriesCategoryId = -3; // Default to "All"
        focusedSeriesChannelIndex = 0;
        focusedSeriesCardIndex = 0;
        inSeriesChannelList = false; // Aim for card focus

        renderSeries();
        highlightActiveSeriesCategory();

        // Wait for cards to render and focus on the first one
        const initialFocusCheck = (attempts = 0) => {
          const cards = qsa(".series-card");
          const MAX_ATTEMPTS = 30; // 6 seconds

          if (cards.length > 0) {
            setSeriesFocus(cards, 0, "focused");
            focusedSeriesCardIndex = 0;
            setSeriesFlags(false, false, false);
          } else if (attempts < MAX_ATTEMPTS) {
            setTimeout(() => initialFocusCheck(attempts + 1), 200);
          } else {
            // Fallback: If no cards appear (e.g. empty favorites), focus on category
            focusSeriesChannels(0);
          }
        };
        initialFocusCheck();

        // Smoothly remove loader
        if (seriesLoader) {
          seriesLoader.classList.add("fade-out");
          setTimeout(() => seriesLoader.remove(), 500);
        }
      }
    }, 10);

    function seriesPageKeydownHandler(e) {
      if (localStorage.getItem("currentPage") !== "seriesPage") return;

      // Block all navigation during card rendering
      if (isRenderingSeriesCards) {
        e.preventDefault();
        return;
      }

      // Handle dropdown open state
      if (isSeriesDropdownOpen) {
        const backKeys = [10009, "Escape", "Back", "BrowserBack", "XF86Back"];
        const isUp = e.key === "ArrowUp" || e.keyCode === 38;
        const isDown = e.key === "ArrowDown" || e.keyCode === 40;
        const isEnter = e.key === "Enter" || e.keyCode === 13;

        if (backKeys.includes(e.keyCode) || backKeys.includes(e.key)) {
          e.preventDefault();
          closeSeriesDropdown();
          return;
        }

        if (isUp || isDown || isEnter) {
          e.preventDefault();
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const channelList = qsa(".series-channel-category");
      const cards = qsa(".series-card");
      const cardsContainer = qs(".series-cards-list-container");
      const firstCard = cards.length > 0 ? cards[0] : null;

      let cardsPerRow = 1;
      if (cards.length > 1) {
        const firstTop = cards[0].offsetTop;
        for (let i = 1; i < cards.length; i++) {
          if (cards[i].offsetTop > firstTop) {
            cardsPerRow = i;
            break;
          }
        }
        if (
          cardsPerRow === 1 &&
          cards.length > 1 &&
          cards[0].offsetTop === cards[1].offsetTop
        ) {
          // Fallback for safety
          cardsPerRow =
            Math.floor(cardsContainer.offsetWidth / cards[0].offsetWidth) || 1;
        }
      }

      const searchInput = qs("#series-header-search");

      // Add keydown for search input (ArrowDown to categories)
      if (searchInput && !searchInput.dataset.keyfix) {
        searchInput.addEventListener("keydown", (ev) => {
          if (ev.key === "ArrowDown" || ev.keyCode === 40) {
            ev.preventDefault();
            searchInput.blur();
            searchInput.classList.remove("series-header-search-input-focused");
            focusSeriesChannels(0);
            setSeriesFlags(true, false, false);
          }
        });
        searchInput.dataset.keyfix = "true";
      }

      // Back keys
      const backKeys = [10009, "Escape", "Back", "BrowserBack", "XF86Back"];
      if (backKeys.includes(e.keyCode) || backKeys.includes(e.key)) {
        if (
          !inSeriesChannelList &&
          !inSeriesSearch &&
          !inSeriesMenu &&
          !inSeriesControls &&
          focusedSeriesCardIndex >= cardsPerRow
        ) {
          // If in cards and NOT on first row, go to first card of first row
          focusedSeriesCardIndex = 0;
          setSeriesFocus(cards, focusedSeriesCardIndex, "focused");
          e.preventDefault();
          return;
        }
        // Otherwise (first row, sidebar, search, or menu), go to dashboard
        localStorage.removeItem("seriesRestoreFocus");
        localStorage.removeItem("seriesLastCategoryId");
        localStorage.removeItem("seriesLastChannelIndex");
        localStorage.removeItem("seriesLastCardIndex");
        localStorage.removeItem("seriesSidebarVisible");
        localStorage.removeItem("selectedSeriesId");
        localStorage.removeItem("selectedSeriesItem");

        localStorage.setItem("currentPage", "dashboard");
        Router.showPage("dashboard");
        document.body.style.cssText = "background:none;background-color:black";
        return;
      }

      const isUp = e.key === "ArrowUp" || e.keyCode === 38;
      const isDown = e.key === "ArrowDown" || e.keyCode === 40;
      const isLeft = e.key === "ArrowLeft" || e.keyCode === 37;
      const isRight = e.key === "ArrowRight" || e.keyCode === 39;
      const isEnter = e.key === "Enter" || e.keyCode === 13;

      const toggleBtn = qs(".series-cat-toggle-btn");
      const catSearchContainer = qs(".series-cat-search-container");
      const catSearchInput = qs("#series-cat-search-input");

      if (inSeriesControls) {
        const isToggleFocused =
          (document.activeElement.classList.contains("series-cat-toggle-btn") ||
            (toggleBtn && toggleBtn.classList.contains("focused"))) &&
          !isSeriesCatSearchFocused;

        if (isToggleFocused) {
          if (isDown) {
            e.preventDefault();
            toggleBtn.classList.remove("focused");
            toggleBtn.blur(); // Ensure browser focus is cleared
            if (isSeriesSidebarVisible) {
              focusSeriesChannels(0);
            } else {
              focusSeriesCards(0);
            }
            return;
          }
          if (isRight) {
            e.preventDefault();
            // Search container is now always visible
            toggleBtn.classList.remove("focused");
            toggleBtn.blur();
            catSearchContainer.classList.add("focused");
            isSeriesCatSearchFocused = true;
            return;
          }
          if (isUp) {
            e.preventDefault();
            toggleBtn.classList.remove("focused");
            toggleBtn.blur();
            focusSeriesSearch();
            return;
          }
          if (isEnter) {
            e.preventDefault();
            toggleSeriesSidebar(!isSeriesSidebarVisible);
            return;
          }
        } else if (isSeriesCatSearchFocused) {
          if (isEnter) {
            e.preventDefault();
            if (toggleBtn) toggleBtn.blur();
            if (catSearchInput) {
              catSearchInput.focus();
              // Add listener to return focus to container
              if (!catSearchInput.dataset.focusFix) {
                catSearchInput.addEventListener("keydown", (ev) => {
                  const isBack =
                    [
                      10009,
                      "Escape",
                      "Back",
                      "BrowserBack",
                      "XF86Back",
                    ].includes(ev.keyCode) ||
                    [
                      10009,
                      "Escape",
                      "Back",
                      "BrowserBack",
                      "XF86Back",
                    ].includes(ev.key);
                  if (ev.key === "ArrowDown" || ev.keyCode === 40 || isBack) {
                    ev.preventDefault();
                    catSearchInput.blur();
                    catSearchContainer.classList.add("focused");
                    isSeriesCatSearchFocused = true;
                  }
                });
                catSearchInput.dataset.focusFix = "true";
              }
            }
            return;
          }
          if (isDown) {
            e.preventDefault();
            isSeriesCatSearchFocused = false;
            catSearchContainer.classList.remove("focused");
            if (catSearchInput) catSearchInput.blur();
            if (isSeriesSidebarVisible) {
              focusSeriesChannels(0);
            } else {
              focusSeriesCards(0);
            }
            return;
          }
          if (isUp) {
            e.preventDefault();
            isSeriesCatSearchFocused = false;
            catSearchContainer.classList.remove("focused");
            if (catSearchInput) catSearchInput.blur();
            focusSeriesSearch();
            return;
          }
          if (isLeft) {
            e.preventDefault();
            isSeriesCatSearchFocused = false;
            catSearchContainer.classList.remove("focused");
            if (catSearchInput) catSearchInput.blur();
            if (toggleBtn) {
              toggleBtn.focus();
              toggleBtn.classList.add("focused");
            }
            return;
          }
        }
        if (!isEnter && !isUp && !isDown && !isLeft && !isRight) return;
      }

      // ---------- UP ----------
      if (isUp) {
        if (inSeriesChannelList) {
          if (focusedSeriesChannelIndex === 0) {
            // Explicitly remove category focused class when moving up to toggle
            qsa(".series-channel-category-focused").forEach((el) => {
              el.classList.remove("series-channel-category-focused");
            });
            focusSeriesToggleBtn();
          } else {
            setSeriesFocus(
              channelList,
              --focusedSeriesChannelIndex,
              "series-channel-category-focused",
            );
          }
          e.preventDefault();
          return;
        }

        if (!inSeriesChannelList && !inSeriesSearch && !inSeriesMenu) {
          if (focusedSeriesCardIndex >= cardsPerRow) {
            setSeriesFocus(
              cards,
              (focusedSeriesCardIndex -= cardsPerRow),
              "focused",
            );
          } else {
            // Explicitly remove focused class from all cards when moving to controls
            cards.forEach((c) => c.classList.remove("focused"));
            focusSeriesToggleBtn();
            focusedSeriesCardIndex = -1;
          }
          e.preventDefault();
          return;
        }
      }

      // ---------- DOWN ----------
      if (isDown) {
        if (inSeriesSearch || inSeriesMenu) {
          searchInput && searchInput.blur();
          searchInput &&
            searchInput.classList.remove("series-header-search-input-focused");

          focusSeriesToggleBtn();

          e.preventDefault();
          return;
        }

        if (inSeriesChannelList) {
          if (focusedSeriesChannelIndex < channelList.length - 1) {
            setSeriesFocus(
              channelList,
              ++focusedSeriesChannelIndex,
              "series-channel-category-focused",
            );
            e.preventDefault();
            return;
          } else {
            const allFiltered = filterSeriesCategoriesList();
            if (channelList.length < allFiltered.length) {
              seriesCategoryChunk++;
              const limited = allFiltered.slice(
                0,
                seriesCategoryChunk * SERIES_PAGE_SIZE,
              );
              qs(".series-channels-list").innerHTML =
                renderSeriesCategories(limited);
              highlightActiveSeriesCategory();

              // Move to next item after rendering
              focusedSeriesChannelIndex++;
              const newChannelList = qsa(".series-channel-category");
              setSeriesFocus(
                newChannelList,
                focusedSeriesChannelIndex,
                "series-channel-category-focused",
              );

              e.preventDefault();
              return;
            }
          }
        }

        if (!inSeriesChannelList && focusedSeriesCardIndex >= 0) {
          const currentRow = Math.floor(focusedSeriesCardIndex / cardsPerRow);
          const totalRows = Math.ceil(cards.length / cardsPerRow);
          const isLastRow = currentRow === totalRows - 1;

          // Check if we're in the last row
          if (isLastRow) {
            // We're in the last row, need to load more cards
            const category = window.seriesCategories.find(
              (c) => c.id === selectedSeriesCategoryId,
            );
            if (!category) {
              e.preventDefault();
              return;
            }

            // FIXED: Get sorted series from cache or sort them
            if (
              !category._sortedCache ||
              category._lastSortValue !== localStorage.getItem("movieSortValue")
            ) {
              category._sortedCache = sortSeries(category.series || []);
              category._lastSortValue = localStorage.getItem("movieSortValue");
            }

            const sortedSeries = category._sortedCache;
            const totalSeries = sortedSeries.length;

            if (cards.length < totalSeries) {
              // Calculate which card in the next row we want to focus
              const currentColumn = focusedSeriesCardIndex % cardsPerRow;
              const targetIndexInNextRow = cards.length + currentColumn;

              // FIXED: Get next chunk from SORTED series array
              const newSeries = sortedSeries.slice(
                cards.length,
                cards.length + SERIES_PAGE_SIZE,
              );
              const fragment = document.createDocumentFragment();
              const showFavHeartIcon = Number(selectedSeriesCategoryId) === -1;

              newSeries.forEach((s) => {
                const isAdultSeries = isSeriesAdult(s);
                const parentalLockEnabled = !!currentPlaylist.parentalPassword;
                const shouldBlur =
                  parentalLockEnabled && shouldBlurAdultSeriesCard(s);
                const showLockIcon = shouldBlur;

                const div = document.createElement("div");
                div.className = "series-card";
                div.dataset.seriesId = s.series_id;
                div.dataset.seriesTitle = s.name;

                if (shouldBlur) {
                  div.classList.add("series-card-blurred");
                }

                div.innerHTML = `
          <div class="series-card-image-wrapper">
            <img src="${s.cover || "/assets/noImageFound.png"}" alt="${
              s.name
            }" onerror="this.onerror=null; this.src='/assets/noImageFound.png';" loading="lazy" class="series-card-img ${
              shouldBlur ? "blurred-image" : ""
            }"/>
          </div>
          <div class="series-card-bottom-content ${
            shouldBlur ? "blurred-text" : ""
          }">
            <p class="series-card-title">${s.name}</p>
            <p class="series-card-description">${s.name}</p>
          </div>
          <div class="series-card-top-content">
            <p class="series-card-rating ${shouldBlur ? "blurred-text" : ""}">${
              isNaN(s.rating_5based)
                ? 0
                : Math.min(5, parseInt(s.rating_5based, 10))
            }</p>
            ${
              showFavHeartIcon ||
              (Array.isArray(allFavoritesSeriesIds) &&
                allFavoritesSeriesIds.includes(s.series_id))
                ? '<img src="/assets/heart-icon.png" alt="heart-icon" loading="lazy" class="series-card-heart-icon"/>'
                : ""
            }
            ${
              showLockIcon
                ? '<i class="fas fa-lock series-card-lock-icon"></i>'
                : ""
            }
          </div>
        `;
                fragment.appendChild(div);
              });

              cardsContainer.appendChild(fragment);

              // Get updated cards list after adding new cards
              const newCards = qsa(".series-card");

              // Try to focus on the card in the same column position in the next row
              let nextFocusIndex = targetIndexInNextRow;

              // If that exact position doesn't exist, focus on the last card in the new row
              if (nextFocusIndex >= newCards.length) {
                const newRowStartIndex = cards.length;
                const newRowEndIndex = Math.min(
                  newRowStartIndex + cardsPerRow - 1,
                  newCards.length - 1,
                );
                nextFocusIndex = newRowEndIndex;
              }

              setSeriesFocus(newCards, nextFocusIndex, "focused");
              focusedSeriesCardIndex = nextFocusIndex;
              e.preventDefault();
              return;
            }
            // If no more cards to load, stay on current card
            e.preventDefault();
            return;
          }

          // Not in last row, navigate normally to next row
          const nextRowStartIndex = (currentRow + 1) * cardsPerRow;
          const currentColumn = focusedSeriesCardIndex % cardsPerRow;
          const potentialNextIndex = nextRowStartIndex + currentColumn;

          // Try to move to same column in next row
          if (potentialNextIndex < cards.length) {
            setSeriesFocus(cards, potentialNextIndex, "focused");
            focusedSeriesCardIndex = potentialNextIndex;
            e.preventDefault();
            return;
          }

          // If same column doesn't exist, move to last card in next row
          const nextRowEndIndex = Math.min(
            nextRowStartIndex + cardsPerRow - 1,
            cards.length - 1,
          );
          if (
            nextRowEndIndex >= nextRowStartIndex &&
            nextRowEndIndex !== focusedSeriesCardIndex
          ) {
            setSeriesFocus(cards, nextRowEndIndex, "focused");
            focusedSeriesCardIndex = nextRowEndIndex;
            e.preventDefault();
            return;
          }

          e.preventDefault();
          return;
        }
      }

      // ---------- RIGHT ----------
      if (isRight) {
        if (inSeriesSearch) {
          searchInput && searchInput.blur();
          searchInput &&
            searchInput.classList.remove("series-header-search-input-focused");
          focusSeriesMenu();
          e.preventDefault();
          return;
        }

        if (inSeriesChannelList) {
          if (seriesToShow.length > 0) {
            if (cards.length) {
              setSeriesFocus(
                channelList,
                -1,
                "series-channel-category-focused",
              );

              // FIX: Reset focusedSeriesCardIndex to 0 and force focus to first card
              focusedSeriesCardIndex = 0; // Reset to first card
              seriesCategoryFocusMap.set(selectedSeriesCategoryId, 0); // Also update the focus map for this category
              focusSeriesCards(0); // Force focus to first card
            } else {
              // No cards available, stay on category
              e.preventDefault();
              return;
            }

            e.preventDefault();
            return;
          } else {
            document
              .querySelectorAll(".series-channel-category-focused")
              .forEach((el) => {
                el.classList.remove("series-channel-category-focused");
              });
            focusSeriesSearch();
            return;
          }
        }

        if (!inSeriesChannelList && !inSeriesSearch && !inSeriesMenu) {
          if (focusedSeriesCardIndex < cards.length - 1) {
            setSeriesFocus(cards, ++focusedSeriesCardIndex, "focused");
            e.preventDefault();
            return;
          } else if (focusedSeriesCardIndex === cards.length - 1) {
            // We are at the last card, check if we can load more
            const category = window.seriesCategories.find(
              (c) => c.id === selectedSeriesCategoryId,
            );

            if (category) {
              // Ensure sorted cache exists
              if (
                !category._sortedCache ||
                category._lastSortValue !==
                  localStorage.getItem("movieSortValue")
              ) {
                category._sortedCache = sortSeries(category.series || []);
                category._lastSortValue =
                  localStorage.getItem("movieSortValue");
              }

              const sortedSeries = category._sortedCache;
              if (cards.length < sortedSeries.length) {
                // Load next chunk
                const newSeries = sortedSeries.slice(
                  cards.length,
                  cards.length + SERIES_PAGE_SIZE,
                );

                const fragment = document.createDocumentFragment();
                const showFavHeartIcon =
                  Number(selectedSeriesCategoryId) === -1;

                newSeries.forEach((s) => {
                  const isAdultSeries = isSeriesAdult(s);
                  const parentalLockEnabled =
                    !!currentPlaylist.parentalPassword;
                  const shouldBlur =
                    parentalLockEnabled && shouldBlurAdultSeriesCard(s);
                  const showLockIcon = shouldBlur;

                  const div = document.createElement("div");
                  div.className = "series-card";
                  div.dataset.seriesId = s.series_id;
                  div.dataset.seriesTitle = s.name;

                  if (shouldBlur) {
                    div.classList.add("series-card-blurred");
                  }

                  div.innerHTML = `
          <div class="series-card-image-wrapper">
            <img src="${s.cover || "/assets/noImageFound.png"}" alt="${
              s.name
            }" onerror="this.onerror=null; this.src='/assets/noImageFound.png';" loading="lazy" class="series-card-img ${
              shouldBlur ? "blurred-image" : ""
            }"/>
          </div>
          <div class="series-card-bottom-content ${
            shouldBlur ? "blurred-text" : ""
          }">
            <p class="series-card-title">${s.name}</p>
            <p class="series-card-description">${s.name}</p>
          </div>
          <div class="series-card-top-content">
            <p class="series-card-rating ${shouldBlur ? "blurred-text" : ""}">${
              isNaN(s.rating_5based)
                ? 0
                : Math.min(5, parseInt(s.rating_5based, 10))
            }</p>
            ${
              showFavHeartIcon ||
              (Array.isArray(allFavoritesSeriesIds) &&
                allFavoritesSeriesIds.includes(s.series_id))
                ? '<img src="/assets/heart-icon.png" alt="heart-icon" loading="lazy" class="series-card-heart-icon"/>'
                : ""
            }
            ${
              showLockIcon
                ? '<i class="fas fa-lock series-card-lock-icon"></i>'
                : ""
            }
          </div>
        `;
                  fragment.appendChild(div);
                });

                cardsContainer.appendChild(fragment);

                // Focus on the next card (which is the first of the new chunk)
                const updatedCards = qsa(".series-card");
                if (updatedCards.length > cards.length) {
                  setSeriesFocus(
                    updatedCards,
                    ++focusedSeriesCardIndex,
                    "focused",
                  );
                }
                e.preventDefault();
                return;
              }
            }
          }
        }
      }

      // ---------- LEFT ----------
      if (isLeft) {
        if (inSeriesMenu) {
          focusSeriesSearch();
          e.preventDefault();
          return;
        }

        if (inSeriesSearch) {
          searchInput && searchInput.blur();
          searchInput &&
            searchInput.classList.remove("series-header-search-input-focused");
          focusSeriesChannels(0);
          e.preventDefault();
          return;
        }

        if (!inSeriesChannelList && !inSeriesSearch && !inSeriesMenu) {
          if (
            cards.length === 0 ||
            focusedSeriesCardIndex % cardsPerRow === 0
          ) {
            setSeriesFocus(cards, -1, "focused");
            focusSeriesChannels(focusedSeriesChannelIndex);
          } else {
            setSeriesFocus(cards, --focusedSeriesCardIndex, "focused");
          }
          e.preventDefault();
          return;
        }
      }

      // ---------- ENTER ----------
      if (isEnter) {
        const focusedCard = cards[focusedSeriesCardIndex];

        if (inSeriesSearch) {
          searchInput && searchInput.focus();
          e.preventDefault();
          return;
        }

        if (inSeriesMenu) {
          e.preventDefault();
          localStorage.setItem("sidebarPage", "seriesPage");
          const sidebar = document.querySelector(".sidebar-container-series");

          if (sidebar.style.display === "none") {
            // Refresh sidebar with current series page data before opening
            const sidebarContainer = document.querySelector(
              ".sidebar-container-series",
            );
            if (sidebarContainer) {
              // Re-render sidebar with fresh series data
              sidebarContainer.innerHTML = Sidebar({
                from: "seriesPage",
                onSort: () => {
                  console.log("Sorting series...");
                  renderSeries(); // Refresh series display after sort

                  // Maintain current focus position
                  if (inSeriesChannelList) {
                    focusSeriesChannels(focusedSeriesChannelIndex);
                  } else {
                    focusSeriesCards(focusedSeriesCardIndex);
                  }
                },
              });
            }

            // Open the refreshed sidebar
            openSidebar("seriesPage");
          } else {
            closeSidebar("seriesPage");
          }
          return;
        }

        // Handle category ENTER with PIN protection
        if (inSeriesChannelList) {
          const catEl = channelList[focusedSeriesChannelIndex];
          if (!catEl) return;

          const catId = Number(catEl.dataset.categoryId);
          const catName = catEl.dataset.categoryName;
          const isAdultCat = isSeriesAdultCategory(catName);
          const parentalLockEnabled = !!currentPlaylist.parentalPassword;
          const isUnlocked = unlockedSeriesAdultCategories.has(String(catId));

          if (isAdultCat && parentalLockEnabled && !isUnlocked) {
            ParentalPinDialog(
              async () => {
                unlockedSeriesAdultCategories.add(String(catId));
                selectedSeriesCategoryId = catId;
                focusedSeriesChannelIndex = qsa(
                  ".series-channel-category",
                ).indexOf(catEl);
                visibleSeriesCount = SERIES_PAGE_SIZE;
                saveSeriesFocusState();

                // Remove lock icon and blur class immediately
                const lockEl = catEl.querySelector(
                  ".series-category-lock-icon",
                );
                if (lockEl) lockEl.remove();
                catEl.classList.remove("series-category-blurred");

                // Show spinner immediately
                const cardsContainer = qs(".series-cards-list-container");
                if (cardsContainer) {
                  cardsContainer.innerHTML = `<div class="cards-loading-spinner"><div class="spinner"></div></div>`;
                }

                // Load the category series data first
                const loadedCategory = await loadSeriesCategory(catId);

                // Ensure the loaded category series are sorted before rendering
                if (loadedCategory && loadedCategory.series) {
                  loadedCategory.series = sortSeries(loadedCategory.series);
                }

                // Call renderCardsChunked directly
                await renderSeriesCardsChunked(loadedCategory);

                highlightActiveSeriesCategory();

                // Focus on the first card after unlocking
                setTimeout(() => {
                  const cards = qsa(".series-card");
                  if (cards.length) {
                    focusedSeriesCardIndex = 0;
                    setSeriesFocus(cards, focusedSeriesCardIndex, "focused");
                    setSeriesFlags(false, false, false);
                  } else {
                    setSeriesFocus(
                      qsa(".series-channel-category"),
                      focusedSeriesChannelIndex,
                      "series-channel-category-focused",
                    );
                    setSeriesFlags(true, false, false);
                  }
                }, 100);
              },
              () => {
                setSeriesFocus(
                  qsa(".series-channel-category"),
                  focusedSeriesChannelIndex,
                  "series-channel-category-focused",
                );
                setSeriesFlags(true, false, false);
              },
              currentPlaylist,
              "seriesPage",
            );
            e.preventDefault();
            return;
          } else {
            // Normal category navigation
            searchInput.value = "";
            seriesSearchQuery = "";

            // Update selected category
            selectedSeriesCategoryId = catId;
            focusedSeriesChannelIndex = qsa(".series-channel-category").indexOf(
              catEl,
            );
            visibleSeriesCount = SERIES_PAGE_SIZE;
            saveSeriesFocusState();

            // Show spinner immediately
            const cardsContainer = qs(".series-cards-list-container");
            if (cardsContainer) {
              cardsContainer.innerHTML = `<div class="cards-loading-spinner"><div class="spinner"></div></div>`;
            }

            // Render with delay to show spinner
            setTimeout(() => {
              renderSeries();
              highlightActiveSeriesCategory();
              setSeriesFocus(
                qsa(".series-channel-category"),
                focusedSeriesChannelIndex,
                "series-channel-category-focused",
              );
              setSeriesFlags(true, false, false);
            }, 10);

            e.preventDefault();
            return;
          }
        }

        // FIXED: Long press / Continue Watching logic
        if (
          !inSeriesChannelList &&
          !inSeriesSearch &&
          !inSeriesMenu &&
          focusedCard
        ) {
          e.preventDefault();

          // Clear any existing timer first
          if (seriesEnterPressTimer) {
            clearTimeout(seriesEnterPressTimer);
            seriesEnterPressTimer = null;
          }

          // Check if this is an adult series in special category that requires PIN
          const seriesId = Number(focusedCard.dataset.seriesId);
          const allSeriesData = window.allSeries || [];
          const selectedSeriesObj = allSeriesData.find(
            (s) => Number(s.series_id) === seriesId,
          );

          const parentalLockEnabled = !!currentPlaylist.parentalPassword;
          const isAdultSeries = selectedSeriesObj
            ? isSeriesAdult(selectedSeriesObj)
            : false;
          const shouldAskForPin =
            parentalLockEnabled &&
            isAdultSeries &&
            [-3, -1, -2].includes(selectedSeriesCategoryId);

          // If adult series in special category, show PIN dialog immediately
          if (shouldAskForPin) {
            ParentalPinDialog(
              () => {
                saveSeriesFocusState();
                localStorage.setItem(
                  "seriesSidebarVisible",
                  isSeriesSidebarVisible,
                );
                localStorage.setItem("selectedSeriesId", seriesId);
                localStorage.setItem("currentPage", "seriesDetailPage");
                localStorage.setItem(
                  "selectedSeriesItem",
                  JSON.stringify(selectedSeriesObj),
                );
                document.querySelector("#loading-progress").style.display =
                  "none";
                Router.showPage("seriesDetail");
              },
              () => {
                const currentCards = qsa(".series-card");
                if (currentCards.length > 0) {
                  setSeriesFocus(
                    currentCards,
                    focusedSeriesCardIndex,
                    "focused",
                  );
                }
              },
              currentPlaylist,
              "seriesPage",
            );
            return;
          }

          seriesEnterPressTimer = setTimeout(() => {
            const isContinueWatchingCategory = selectedSeriesCategoryId === -2;

            closeSeriesDropdown();

            if (isContinueWatchingCategory) {
              selectedSeriesCardForDropdown = focusedCard;
              isSeriesDropdownOpen = true;
              focusedCard.classList.remove("focused");
              renderSeriesCardDropdown(focusedCard, seriesId);
            } else {
              toggleSeriesFavoriteItem(seriesId, "favouriteSeries");
            }

            seriesEnterPressTimer = null;
            isSeriesLongPressExecuted = true;
          }, SERIES_LONG_PRESS_DURATION);
        }
      }

      if (
        !inSeriesChannelList &&
        !inSeriesSearch &&
        !inSeriesMenu &&
        focusedSeriesCardIndex >= 0
      ) {
        seriesCategoryFocusMap.set(
          selectedSeriesCategoryId,
          focusedSeriesCardIndex,
        );
        saveSeriesFocusState();
      }
    }

    const seriesPageKeyupHandler = (e) => {
      const isEnter = e.key === "Enter" || e.keyCode === 13;

      if (!isEnter) return;

      // If timer exists, it means we had a short press - handle normal navigation
      if (seriesEnterPressTimer && !isSeriesLongPressExecuted) {
        clearTimeout(seriesEnterPressTimer);
        seriesEnterPressTimer = null;

        // Only navigate if dropdown is not open and we're focused on a card
        if (
          !isSeriesDropdownOpen &&
          !inSeriesChannelList &&
          !inSeriesSearch &&
          !inSeriesMenu
        ) {
          const cards = qsa(".series-card");
          if (focusedSeriesCardIndex >= 0 && cards[focusedSeriesCardIndex]) {
            const card = cards[focusedSeriesCardIndex];
            const seriesId = Number(card.dataset.seriesId);

            // Check if this is an adult series in special category that requires PIN
            const allSeriesData = window.allSeries || [];
            const selectedSeriesObj = allSeriesData.find(
              (s) => Number(s.series_id) === seriesId,
            );

            const parentalLockEnabled = !!currentPlaylist.parentalPassword;
            const isAdultSeries = selectedSeriesObj
              ? isSeriesAdult(selectedSeriesObj)
              : false;
            const shouldAskForPin =
              parentalLockEnabled &&
              isAdultSeries &&
              [-3, -1, -2].includes(selectedSeriesCategoryId);

            // If adult series in special category, show PIN dialog
            if (shouldAskForPin) {
              ParentalPinDialog(
                () => {
                  saveSeriesFocusState();
                  localStorage.setItem("selectedSeriesId", seriesId);
                  localStorage.setItem("currentPage", "seriesDetailPage");
                  localStorage.setItem(
                    "selectedSeriesItem",
                    JSON.stringify(selectedSeriesObj),
                  );
                  document.querySelector("#loading-progress").style.display =
                    "none";
                  Router.showPage("seriesDetail");
                },
                () => {
                  const currentCards = qsa(".series-card");
                  if (currentCards.length > 0) {
                    setSeriesFocus(
                      currentCards,
                      focusedSeriesCardIndex,
                      "focused",
                    );
                  }
                },
                currentPlaylist,
                "seriesPage",
              );
              return;
            }

            // Normal navigation for non-adult content
            if (selectedSeriesObj) {
              saveSeriesFocusState();
              localStorage.setItem("selectedSeriesId", seriesId);
              localStorage.setItem("currentPage", "seriesDetailPage");
              localStorage.setItem(
                "selectedSeriesItem",
                JSON.stringify(selectedSeriesObj),
              );
              document.querySelector("#loading-progress").style.display =
                "none";
              Router.showPage("seriesDetail");
            } else {
              alert("Series not found");
            }
          }
        }
      }

      // Reset the long press flag
      isSeriesLongPressExecuted = false;
    };

    document.addEventListener("click", seriesPageClickHandler);
    document.addEventListener("keydown", seriesPageKeydownHandler);
    document.addEventListener("keyup", seriesPageKeyupHandler);
    SeriesPage.cleanup = () => {
      document.removeEventListener("keydown", seriesPageKeydownHandler);
      document.removeEventListener("click", seriesPageClickHandler);
      document.removeEventListener("keyup", seriesPageKeyupHandler);

      // Cleanup timers and animation frames for memory management
      if (seriesSearchDebounceTimer) {
        clearTimeout(seriesSearchDebounceTimer);
        seriesSearchDebounceTimer = null;
      }
      if (seriesRenderAnimationFrame) {
        cancelAnimationFrame(seriesRenderAnimationFrame);
        seriesRenderAnimationFrame = null;
      }
      if (seriesEnterPressTimer) {
        clearTimeout(seriesEnterPressTimer);
        seriesEnterPressTimer = null;
      }
    };

    const searchInput = qs("#series-header-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        // Clear previous debounce timer
        if (seriesSearchDebounceTimer) {
          clearTimeout(seriesSearchDebounceTimer);
        }

        // Debounce search input for performance
        seriesSearchDebounceTimer = setTimeout(async () => {
          const newQuery = e.target.value.trim();

          // Avoid re-processing same query
          if (newQuery === seriesSearchQuery) return;

          seriesSearchQuery = newQuery;

          if (seriesSearchQuery.trim()) {
            visibleSeriesCount = 30; // Limited for Tizen performance
            // Clear cache to force fresh search
            const selectedCategory = window.seriesCategories.find(
              (c) => c.id === selectedSeriesCategoryId,
            );
            if (selectedCategory) {
              delete selectedCategory._sortedCache;
              delete selectedCategory._lastSortValue;
            }
          } else {
            visibleSeriesCount = SERIES_PAGE_SIZE;
            // Reset to normal view when search is cleared
            seriesSearchQuery = "";
          }

          // Small delay to prevent UI freeze on Tizen
          await new Promise((resolve) => setTimeout(resolve, 100));

          await renderSeries();
          highlightActiveSeriesCategory();

          // Always focus on channels after search to maintain navigation
          focusSeriesChannels(focusedSeriesChannelIndex);
        }, SERIES_SEARCH_DEBOUNCE_DELAY);
      });
    }

    // Category Search Input Listener
    const catSearchElement = qs("#series-cat-search-input");
    if (catSearchElement) {
      catSearchElement.addEventListener("input", (e) => {
        seriesCategorySearchQuery = e.target.value;
        seriesCategoryChunk = 1; // Reset pagination on search
        // Re-render categories
        const catList = qs(".series-channels-list");
        if (catList)
          catList.innerHTML = renderSeriesCategories(
            filterSeriesCategoriesList().slice(
              0,
              seriesCategoryChunk * SERIES_PAGE_SIZE,
            ),
          );
        highlightActiveSeriesCategory();
      });
    }
  }, 0);

  // ========= Template =========
  return `<div class="seriespage-main-container">
    <div class="series-header">
      <div class="first-series-header">
        <img src="/assets/app-logo.png" alt="Logo" class="series-header-logo"/>
        <div class="series-header-time">


   ${DateTimeComponent()}
      </div>
      
   </div>
      <div class="second-series-header">
        <p class="series-header-title">Series</p>
        <div class="second-series-header-div">
          <div class="series-header-search">
            <input type="text" placeholder="Search Series" id="series-header-search" class="series-header-search-input"/>
            <img src="/assets/search-icon.png" alt="search" class="series-header-search-icon"/>
          </div>
          <div class="series-header-menu">
            <svg width="14" height="58" viewBox="0 0 14 58" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="7" cy="7" r="7" fill="white"/>
              <circle cx="7" cy="29" r="7" fill="white"/>
              <circle cx="7" cy="51" r="7" fill="white"/>
            </svg>
                     <div class="sidebar-container-series" style="display: none;">
  ${Sidebar({ from: "seriesPage", onSort: () => console.log("Sorting...") })}
  </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="series-category-controls">
      <div class="series-cat-toggle-btn" tabindex="0">
        <span class="series-cat-toggle-text">Select Categories</span>
        <i class="fas fa-chevron-down series-cat-toggle-icon"></i>
      </div>
      <div class="series-cat-search-container">
        <i class="fas fa-search series-cat-search-icon"></i>
        <input type="text" id="series-cat-search-input" placeholder="Search categories" />
      </div>
    </div>

    <div class="series-content-container"></div>
  </div>`;
}
