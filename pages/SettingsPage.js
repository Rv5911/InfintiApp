function SettingsPage() {
    setTimeout(function() {
        if (SettingsPage.cleanup) SettingsPage.cleanup();

        const container = document.querySelector(".settings-pages-container");
        const items = Array.from(container.querySelectorAll("p"));
        let activeIndex = 0;
        let isInSubPage = true;
        let currentOpenTab = items[0]; // Default to first item

        // Show StreamFormat by default
        const secondContainer = document.querySelector(
            ".settings-second-container"
        );
        secondContainer.innerHTML = StreamFormat();
        isInSubPage = true;

        function updateActiveItem() {
            items.forEach((item, index) => {
                if (index === activeIndex) {
                    item.classList.add("settings-pages-container-active");
                    const img = item.querySelector("img");
                    if (img) img.classList.add("settings-pages-container-image-active");
                } else {
                    item.classList.remove("settings-pages-container-active");
                    const img = item.querySelector("img");
                    if (img)
                        img.classList.remove("settings-pages-container-image-active");
                }
            });
        }

        updateActiveItem();

        function settingsKeydownEvents(e) {
            if (isInSubPage) return;
            if (document.querySelector(".parental-pin-dialog-container")) return;

            if (
                localStorage.getItem("currentPage") !== "settingsPage" &&
                localStorage.getItem("settingPage") !== "settingsPage"
            )
                return;

            const key = e.key;
            const selectedItem = items[activeIndex];
            console.log(selectedItem, "selectedItem");

            switch (key) {
                case "ArrowDown":
                    if (selectedItem.classList.contains("clear-app-cache")) return;
                    if (activeIndex < items.length - 1) {
                        activeIndex++;
                        updateActiveItem();
                    }
                    break;

                case "ArrowUp":
                    if (selectedItem.classList.contains("stream-format")) return;
                    activeIndex = (activeIndex - 1 + items.length) % items.length;
                    updateActiveItem();
                    break;

                case "ArrowLeft":
                    // Do nothing
                    break;

                case "ArrowRight":
                    localStorage.setItem("settingPage", "settingsPage");
                    handleSelection(currentOpenTab); // Use currently open tab
                    break;

                case "Enter":
                    handleSelection(selectedItem);
                    break;

                case "Backspace":
                case "Escape":
                case "Back":
                case "BrowserBack":
                case "XF86Back":
                case "10009":
                    SettingsPage.cleanup();
                    localStorage.setItem("currentPage", "dashboard");
                    Router.showPage("dashboard");
                    break;

                default:
                    break;
            }
        }

        function handleSelection(item) {
            const container = document.querySelector(".settings-second-container");

            isInSubPage = true;

            // Only update currentOpenTab if it's a valid subpage item
            if (!item.classList.contains("clear-app-cache")) {
                currentOpenTab = item;
            }

            if (item.classList.contains("stream-format")) {
                container.innerHTML = StreamFormat();
                // Set up cleanup for when returning from StreamFormat
                setupSubPageCleanup();
            } else if (item.classList.contains("time-format")) {
                container.innerHTML = TimeFormat();
                setupSubPageCleanup();
            } else if (item.classList.contains("parental-control")) {
                container.innerHTML = ParentalControl();
                setupSubPageCleanup();
            } else if (item.classList.contains("clear-app-cache")) {
                alert("Clear App Cache selected");
            }
        }

        function setupSubPageCleanup() {}

        setupSubPageCleanup();

        // Listen for exit event from subpages
        function handleSubPageExit() {
            isInSubPage = false;
            updateActiveItem();
        }
        document.addEventListener("settings-subpage-exit", handleSubPageExit);

        document.addEventListener("keydown", settingsKeydownEvents);

        SettingsPage.cleanup = function() {
            document.removeEventListener("keydown", settingsKeydownEvents);
            document.removeEventListener("settings-subpage-exit", handleSubPageExit);
            isInSubPage = false;
        };
    }, 0);

    return `
  <div class="settings-inner-container">
         <div class="settings-header">
            <div class="setting-login-header">
                <img src="/assets/app-logo.png" alt="Add User" class="playlist-add-user-img">
            </div>
        </div>
    <div class="settings-main-container">
<div class="settings-content2-container">

      <div class="settings-first-container">
        <div class="settings-first-content">
          <div class="settings-pages-container">
            <p class="stream-format"><img src="/assets/stream-icon.png"/>Stream Format</p>
            <p class="time-format"><img src="/assets/time-icon.png"/>Time Format</p>
            <p class="parental-control"><img src="/assets/parental-icon.png"/>Parental Control</p>
            <!-- <p class="clear-app-cache"><img src="/assets/clear-cache-icon-white.png"/>Clear App Cache</p> -->
          </div>
        </div>
      </div>
      <div class="settings-divider">
      <div class="settings-divider-line">
      </div>
      </div>

      <div class="settings-second-container"></div>
      </div>
      </div>
      </div>
  `;
}