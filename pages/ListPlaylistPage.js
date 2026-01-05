function ListPlaylistPage() {
  let playlistsData = JSON.parse(localStorage.getItem("playlistsData")) || [];

  if (playlistsData.length === 0) {
    localStorage.removeItem("currentPage");
    Router.showPage("login");
    return "";
  }
  let focusIndex = 0;
  let removeFocus = false;
  let modalFocusIndex = 0;
  let modalOpen = false;
  const LONG_PRESS_DURATION = 500; // 500ms for long press
  let enterPressTimer = null;

  setTimeout(() => {
    if (ListPlaylistPage.cleanup) ListPlaylistPage.cleanup();

    const cardElements = Array.from(
      document.querySelectorAll(".playlist-card")
    );
    const addPlaylistBtn = document.querySelector(".playlist-add-user");
    const modal = document.querySelector(".playlist-modal");
    const removeBtn = document.querySelector(".playlist-remove-btn");
    const cancelBtn = document.querySelector(".playlist-cancel-btn");
    const modalButtons = [removeBtn, cancelBtn];

    if (playlistsData.length === 0) {
      focusIndex = -1;
    }

    let prevFocusIndex = -2;

    function updateFocus() {
      if (modalOpen) {
        modalButtons.forEach((btn, i) => {
          btn.classList.toggle("playlist-card-focused", i === modalFocusIndex);
        });
        return;
      }

      if (prevFocusIndex === -1) {
        addPlaylistBtn.classList.remove("playlist-card-focused");
      } else if (prevFocusIndex >= 0 && prevFocusIndex < cardElements.length) {
        cardElements[prevFocusIndex].classList.remove("playlist-card-focused");
      }

      if (focusIndex === -1 && !removeFocus) {
        addPlaylistBtn.classList.add("playlist-card-focused");
        if (prevFocusIndex !== -1) {
          scrollBy({ top: 0 });
          addPlaylistBtn.scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
        }
      } else if (focusIndex >= 0 && focusIndex < cardElements.length) {
        const card = cardElements[focusIndex];
        if (!removeFocus) {
          card.classList.add("playlist-card-focused");
          // Only scroll if focus actually changed to this card
          if (prevFocusIndex !== focusIndex) {
            card.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }
      }

      prevFocusIndex = focusIndex;
    }

    // ---------- Playlist click ----------
    function listPlaylistClick(targetIndex = null) {
      if (localStorage.getItem("currentPage") !== "playlistPage" || modalOpen)
        return;

      if (targetIndex === -1) {
        localStorage.removeItem("currentPage");
        ListPlaylistPage.cleanup();
        Router.showPage("login");
        return;
      } else if (targetIndex >= 0 && targetIndex < playlistsData.length) {

            const loadingEl = document.querySelector("#loading-overlay");
    if (loadingEl && localStorage.getItem("currentPage") === "preLoginPage") {
      loadingEl.style.background = "rgba(0, 0, 0, 0.7)";
      loadingEl.style.marginTop = "0%";
    }

        if (loadingEl) {
            loadingEl.style.background = "rgba(0, 0, 0, 0.7)";
            loadingEl.style.marginTop = "0px";
        }
        if (playlistsData[targetIndex]) {
          loginApi(
            "",
            "",
            playlistsData[targetIndex].playlistName,
            true,
            playlistsData[targetIndex].playlistUrl
          ).then((response) => {
            if (response) {
              const currentPlaylistData = JSON.parse(
                localStorage.getItem("currentPlaylistData")
              );

              localStorage.setItem(
                "selectedPlaylist",
                JSON.stringify(playlistsData[targetIndex])
              );
              // if (!currentPlaylistData.streamFormat) {
              //   currentPlaylistData.streamFormat = "ts";

              //   localStorage.setItem(
              //     "currentPlaylistData",
              //     JSON.stringify(currentPlaylistData)
              //   );

              //   let selectedPlaylist =
              //     JSON.parse(localStorage.getItem("selectedPlaylist")) || {};
              //   if (selectedPlaylist.playlistName) {
              //     updatePlaylistData(
              //       selectedPlaylist.playlistName,
              //       "streamFormat",
              //       "ts"
              //     );
              //   }
              // }
              ListPlaylistPage.cleanup();
            }
          });
        }
      }
    }

    // ---------- Modal helpers ----------
    function openModal() {
      if (focusIndex >= 0 && focusIndex < playlistsData.length) {
        modal.classList.remove("hidden");
        modalOpen = true;
        modalFocusIndex = 0;
        updateFocus();
      }
    }

    function closeModal() {
      modal.classList.add("hidden");
      modalOpen = false;
      updateFocus();
    }

    function removePlaylist() {
      if (focusIndex >= 0 && focusIndex < playlistsData.length) {
        playlistsData.splice(focusIndex, 1);
        localStorage.setItem("playlistsData", JSON.stringify(playlistsData));
        Router.showPage("playlistPage");
      }

      if (playlistsData.length === 0) {
        focusIndex = -1;
        removeFocus = false;
      }

      closeModal();
    }

    // ---------- Keydown handling ----------
    function listPlaylistKeydown(e) {
      if (localStorage.getItem("currentPage") !== "playlistPage") return;

      if (modalOpen) {
        switch (e.key) {
          case "ArrowRight":
            modalFocusIndex = (modalFocusIndex + 1) % modalButtons.length;
            updateFocus();
            e.preventDefault();
            break;
          case "ArrowLeft":
            modalFocusIndex =
              (modalFocusIndex - 1 + modalButtons.length) % modalButtons.length;
            updateFocus();
            e.preventDefault();
            break;
          case "Enter":
            if (modalFocusIndex === 0) removePlaylist();
            else closeModal();
            e.preventDefault();
            break;
          case "Escape":
            closeModal();
            e.preventDefault();
            break;
        }
        return;
      }

      const rowLength = 4;
      const totalCards = cardElements.length;

      switch (e.key) {
        case "ArrowRight":
          if (!removeFocus && focusIndex < totalCards - 1) {
            focusIndex++;
          }
          if (removeFocus) {
            focusIndex++;
          }
          removeFocus = false;
          updateFocus();
          e.preventDefault();
          break;

        case "ArrowLeft":
          if (focusIndex == 0) {
            return;
          }
          if (!removeFocus && focusIndex > 0) {
            focusIndex--;
          }
          if (removeFocus) {
            focusIndex--;
          }
          removeFocus = false;
          updateFocus();
          e.preventDefault();
          break;

        case "ArrowDown":
          if (removeFocus) {
            // if on remove icon → move back to card body
            removeFocus = false;
          } else if (focusIndex === -1) {
            // Add Playlist → jump to first card
            focusIndex = 0;
          } else {
            // try to move one row down
            let nextIndex = focusIndex + rowLength;
            if (nextIndex < totalCards) {
              focusIndex = nextIndex;
            } else {
              // clamp to last row
              let lastRowStart =
                Math.floor((totalCards - 1) / rowLength) * rowLength;
              let posInRow = focusIndex % rowLength;
              focusIndex = Math.min(lastRowStart + posInRow, totalCards - 1);
            }
          }
          updateFocus();
          e.preventDefault();
          break;

        case "ArrowUp":
          if (focusIndex === -1) {
            return;
          }

          if (focusIndex >= rowLength) {
            // not first row → go up one row (card body)
            focusIndex -= rowLength;
          } else {
            // first row → go to Add Playlist
            focusIndex = -1;
          }
          removeFocus = false;

          updateFocus();
          e.preventDefault();
          break;

        case "Enter":
          e.preventDefault();
          if (removeFocus) {
            // On remove icon → open modal immediately
            openModal();
          } else {
            // On card body → detect short vs long press
            if (!enterPressTimer && !modalOpen) {
              enterPressTimer = setTimeout(() => {
                openModal();
                enterPressTimer = null;
              }, LONG_PRESS_DURATION);
            }
          }
          break;
      }
    }

    // ---------- Keyup handling for Enter key ----------
    function listPlaylistKeyup(e) {
      if (localStorage.getItem("currentPage") !== "playlistPage") return;

      const isEnter = e.key === "Enter" || e.keyCode === 13;

      if (!isEnter) return;

      if (enterPressTimer) {
        // Enter key released before long press threshold
        clearTimeout(enterPressTimer);
        enterPressTimer = null;

        // Only navigate if modal is not open and not on remove icon
        if (!modalOpen && !removeFocus) {
          listPlaylistClick(focusIndex);
        }
      }
    }

    // ---------- Bind events ----------
    document.addEventListener("keydown", listPlaylistKeydown);
    document.addEventListener("keyup", listPlaylistKeyup);

    removeBtn.onclick = removePlaylist;
    cancelBtn.onclick = closeModal;

    updateFocus();

    // ---------- Cleanup ----------
    ListPlaylistPage.cleanup = function () {
      document.removeEventListener("keydown", listPlaylistKeydown);
      document.removeEventListener("keyup", listPlaylistKeyup);
      cardElements.forEach((card) => (card.onclick = null));
      addPlaylistBtn.onclick = null;
      removeBtn.onclick = null;
      cancelBtn.onclick = null;
    };
  }, 0);

  return `
    <div class="playlistpage-main-container">
        <div class="settings-header">
            <div class="setting-login-header">
                <img src="/assets/app-logo.png" alt="Add User" class="playlist-add-user-img">
            </div>
            <div class="playlist-label">List User</div>
            <div class="playlist-add-user">
            <img src="/assets/listuser-add-user.png" alt="Add User" class="playlist-add-user-image">
<p>Add User</p>
            </div>
        </div>

        <div class="playlist-card-container">
            ${playlistsData
              .map(
                (playlist) => `
                <div class="playlist-card">
                    <div class="playlist-card-img">
            <svg width="107" height="107" viewBox="0 0 107 107" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="53.5" cy="53.5" r="53.5" fill="#2A83C5"/>
<path d="M72.2326 58.8486C77.8111 58.8486 82.3336 63.371 82.3336 68.9495V74H77.2831M64.6569 48.4294C69.0134 47.308 72.2326 43.3533 72.2326 38.6467C72.2326 33.9401 69.0134 29.9853 64.6569 28.8639M36.8793 58.8486C31.3007 58.8486 26.7783 63.371 26.7783 68.9495V74H67.1821V68.9495C67.1821 63.371 62.6597 58.8486 57.0812 58.8486H46.9802M46.9802 28.5457C41.4016 28.5457 36.8793 33.0681 36.8793 38.6467C36.8793 44.2253 41.4016 48.7476 46.9802 48.7476C52.5587 48.7476 57.0812 44.2253 57.0812 38.6467C57.0812 36.8069 56.5893 35.0819 55.7299 33.5962" stroke="white" stroke-width="3.78786" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

                    </div>
                    <h3>${playlist.playlistName}</h3>
                    <p>Username: ${playlist.playlistUsername}</p>
            <div class="playlist-remove-icon"><i class="fa-solid fa-trash" style="color: #ff0000;"></i></div>
                </div>
            `
              )
              .join("")}
        </div>

        <!-- One Global Modal -->
        <div class="playlist-modal hidden">
            <div class="playlist-modal-content">
                <p>Do you want to remove this playlist?</p>
                <div class="playlist-modal-actions">
                    <button class="playlist-remove-btn">Remove</button>
                    <button class="playlist-cancel-btn">Cancel</button>
                </div>
            </div>
        </div>
              <p class="playlist-instructions">Hold To Remove Playlist</p>

    </div>
    `;
}
