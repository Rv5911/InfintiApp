function LoginPage() {
  setTimeout(() => {
    if (typeof logAllDnsEntries === "function") {
      logAllDnsEntries();
    }

    // Cache elements once
    const loginInputs = Array.from(
      document.querySelectorAll(".login-page-input")
    );
    const loginButtons = Array.from(
      document.querySelectorAll(".login-page-btn")
    );
    const toggleIcons = Array.from(
      document.querySelectorAll(".toggle-password")
    );

    // Create a flat list of focusable elements with pre-calculated metadata
    // This avoids DOM queries during navigation events
    const focusableItems = [
      ...loginInputs,
      ...toggleIcons,
      ...loginButtons,
    ].map((el) => {
      const isInput = el.tagName === "INPUT";
      const isButton = el.tagName === "BUTTON";
      const isToggle = el.classList.contains("toggle-password");
      const isPasswordInput =
        isInput && el.closest(".password-container") !== null;
      const isAddPlaylistBtn =
        isButton && el.classList.contains("add-playlist");
      const isListPlaylistBtn =
        isButton && el.classList.contains("list-playlist");
      const id = el.id;

      return {
        element: el,
        isInput,
        isButton,
        isToggle,
        isPasswordInput,
        isAddPlaylistBtn,
        isListPlaylistBtn,
        id,
      };
    });

    let focusIndex = 0;

    // Fast lookups for specific indices we jump to
    const addUserBtnIndex = focusableItems.findIndex(
      (item) => item.isAddPlaylistBtn
    );
    const usernameInputIndex = focusableItems.findIndex(
      (item) => item.id === "login-username"
    );
    const toggleIconIndex = focusableItems.findIndex((item) => item.isToggle);
    const passwordInputIndex = focusableItems.findIndex(
      (item) => item.isPasswordInput
    );

    // Cached toggle icon element for quick access
    const mainToggleIcon = toggleIcons.length > 0 ? toggleIcons[0] : null;

    // focus styles helpers - Optimized to separate concerns
    function setFocusState(item, isFocused) {
      if (!item || !item.element) return;
      const {
        element,
        isInput,
        isButton,
        isToggle,
        isAddPlaylistBtn,
        isListPlaylistBtn,
      } = item;

      if (isInput) {
        if (isFocused) {
          element.classList.add("login-input-focused");
          // Only focus input if we really need to type, ensuring it doesn't scroll/zoom weirdly
          // deferred focus can sometimes help with UI stutter, but direct is usually better for inputs
        } else {
          element.classList.remove("login-input-focused");
          element.classList.remove("login-input-focused");
          if (document.activeElement === element) {
            element.blur();
          }
        }
      } else if (isButton) {
        if (isAddPlaylistBtn) {
          element.classList.toggle("login-btn-focused", isFocused);
        } else if (isListPlaylistBtn) {
          element.classList.toggle("list-users-btn-focused", isFocused);
        }
      } else if (isToggle) {
        element.classList.toggle("login-icon-focused", isFocused);
      }
    }

    // Initialize focus
    if (focusableItems.length > 0) {
      setFocusState(focusableItems[focusIndex], true);
    }

    function handleClick(e) {
      const target = e.target;

      // Use classList for fast checks
      if (target.classList.contains("add-playlist")) {
        const playlistName = document.getElementById("login-playlist-name");
        const playlistPassword = document.getElementById("login-password");
        const playlistUsername = document.getElementById("login-username");

        if (
          !playlistName.value ||
          !playlistPassword.value ||
          !playlistUsername.value
        ) {
          Toaster.showToast("error", "Please complete all fields!");
          return;
        }

        if (typeof logAllDnsEntries === "function") logAllDnsEntries();
        const loadingEl = document.querySelector("#loading-overlay");
        if (loadingEl) {
          loadingEl.style.background = "rgba(0, 0, 0, 0.7)";
          loadingEl.style.marginTop = "0%";
        }
        loginApi(
          playlistUsername.value,
          playlistPassword.value,
          playlistName.value
        ).then((response) => {
          if (response) {
            LoginPage.cleanup();
          }
        });
      }

      if (target.classList.contains("list-playlist")) {
        // Optimized: Don't parse if we don't need to?
        // Actually, we need to check length.
        // We can just check the string existence first potentially, but parsing is safe enough here as click is rare.
        let playlistsData = [];
        try {
          const stored = localStorage.getItem("playlistsData");
          if (stored) playlistsData = JSON.parse(stored);
        } catch (err) {
          console.error(err);
        }

        if (!playlistsData || playlistsData.length === 0) {
          Toaster.showToast("error", "No Playlists Available Please Add One!");
          return;
        } else {
          localStorage.setItem("currentPage", "playlistPage");
          LoginPage.cleanup();
          Router.showPage("playlistPage");
          return;
        }
      }

      if (target.classList.contains("toggle-password")) {
        togglePasswordVisibility(target);
      }
    }

    function togglePasswordVisibility(iconElement) {
      const wrapper = iconElement.closest(".password-wrapper");
      if (!wrapper) return;
      const input = wrapper.querySelector("input");
      if (input) {
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        iconElement.setAttribute("aria-pressed", String(isHidden));
        iconElement.classList.toggle("fa-eye-slash", !isHidden);
        iconElement.classList.toggle("fa-eye", isHidden);
      }
    }

    function handleKeydown(e) {
      const currentItem = focusableItems[focusIndex];
      const len = focusableItems.length;

      // OPTIMIZATIONS:
      // 1. Using pre-calculated 'currentItem' properties
      // 2. Using pre-calculated indices (addUserBtnIndex, etc.)

      if (e.key === "ArrowDown") {
        if (focusIndex === focusableItems.length - 1) return;

        setFocusState(currentItem, false);

        // Logic: If on eye icon, skip to LOGIN button
        if (currentItem.isToggle && addUserBtnIndex !== -1) {
          focusIndex = addUserBtnIndex;
        } else if (currentItem.isPasswordInput && addUserBtnIndex !== -1) {
          // Skip eye icon when moving down from password
          focusIndex = addUserBtnIndex;
        } else {
          focusIndex = (focusIndex + 1) % len;
        }

        setFocusState(focusableItems[focusIndex], true);
      } else if (e.key === "ArrowUp") {
        if (focusIndex === 0) return;

        setFocusState(currentItem, false);

        // Logic: If on eye icon, go back to username input
        if (currentItem.isToggle && usernameInputIndex !== -1) {
          focusIndex = usernameInputIndex;
        }
        // Logic: If on LOGIN button, skip eye icon and go back to password field
        else if (currentItem.isAddPlaylistBtn && passwordInputIndex !== -1) {
          focusIndex = passwordInputIndex;
        } else {
          focusIndex = (focusIndex - 1 + len) % len;
        }

        setFocusState(focusableItems[focusIndex], true);
      } else if (e.key === "ArrowRight") {
        // From password input -> toggle icon
        if (currentItem.isPasswordInput && toggleIconIndex !== -1) {
          setFocusState(currentItem, false);
          focusIndex = toggleIconIndex;
          setFocusState(focusableItems[focusIndex], true);
        }
        // From username input -> toggle icon (logic copied from original, though weird UX?)
        else if (
          currentItem.id === "login-username" &&
          toggleIconIndex !== -1
        ) {
          setFocusState(currentItem, false);
          focusIndex = toggleIconIndex;
          setFocusState(focusableItems[focusIndex], true);
        }
      } else if (e.key === "ArrowLeft") {
        // From toggle icon -> password input
        if (currentItem.isToggle && passwordInputIndex !== -1) {
          setFocusState(currentItem, false);
          focusIndex = passwordInputIndex;
          setFocusState(focusableItems[focusIndex], true);
        }
      } else if (e.key === "Enter") {
        if (currentItem.isInput) {
          currentItem.element.focus();
        } else if (currentItem.isButton) {
          currentItem.element.click();
        } else if (currentItem.isToggle) {
          // Use the cached element directly
          if (mainToggleIcon) togglePasswordVisibility(mainToggleIcon);
        }
      }
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeydown);

    LoginPage.cleanup = function () {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };

    toggleIcons.forEach((icon) => {
      icon.setAttribute("tabindex", "0");
      icon.setAttribute("role", "button");
      icon.setAttribute("aria-label", "Show or hide password");
      icon.setAttribute("aria-pressed", "false");
    });

    // Handle virtual keyboard shift for TV
    const passwordInput = document.getElementById("login-password");
    const formContainer = document.querySelector(".login-form");

    if (passwordInput && formContainer) {
      passwordInput.addEventListener("focus", () => {
        // Use requestAnimationFrame for smoother visual update
        requestAnimationFrame(() => {
          formContainer.style.transform = "translateY(-160px) scale(0.9)"; // Include scale to maintain size
        });
      });

      passwordInput.addEventListener("blur", () => {
        requestAnimationFrame(() => {
          formContainer.style.transform = "scale(0.9)"; // Reset to original scaled state
        });
      });
    }

    // Lazy load backgrounds to unblock Main Thread
    setTimeout(() => {
      const pageContainer = document.querySelector(".login-page-container");
      if (pageContainer) pageContainer.style.backgroundImage = "";

      const formCallback = document.querySelector(".login-form");
      if (formCallback) formCallback.style.backgroundImage = "";
    }, 100);
  }, 0);

  return `
    <div class="login-page-container" style="background-image: none !important;">

      <div class="login-form" style="background-image: none !important;">
      <div class="login-form-logo-container">

      <img src="/assets/app-logo.png" alt="Logo" class="login-form-logo" />
      </div>
      <p class="login-form-title">Login Details</p>
        <div class="login-page-form-container">
          <div class="login-input-container">
            <input type="text" id="login-playlist-name" value="SimonWinter"  class="login-page-input" placeholder="Anyname" autocomplete="new-password" />
            <img src="/assets/playlist-name-icon.png" style="opacity: 0.8;" alt="Logo" class="logo" />
          </div>
          <div class="login-input-container">
            <input type="text" id="login-username" value="SimonWinter"   class="login-page-input" placeholder="User Name" autocomplete="new-password" />
            <img src="/assets/playlist-username-icon.png" style="opacity: 0.8;" alt="Logo" class="logo" />
          </div>
          <div class="password-wrapper">
            <div class="login-input-container password-container">
              <input type="password"  id="login-password" value="1z5gFtKLe5"   class="login-page-input" placeholder="Password" autocomplete="new-password" />
              <img src="/assets/playlist-password-icon.png" style="opacity: 0.8;" alt="Logo" class="logo" />
            </div>
            <div class="toggle-password-container">
              <i class="fa-regular fa-eye-slash toggle-password"></i>
            </div>
          </div>
          <div class="button-container">
            <button class="btn add-playlist login-page-btn">LOGIN</button>
            <button class="btn list-playlist login-page-btn">
              <img src="/assets/list-users-login.png" alt="Logo" class="list-users-icon" />List Users
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
