const adultsCategories = [
  "adult",
  "xxx",
  "18+",
  "18 +",
  "18 plus",
  "erotic",
  "erotica",
  "adult movie",
  "adult series",
  "nude",
  "nudity",
  "sex",
  "sexual",
  "hot",
  "porn",
  "xnxx",
  "xvideos",
  "xvideo",
].map((w) => w.toLowerCase());

function clearLocalStorageExcept(keepKeys) {
  var temp = {};

  for (var i = 0; i < keepKeys.length; i++) {
    var key = keepKeys[i];
    var value = localStorage.getItem(key);
    if (value !== null) {
      temp[key] = value;
    }
  }

  localStorage.clear();

  for (var key in temp) {
    if (temp.hasOwnProperty(key)) {
      localStorage.setItem(key, temp[key]);
    }
  }
}

function formatUnixDate(timestamp) {
  if (!timestamp) return "";

  const date = new Date(Number(timestamp) * 1000);

  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function updatePlaylistData(playlistId, key, value) {
  let playlistsData = JSON.parse(localStorage.getItem("playlistsData")) || [];
  let selectedPlaylist =
    JSON.parse(localStorage.getItem("selectedPlaylist")) || {};

  const targetIndex = playlistsData.findIndex(
    (pl) => pl.playlistName === playlistId
  );
  if (targetIndex !== -1) {
    playlistsData[targetIndex][key] = value;
    localStorage.setItem("playlistsData", JSON.stringify(playlistsData));

    if (selectedPlaylist.playlistName === playlistId) {
      selectedPlaylist[key] = value;
      localStorage.setItem(
        "selectedPlaylist",
        JSON.stringify(selectedPlaylist)
      );
    }
    return true;
  }

  return false;
}

function getPlaylistData(playlistId) {
  let playlistsData = JSON.parse(localStorage.getItem("playlistsData")) || [];
  return playlistsData.find((pl) => pl.playlistName === playlistId) || null;
}

function getPlaylistsData() {
  return JSON.parse(localStorage.getItem("playlistsData")) || [];
}

function savePlaylistsData(data) {
  localStorage.setItem("playlistsData", JSON.stringify(data));
}

function getCurrentPlaylistUsername() {
  try {
    const cp = JSON.parse(localStorage.getItem("currentPlaylistData")) || {};
    return cp.playlistName ? cp.playlistName : null;
  } catch (e) {
    return null;
  }
}

function getCurrentPlaylist() {
  try {
    const playlists = localStorage.getItem("playlistsData")
      ? JSON.parse(localStorage.getItem("playlistsData"))
      : [];
    const selectedPlaylist = localStorage.getItem("selectedPlaylist")
      ? JSON.parse(localStorage.getItem("selectedPlaylist"))
      : {};

    const currentPlaylist = playlists.find(
      (pl) => pl.playlistName === selectedPlaylist.playlistName
    );

    return currentPlaylist;
  } catch (e) {
    return null;
  }
}

function getItemUniqueId(item) {
  if (!item) return null;
  if (item.stream_id) return String(item.stream_id);
  if (item.id) return String(item.id);
  if (item.series_id) return String(item.series_id);
  if (item.tmdb_id) return String(item.tmdb_id);
  if (item.movie_id) return String(item.movie_id);
  if (item.video_id) return String(item.video_id);
  // fallback
  try {
    return JSON.stringify(item);
  } catch (e) {
    return null;
  }
}

function isItemFavoriteForPlaylist(item, typeKey, playlistUsername) {
  const username = playlistUsername || getCurrentPlaylistUsername();
  if (!username) return false;

  const playlists = getPlaylistsData();
  const pl = playlists.find((p) => p.playlistName === username);
  if (!pl || !pl[typeKey]) return false;

  const uid = getItemUniqueId(item);
  if (!uid) return false;

  return pl[typeKey].some((m) => getItemUniqueId(m) === uid);
}

function saveItemToCurrentPlaylist(item, typeKey, playlistUsername) {
  const username = playlistUsername || getCurrentPlaylistUsername();
  if (!username) return false;

  const playlists = getPlaylistsData();
  const pl = playlists.find((p) => p.playlistName === username);
  if (!pl || !pl[typeKey]) return false;

  const uid = getItemUniqueId(item);
  if (!uid) return false;

  return pl[typeKey].some((m) => getItemUniqueId(m) === uid);
}

function addItemToHistory(item, typeKey, playlistUsername) {
  const username = playlistUsername || getCurrentPlaylistUsername();
  if (!username) return;

  const playlists = getPlaylistsData();
  const plIndex = playlists.findIndex((p) => p.playlistName === username);
  if (plIndex === -1) return;

  const pl = playlists[plIndex];
  if (!pl[typeKey]) pl[typeKey] = [];

  const uid = getItemUniqueId(item);
  if (!uid) return;

  // Remove if exists
  pl[typeKey] = pl[typeKey].filter((m) => getItemUniqueId(m) !== uid);

  // Add to front
  pl[typeKey].unshift(item);

  savePlaylistsData(playlists);
}

// // Add one or multiple items to history by streamId(s)
// function addItemToHistoryById(streamIds, typeKey, playlistUsername) {
//   if (!streamIds) return;
//   const ids = Array.isArray(streamIds) ? streamIds : [streamIds];

//   const username = playlistUsername || getCurrentPlaylistUsername();
//   if (!username) return;

//   const playlists = getPlaylistsData();
//   const plIndex = playlists.findIndex(p => p.playlistUsername === username);
//   if (plIndex === -1) return;

//   const pl = playlists[plIndex];
//   if (!pl[typeKey]) pl[typeKey] = [];

//   // Add each streamId
//   ids.forEach(id => {
//     const uid = String(id);
//     if (!uid) return;

//     // Remove existing item if already in history
//     pl[typeKey] = pl[typeKey].filter(m => String(m.stream_id) !== uid);

//     // Try to find full object from ChannelListLive or favoritesLiveTV
//     let itemObj = (pl.ChannelListLive || []).find(ch => String(ch.stream_id) === uid) ||
//                   (pl.favoritesLiveTV || []).find(ch => String(ch.stream_id) === uid) ||
//                   { stream_id: uid }; // fallback minimal object

//     pl[typeKey].unshift(itemObj); // add to front
//   });

//   savePlaylistsData(playlists);
// }

// Remove one or multiple items from history by streamId(s)
function removeItemFromHistoryById(streamIds, typeKey, playlistUsername) {
  if (!streamIds) return;
  const ids = Array.isArray(streamIds) ? streamIds : [streamIds];

  const username = playlistUsername || getCurrentPlaylistUsername();
  if (!username) return;

  const playlists = getPlaylistsData();
  const plIndex = playlists.findIndex((p) => p.playlistName === username);
  if (plIndex === -1) return;

  const pl = playlists[plIndex];
  if (!pl[typeKey]) return;

  const uidSet = new Set(ids.map(String));

  // Try multiple possible ID properties
  pl[typeKey] = pl[typeKey].filter((m) => {
    const streamId = m.stream_id ? String(m.stream_id) : null;
    const itemId = m.itemId ? String(m.itemId) : null;

    // Return true to KEEP items that don't match the IDs to remove
    return !uidSet.has(streamId) && !uidSet.has(itemId);
  });

  savePlaylistsData(playlists);
  const currentPage = localStorage.getItem("currentPage");
  const sidebarPage = localStorage.getItem("sidebarPage");
  if (currentPage === "sidebar") {
    closeSidebar(sidebarPage);
    // Reopen sidebar after a short delay to show updated state
    setTimeout(() => {
      openSidebar(sidebarPage);
    }, 50);
  }
}
// Clear all items from a typeKey in history
function removeAllFromHistory(typeKey, playlistUsername) {
  const username = playlistUsername || getCurrentPlaylistUsername();
  if (!username) {
    console.warn("No username provided for removeAllFromHistory");
    return;
  }

  const playlists = getPlaylistsData();
  const plIndex = playlists.findIndex((p) => p.playlistName === username);
  if (plIndex === -1) {
    console.warn(`Playlist not found for username: ${username}`);
    return;
  }

  const pl = playlists[plIndex];

  // Additional safety check
  if (!Array.isArray(pl[typeKey])) {
    pl[typeKey] = []; // Initialize if it doesn't exist or isn't an array
  } else {
    pl[typeKey] = []; // Clear existing array
  }

  savePlaylistsData(playlists);
  const currentPage = localStorage.getItem("currentPage");
  const sidebarPage = localStorage.getItem("sidebarPage");
  if (currentPage === "sidebar") {
    closeSidebar(sidebarPage);
    // Reopen sidebar after a short delay to show updated state
    setTimeout(() => {
      openSidebar(sidebarPage);
    }, 50);
  }
  console.log(`Cleared all items from ${typeKey} for playlist ${username}`);
}

function toggleFavoriteItem(item, typeKey, playlistUsername) {
  // Prevent concurrent modifications with timeout-based lock
  const lockTimeout = 3000; // 3 seconds max lock time
  if (window._toggleFavoriteLock) {
    const lockAge = Date.now() - window._toggleFavoriteLockTime;
    if (lockAge < lockTimeout) {
      console.warn("Toggle favorite operation already in progress");
      return {
        success: false,
        message: "operation in progress",
        isFav: false,
        wasFav: false,
      };
    } else {
      // Lock is stale, release it
      console.warn("Releasing stale lock");
      window._toggleFavoriteLock = false;
    }
  }

  try {
    window._toggleFavoriteLock = true;
    window._toggleFavoriteLockTime = Date.now();

    const currentPlaylistData = getCurrentPlaylist();

    const username =
      playlistUsername ||
      (currentPlaylistData && currentPlaylistData.playlistName
        ? currentPlaylistData.playlistName
        : "");

    console.log("🔄 toggleFavoriteItem called:", {
      typeKey,
      providedUsername: playlistUsername,
      resolvedUsername: username,
      itemId: item && (item.stream_id || item.id),
      itemName: item && item.name,
    });

    if (!username) {
      console.error("❌ No playlist username found");
      return {
        success: false,
        message: "no playlist username",
        isFav: false,
        wasFav: false,
      };
    }

    // Get fresh data from localStorage
    const playlists = getPlaylistsData();
    console.log(
      "📦 Current playlists data:",
      playlists.map((p) => ({
        name: p.playlistName,
        favCount: (p[typeKey] && p[typeKey].length) || 0,
      }))
    );

    const uid = getItemUniqueId(item);
    if (!uid) {
      console.error("❌ Item has no unique ID");
      return {
        success: false,
        message: "item has no unique id",
        isFav: false,
        wasFav: false,
      };
    }

    const plIndex = playlists.findIndex((p) => p.playlistName === username);
    let result;

    if (plIndex === -1) {
      console.log("➕ Creating new playlist entry for:", username);
      // create minimal playlist entry with the right key
      const newPl = {
        playlistName: username,
        playlistUrl: "",
        playlistUsername: username,
      };
      newPl[typeKey] = [item];
      playlists.push(newPl);
      savePlaylistsData(playlists);
      console.log("✅ Saved new playlist with favorite");
      result = {
        success: true,
        isFav: true,
        wasFav: false, // Was not a favorite before
        playlists,
      };
    } else {
      const pl = playlists[plIndex];
      if (!pl[typeKey]) pl[typeKey] = [];
      const favIndex = pl[typeKey].findIndex((m) => getItemUniqueId(m) === uid);

      if (favIndex === -1) {
        // Add to favorites
        console.log("➕ Adding to favorites:", uid);
        pl[typeKey].push(item);
        savePlaylistsData(playlists);
        console.log("✅ Saved! New favorite count:", pl[typeKey].length);
        result = {
          success: true,
          isFav: true,
          wasFav: false, // Was not a favorite before
          playlists,
        };
      } else {
        // Remove from favorites
        console.log("➖ Removing from favorites:", uid);
        pl[typeKey].splice(favIndex, 1);
        savePlaylistsData(playlists);
        console.log("✅ Saved! New favorite count:", pl[typeKey].length);
        result = {
          success: true,
          isFav: false,
          wasFav: true, // Was a favorite before
          playlists,
        };
      }
    }

    // Update selectedPlaylist in localStorage to keep it in sync
    // CRITICAL: Preserve ALL fields, only update the specific typeKey array
    try {
      const selectedPlaylist = JSON.parse(
        localStorage.getItem("selectedPlaylist") || "{}"
      );
      console.log(
        "🔄 Updating selectedPlaylist:",
        selectedPlaylist.playlistName
      );
      if (selectedPlaylist.playlistName === username) {
        const updatedPlaylist = playlists.find(
          (p) => p.playlistName === username
        );
        if (updatedPlaylist) {
          // Update only the specific typeKey field, preserve everything else
          selectedPlaylist[typeKey] = updatedPlaylist[typeKey] || [];
          localStorage.setItem(
            "selectedPlaylist",
            JSON.stringify(selectedPlaylist)
          );
          console.log(
            "✅ selectedPlaylist updated, favorite count:",
            selectedPlaylist[typeKey].length
          );
        }
      }
    } catch (e) {
      console.warn("Failed to update selectedPlaylist:", e);
    }

    return result;
  } finally {
    // Always release the lock
    window._toggleFavoriteLock = false;
    window._toggleFavoriteLockTime = null;
  }
}

function updateLiveClearAllIcon() {
  const channelHistoryEl = document.querySelector(
    ".livetv-channel-category[data-category-id='channelHistory']"
  );

  if (channelHistoryEl) {
    console.log("Updating clear icon for:", channelHistoryEl);

    const countElement = channelHistoryEl.querySelector(
      ".livetv-channel-category-count"
    );

    // Get the actual count from the current playlist data
    const currentPlaylistName = JSON.parse(
      localStorage.getItem("selectedPlaylist")
    ).playlistName;
    const currentPlaylist = JSON.parse(
      localStorage.getItem("playlistsData")
    ).find((pl) => pl.playlistName === currentPlaylistName);

    const channelHistory = currentPlaylist.ChannelListLive || [];
    const count = channelHistory.length;

    // Update the count display
    if (countElement) {
      countElement.textContent = count;
    }

    // Find or create the clear button
    let clearButton = document.querySelector(".live-clear");

    if (count > 0) {
      console.log(clearButton, "clearButton");
      if (clearButton) {
        clearButton.style.display = "flex";
      }
    } else {
      if (clearButton) {
        clearButton.remove();
      }
    }
  }
}

function updateSeriesClearAllIcon() {
  const channelHistoryEl = document.querySelector(
    ".series-channel-category[data-category-id='-2']"
  );

  if (channelHistoryEl) {
    console.log("Updating clear icon for:", channelHistoryEl);

    const countElement = channelHistoryEl.querySelector(
      ".series-channel-category-count"
    );

    // Get the actual count from the current playlist data
    const currentPlaylistName = JSON.parse(
      localStorage.getItem("selectedPlaylist")
    ).playlistName;
    const currentPlaylist = JSON.parse(
      localStorage.getItem("playlistsData")
    ).find((pl) => pl.playlistName === currentPlaylistName);

    const channelHistory = currentPlaylist.ChannelListLive || [];
    const count = channelHistory.length;

    // Update the count display
    if (countElement) {
      countElement.textContent = count;
    }

    // Find or create the clear button
    let clearButton = document.querySelector(".series-clear");

    if (count > 0) {
      console.log(clearButton, "clearButton");
      if (clearButton) {
        clearButton.style.display = "flex";
      }
    } else {
      if (clearButton) {
        clearButton.remove();
      }
    }
  }
}

function updateMoviesClearAllIcon() {
  const channelHistoryEl = document.querySelector(
    ".movie-channel-category[data-category-id='-2']"
  );

  if (channelHistoryEl) {
    console.log("Updating clear icon for:", channelHistoryEl);

    const countElement = channelHistoryEl.querySelector(
      ".movie-channel-category-count"
    );

    // Get the actual count from the current playlist data
    const currentPlaylistName = JSON.parse(
      localStorage.getItem("selectedPlaylist")
    ).playlistName;
    const currentPlaylist = JSON.parse(
      localStorage.getItem("playlistsData")
    ).find((pl) => pl.playlistName === currentPlaylistName);

    const channelHistory = currentPlaylist.continueWatchingMovies || [];
    const count = channelHistory.length;

    // Update the count display
    if (countElement) {
      countElement.textContent = count;
    }

    // Find or create the clear button
    let clearButton = document.querySelector(".movie-clear");

    if (count > 0) {
      console.log(clearButton, "clearButton");

      if (clearButton) {
        clearButton.style.display = "flex";
      }
    } else {
      if (clearButton) {
        clearButton.remove();
      }
    }
  }
}

function decodeBase64(str) {
  try {
    return decodeURIComponent(escape(window.atob(str)));
  } catch (e) {
    return str;
  }
}

// blocking keys when loading is shown
let loginCancelled = false;
let keyBlockHandler = null;

function enableKeyBlock(onCancel) {
  loginCancelled = false;

  keyBlockHandler = (e) => {
    if (e.key === "Escape" || e.keyCode === 10009) {
      // Allow "back" → cancel
      e.preventDefault();
      e.stopPropagation();
      console.log("⏪ Back pressed → Cancel action");
      loginCancelled = true;
      disableKeyBlock();
      if (typeof onCancel === "function") {
        onCancel();
      }
      return;
    }

    // Block everything else
    e.preventDefault();
    e.stopPropagation();
  };

  document.addEventListener("keydown", keyBlockHandler, true);
}

function disableKeyBlock() {
  if (keyBlockHandler) {
    document.removeEventListener("keydown", keyBlockHandler, true);
    keyBlockHandler = null;
  }
}

function isLoginCancelled() {
  return loginCancelled;
}

// Add one channel to "watchHistoryLive" by stream_id
// addItemToHistoryById("978314", "watchHistoryLive");

// // Add one channel to "watchHistoryLive" by stream_id
// addItemToHistoryById("978314", "watchHistoryLive");

// Remove a channel by stream_id
// removeItemFromHistoryById("978301", "watchHistoryLive");

// Clear the entire watchHistoryLive array
// removeAllFromHistory("watchHistoryLive");

// expose globally

function applyMarqueeEffect(containerSelector, titleSelector, focusedClass) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const titles = container.querySelectorAll(titleSelector);
  titles.forEach((title) => {
    const parent = title.closest(`.${focusedClass}`);
    if (parent) {
      if (title.scrollWidth > title.clientWidth) {
        title.classList.add("marquee-active");
      }
    } else {
      title.classList.remove("marquee-active");
    }
  });
}

function clearMoviesAndSeriesLocalStorage() {
  localStorage.removeItem("moviesCardIndex");
  localStorage.removeItem("moviesCategoryIndex");
  localStorage.removeItem("moviesSelectedCategoryId");
  localStorage.removeItem("selectedSeason");
  localStorage.removeItem("selectedSeriesItem");
  localStorage.removeItem("selectedVideoItemUrl");
  localStorage.removeItem("seriesCardIndex");
  localStorage.removeItem("seriesCategoryIndex");
  localStorage.removeItem("seriesEpisodesData");
  localStorage.removeItem("seriesSelectedCategoryId");
  localStorage.removeItem("seriesNavState");
  localStorage.removeItem("moviesNavState");
  localStorage.removeItem("sortvalue");
}

window.updatePlaylistData = updatePlaylistData;
window.getPlaylistData = getPlaylistData;
window.isLoginCancelled = isLoginCancelled;
window.disableKeyBlock = disableKeyBlock;
window.enableKeyBlock = enableKeyBlock;
window.clearLocalStorageExcept = clearLocalStorageExcept;
window.formatUnixDate = formatUnixDate;
window.getPlaylistData = getPlaylistData;
window.updatePlaylistData = updatePlaylistData;
window.getPlaylistsData = getPlaylistsData;
window.savePlaylistsData = savePlaylistsData;
window.getCurrentPlaylistUsername = getCurrentPlaylistUsername;
window.isItemFavoriteForPlaylist = isItemFavoriteForPlaylist;
window.toggleFavoriteItem = toggleFavoriteItem;
window.saveItemToCurrentPlaylist = saveItemToCurrentPlaylist;
window.addItemToHistory = addItemToHistory;
window.removeItemFromHistoryById = removeItemFromHistoryById;
window.removeAllFromHistory = removeAllFromHistory;
window.applyMarqueeEffect = applyMarqueeEffect;
window.clearMoviesAndSeriesLocalStorage = clearMoviesAndSeriesLocalStorage;
window.decodeBase64 = decodeBase64;
window.adultsCategories = adultsCategories;
window.getCurrentPlaylist = getCurrentPlaylist;
