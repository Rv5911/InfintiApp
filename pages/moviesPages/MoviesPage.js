function MoviesPage() {
  let selectedCategoryId = null;
  let focusedChannelIndex = 0;
  let focusedCardIndex = 0;
  let inChannelList = true;
  let inSearch = false;
  let inMenu = false;
  let inControls = false;
  let isSidebarVisible = false; // Default hidden
  let searchCategoryQuery = "";
  let searchQuery = "";
  const categoryFocusMap = new Map();
  const unlockedMovieAdultCatIds = new Set();
  let isLongPressExecuted = false;
  let isRenderingCards = false; // Flag to prevent navigation during card rendering

  const saveMoviesFocusState = () => {
    localStorage.setItem("moviesCategoryIndex", focusedChannelIndex);
    localStorage.setItem("moviesCardIndex", focusedCardIndex);
    localStorage.setItem("moviesSelectedCategoryId", selectedCategoryId);
    localStorage.setItem("moviesSidebarVisible", isSidebarVisible);
  };
  let moviesToShow = [];
  let adultsCategories = [];

  let selectedCardForDropdown = null;
  let isDropdownOpen = false;
  let isCatSearchFocused = false;
  const LONG_PRESS_DURATION = 500;
  let enterPressTimer = null;

  const loadMoreSearchResults = () => {
    if (!searchQuery.trim() || !selectedCategoryId) return;

    const selectedCategory = window.moviesCategories.find(
      (c) => c.id === selectedCategoryId,
    );
    if (!selectedCategory || !selectedCategory._sortedCache) return;

    const currentVisible = moviesToShow.length;
    const totalAvailable = selectedCategory._sortedCache.length;

    if (currentVisible < totalAvailable) {
      visibleCount = Math.min(currentVisible + 15, totalAvailable);

      setTimeout(() => {
        renderCardsChunked(selectedCategory);
      }, 50);
    }
  };
  const isMovieAdultCategory = (name) => {
    const normalized = (name || "").trim().toLowerCase();
    const configured = Array.isArray(adultsCategories) ? adultsCategories : [];
    if (configured.includes(normalized)) return true;
    return /(adult|xxx|18\+|18\s*plus|sex|porn|nsfw)/i.test(normalized);
  };

  const isMovieAdult = (movie) => {
    if (!movie) return false;

    // Check if movie belongs to any adult category
    const movieCategoryIds = new Set();
    if (movie.category_id != null)
      movieCategoryIds.add(Number(movie.category_id));
    if (Array.isArray(movie.category_ids)) {
      for (const cid of movie.category_ids) movieCategoryIds.add(Number(cid));
    }

    // Check if any of the movie's categories are adult categories
    for (const catId of movieCategoryIds) {
      const category = window.moviesCategories.find((c) => c.id === catId);
      if (category && isMovieAdultCategory(category.name)) {
        return true;
      }
    }

    return false;
  };

  const shouldBlurAdultCard = (movie) => {
    // Don't blur if the adult category is already unlocked
    const currentCategory = window.moviesCategories.find(
      (c) => c.id === selectedCategoryId,
    );
    if (currentCategory && isMovieAdultCategory(currentCategory.name)) {
      const isUnlocked = unlockedMovieAdultCatIds.has(
        String(selectedCategoryId),
      );
      return !isUnlocked; // Only blur if category is locked
    }

    // Only blur adult cards in these special categories
    const shouldBlurInCategory = [-3, -1, -2].includes(selectedCategoryId); // All, Favorites, Continue Watching

    return shouldBlurInCategory && isMovieAdult(movie);
  };

  let visibleCount = 100;
  let categoryChunk = 1;
  const PAGE_SIZE = 100;

  const currentPlaylistName = JSON.parse(
    localStorage.getItem("selectedPlaylist"),
  ).playlistName;
  const currentPlaylist = JSON.parse(
    localStorage.getItem("playlistsData"),
  ).filter((pl) => pl.playlistName === currentPlaylistName)[0];

  const favoritesMoviesIds = Array.isArray(currentPlaylist.favouriteMovies)
    ? currentPlaylist.favouriteMovies
    : [];

  const allFavoritesMovies = window.allMoviesStreams.filter((m) =>
    favoritesMoviesIds.includes(m.stream_id),
  );

  const allContiueWatchMovies = (() => {
    // Check if continueWatchingMovies exists in localStorage
    const continueWatchingData = currentPlaylist.continueWatchingMovies || [];

    if (
      !Array.isArray(continueWatchingData) ||
      continueWatchingData.length === 0
    ) {
      return []; // Return empty array if no continue watching data exists
    }

    // Get the limit from localStorage, default to showing all if not specified
    const continueLimit = parseInt(currentPlaylist.continueLimit) || 0;

    // Process movies that are in the continueWatchingMovies array
    const continueMovies = window.allMoviesStreams
      .map((m) => {
        const cw = continueWatchingData.find(
          (item) => Number(item.itemId) === Number(m.stream_id),
        );

        if (cw) {
          const duration = Number(cw.duration) || 0;
          const resumeTime = Number(cw.resumeTime) || 0;
          const progress =
            duration > 0
              ? Math.min(100, Math.floor((resumeTime / duration) * 100))
              : 0;

          return {
            ...m,
            progress,
          };
        }
        return null;
      })
      .filter(Boolean);

    // Apply limit only if continueLimit is greater than 0
    if (continueLimit > 0) {
      return continueMovies.slice(0, continueLimit);
    } else {
      return continueMovies; // Return all if no limit or limit is 0
    }
  })();

  const qsa = (s) => [...document.querySelectorAll(s)];
  const qs = (s) => document.querySelector(s);
  const setFlags = (ch, se, me, co) => {
    inChannelList = ch;
    inSearch = se;
    inMenu = me;
    inControls = co;
  };

  const highlightActiveCategory = () =>
    qsa(".movie-channel-category").forEach((el) =>
      el.classList.toggle(
        "movie-channel-category-active",
        Number(el.dataset.categoryId) === Number(selectedCategoryId),
      ),
    );

  const clearHeaderFocus = () => {
    const searchEl = qs("#movies-header-search");
    const menuEl = qs(".movies-header-menu");
    const toggleBtn = qs(".movies-cat-toggle-btn");
    const catSearch = qs(".movies-cat-search-container");
    const catSearchInput = qs("#movies-cat-search-input");

    if (searchEl)
      searchEl.classList.remove("movies-header-search-input-focused");
    if (menuEl) menuEl.classList.remove("movies-header-menu-focused");
    if (toggleBtn) {
      toggleBtn.classList.remove("focused");
      toggleBtn.blur();
    }
    if (catSearch) catSearch.classList.remove("focused");
    if (catSearchInput) catSearchInput.blur();
  };

  let isProcessingData = false;
  const CHUNK_SIZE = 50; // Reduced chunk size for low-end devices
  const MAX_VISIBLE_CARDS = 15; // Limit visible cards for performance
  const SEARCH_DEBOUNCE_DELAY = 300; // Debounce search input
  let searchDebounceTimer = null;
  let renderAnimationFrame = null;

  async function loadCategoryMovies(categoryId) {
    const category = window.moviesCategories.find((c) => c.id === categoryId);
    if (!category || category.movies.length > 0) return category;

    if (categoryId === -1 || categoryId === -2 || categoryId === -3)
      return category;

    const allMovies = Array.isArray(window.allMoviesStreams)
      ? window.allMoviesStreams
      : [];
    const categoryMovies = [];

    // Process in smaller chunks to prevent freezing
    const PROCESS_CHUNK = 100;
    for (let i = 0; i < allMovies.length; i += PROCESS_CHUNK) {
      const chunk = allMovies.slice(i, i + PROCESS_CHUNK);

      for (const m of chunk) {
        const ids = new Set();
        if (m.category_id != null) ids.add(Number(m.category_id));
        if (Array.isArray(m.category_ids)) {
          for (const cid of m.category_ids) ids.add(Number(cid));
        }

        if (ids.has(categoryId)) {
          if (!categoryMovies.some((x) => x.stream_id === m.stream_id)) {
            categoryMovies.push(m);
          }
        }
      }

      // Yield to browser every chunk
      if (i + PROCESS_CHUNK < allMovies.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    category.movies = categoryMovies;
    return category;
  }

  async function renderCardsChunked(selectedCategory) {
    isRenderingCards = true; // Block navigation during rendering
    const currentCardsContainer = qs(".movies-cards-list-container");
    if (
      !currentCardsContainer ||
      !selectedCategory ||
      !selectedCategory.movies
    ) {
      isRenderingCards = false;
      return;
    }

    const isAdultSelectedAgain = isMovieAdultCategory(
      selectedCategory && selectedCategory.name,
    );
    const parentalLockEnabledAgain = !!currentPlaylist.parentalPassword;
    const isUnlockedAgain = unlockedMovieAdultCatIds.has(
      String(selectedCategoryId),
    );

    if (parentalLockEnabledAgain && isAdultSelectedAgain && !isUnlockedAgain) {
      currentCardsContainer.innerHTML = `
      <div class="movie-no-data">
        <p>Locked Category. Enter PIN to unlock.</p>
      </div>`;
      highlightActiveCategory();
      if (inChannelList) {
        setFocus(
          qsa(".movie-channel-category"),
          focusedChannelIndex,
          "movie-channel-category-focused",
        );
      }
      return;
    }

    // CACHE sorted movies on the category object to avoid re-sorting
    if (
      !selectedCategory._sortedCache ||
      selectedCategory._lastSortValue !== localStorage.getItem("movieSortValue")
    ) {
      selectedCategory._sortedCache = sortMovies(selectedCategory.movies || []);
      selectedCategory._lastSortValue = localStorage.getItem("movieSortValue");
    }

    if (searchQuery.trim()) {
      moviesToShow = (selectedCategory._sortedCache || []).slice(
        0,
        Math.max(visibleCount, 30),
      );
    } else {
      moviesToShow = selectedCategory._sortedCache.slice(0, visibleCount);
    }

    if (!moviesToShow.length) {
      const container = document.querySelector(".movies-cards-list-container");
      if (container) {
        container.style.display = "flex";
        container.innerHTML = `
            <div class="movie-no-data">
              <p>No results found for "${
                searchQuery.trim() || selectedCategory.name
              }"</p>
            </div>
          `;
      }
      // Force focus back to categories since no cards are available
      focusChannels(focusedChannelIndex);
      isRenderingCards = false;
      return;
    }

    const container = document.querySelector(".movies-cards-list-container");
    if (container) {
      container.style.display = "grid";
    }

    const showFavHeartIcon = Number(selectedCategoryId) === -1;

    // Clear container
    currentCardsContainer.innerHTML = "";

    // Increase chunk size for better performance (less iterations)
    const CARD_CHUNK_SIZE = 8; // Increased from 4

    let currentIndex = 0;

    const renderNextChunk = () => {
      if (currentIndex >= moviesToShow.length) {
        highlightActiveCategory();
        if (inChannelList) {
          setFocus(
            qsa(".movie-channel-category"),
            focusedChannelIndex,
            "movie-channel-category-focused",
          );
        }
        isRenderingCards = false; // Re-enable navigation after rendering completes
        return;
      }

      const chunk = moviesToShow.slice(
        currentIndex,
        currentIndex + CARD_CHUNK_SIZE,
      );
      const fragment = document.createDocumentFragment();

      chunk.forEach((m) => {
        const isFav = favoritesMoviesIds.includes(m.stream_id);
        const showHeart = showFavHeartIcon || isFav;
        const isAdultMovie = isMovieAdult(m);
        const parentalLockEnabled = !!currentPlaylist.parentalPassword;
        const shouldBlur = parentalLockEnabled && shouldBlurAdultCard(m);
        const showLockIcon = shouldBlur;

        const cardDiv = document.createElement("div");
        cardDiv.className = "movies-card";
        cardDiv.dataset.movieId = m.stream_id;
        cardDiv.dataset.movieTitle = m.name;

        if (shouldBlur) {
          cardDiv.classList.add("movie-card-blurred");
        }

        const imgSrc = m.stream_icon || "/assets/noImageFound.png";
        const rating = isNaN(m.rating_5based)
          ? 0
          : Math.min(5, parseInt(m.rating_5based, 10));
        const progressHtml =
          typeof m.progress === "number"
            ? `<div class="movie-progress-overlay"><div class="movie-progress-fill" style="width:${m.progress}%;"></div></div>`
            : "";
        const heartHtml = showHeart
          ? '<img src="/assets/heart-icon.png" alt="heart-icon" loading="lazy" class="movie-card-heart-icon"/>'
          : "";
        const lockHtml = showLockIcon
          ? '<i class="fas fa-lock movie-card-lock-icon"></i>'
          : "";

        cardDiv.innerHTML = `
        <div class="movie-card-image-wrapper">
          <img src="${imgSrc}" alt="${m.name}" 
               onerror="this.onerror=null; this.src='/assets/noImageFound.png';" 
               loading="lazy" class="movies-card-img ${
                 shouldBlur ? "blurred-image" : ""
               }"/>
          ${progressHtml}
        </div>
        <div class="movie-card-bottom-content ${
          shouldBlur ? "blurred-text" : ""
        }">
          <p class="movies-card-title"><span data-title="${m.name}">${
            m.name
          }</span></p>
          <p class="movies-card-description">${m.name}</p>
        </div>
        <div class="movie-card-top-content">
          <p class="movie-card-rating ${
            shouldBlur ? "blurred-text" : ""
          }">${rating}</p>
          ${heartHtml}
          ${lockHtml}
        </div>
      `;

        fragment.appendChild(cardDiv);
      });

      currentCardsContainer.appendChild(fragment);
      currentIndex += CARD_CHUNK_SIZE;

      // Reduce delay between chunks for faster rendering
      setTimeout(() => {
        renderAnimationFrame = requestAnimationFrame(renderNextChunk);
      }, 10); // Reduced from 20ms
    };

    renderAnimationFrame = requestAnimationFrame(renderNextChunk);
  }

  async function processData() {
    try {
      if (isProcessingData) return;
      isProcessingData = true;

      const rawCategories = Array.isArray(window.moviesCategories)
        ? window.moviesCategories
        : [];
      const allMovies = Array.isArray(window.allMoviesStreams)
        ? window.allMoviesStreams
        : [];

      // Just prepare categories without processing movies
      const categoriesWithMovies = rawCategories.map((c) => {
        const idNum = Number(c.category_id || c.id);
        return {
          id: idNum,
          name: c.category_name || c.name || `Cat ${idNum}`,
          parent_id: c.parent_id || 0,
          movies: [], // Empty initially - will be populated on demand
          _movieCount: 0, // Track count without loading movies
        };
      });

      // Calculate movie counts for each category without loading movies
      for (const m of allMovies) {
        const ids = new Set();
        if (m.category_id != null) ids.add(Number(m.category_id));
        if (Array.isArray(m.category_ids)) {
          for (const cid of m.category_ids) ids.add(Number(cid));
        }

        for (const cid of ids) {
          const cat = categoriesWithMovies.find((c) => c.id === cid);
          if (cat) {
            cat._movieCount++;
          }
        }
      }

      // Create special categories
      const favoritesCategory = {
        id: -1,
        name: "Favorites",
        parent_id: 0,
        movies: Array.isArray(allFavoritesMovies) ? allFavoritesMovies : [],
        _movieCount: Array.isArray(allFavoritesMovies)
          ? allFavoritesMovies.length
          : 0,
      };

      const continueCategory = {
        id: -2,
        name: "Continue Watching",
        parent_id: 0,
        movies: allContiueWatchMovies, // This now uses the limited array
        _movieCount: allContiueWatchMovies.length, // This reflects the actual count after limiting
      };

      const allMoviesCategory = {
        id: -3,
        name: "All",
        parent_id: 0,
        movies: Array.isArray(window.allMoviesStreams)
          ? window.allMoviesStreams
          : [],
        _movieCount: Array.isArray(window.allMoviesStreams)
          ? window.allMoviesStreams.length
          : 0,
      };

      const specialCategories = [
        allMoviesCategory,
        favoritesCategory,
        continueCategory,
      ];

      const cleanedCategories = categoriesWithMovies.filter(
        (c) => c.id !== -1 && c.id !== -2 && c.id !== -3,
      );

      window.moviesCategories = [...specialCategories, ...cleanedCategories];
      window.allMovies = allMovies;

      const firstWithMovies = window.moviesCategories.find(
        (c) => c._movieCount > 0,
      );
      selectedCategoryId = -3;

      isProcessingData = false;
    } catch (err) {
      console.error("Error loading movies page:", err);
      isProcessingData = false;

      const container = document.querySelector(".movies-content-container");
      if (container) {
        container.innerHTML = `
        <div class="movie-no-data">
          <p>Failed to load Movies. Please try again.</p>
        </div>`;
      }
    }
  }

  // Helper function to sync favorites data
  function syncFavoritesData() {
    const playlist = JSON.parse(localStorage.getItem("playlistsData")).find(
      (pl) => pl.playlistName === currentPlaylistName,
    );

    if (playlist) {
      // Update global favorites array
      favoritesMoviesIds.length = 0;
      favoritesMoviesIds.push(...(playlist.favouriteMovies || []));

      // Update favorites category
      const favCategory = window.moviesCategories.find((c) => c.id === -1);
      if (favCategory) {
        const updatedFavMovies = window.allMoviesStreams.filter((m) =>
          favoritesMoviesIds.includes(m.stream_id),
        );
        favCategory.movies = updatedFavMovies;
        favCategory._movieCount = updatedFavMovies.length;
        delete favCategory._sortedCache;
        delete favCategory._lastSortValue;
      }
    }
  }

  // ========= Helpers =========
  function scrollToElement(el, align = "center") {
    const container =
      el.closest(".movies-cards-list-container") ||
      el.closest(".movies-channels-list");
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

  function setFocus(list, idx, cls) {
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
      if (cls === "focused" && el.classList.contains("movies-card") && arr[0]) {
        if (el.offsetTop === arr[0].offsetTop) {
          el.classList.add("first-row-card");
        }

        // IMPROVED MARQUEE: Set dynamic duration based on title width
        const titleSpan = el.querySelector(".movies-card-title span");
        if (titleSpan) {
          const scrollWidth = titleSpan.scrollWidth;
          const clientWidth = titleSpan.clientWidth;
          if (scrollWidth > clientWidth + 2) {
            // Added 2px buffer
            // "slightly fast" - base speed 45px/s (adjust as needed)
            const duration = (scrollWidth / 45).toFixed(2);
            titleSpan.style.setProperty("--marquee-duration", `${duration}s`);
            titleSpan.classList.add("marquee");
          } else {
            titleSpan.classList.remove("marquee");
          }
        }
      }

      if (cls === "movie-channel-category-focused") {
        const nameSpan = el.querySelector(".movie-channel-category-name span");
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
        el.closest(".movies-cards-list-container") ||
        el.closest(".movies-channels-list");
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
  const renderCardDropdown = (cardElement, movieId) => {
    const isFav = favoritesMoviesIds.includes(movieId);
    const isContinueWatchingCategory = selectedCategoryId === -2;

    // Check if movie is actually in continue watching list
    const isInContinueWatching = (
      currentPlaylist.continueWatchingMovies || []
    ).some((item) => Number(item.itemId) === Number(movieId));

    const dropdown = document.createElement("div");
    dropdown.className = "movie-card-dropdown";

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

      // Only show "Remove from Continue Watching" if movie is actually in continue watching
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
      if (!isDropdownOpen) return;

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
        handleDropdownAction(action, movieId);
        closeDropdown();
        return;
      }

      if (isBack) {
        e.preventDefault();
        closeDropdown(); // closeDropdown now handles restoring focus
        return;
      }
    };

    document.addEventListener("keydown", dropdownKeyHandler);

    // Store reference for cleanup
    dropdown._keyHandler = dropdownKeyHandler;

    return dropdown;
  };

  const closeDropdown = () => {
    const dropdown = document.querySelector(".movie-card-dropdown");
    if (dropdown) {
      if (dropdown._keyHandler) {
        document.removeEventListener("keydown", dropdown._keyHandler);
      }
      dropdown.remove();
    }
    isDropdownOpen = false;

    // Get current cards after any potential removals
    const currentCards = qsa(".movies-card");

    if (currentCards.length > 0) {
      // There are cards available
      if (
        selectedCardForDropdown &&
        document.body.contains(selectedCardForDropdown)
      ) {
        // Original card still exists, focus on it
        const cardIndex = Array.from(currentCards).indexOf(
          selectedCardForDropdown,
        );
        if (cardIndex >= 0) {
          focusedCardIndex = cardIndex;
          setFocus(currentCards, focusedCardIndex, "focused");
          setFlags(false, false, false);
        }
      } else {
        // Original card was removed, focus on nearest valid card
        focusedCardIndex = Math.min(focusedCardIndex, currentCards.length - 1);
        focusedCardIndex = Math.max(0, focusedCardIndex);
        setFocus(currentCards, focusedCardIndex, "focused");
        setFlags(false, false, false);
      }
    } else {
      // No cards left, focus back on categories
      setFlags(true, false, false);
      const categories = qsa(".movie-channel-category");
      if (categories.length > 0) {
        setFocus(
          categories,
          focusedChannelIndex,
          "movie-channel-category-focused",
        );
      }
    }

    selectedCardForDropdown = null;
  };

  const handleDropdownAction = (action, movieId) => {
    switch (action) {
      case "add-fav":
        toggleFavoriteItem(movieId, "favouriteMovies");
        break;
      case "remove-fav":
        toggleFavoriteItem(movieId, "favouriteMovies");
        break;
      case "remove-continue":
        removeFromContinueWatching(movieId);
        break;
    }

    // Sync data and refresh UI
    syncFavoritesData();

    // Update the heart icon on the current card
    const currentCards = qsa(".movies-card");
    const currentCard = currentCards.find(
      (card) => Number(card.dataset.movieId) === Number(movieId),
    );

    if (currentCard) {
      const isFav = favoritesMoviesIds.includes(movieId);
      const heartIcon = currentCard.querySelector(".movie-card-heart-icon");
      const topContent = currentCard.querySelector(".movie-card-top-content");

      if (isFav && !heartIcon && topContent) {
        // Add heart icon if favorited
        const heartImg = document.createElement("img");
        heartImg.src = "/assets/heart-icon.png";
        heartImg.alt = "heart-icon";
        heartImg.className = "movie-card-heart-icon";
        heartImg.loading = "lazy";
        topContent.appendChild(heartImg);
      } else if (!isFav && heartIcon) {
        // Remove heart icon if unfavorited
        heartIcon.remove();
      }
    }

    // Update favorites category count
    const favCategory = window.moviesCategories.find((c) => c.id === -1);
    if (favCategory) {
      const favCatEl = qs('.movie-channel-category[data-category-id="-1"]');
      if (favCatEl) {
        const countEl = favCatEl.querySelector(".movie-channel-category-count");
        if (countEl) {
          countEl.textContent = favCategory.movies.length;
        }
      }
    }
  };
  const removeFromContinueWatching = (movieId) => {
    try {
      // Get current playlists data
      const playlistsData = JSON.parse(localStorage.getItem("playlistsData"));
      const playlistIndex = playlistsData.findIndex(
        (pl) => pl.playlistName === currentPlaylistName,
      );

      if (playlistIndex === -1) return;

      const playlist = playlistsData[playlistIndex];

      // Remove from continue watching array
      if (playlist.continueWatchingMovies) {
        const originalLength = playlist.continueWatchingMovies.length;
        playlist.continueWatchingMovies =
          playlist.continueWatchingMovies.filter(
            (item) => Number(item.itemId) !== Number(movieId),
          );

        // Only proceed if something was actually removed
        if (playlist.continueWatchingMovies.length === originalLength) {
          console.log("Movie not found in continue watching list");
          return;
        }
      }

      // Update the specific playlist in the array
      playlistsData[playlistIndex] = playlist;

      // Save back to localStorage
      localStorage.setItem("playlistsData", JSON.stringify(playlistsData));

      // Update the continue watching category in memory
      const continueCategory = window.moviesCategories.find((c) => c.id === -2);
      if (continueCategory) {
        continueCategory.movies = continueCategory.movies.filter(
          (m) => Number(m.stream_id) !== Number(movieId),
        );
        continueCategory._movieCount = continueCategory.movies.length;
        delete continueCategory._sortedCache;
        delete continueCategory._lastSortValue;

        // Update UI count immediately
        const contCatEl = qs('.movie-channel-category[data-category-id="-2"]');
        if (contCatEl) {
          const countEl = contCatEl.querySelector(
            ".movie-channel-category-count",
          );
          if (countEl) {
            countEl.textContent = continueCategory.movies.length;
          }
        }
      }

      // Update global continue watching array
      const updatedContinueWatch =
        window.allMoviesStreams
          .map((m) => {
            const cw = (playlist.continueWatchingMovies || []).find(
              (item) => Number(item.itemId) === Number(m.stream_id),
            );
            if (cw) {
              const duration = Number(cw.duration) || 0;
              const resumeTime = Number(cw.resumeTime) || 0;
              const progress =
                duration > 0
                  ? Math.min(100, Math.floor((resumeTime / duration) * 100))
                  : 0;
              return {
                ...m,
                progress,
              };
            }
            return null;
          })
          .filter(Boolean) || [];

      // Update global variable
      window.allContiueWatchMovies = updatedContinueWatch;

      Toaster.showToast("success", "Removed from Continue Watching");

      // Refresh sidebar if it's open to update "Clear Continue Watching" visibility
      const currentPage = localStorage.getItem("currentPage");
      const sidebarPage = localStorage.getItem("sidebarPage");
      if (currentPage === "sidebar" && sidebarPage === "moviesPage") {
        // Close and reopen sidebar to refresh the content
        closeSidebar("moviesPage");
        setTimeout(() => {
          openSidebar("moviesPage");
        }, 10);
      }

      // If we're currently in continue watching category, refresh immediately
      if (selectedCategoryId === -2) {
        // Remove the specific card from DOM immediately
        const cardToRemove = qs(`.movies-card[data-movie-id="${movieId}"]`);
        if (cardToRemove) {
          const wasFocused = cardToRemove.classList.contains("focused");
          cardToRemove.remove();

          // Handle focus after removal
          const remainingCards = qsa(".movies-card");
          if (remainingCards.length > 0 && wasFocused) {
            focusedCardIndex = Math.min(
              focusedCardIndex,
              remainingCards.length - 1,
            );
            setFocus(remainingCards, focusedCardIndex, "focused");
          } else if (remainingCards.length === 0) {
            // No cards left, show no data message
            const cardsContainer = qs(".movies-cards-list-container");
            if (cardsContainer) {
              cardsContainer.style.display = "flex";
              cardsContainer.innerHTML = `
          <div class="movie-no-data">
            <p>No movies in Continue Watching</p>
          </div>`;
            }
            setFlags(true, false, false);
            setFocus(
              qsa(".movie-channel-category"),
              focusedChannelIndex,
              "movie-channel-category-focused",
            );
          }
        }

        // Update category count in sidebar
        const continueWatchingEl = qs(
          '.movie-channel-category[data-category-id="-2"]',
        );
        if (continueWatchingEl) {
          const countEl = continueWatchingEl.querySelector(
            ".movie-channel-category-count",
          );
          if (countEl) countEl.textContent = continueCategory.movies.length;
        }
      }
    } catch (error) {
      console.error("Error removing from continue watching:", error);
      Toaster.showToast("error", "Failed to remove from Continue Watching");
    }
  };
  const focusSearch = () => {
    clearHeaderFocus();
    setFlags(false, true, false);
    const searchEl = qs("#movies-header-search");
    if (searchEl) searchEl.classList.add("movies-header-search-input-focused");
  };

  const focusMenu = () => {
    clearHeaderFocus();
    setFlags(false, false, true);
    const menuEl = qs(".movies-header-menu");
    if (menuEl) menuEl.classList.add("movies-header-menu-focused");
  };

  function focusChannels(idx = 0) {
    clearHeaderFocus();
    setFlags(true, false, false);
    const channelList = qsa(".movie-channel-category");
    if (!channelList.length) return;

    // Skip blurred (locked) categories when navigating
    let validIndex = idx;
    const validChannels = channelList.filter((cat, index) => {
      return !cat.classList.contains("movie-category-blurred");
    });

    if (validChannels.length > 0) {
      // Find the index in the original array that corresponds to the first valid channel
      validIndex = Array.from(channelList).indexOf(
        validChannels[Math.min(idx, validChannels.length - 1)],
      );
    } else {
      validIndex = 0;
    }

    setFocus(
      channelList,
      (focusedChannelIndex = Math.max(
        0,
        Math.min(validIndex, channelList.length - 1),
      )),
      "movie-channel-category-focused",
    );
  }

  function focusCards(idx = 0) {
    clearHeaderFocus();
    setFlags(false, false, false, false);
    const cards = qsa(".movies-card");
    if (!cards.length) return;

    let validIndex = idx;

    // override removed to respect validIndex/idx
    // was: validIndex = 0;

    // Restore last focused index if available
    if (categoryFocusMap.has(selectedCategoryId)) {
      const savedIndex = categoryFocusMap.get(selectedCategoryId);
      if (savedIndex >= 0 && savedIndex < cards.length) {
        validIndex = savedIndex;
      }
    }

    if (validIndex >= 0 && validIndex < cards.length) {
      setFocus(cards, (focusedCardIndex = validIndex), "focused");
    } else {
      // No cards to focus, go back to categories or controls
      if (isSidebarVisible) {
        focusChannels(focusedChannelIndex);
      } else {
        focusToggleBtn();
      }
    }
  }

  const focusToggleBtn = () => {
    clearHeaderFocus();
    setFlags(false, false, false, true); // inControls
    const btn = qs(".movies-cat-toggle-btn");
    const searchContainer = qs(".movies-cat-search-container");
    if (btn) {
      btn.focus();
      btn.classList.add("focused");
    }
    if (searchContainer) {
      searchContainer.classList.remove("focused");
    }
    isCatSearchFocused = false;
  };

  // ========= Data → UI =========
  const getFilteredCategories = async () => {
    const cats = window.moviesCategories || [];

    // If no search query, return all categories
    if (!searchQuery.trim()) return cats;

    if (!selectedCategoryId) return [];

    const selectedCategory = cats.find((c) => c.id === selectedCategoryId);
    if (!selectedCategory) return [];

    const q = searchQuery.toLowerCase().trim();

    try {
      // Ensure we have movies loaded for the selected category
      const loadedCategory = await loadCategoryMovies(selectedCategoryId);
      if (!loadedCategory || !loadedCategory.movies) return [];

      // Filter movies based on search query
      const filteredMovies = loadedCategory.movies.filter(
        (movie) => movie && movie.name && movie.name.toLowerCase().includes(q),
      );

      if (filteredMovies.length === 0) return [];

      // Return a temporary category with filtered results
      return [
        {
          ...selectedCategory,
          movies: filteredMovies,
          _movieCount: filteredMovies.length,
        },
      ];
    } catch (error) {
      console.error("Error filtering categories:", error);
      return [];
    }
  };

  const renderCategories = (filtered) =>
    (filtered || [])
      .map((c) => {
        const catIdStr = String(c.id);
        const isAdultCat = isMovieAdultCategory(c.name);
        const parentalLockEnabled = !!currentPlaylist.parentalPassword;
        const isCatUnlocked = unlockedMovieAdultCatIds.has(catIdStr);

        // ADD BLUR LOGIC FOR ADULT CATEGORIES
        const shouldBlur = parentalLockEnabled && isAdultCat && !isCatUnlocked;
        const blurClass = shouldBlur ? "movie-category-blurred" : "";

        return `
      <div class="movie-channel-category-container">
        <div class="movie-channel-category ${
          c.id === selectedCategoryId ? "movie-channel-category-active" : ""
        } ${blurClass}" data-category-id="${c.id}" data-category-name="${
          c.name
        }">
          ${
            parentalLockEnabled && isAdultCat && !isCatUnlocked
              ? '<i class="fas fa-lock movie-category-lock-icon"></i>'
              : ""
          }
          <p class="movie-channel-category-name"><span data-title="${c.name}">${
            c.name
          }</span></p> 
          <p class="movie-channel-category-count">${
            c._movieCount || c.movies.length
          }</p>
        </div>
      </div>`;
      })
      .join("");

  function sortMovies(movies) {
    const sortValue = localStorage.getItem("movieSortValue") || "default";

    // Helper function to categorize movies for special character handling
    const categorizeMovie = (movieName) => {
      if (!movieName || movieName.trim().length === 0) return "special";

      const firstChar = movieName.trim().charAt(0).toLowerCase();

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
        return [...movies].sort((a, b) => {
          const tA = new Date(a.added || a.created_at || 0).getTime();
          const tB = new Date(b.added || b.created_at || 0).getTime();
          return tB - tA; // newest first
        });

      case "az":
        return [...movies].sort((a, b) => {
          const aName = a.name || "";
          const bName = b.name || "";

          const aCategory = categorizeMovie(aName);
          const bCategory = categorizeMovie(bName);

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
        return [...movies].sort((a, b) => {
          const aName = a.name || "";
          const bName = b.name || "";

          const aCategory = categorizeMovie(aName);
          const bCategory = categorizeMovie(bName);

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
        return [...movies].sort(
          (a, b) => (b.rating_5based || 0) - (a.rating_5based || 0),
        );

      default:
        return movies; // keep API order
    }
  }

  const toggleSidebar = (visible) => {
    isSidebarVisible = visible;
    const sidebar = qs(".movies-channels-list");
    const cardsContainer = qs(".movies-cards-list-container");
    const toggleIcon = qs(".movies-cat-toggle-icon");
    const searchContainer = qs(".movies-cat-search-container");
    const toggleBtn = qs(".movies-cat-toggle-btn");

    if (sidebar)
      sidebar.classList.toggle("movies-channels-hidden", !isSidebarVisible);
    if (cardsContainer)
      cardsContainer.classList.toggle(
        "movies-cards-full-width",
        !isSidebarVisible,
      );

    if (toggleBtn) {
      toggleBtn.classList.toggle("sidebar-open", isSidebarVisible);
    }

    if (toggleIcon) {
      toggleIcon.className = isSidebarVisible
        ? "fas fa-chevron-up movies-cat-toggle-icon"
        : "fas fa-chevron-down movies-cat-toggle-icon";
    }

    // Search container is now always visible
  };

  const filterCategoriesList = () => {
    const cats = window.moviesCategories || [];
    if (!searchCategoryQuery.trim()) return cats;
    const q = searchCategoryQuery.toLowerCase().trim();
    return cats.filter((c) => c.name.toLowerCase().includes(q));
  };

  // ========= UPDATED renderMovies =========
  async function renderMovies() {
    const container = qs(".movies-content-container");
    if (!container) return;

    // FIXED: Properly await the filtered categories
    const filtered = await getFilteredCategories();

    // FIXED: Handle empty search results properly
    if (
      searchQuery.trim() &&
      (!Array.isArray(filtered) || filtered.length === 0)
    ) {
      const selectedCategory = window.moviesCategories.find(
        (c) => c.id === selectedCategoryId,
      );
      const categoryName = selectedCategory
        ? selectedCategory.name
        : "this category";

      container.innerHTML = `
      <div class="movies-channels-list">
        ${renderCategories(window.moviesCategories || [])}
      </div>
      <div class="movies-cards-list-container" style="display: flex;">
        <div class="movie-no-data">
          <p>No results found for "${searchQuery.trim()}" in ${categoryName}</p>
        </div>
      </div>`;

      highlightActiveCategory();
      if (inChannelList) {
        setFocus(
          qsa(".movie-channel-category"),
          focusedChannelIndex,
          "movie-channel-category-focused",
        );
      }
      return;
    }

    // FIXED: Use filtered results when available, otherwise use all categories
    const categoriesToShow =
      Array.isArray(filtered) && filtered.length > 0
        ? filtered
        : window.moviesCategories;
    let selectedCategory = null;

    // Select the appropriate category to display
    if (Array.isArray(categoriesToShow) && categoriesToShow.length > 0) {
      selectedCategory = categoriesToShow.find(
        (c) => c.id === selectedCategoryId,
      );
      if (!selectedCategory && categoriesToShow.length > 0) {
        selectedCategory = categoriesToShow[0];
        if (selectedCategory) {
          selectedCategoryId = selectedCategory.id;
        }
      }
    }

    if (!selectedCategory) {
      selectedCategory = window.moviesCategories.find(
        (c) => c.id === selectedCategoryId,
      );
    }

    let channelsList = qs(".movies-channels-list");
    let cardsContainer = qs(".movies-cards-list-container");

    // Build DOM if first time OR show spinner while loading
    if (!channelsList || !cardsContainer) {
      /* FIXED: Add initial visibility classes */
      const sidebarHiddenClass = !isSidebarVisible
        ? "movies-channels-hidden"
        : "";
      const cardsFullWidthClass = !isSidebarVisible
        ? "movies-cards-full-width"
        : "";

      container.innerHTML = `
      <div class="movies-channels-list ${sidebarHiddenClass}">
        ${renderCategories(categoriesToShow.slice(0, categoryChunk * PAGE_SIZE))}
      </div>
      <div class="movies-cards-list-container ${cardsFullWidthClass}">
        <div class="cards-loading-spinner"><div class="spinner"></div></div>
      </div>
    `;
    } else {
      // Update categories list - respect category search query
      // Also ensure sidebar visibility class is maintained
      const catList = qs(".movies-channels-list");
      catList.classList.toggle("movies-channels-hidden", !isSidebarVisible);
      catList.innerHTML = renderCategories(
        filterCategoriesList().slice(0, categoryChunk * PAGE_SIZE),
      );

      const cardsContainer = qs(".movies-cards-list-container");
      cardsContainer.classList.toggle(
        "movies-cards-full-width",
        !isSidebarVisible,
      );

      // Show spinner while loading new category
      cardsContainer.innerHTML = `<div class="cards-loading-spinner"><div class="spinner"></div></div>`;
    }

    // Adult category lock check
    const isAdultCurrentlySelected =
      selectedCategory && isMovieAdultCategory(selectedCategory.name);
    const parentalLockEnabled = !!currentPlaylist.parentalPassword;
    const isSelectedUnlocked = unlockedMovieAdultCatIds.has(
      String(selectedCategoryId),
    );

    if (
      parentalLockEnabled &&
      isAdultCurrentlySelected &&
      !isSelectedUnlocked
    ) {
      const lockedContainer = qs(".movies-cards-list-container");
      if (lockedContainer) {
        lockedContainer.innerHTML = `
        <div class="movie-no-data">
          <p>Locked Category. Enter PIN to unlock.</p>
        </div>`;
      }
      highlightActiveCategory();
      if (inChannelList) {
        setFocus(
          qsa(".movie-channel-category"),
          focusedChannelIndex,
          "movie-channel-category-focused",
        );
      }
      return;
    }

    // Load movies with spinner visible
    const isSearchMode = searchQuery.trim().length > 0;
    const loadedCategory =
      isSearchMode && selectedCategory
        ? selectedCategory
        : await loadCategoryMovies(selectedCategoryId);

    // Use requestIdleCallback if available, otherwise requestAnimationFrame
    if (window.requestIdleCallback) {
      requestIdleCallback(() => {
        renderCardsChunked(loadedCategory);
      });
    } else {
      requestAnimationFrame(() => {
        renderCardsChunked(loadedCategory);
      });
    }
  }
  window.renderMovies = renderMovies;
  // ========= Events =========
  function moviesPageClickHandler(e) {
    if (localStorage.getItem("currentPage") !== "moviesPage") return;

    // Category click logic
    const toggleBtn = e.target.closest(".movies-cat-toggle-btn");
    if (toggleBtn) {
      toggleSidebar(!isSidebarVisible);
      return;
    }

    const cat = e.target.closest(".movie-channel-category");
    if (cat) {
      searchQuery = "";
      const searchInput = qs("#movies-header-search");
      if (searchInput) searchInput.value = "";
      const catId = Number(cat.dataset.categoryId);
      const isAdultCat = isMovieAdultCategory(cat.dataset.categoryName);
      const isUnlocked = unlockedMovieAdultCatIds.has(String(catId));

      if (isAdultCat && !!currentPlaylist.parentalPassword && !isUnlocked) {
        ParentalPinDialog(
          async () => {
            unlockedMovieAdultCatIds.add(String(catId));
            selectedCategoryId = catId;
            focusedChannelIndex = qsa(".movie-channel-category").indexOf(cat);
            visibleCount = PAGE_SIZE;
            const lockEl = cat.querySelector(".movie-category-lock-icon");
            if (lockEl) lockEl.remove();

            // Show spinner immediately
            const cardsContainer = qs(".movies-cards-list-container");
            if (cardsContainer) {
              cardsContainer.innerHTML = `<div class="cards-loading-spinner"><div class="spinner"></div></div>`;
            }

            // Render with delay to show spinner
            setTimeout(async () => {
              await renderMovies();
              highlightActiveCategory();
              setTimeout(() => {
                const cards = qsa(".movies-card");
                if (cards.length) {
                  focusedCardIndex = 0;
                  setFocus(cards, focusedCardIndex, "focused");
                  setFlags(false, false, false);
                } else {
                  setFocus(
                    qsa(".movie-channel-category"),
                    focusedChannelIndex,
                    "movie-channel-category-focused",
                  );
                  setFlags(true, false, false);
                }
              }, 0);
            }, 10);
          },
          () => {
            setFocus(
              qsa(".movie-channel-category"),
              focusedChannelIndex,
              "movie-channel-category-focused",
            );
            setFlags(true, false, false);
          },
          currentPlaylist,
          "moviesPage",
        );
        return;
      }

      selectedCategoryId = catId;
      focusedChannelIndex = qsa(".movie-channel-category").indexOf(cat);
      visibleCount = PAGE_SIZE;

      const newCategory = window.moviesCategories.find((c) => c.id === catId);
      if (newCategory) {
        delete newCategory._sortedCache;
        delete newCategory._lastSortValue;
      }
      // Show spinner immediately
      const cardsContainer = qs(".movies-cards-list-container");
      if (cardsContainer) {
        cardsContainer.innerHTML = `<div class="cards-loading-spinner"><div class="spinner"></div></div>`;
      }

      // Render with delay to show spinner
      setTimeout(() => {
        renderMovies();
        highlightActiveCategory();
        setFocus(
          qsa(".movie-channel-category"),
          focusedChannelIndex,
          "movie-channel-category-focused",
        );
        setFlags(true, false, false);
      }, 10);
      return;
    }

    const card = e.target.closest(".movies-card");
    if (card && !isDropdownOpen) {
      const movieId = Number(card.dataset.movieId);
      const allMoviesData = window.allMovies || [];
      const selectedMovieObj = allMoviesData.find(
        (m) => Number(m.stream_id) === movieId,
      );

      if (selectedMovieObj) {
        const parentalLockEnabled = !!currentPlaylist.parentalPassword;
        const isAdultMovie = isMovieAdult(selectedMovieObj);
        const currentCategory = window.moviesCategories.find(
          (c) => c.id === selectedCategoryId,
        );
        const isAdultCategory =
          currentCategory && isMovieAdultCategory(currentCategory.name);
        const isAdultCategoryUnlocked = unlockedMovieAdultCatIds.has(
          String(selectedCategoryId),
        );

        const shouldAskForPin =
          parentalLockEnabled &&
          isAdultMovie &&
          ([-3, -1, -2].includes(selectedCategoryId) ||
            (isAdultCategory && !isAdultCategoryUnlocked));

        if (shouldAskForPin) {
          e.preventDefault();
          e.stopPropagation();

          ParentalPinDialog(
            () => {
              // Store current focus state before navigating
              saveMoviesFocusState();

              localStorage.setItem("selectedMovieId", movieId);
              localStorage.setItem("currentPage", "moviesDetailPage");
              localStorage.setItem(
                "selectedMovieData",
                JSON.stringify(selectedMovieObj),
              );
              document.querySelector("#loading-progress").style.display =
                "none";
              Router.showPage("movieDetail");
            },
            () => {
              const currentCards = qsa(".movies-card");
              if (currentCards.length > 0) {
                setFocus(currentCards, focusedCardIndex, "focused");
              }
            },
            currentPlaylist,
            "moviesPage",
          );
          return;
        } else {
          // Store current focus state before navigating
          saveMoviesFocusState();

          localStorage.setItem("selectedMovieId", movieId);
          localStorage.setItem("currentPage", "moviesDetailPage");
          localStorage.setItem(
            "selectedMovieData",
            JSON.stringify(selectedMovieObj),
          );
          document.querySelector("#loading-progress").style.display = "none";
          Router.showPage("movieDetail");
        }
      }
    }
  }

  // Show UI immediately, then load data
  setTimeout(() => {
    // Remove stale loader from other pages if it exists
    const staleLoader = document.getElementById("home-page-loader");
    if (staleLoader) staleLoader.remove();

    if (MoviesPage.cleanup) MoviesPage.cleanup();

    // Show loading state first
    const container = qs(".movies-content-container");
    if (container) {
      container.innerHTML = `
        <div class="movies-loading-spinner">
          <div class="spinner"></div>
        </div>
      `;
    }
    setTimeout(async () => {
      await processData();

      // Check if returning from detail page
      const savedCategoryId = localStorage.getItem("moviesSelectedCategoryId");
      const savedCategoryIndex = localStorage.getItem("moviesCategoryIndex");
      const savedCardIndex = localStorage.getItem("moviesCardIndex");

      if (
        savedCategoryId &&
        savedCategoryIndex !== null &&
        savedCardIndex !== null
      ) {
        // Restore sidebar state
        const savedSidebarVisible =
          localStorage.getItem("moviesSidebarVisible") === "true";
        if (savedSidebarVisible !== isSidebarVisible) {
          toggleSidebar(savedSidebarVisible);
        }

        // Restore the saved category and indices
        selectedCategoryId = Number(savedCategoryId);
        focusedChannelIndex = Number(savedCategoryIndex);
        focusedCardIndex = Number(savedCardIndex);

        // CREATE OVERLAY
        const overlayId = "movies-focus-restore-overlay";
        let overlay = document.getElementById(overlayId);
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = overlayId;
          overlay.style.cssText =
            "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 10000; display: flex; justify-content: center; align-items: center;";
          overlay.innerHTML = '<div class="spinner"></div>';
          document.body.appendChild(overlay);
        }

        // Calculate how many cards need to be visible to show the focused card
        const cardsNeededToShow = focusedCardIndex + 1;
        visibleCount = Math.max(
          PAGE_SIZE,
          Math.ceil(cardsNeededToShow / PAGE_SIZE) * PAGE_SIZE,
        );

        // Load the category movies first
        const categoryToLoad = await loadCategoryMovies(selectedCategoryId);

        // Render movies with enough cards visible
        await renderMovies();
        highlightActiveCategory();

        // Wait for cards to render using checking loop
        // Wait for cards to render using checking loop
        // Increased persistence to handle slow devices/large lists
        const checkAndFocus = (attempts = 0) => {
          const cards = qsa(".movies-card");
          const MAX_ATTEMPTS = 50; // 50 * 200ms = 10 seconds max wait

          if (cards.length > focusedCardIndex) {
            // FOUND IT
            setFocus(cards, focusedCardIndex, "focused");
            const card = cards[focusedCardIndex];
            if (card) {
              scrollToElement(card, "center");
            }
            setFlags(false, false, false);
            // REMOVE OVERLAY with slight delay for smooth transition
            setTimeout(() => {
              const overlay = document.getElementById(
                "movies-focus-restore-overlay",
              );
              if (overlay) overlay.remove();
            }, 300);
          } else if (attempts < MAX_ATTEMPTS) {
            // Retry (every 200ms)
            setTimeout(() => checkAndFocus(attempts + 1), 200);
          } else {
            // Fallback after timeout
            if (cards.length > 0) {
              // Focus last available
              focusedCardIndex = Math.min(focusedCardIndex, cards.length - 1);
              setFocus(cards, focusedCardIndex, "focused");
              const card = cards[focusedCardIndex];
              if (card) scrollToElement(card, "center");
            } else {
              focusChannels(focusedChannelIndex);
            }
            // REMOVE OVERLAY with slight delay
            setTimeout(() => {
              const overlay = document.getElementById(
                "movies-focus-restore-overlay",
              );
              if (overlay) overlay.remove();
            }, 300);
          }
        };

        checkAndFocus();

        // Clear saved data
        localStorage.removeItem("moviesSelectedCategoryId");
        localStorage.removeItem("moviesCategoryIndex");
        localStorage.removeItem("moviesCardIndex");
      } else {
        // Normal initialization - Focus on first card instead of search
        selectedCategoryId = -3; // Default to "All"
        focusedChannelIndex = 0;
        focusedCardIndex = 0;
        inChannelList = false; // Aim for card focus

        renderMovies();
        highlightActiveCategory();

        // Wait for cards to render and focus on the first one
        const initialFocusCheck = (attempts = 0) => {
          const cards = qsa(".movies-card");
          const MAX_ATTEMPTS = 30; // 6 seconds

          if (cards.length > 0) {
            setFocus(cards, 0, "focused");
            focusedCardIndex = 0;
            setFlags(false, false, false);
          } else if (attempts < MAX_ATTEMPTS) {
            setTimeout(() => initialFocusCheck(attempts + 1), 200);
          } else {
            // Fallback: If no cards appear (e.g. empty favorites), focus on category
            focusChannels(0);
          }
        };
        initialFocusCheck();
      }
    }, 10);

    function toggleFavoriteItem(movieId, listKey = "favouriteMovies") {
      // Only work on movies page
      if (localStorage.getItem("currentPage") !== "moviesPage") return;

      const playlist = JSON.parse(localStorage.getItem("playlistsData")).find(
        (pl) => pl.playlistName === currentPlaylistName,
      );
      if (!playlist) return;

      playlist[listKey] = playlist[listKey] || [];
      const index = playlist[listKey].indexOf(movieId);
      const isAdding = index === -1;

      if (index > -1) {
        playlist[listKey].splice(index, 1);
      } else {
        playlist[listKey].push(movieId);
      }

      localStorage.setItem(
        "playlistsData",
        JSON.stringify(
          JSON.parse(localStorage.getItem("playlistsData")).map((pl) =>
            pl.playlistName === currentPlaylistName ? playlist : pl,
          ),
        ),
      );

      favoritesMoviesIds.length = 0;
      favoritesMoviesIds.push(...playlist[listKey]);

      updateFavoritesUI(movieId, isAdding);

      Toaster.showToast(
        isAdding ? "success" : "error",
        isAdding ? "Added to Favorites" : "Removed from Favorites",
      );
    }

    function updateFavoritesUI(movieId, isAdding) {
      // Only work on movies page
      if (localStorage.getItem("currentPage") !== "moviesPage") return;

      // Update favorites category count - FIXED VERSION
      const favCategory = window.moviesCategories.find((c) => c.id === -1);
      if (favCategory) {
        if (isAdding) {
          const movieToAdd = window.allMoviesStreams.find(
            (m) => m.stream_id === movieId,
          );
          if (
            movieToAdd &&
            !favCategory.movies.some((m) => m.stream_id === movieId)
          ) {
            favCategory.movies.push(movieToAdd);
          }
        } else {
          favCategory.movies = favCategory.movies.filter(
            (m) => m.stream_id !== movieId,
          );
        }

        // Update the count property
        favCategory._movieCount = favCategory.movies.length;
        delete favCategory._sortedCache;
        delete favCategory._lastSortValue;

        // Update UI count immediately
        const favCatEl = qs('.movie-channel-category[data-category-id="-1"]');
        if (favCatEl) {
          const countEl = favCatEl.querySelector(
            ".movie-channel-category-count",
          );
          if (countEl) {
            countEl.textContent = favCategory.movies.length;
          }
        }
      }

      const allCurrentCards = qsa(".movies-card");
      allCurrentCards.forEach((card) => {
        const cardMovieId = Number(card.dataset.movieId);
        if (cardMovieId === movieId) {
          const heartIcon = card.querySelector(".movie-card-heart-icon");
          const topContent = card.querySelector(".movie-card-top-content");

          if (isAdding) {
            if (!heartIcon && topContent) {
              const heartImg = document.createElement("img");
              heartImg.src = "/assets/heart-icon.png";
              heartImg.alt = "heart-icon";
              heartImg.className = "movie-card-heart-icon";
              heartImg.loading = "lazy";
              topContent.appendChild(heartImg);
            }
          } else {
            if (heartIcon && selectedCategoryId !== -1) {
              heartIcon.remove();
            }
          }
        }
      });

      // Always maintain focus after toggle, regardless of category
      const currentCards = qsa(".movies-card");
      if (
        currentCards.length > 0 &&
        focusedCardIndex >= 0 &&
        !inChannelList &&
        !inSearch &&
        !inMenu
      ) {
        // Ensure focused card index is within bounds
        focusedCardIndex = Math.min(focusedCardIndex, currentCards.length - 1);
        setFocus(currentCards, focusedCardIndex, "focused");
      }

      if (selectedCategoryId === -1) {
        // Only update the specific card that was toggled, don't refresh all cards
        if (!isAdding) {
          // Removing from favorites - remove the specific card
          const cardToRemove = qs(`.movies-card[data-movie-id="${movieId}"]`);
          if (cardToRemove) {
            const wasFocused = cardToRemove.classList.contains("focused");
            cardToRemove.remove();

            // If the removed card was focused, adjust focus
            if (wasFocused) {
              const remainingCards = qsa(".movies-card");
              if (remainingCards.length > 0) {
                focusedCardIndex = Math.min(
                  focusedCardIndex,
                  remainingCards.length - 1,
                );
                setFocus(remainingCards, focusedCardIndex, "focused");
              } else {
                // No cards left, show no data message
                const cardsContainer = qs(".movies-cards-list-container");
                if (cardsContainer) {
                  cardsContainer.style.display = "flex";
                  cardsContainer.innerHTML = `
              <div class="movie-no-data">
                <p>No favorite movies yet</p>
              </div>`;
                }
                setFlags(true, false, false);
                setFocus(
                  qsa(".movie-channel-category"),
                  focusedChannelIndex,
                  "movie-channel-category-focused",
                );
              }
            }
          }
        }
        // If adding to favorites, the card is already there with heart icon updated above
      }
    }

    function moviesPageKeydownHandler(e) {
      if (localStorage.getItem("currentPage") !== "moviesPage") return;

      // Block all navigation during card rendering
      if (isRenderingCards) {
        e.preventDefault();
        return;
      }

      // Handle dropdown open state
      if (isDropdownOpen) {
        const backKeys = [10009, "Escape", "Back", "BrowserBack", "XF86Back"];
        const isUp = e.key === "ArrowUp" || e.keyCode === 38;
        const isDown = e.key === "ArrowDown" || e.keyCode === 40;
        const isEnter = e.key === "Enter" || e.keyCode === 13;

        if (backKeys.includes(e.keyCode) || backKeys.includes(e.key)) {
          e.preventDefault();
          closeDropdown();
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

      const channelList = qsa(".movie-channel-category");
      const cards = qsa(".movies-card");
      const cardsContainer = qs(".movies-cards-list-container");
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
          // Fallback if somehow they have same offsetTop but we know there's more
          // This case is unlikely in a grid but good for safety
          cardsPerRow =
            Math.floor(cardsContainer.offsetWidth / cards[0].offsetWidth) || 1;
        }
      }

      const searchInput = qs("#movies-header-search");

      // Add keydown for search input (ArrowDown to categories)
      if (searchInput && !searchInput.dataset.keyfix) {
        searchInput.addEventListener("keydown", (ev) => {
          if (ev.key === "ArrowDown" || ev.keyCode === 40) {
            ev.preventDefault();
            searchInput.blur();
            searchInput.classList.remove("movies-header-search-input-focused");
            focusToggleBtn();
          }
        });
        searchInput.dataset.keyfix = "true";
      }

      // Back keys
      const backKeys = [10009, "Escape", "Back", "BrowserBack", "XF86Back"];
      if (backKeys.includes(e.keyCode) || backKeys.includes(e.key)) {
        if (
          !inChannelList &&
          !inSearch &&
          !inMenu &&
          !inControls &&
          focusedCardIndex >= cardsPerRow
        ) {
          // If in cards and NOT on first row, go to first card of first row
          focusedCardIndex = 0;
          setFocus(cards, focusedCardIndex, "focused");
          e.preventDefault();
          return;
        }
        // Otherwise (first row, sidebar, search, or menu), go to dashboard
        localStorage.removeItem("moviesLastFocusedCardIndex");
        localStorage.removeItem("moviesLastFocusedCategory");
        localStorage.removeItem("moviesSelectedCategoryId");
        localStorage.removeItem("moviesCategoryIndex");
        localStorage.removeItem("moviesCardIndex");
        localStorage.removeItem("moviesSidebarVisible");
        localStorage.removeItem("selectedMovieId");
        localStorage.removeItem("selectedMovieData");
        localStorage.removeItem("moviesRestoreFocus");

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

      const toggleBtn = qs(".movies-cat-toggle-btn");
      const catSearchContainer = qs(".movies-cat-search-container");
      const catSearchInput = qs("#movies-cat-search-input");

      if (inControls) {
        const isToggleFocused =
          (document.activeElement.classList.contains("movies-cat-toggle-btn") ||
            (toggleBtn && toggleBtn.classList.contains("focused"))) &&
          !isCatSearchFocused;

        if (isToggleFocused) {
          if (isDown) {
            e.preventDefault();
            if (toggleBtn) {
              toggleBtn.classList.remove("focused");
              toggleBtn.blur();
            }
            if (isSidebarVisible) {
              focusChannels(0);
            } else {
              focusCards(0);
            }
            return;
          }
          if (isRight) {
            e.preventDefault();
            // Search container is now always visible
            if (toggleBtn) {
              toggleBtn.classList.remove("focused");
              toggleBtn.blur();
            }
            catSearchContainer.classList.add("focused");
            isCatSearchFocused = true;
            return;
          }
          if (isUp) {
            e.preventDefault();
            if (toggleBtn) {
              toggleBtn.classList.remove("focused");
              toggleBtn.blur();
            }
            focusSearch();
            return;
          }
          if (isEnter) {
            e.preventDefault();
            toggleSidebar(!isSidebarVisible);
            return;
          }
        } else if (isCatSearchFocused) {
          if (isEnter) {
            e.preventDefault();
            if (toggleBtn) toggleBtn.blur();
            if (catSearchInput) {
              catSearchInput.focus();
              // Add one-time listener to return focus to container
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
                    isCatSearchFocused = true;
                  }
                });
                catSearchInput.dataset.focusFix = "true";
              }
            }
            return;
          }
          if (isDown) {
            e.preventDefault();
            isCatSearchFocused = false;
            catSearchContainer.classList.remove("focused");
            if (catSearchInput) catSearchInput.blur();
            if (isSidebarVisible) {
              focusChannels(0);
            } else {
              focusCards(0);
            }
            return;
          }
          if (isUp) {
            e.preventDefault();
            isCatSearchFocused = false;
            catSearchContainer.classList.remove("focused");
            if (catSearchInput) catSearchInput.blur();
            focusSearch();
            return;
          }
          if (isLeft) {
            e.preventDefault();
            isCatSearchFocused = false;
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
        if (inChannelList) {
          if (focusedChannelIndex === 0) {
            document
              .querySelectorAll(".movie-channel-category-focused")
              .forEach((el) => {
                el.classList.remove("movie-channel-category-focused");
              });
            focusToggleBtn();
          } else {
            setFocus(
              channelList,
              --focusedChannelIndex,
              "movie-channel-category-focused",
            );
          }
          e.preventDefault();
          return;
        }

        if (!inChannelList && !inSearch && !inMenu) {
          if (focusedCardIndex >= cardsPerRow) {
            setFocus(cards, (focusedCardIndex -= cardsPerRow), "focused");
          } else {
            // Explicitly remove focused class from all cards when moving to controls
            cards.forEach((c) => c.classList.remove("focused"));
            focusToggleBtn();
            focusedCardIndex = -1;
          }
          e.preventDefault();
          return;
        }
      }

      if (isDown) {
        if (inSearch || inMenu) {
          searchInput && searchInput.blur();
          searchInput &&
            searchInput.classList.remove("movies-header-search-input-focused");
          focusToggleBtn();
          e.preventDefault();
          return;
        }

        if (inChannelList) {
          if (focusedChannelIndex < channelList.length - 1) {
            setFocus(
              channelList,
              ++focusedChannelIndex,
              "movie-channel-category-focused",
            );
            e.preventDefault();
            return;
          } else {
            const allFiltered = filterCategoriesList();
            if (channelList.length < allFiltered.length) {
              categoryChunk++;
              const limited = allFiltered.slice(0, categoryChunk * PAGE_SIZE);
              qs(".movies-channels-list").innerHTML = renderCategories(limited);
              highlightActiveCategory();

              // Move to next item after rendering
              focusedChannelIndex++;
              const newChannelList = qsa(".movie-channel-category");
              setFocus(
                newChannelList,
                focusedChannelIndex,
                "movie-channel-category-focused",
              );

              e.preventDefault();
              return;
            }
          }
        }

        if (!inChannelList && focusedCardIndex >= 0) {
          const currentRow = Math.floor(focusedCardIndex / cardsPerRow);
          const totalRows = Math.ceil(cards.length / cardsPerRow);
          const isLastRow = currentRow === totalRows - 1;

          if (isLastRow && searchQuery.trim()) {
            loadMoreSearchResults();
            e.preventDefault();
            return;
          }

          // Check if we're in the last row
          if (isLastRow) {
            // We're in the last row, need to load more cards
            const category = window.moviesCategories.find(
              (c) => c.id === selectedCategoryId,
            );
            if (!category) {
              e.preventDefault();
              return;
            }

            // FIXED: Get sorted movies from cache or sort them
            if (
              !category._sortedCache ||
              category._lastSortValue !== localStorage.getItem("movieSortValue")
            ) {
              category._sortedCache = sortMovies(category.movies || []);
              category._lastSortValue = localStorage.getItem("movieSortValue");
            }

            const sortedMovies = category._sortedCache;
            const totalMovies = sortedMovies.length;

            if (cards.length < totalMovies) {
              // Calculate which card in the next row we want to focus
              const currentColumn = focusedCardIndex % cardsPerRow;
              const targetIndexInNextRow = cards.length + currentColumn;

              // FIXED: Get next chunk from SORTED movies array
              const newMovies = sortedMovies.slice(
                cards.length,
                cards.length + PAGE_SIZE,
              );
              const fragment = document.createDocumentFragment();
              const showFavHeartIcon = Number(selectedCategoryId) === -1;

              newMovies.forEach((m) => {
                const isAdultMovie = isMovieAdult(m);
                const parentalLockEnabled = !!currentPlaylist.parentalPassword;
                const shouldBlur =
                  parentalLockEnabled && shouldBlurAdultCard(m);
                const showLockIcon = shouldBlur;

                const div = document.createElement("div");
                div.className = "movies-card";
                div.dataset.movieId = m.stream_id;
                div.dataset.movieTitle = m.name;

                if (shouldBlur) {
                  div.classList.add("movie-card-blurred");
                }

                div.innerHTML = `
          <div class="movie-card-image-wrapper">
            <img src="${m.stream_icon || "/assets/noImageFound.png"}" alt="${
              m.name
            }" onerror="this.onerror=null; this.src='/assets/noImageFound.png';" loading="lazy" class="movies-card-img ${
              shouldBlur ? "blurred-image" : ""
            }"/>
          </div>
          <div class="movie-card-bottom-content ${
            shouldBlur ? "blurred-text" : ""
          }">
            <p class="movies-card-title">${m.name}</p>
            <p class="movies-card-description">${m.name}</p>
          </div>
          <div class="movie-card-top-content">
            <p class="movie-card-rating ${shouldBlur ? "blurred-text" : ""}">${
              isNaN(m.rating_5based)
                ? 0
                : Math.min(5, parseInt(m.rating_5based, 10))
            }</p>
            ${
              showFavHeartIcon ||
              (Array.isArray(favoritesMoviesIds) &&
                favoritesMoviesIds.includes(m.stream_id))
                ? '<img src="/assets/heart-icon.png" alt="heart-icon" loading="lazy" class="movie-card-heart-icon"/>'
                : ""
            }
            ${
              showLockIcon
                ? '<i class="fas fa-lock movie-card-lock-icon"></i>'
                : ""
            }
          </div>
        `;
                fragment.appendChild(div);
              });

              cardsContainer.appendChild(fragment);

              // Get updated cards list after adding new cards
              const newCards = qsa(".movies-card");

              // Try to focus on the card in the same column position in the next row
              let nextFocusIndex = targetIndexInNextRow;

              // If that exact position doesn't exist, focus on the last card in the new row
              if (nextFocusIndex >= newCards.length) {
                // Find the last card in the newly loaded row
                const newRowStartIndex = cards.length;
                const newRowEndIndex = Math.min(
                  newRowStartIndex + cardsPerRow - 1,
                  newCards.length - 1,
                );
                nextFocusIndex = newRowEndIndex;
              }

              setFocus(newCards, nextFocusIndex, "focused");
              focusedCardIndex = nextFocusIndex;
              e.preventDefault();
              return;
            }
            // If no more cards to load, stay on current card
            e.preventDefault();
            return;
          }

          // Not in last row, navigate normally to next row
          const nextRowStartIndex = (currentRow + 1) * cardsPerRow;
          const currentColumn = focusedCardIndex % cardsPerRow;
          const potentialNextIndex = nextRowStartIndex + currentColumn;

          // Try to move to same column in next row
          if (potentialNextIndex < cards.length) {
            setFocus(cards, potentialNextIndex, "focused");
            focusedCardIndex = potentialNextIndex;
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
            nextRowEndIndex !== focusedCardIndex
          ) {
            setFocus(cards, nextRowEndIndex, "focused");
            focusedCardIndex = nextRowEndIndex;
            e.preventDefault();
            return;
          }

          e.preventDefault();
          return;
        }
      }

      if (isRight) {
        if (inSearch) {
          searchInput && searchInput.blur();
          searchInput &&
            searchInput.classList.remove("movies-header-search-input-focused");
          focusMenu();
          e.preventDefault();
          return;
        }

        if (inChannelList) {
          if (cards.length > 0) {
            setFocus(channelList, -1, "movie-channel-category-focused");

            // Always focus on first card (index 0) regardless of blur status
            focusCards(0);
          } else {
            // No cards available, stay on category
            e.preventDefault();
            return;
          }
          e.preventDefault();
          return;
        }

        if (!inChannelList && !inSearch && !inMenu) {
          if (focusedCardIndex < cards.length - 1) {
            // Navigate to next card regardless of blur status
            setFocus(cards, ++focusedCardIndex, "focused");
            e.preventDefault();
            return;
          } else if (focusedCardIndex === cards.length - 1) {
            // We are at the last card, check if we can load more
            const category = window.moviesCategories.find(
              (c) => c.id === selectedCategoryId,
            );

            if (category) {
              // Ensure sorted cache exists
              if (
                !category._sortedCache ||
                category._lastSortValue !==
                  localStorage.getItem("movieSortValue")
              ) {
                category._sortedCache = sortMovies(category.movies || []);
                category._lastSortValue =
                  localStorage.getItem("movieSortValue");
              }

              const sortedMovies = category._sortedCache;
              if (cards.length < sortedMovies.length) {
                // Load next chunk
                const newMovies = sortedMovies.slice(
                  cards.length,
                  cards.length + PAGE_SIZE,
                );

                const fragment = document.createDocumentFragment();
                const showFavHeartIcon = Number(selectedCategoryId) === -1;

                newMovies.forEach((m) => {
                  const isAdultMovie = isMovieAdult(m);
                  const parentalLockEnabled =
                    !!currentPlaylist.parentalPassword;
                  const shouldBlur =
                    parentalLockEnabled && shouldBlurAdultCard(m);
                  const showLockIcon = shouldBlur;

                  const div = document.createElement("div");
                  div.className = "movies-card";
                  div.dataset.movieId = m.stream_id;
                  div.dataset.movieTitle = m.name;

                  if (shouldBlur) {
                    div.classList.add("movie-card-blurred");
                  }

                  div.innerHTML = `
            <div class="movie-card-image-wrapper">
              <img src="${m.stream_icon || "/assets/noImageFound.png"}" alt="${
                m.name
              }" onerror="this.onerror=null; this.src='/assets/noImageFound.png';" loading="lazy" class="movies-card-img ${
                shouldBlur ? "blurred-image" : ""
              }"/>
            </div>
            <div class="movie-card-bottom-content ${
              shouldBlur ? "blurred-text" : ""
            }">
              <p class="movies-card-title">${m.name}</p>
              <p class="movies-card-description">${m.name}</p>
            </div>
            <div class="movie-card-top-content">
              <p class="movie-card-rating ${
                shouldBlur ? "blurred-text" : ""
              }">${
                isNaN(m.rating_5based)
                  ? 0
                  : Math.min(5, parseInt(m.rating_5based, 10))
              }</p>
              ${
                showFavHeartIcon ||
                (Array.isArray(favoritesMoviesIds) &&
                  favoritesMoviesIds.includes(m.stream_id))
                  ? '<img src="/assets/heart-icon.png" alt="heart-icon" loading="lazy" class="movie-card-heart-icon"/>'
                  : ""
              }
              ${
                showLockIcon
                  ? '<i class="fas fa-lock movie-card-lock-icon"></i>'
                  : ""
              }
            </div>
          `;
                  fragment.appendChild(div);
                });

                cardsContainer.appendChild(fragment);

                // Focus on the next card (which is the first of the new chunk)
                const updatedCards = qsa(".movies-card");
                if (updatedCards.length > cards.length) {
                  setFocus(updatedCards, ++focusedCardIndex, "focused");
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
        if (inMenu) {
          focusSearch();
          e.preventDefault();
          return;
        }

        if (inSearch) {
          searchInput && searchInput.blur();
          searchInput &&
            searchInput.classList.remove("movies-header-search-input-focused");
          focusChannels(0);
          e.preventDefault();
          return;
        }
        //  if(moviesToShow.length=0){
        //       if (inSearch || inMenu) {
        //     searchInput && searchInput.blur();
        //     searchInput && searchInput.classList.remove("movies-header-search-input-focused");
        //     focusChannels(0);
        //     e.preventDefault();
        //     return;
        //   }

        if (!inChannelList && !inSearch && !inMenu) {
          if (cards.length === 0 || focusedCardIndex % cardsPerRow === 0) {
            setFocus(cards, -1, "focused");
            focusChannels(focusedChannelIndex);
          } else {
            setFocus(cards, --focusedCardIndex, "focused");
          }

          e.preventDefault();
          return;
        }
      }

      // ---------- ENTER ----------
      if (isEnter) {
        const focusedCard = cards[focusedCardIndex];

        if (inSearch) {
          searchInput && searchInput.focus();
          e.preventDefault();
          return;
        }

        if (inMenu) {
          e.preventDefault();
          localStorage.setItem("sidebarPage", "moviesPage");
          const sidebar = document.querySelector(".sidebar-container-movie");

          if (sidebar.style.display === "none") {
            // Refresh sidebar with current movies page data before opening
            const sidebarContainer = document.querySelector(
              ".sidebar-container-movie",
            );
            if (sidebarContainer) {
              // Re-render sidebar with fresh movies data
              sidebarContainer.innerHTML = Sidebar({
                from: "moviesPage",
                onSort: () => {
                  console.log("Sorting movies...");
                  renderMovies(); // Refresh movies display after sort

                  // Maintain current focus position
                  if (inChannelList) {
                    focusChannels(focusedChannelIndex);
                  } else {
                    focusCards(focusedCardIndex);
                  }
                },
              });
            }

            // Open the refreshed sidebar
            openSidebar("moviesPage");
          } else {
            closeSidebar("moviesPage");
          }
          return;
        }

        if (inChannelList) {
          const catEl = channelList[focusedChannelIndex];
          if (!catEl) return;

          const catId = Number(catEl.dataset.categoryId);
          const isAdultCat = isMovieAdultCategory(catEl.dataset.categoryName);
          const isUnlocked = unlockedMovieAdultCatIds.has(String(catId));

          if (isAdultCat && !!currentPlaylist.parentalPassword && !isUnlocked) {
            ParentalPinDialog(
              () => {
                unlockedMovieAdultCatIds.add(String(catId));
                selectedCategoryId = catId;
                visibleCount = PAGE_SIZE;
                const lockEl = catEl.querySelector(".movie-category-lock-icon");
                if (lockEl) lockEl.remove();
                renderMovies();
                highlightActiveCategory();
                setTimeout(() => {
                  const newCards = qsa(".movies-card");
                  if (newCards.length) {
                    focusedCardIndex = 0;
                    setFocus(newCards, focusedCardIndex, "focused");
                    setFlags(false, false, false);
                  } else {
                    setFocus(
                      channelList,
                      focusedChannelIndex,
                      "movie-channel-category-focused",
                    );
                    setFlags(true, false, false);
                  }
                }, 0);
              },
              () => {
                setFocus(
                  channelList,
                  focusedChannelIndex,
                  "movie-channel-category-focused",
                );
                setFlags(true, false, false);
              },
              currentPlaylist,
              "moviesPage",
            );
            e.preventDefault();
            return;
          } else {
            searchInput.value = "";
            searchQuery = "";
            catEl.click();
            return;
          }
        }

        // FIXED: Long press / Continue Watching logic
        if (!inChannelList && !inSearch && !inMenu && focusedCard) {
          e.preventDefault();

          // Clear any existing timer first
          if (enterPressTimer) {
            clearTimeout(enterPressTimer);
            enterPressTimer = null;
          }

          // In your keydown handler, where you have the long press logic:
          enterPressTimer = setTimeout(() => {
            const movieId = Number(focusedCard.dataset.movieId);
            const isContinueWatchingCategory = selectedCategoryId === -2;

            closeDropdown();

            if (isContinueWatchingCategory) {
              selectedCardForDropdown = focusedCard;
              isDropdownOpen = true;
              focusedCard.classList.remove("focused");
              renderCardDropdown(focusedCard, movieId);
            } else {
              toggleFavoriteItem(movieId, "favouriteMovies");
            }

            enterPressTimer = null;
            isLongPressExecuted = true; // Set flag to indicate long press was executed
          }, LONG_PRESS_DURATION);
        }
      }

      if (!inChannelList && !inSearch && !inMenu && focusedCardIndex >= 0) {
        categoryFocusMap.set(selectedCategoryId, focusedCardIndex);
      }
    }

    // === REPLACE THE ENTIRE moviesPageKeyupHandler FUNCTION WITH THIS ===
    const moviesPageKeyupHandler = (e) => {
      const isEnter = e.key === "Enter" || e.keyCode === 13;

      if (!isEnter) return;

      if (enterPressTimer && !isLongPressExecuted) {
        clearTimeout(enterPressTimer);
        enterPressTimer = null;

        if (!isDropdownOpen && !inChannelList && !inSearch && !inMenu) {
          const cards = qsa(".movies-card");
          if (focusedCardIndex >= 0 && cards[focusedCardIndex]) {
            const card = cards[focusedCardIndex];
            const movieId = Number(card.dataset.movieId);
            const allMoviesData = window.allMovies || [];
            const selectedMovieObj = allMoviesData.find(
              (m) => Number(m.stream_id) === movieId,
            );

            if (selectedMovieObj) {
              const parentalLockEnabled = !!currentPlaylist.parentalPassword;
              const isAdultMovie = isMovieAdult(selectedMovieObj);
              const currentCategory = window.moviesCategories.find(
                (c) => c.id === selectedCategoryId,
              );
              const isAdultCategory =
                currentCategory && isMovieAdultCategory(currentCategory.name);
              const isAdultCategoryUnlocked = unlockedMovieAdultCatIds.has(
                String(selectedCategoryId),
              );

              const shouldAskForPin =
                parentalLockEnabled &&
                isAdultMovie &&
                ([-3, -1, -2].includes(selectedCategoryId) ||
                  (isAdultCategory && !isAdultCategoryUnlocked));

              if (shouldAskForPin) {
                ParentalPinDialog(
                  () => {
                    // Store current focus state before navigating
                    saveMoviesFocusState();

                    localStorage.setItem("selectedMovieId", movieId);
                    localStorage.setItem("currentPage", "moviesDetailPage");
                    localStorage.setItem(
                      "selectedMovieData",
                      JSON.stringify(selectedMovieObj),
                    );
                    document.querySelector("#loading-progress").style.display =
                      "none";
                    Router.showPage("movieDetail");
                  },
                  () => {
                    const currentCards = qsa(".movies-card");
                    if (currentCards.length > 0) {
                      setFocus(currentCards, focusedCardIndex, "focused");
                    }
                  },
                  currentPlaylist,
                  "moviesPage",
                );
              } else {
                // Store current focus state before navigating
                saveMoviesFocusState();

                localStorage.setItem("selectedMovieId", movieId);
                localStorage.setItem("currentPage", "moviesDetailPage");
                localStorage.setItem(
                  "selectedMovieData",
                  JSON.stringify(selectedMovieObj),
                );
                document.querySelector("#loading-progress").style.display =
                  "none";
                Router.showPage("movieDetail");
              }
            }
          }
        }
      }

      isLongPressExecuted = false;
    };
    // === END OF REPLACED FUNCTION ===
    document.addEventListener("click", moviesPageClickHandler);
    document.addEventListener("keydown", moviesPageKeydownHandler);
    document.addEventListener("keyup", moviesPageKeyupHandler);
    MoviesPage.cleanup = () => {
      document.removeEventListener("keydown", moviesPageKeydownHandler);
      document.removeEventListener("click", moviesPageClickHandler);
      document.removeEventListener("keyup", moviesPageKeyupHandler);

      // Cleanup timers and animation frames for memory management
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
      if (renderAnimationFrame) {
        cancelAnimationFrame(renderAnimationFrame);
        renderAnimationFrame = null;
      }
      if (enterPressTimer) {
        clearTimeout(enterPressTimer);
        enterPressTimer = null;
      }
    };

    const headerInputElement = qs("#movies-header-search");
    if (headerInputElement) {
      headerInputElement.addEventListener("input", (e) => {
        // Clear previous debounce timer
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
        }

        // 700ms debounce for Tizen low-end devices
        searchDebounceTimer = setTimeout(async () => {
          const newQuery = e.target.value.trim();

          // Avoid re-processing same query
          if (newQuery === searchQuery) return;

          searchQuery = newQuery;

          if (searchQuery.trim()) {
            visibleCount = 30; // Limited for Tizen performance
            // Clear cache to force fresh search
            const selectedCategory = window.moviesCategories.find(
              (c) => c.id === selectedCategoryId,
            );
            if (selectedCategory) {
              delete selectedCategory._sortedCache;
              delete selectedCategory._lastSortValue;
            }
          } else {
            visibleCount = PAGE_SIZE;
            // Reset to normal view when search is cleared
            searchQuery = "";
          }

          // Small delay to prevent UI freeze on Tizen
          await new Promise((resolve) => setTimeout(resolve, 100));

          await renderMovies();
          highlightActiveCategory();

          // Always focus on channels after search to maintain navigation
          focusChannels(focusedChannelIndex);
        }, 700); // 700ms debounce for Tizen
      });
    }

    // Category Search Input Listener
    const catSearchElement = qs("#movies-cat-search-input");
    if (catSearchElement) {
      catSearchElement.addEventListener("input", (e) => {
        searchCategoryQuery = e.target.value;
        categoryChunk = 1; // Reset pagination on search
        // Re-render categories
        const catList = qs(".movies-channels-list");
        if (catList)
          catList.innerHTML = renderCategories(
            filterCategoriesList().slice(0, categoryChunk * PAGE_SIZE),
          );
        highlightActiveCategory();
      });
    }
  }, 0);

  // ========= Template =========
  return `<div class="moviespage-main-container">

    <div class="movies-header">
      <div class="first-movies-header">
        <img src="/assets/app-logo.png" alt="Logo" class="movies-header-logo"/>
        <div class="movies-header-right">
        ${DateTimeComponent()}
        </div>
      </div>
      <div class="second-movies-header">
        <p class="movies-header-title">Movies</p>
        <div class="second-movies-header-div">
          <div class="movies-header-search">
            <input type="text" placeholder="Search Movies" id="movies-header-search" class="movies-header-search-input"/>
            <img src="/assets/search-icon.png" alt="search" class="movies-header-search-icon"/>
          </div>
          <div class="movies-header-menu">
            <svg width="14" height="58" viewBox="0 0 14 58" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="7" cy="7" r="7" fill="white"/>
              <circle cx="7" cy="29" r="7" fill="white"/>
              <circle cx="7" cy="51" r="7" fill="white"/>
            </svg>
              <div class="sidebar-container-movie" style="display: none;">
  ${Sidebar({ from: "moviesPage", onSort: () => console.log("Sorting...") })}
  </div>
          </div>
        </div>
      </div>
    </div>

    <div class="movies-category-controls">
      <div class="movies-cat-toggle-btn" tabindex="0">
        <span class="movies-cat-toggle-text">Select Categories</span>
        <i class="fas fa-chevron-down movies-cat-toggle-icon"></i>
      </div>
      <div class="movies-cat-search-container">
        <i class="fas fa-search movies-cat-search-icon"></i>
        <input type="text" id="movies-cat-search-input" placeholder="Search categories" />
      </div>
    </div>

    <div class="movies-content-container"></div>
  </div>`;
}
