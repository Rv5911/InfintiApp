let movieSortValue = localStorage.getItem("movieSortValue") || "default";
let sidebarLinks = [];
let selectedIndex = 0;
let globalOnRemoveItemFromContinueWatching = null;
let globalShowContiueButton = false;

function cleanupLivePlayer() {
  try {
    if (window.livePlayer) {
      console.log("Disposing live player...");

      // Store player reference to avoid race conditions
      const currentPlayer = window.livePlayer;
      window.livePlayer = null;

      // Dispose player safely
      if (typeof currentPlayer.dispose === "function") {
        currentPlayer.dispose();
      } else if (
        currentPlayer._fp &&
        typeof currentPlayer._fp.unload === "function"
      ) {
        // For Flowplayer instances
        currentPlayer._fp.unload();
      }
    }

    // Clean up any remaining video elements
    const videoElements = document.querySelectorAll(
      "#live-videojs-player, #flowplayer-live video"
    );
    videoElements.forEach((video) => {
      if (video.pause) video.pause();
      video.src = "";
      video.load();
    });

    // Reset volume handler flag
    window._liveTvVolumeHandlerAttached = false;
  } catch (err) {
    console.warn("Live player cleanup error:", err);
  }
}

function Sidebar({
  from = "",
  onSort = null,
  onRemoveItemFromContinueWatching = null,
  clearAllContinueWatching = null,
  showOpenContinueButton = false,
} = {}) {
  globalOnRemoveItemFromContinueWatching = onRemoveItemFromContinueWatching;
  globalShowContiueButton = showOpenContinueButton;

  const currentPlaylistName = JSON.parse(
    localStorage.getItem("selectedPlaylist")
  ).playlistName;
  const currentPlaylist = JSON.parse(
    localStorage.getItem("playlistsData")
  ).filter((pl) => pl.playlistName === currentPlaylistName)[0];

  const continueWatchingLive = currentPlaylist.ChannelListLive
    ? currentPlaylist.ChannelListLive
    : [];
  const continueWatchingSeries = currentPlaylist.continueWatchingSeries
    ? currentPlaylist.continueWatchingSeries
    : [];
  const continueWatchingMovies = currentPlaylist.continueWatchingMovies
    ? currentPlaylist.continueWatchingMovies
    : [];

  // console.log(localStorage.getItem("currentPage"),"currenPage")
  return `
    <div class="sidebar-main-container">
      <div class="sidebar-links">
        <a href="#" class="sidebar-link selected"><span><i class="fa-solid fa-house"></i></span>Home</a>
        ${
          from == "liveTvPage"
            ? ""
            : `<a href="#" class="sidebar-link"><span><i class="fa-solid fa-video"></i></span>Live TV</a>`
        }
        ${
          from == "moviesPage"
            ? ""
            : `<a href="#" class="sidebar-link"><span><i class="fa-solid fa-video"></i></span>Movies</a>`
        }
        ${
          from == "seriesPage"
            ? ""
            : `<a href="#" class="sidebar-link"><span><i class="fa-solid fa-film"></i></span>Series</a>`
        }

        
        ${
          from == "detailPage" ||
          from == "movieDetailPage" ||
          from == "seriesDetailPage"
            ? ""
            : `<a href="#" class="sidebar-link"><span><i class="fa-solid fa-sort"></i></span>Sort</a>`
        }
            ${
              (from == "moviesPage" && continueWatchingMovies.length > 0) ||
              (from == "seriesPage" && continueWatchingSeries.length > 0) ||
              (from == "liveTvPage" && continueWatchingLive.length > 0)
                ? `<a href="#"  class="sidebar-link ${
                    from == "moviesPage"
                      ? "movie-clear"
                      : from == "seriesPage"
                      ? "series-clear"
                      : "live-clear"
                  } "><span class="clear-history-span"><i class=" fa-solid fa-trash"></i></span>${
                    from == "moviesPage"
                      ? "Clear Continue Watching"
                      : from == "seriesPage"
                      ? "Clear Continue Watching"
                      : "Clear Channel History"
                  }</a>`
                : `<a href="#" style="display: ${
                    globalShowContiueButton ? "flex" : "none"
                  }" class="sidebar-link continue-watching-link"><span class="clear-history-span"><i class=" fa-solid fa-trash"></i></span>${"Remove From Continue Watching"}</a>`
            }
        <a href="#" class="sidebar-link"><span><i class="fa-solid fa-cog"></i></span>Settings</a>
        <a href="#" class="sidebar-link"><span><i class="fa-solid fa-list"></i></span>List Playlists</a>
      </div>
    </div>
  `;
}

/* -------- Sorting Dialog -------- */
function SortingDialog() {
  const showTopRated = localStorage.getItem("isLivePageOpen") == "true";
  // Get the current sort value from localStorage or use the global variable
  const currentSortValue =
    localStorage.getItem("movieSortValue") || movieSortValue;

  return `
    <div class="sorting-overlay-dialog sorting-overlay-dialog-hidden" id="sortingDialog">
      <div class="sorting-dialog-content">
        <p class="sorting-title">Sorting Options</p>
        <div class="sorting-options">
          <label class="sorting-option">
            <input type="radio" name="sorting" value="default" ${
              currentSortValue === "default" ? "checked" : ""
            }> Default
          </label>
          <label class="sorting-option">
            <input type="radio" name="sorting" value="az" ${
              currentSortValue === "az" ? "checked" : ""
            }> A - Z
          </label>
          <label class="sorting-option">
            <input type="radio" name="sorting" value="za" ${
              currentSortValue === "za" ? "checked" : ""
            }> Z - A
          </label>
                <label class="sorting-option">
            <input type="radio" name="sorting" value="recent" ${
              currentSortValue === "recent" ? "checked" : ""
            }> Recently Added
          </label>
          ${
            !showTopRated
              ? `
            <label class="sorting-option">
              <input type="radio" name="sorting" value="top" ${
                currentSortValue === "top" ? "checked" : ""
              }> Top Rated
            </label>
          `
              : ""
          }
        </div>
        <div class="sorting-actions">
          <button class="sorting-btn" id="sortingCloseBtn">Close</button>
          <button class="sorting-btn" id="sortingApplyBtn">Apply</button>
        </div>
      </div>
    </div>
  `;
}
/* -------- Function to Update Sorting Dialog -------- */
function updateSortingDialog() {
  const existingDialog = document.getElementById("sortingDialog");
  if (existingDialog) {
    existingDialog.remove();
  }

  const container = document.createElement("div");
  container.innerHTML = SortingDialog();
  document.body.appendChild(container);

  // Re-attach event listeners
  attachSortingDialogEvents();
}

/* -------- Attach Sorting Dialog Events -------- */
function attachSortingDialogEvents() {
  const closeBtn = document.getElementById("sortingCloseBtn");
  const applyBtn = document.getElementById("sortingApplyBtn");

  if (closeBtn) {
    closeBtn.onclick = closeSortingDialog;
  }

  if (applyBtn) {
    applyBtn.onclick = applySorting;
  }
}

/* -------- Sorting Dialog Functions -------- */
function openSortingDialog() {
  // Update the dialog first to reflect current PageOpen value
  updateSortingDialog();

  const dialog = document.getElementById("sortingDialog");
  if (!dialog) return;

  dialog.classList.remove("sorting-overlay-dialog-hidden");
  localStorage.setItem("currentPage", "sortingDialog");

  const firstOption = dialog.querySelector(".sorting-option input");
  if (firstOption) firstOption.focus();
}

function closeSortingDialog() {
  const dialog = document.getElementById("sortingDialog");
  if (!dialog) return;

  dialog.classList.add("sorting-overlay-dialog-hidden");

  // return focus to sidebar after closing
  localStorage.setItem("currentPage", "sidebar");
  openSidebar(localStorage.getItem("sidebarPage"));
}

function applySorting() {
  const checked = document.querySelector(
    '.sorting-option input[type="radio"]:checked'
  );
  if (checked) {
    const sortValue = checked.value;
    console.log("Applied sorting:", sortValue);
    localStorage.setItem("movieSortValue", sortValue);
  }

  // close dialog
  const dialog = document.getElementById("sortingDialog");
  if (dialog) {
    dialog.classList.add("sorting-overlay-dialog-hidden");
  }

  // ✅ Always close sidebar too
  const fromClosed = localStorage.getItem("sidebarPage");
  closeSidebar(fromClosed);

  // Dispatch custom event for LivePage (and others if they listen)
  const event = new CustomEvent("sortChanged", {
    detail: {
      sortType: checked ? checked.value : "default",
      page: fromClosed,
    },
  });
  document.dispatchEvent(event);

  if (typeof window.renderMovies === "function") {
    window.renderMovies();
  }
  if (typeof window.renderSeries === "function") {
    window.renderSeries();
  }
  if (typeof window.renderLiveTv === "function") {
    window.renderLiveTv();
  }
}

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
/* -------- Sidebar Key Handling -------- */
function sidebarKeyHandler(event) {
  if (localStorage.getItem("currentPage") !== "sidebar") return;

  if (sidebarLinks.length === 0) {
    let allLinks = Array.from(document.querySelectorAll(".sidebar-link"));

    sidebarLinks = allLinks.filter((link) => {
      if (globalShowContiueButton) return true;
      return !link.classList.contains("continue-watching-link");
    });
  }

  switch (event.key) {
    case "ArrowUp":
      if (selectedIndex > 0) {
        sidebarLinks[selectedIndex].classList.remove("selected");
        selectedIndex--;
        sidebarLinks[selectedIndex].classList.add("selected");
      }
      event.preventDefault();
      break;

    case "ArrowDown":
      if (selectedIndex < sidebarLinks.length - 1) {
        sidebarLinks[selectedIndex].classList.remove("selected");
        selectedIndex++;
        sidebarLinks[selectedIndex].classList.add("selected");
      }
      event.preventDefault();
      break;

    case "Enter":
      event.preventDefault();

      disposeLivePlayer();
      const selectedLink = sidebarLinks[selectedIndex];
      const text = selectedLink.textContent.trim().toLowerCase();
      const fromClosed = localStorage.getItem("sidebarPage");
      const selectedLinkClassName =
        sidebarLinks[selectedIndex].className.toLowerCase();

      closeSidebar(fromClosed);

      if (text === "settings") {
        localStorage.setItem("isLivePageOpen", "false");
        localStorage.setItem("currentPage", "settingsPage");
        localStorage.setItem("movieSortValue", "default");
        Router.showPage("settings");
      } else if (text === "list playlists") {
        localStorage.setItem("isLogin", false);
        localStorage.setItem("isLivePageOpen", "false");
        localStorage.setItem("currentPage", "playlistPage");
        localStorage.setItem("movieSortValue", "default");

        Router.showPage("playlistPage");
      } else if (text === "series") {
        localStorage.setItem("isLivePageOpen", "false");
        localStorage.setItem("currentPage", "seriesPage");
        localStorage.setItem("movieSortValue", "default");

        Router.showPage("series");
      } else if (text === "movies") {
        localStorage.setItem("isLivePageOpen", "false");
        localStorage.setItem("currentPage", "moviesPage");
        localStorage.setItem("movieSortValue", "default");

        Router.showPage("movies");
      } else if (text.includes("live")) {
        localStorage.setItem("isLivePageOpen", "true");
        localStorage.setItem("currentPage", "liveTvPage");
        localStorage.setItem("movieSortValue", "default");

        Router.showPage("liveTvPage");
      } else if (text === "home") {
        localStorage.setItem("isLivePageOpen", "false");
        localStorage.setItem("movieSortValue", "default");

        localStorage.setItem("currentPage", "dashboard");
        Router.showPage("dashboard");
      } else if (text === "sort") {
        openSortingDialog();
      } else if (selectedLinkClassName.includes("live-clear")) {
        removeAllFromHistory("ChannelListLive");
        Toaster.showToast("error", "Channel history cleared");
        localStorage.setItem("currentPage", "liveTvPage");
        localStorage.setItem("isLivePageOpen", true);
        Router.showPage("liveTvPage");
      } else if (selectedLinkClassName.includes("movie-clear")) {
        removeAllFromHistory("continueWatchingMovies");
        Toaster.showToast("error", "Continue watching cleared");

        localStorage.setItem("currentPage", "moviesPage");

        Router.showPage("movies");
      } else if (selectedLinkClassName.includes("series-clear")) {
        removeAllFromHistory("continueWatchingSeries");
        Toaster.showToast("error", "Continue watching cleared");

        localStorage.setItem("currentPage", "seriesPage");

        Router.showPage("series");
      } else {
        if (selectedLinkClassName.includes("continue-watching-link")) {
          if (
            globalOnRemoveItemFromContinueWatching &&
            typeof globalOnRemoveItemFromContinueWatching === "function"
          ) {
            globalOnRemoveItemFromContinueWatching();
          }
        }
      }
      break;

    case "Escape":
    case "Back":
    case "BrowserBack":
    case "XF86Back":
    case "10009":
      const from = localStorage.getItem("sidebarPage");
      closeSidebar(from);
      event.preventDefault();
      break;
  }
}

/* -------- Sorting Key Handling -------- */
function sortingKeyHandler(e) {
  if (localStorage.getItem("currentPage") !== "sortingDialog") return;

  const dialog = document.getElementById("sortingDialog");
  if (!dialog) return;

  const options = Array.from(dialog.querySelectorAll(".sorting-option input"));
  const buttons = Array.from(dialog.querySelectorAll(".sorting-btn"));
  const focusable = [...options, ...buttons];
  let index = focusable.indexOf(document.activeElement);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const active = document.activeElement;
    if (active.type === "radio") {
      if (index < focusable.length - 1) focusable[index + 1].focus();
    } else if (active.classList.contains("sorting-btn")) {
      // When on buttons, don't move down (stay on buttons)
      return;
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const active = document.activeElement;
    if (active.type === "radio") {
      if (index > 0) focusable[index - 1].focus();
    } else if (active.classList.contains("sorting-btn")) {
      // When on buttons and pressing Arrow Up, move to last radio option
      if (options.length > 0) {
        options[options.length - 1].focus();
      }
    }
  } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const active = document.activeElement;

    if (active.type === "radio") {
      e.preventDefault();
      return;
    }

    // Only handle buttons
    if (active.classList.contains("sorting-btn")) {
      e.preventDefault();
      const btnIndex = buttons.indexOf(active);

      if (e.key === "ArrowRight") {
        // Only allow moving from Close to Apply
        if (btnIndex === 0) {
          // Close button
          buttons[1].focus(); // Move to Apply
        }
        // If on Apply button, do nothing
      } else if (e.key === "ArrowLeft") {
        // Only allow moving from Apply to Close
        if (btnIndex === 1) {
          // Apply button
          buttons[0].focus(); // Move to Close
        }
        // If on Close button, do nothing
      }
    }
  } else if (e.key === "Enter") {
    if (document.activeElement.id === "sortingApplyBtn") {
      applySorting();
    } else if (document.activeElement.id === "sortingCloseBtn") {
      closeSortingDialog();
    } else if (document.activeElement.type === "radio") {
      document.activeElement.checked = true;
    }
  } else if (
    e.key === "Escape" ||
    e.key === "Back" ||
    e.key === "BrowserBack" ||
    e.key === "XF86Back" ||
    e.key === "10009"
  ) {
    closeSortingDialog();
    e.preventDefault();
  }
}

/* -------- Sidebar Open/Close -------- */
function openSidebar(from = "") {
  const sidebar =
    from === "moviesPage"
      ? document.querySelector(".sidebar-container-movie")
      : from === "seriesPage"
      ? document.querySelector(".sidebar-container-series")
      : from === "liveTvPage"
      ? document.querySelector(".sidebar-container-live")
      : from === "moviesDetailPage"
      ? document.querySelector(".sidebar-container-movie-detail")
      : from === "seriesDetailPage"
      ? document.querySelector(".sidebar-container-series-detail")
      : null;

  if (!sidebar) return;
  sidebar.style.display = "block";
  localStorage.setItem("currentPage", "sidebar");
  localStorage.setItem("sidebarPage", from);

  sidebarLinks = Array.from(sidebar.querySelectorAll(".sidebar-link")).filter(
    (link) => {
      if (globalShowContiueButton) return true;
      return !link.classList.contains("continue-watching-link");
    }
  );

  selectedIndex = 0;
  sidebarLinks.forEach((link) => link.classList.remove("selected"));
  if (sidebarLinks[selectedIndex])
    sidebarLinks[selectedIndex].classList.add("selected");

  document.addEventListener("keydown", sidebarKeyHandler);
}

function closeSidebar(from = "") {
  const sidebar =
    from === "moviesPage"
      ? document.querySelector(".sidebar-container-movie")
      : from === "seriesPage"
      ? document.querySelector(".sidebar-container-series")
      : from === "liveTvPage"
      ? document.querySelector(".sidebar-container-live")
      : from === "moviesDetailPage"
      ? document.querySelector(".sidebar-container-movie-detail")
      : from === "seriesDetailPage"
      ? document.querySelector(".sidebar-container-series-detail")
      : null;

  if (!sidebar) return;

  sidebar.style.display = "none";
  if (from) localStorage.setItem("currentPage", from);

  document.removeEventListener("keydown", sidebarKeyHandler);
  sidebarLinks = [];
  selectedIndex = 0;
}

function setPageOpen(value) {
  localStorage.setItem("isLivePageOpen", value ? "true" : "false");
  updateSortingDialog();
}

document.addEventListener("DOMContentLoaded", function () {
  updateSortingDialog();

  document.addEventListener("keydown", sortingKeyHandler);
});

window.updateSortingDialog = updateSortingDialog;
window.setPageOpen = setPageOpen;
