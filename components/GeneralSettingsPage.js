function GeneralSettingsPage() {
  function handleGeneralSettingsClick(target) {
    if (localStorage.getItem("currentPage") !== "generalSettingsPage") return;

    if (target instanceof Event) target = target.target;
    if (!target) return;

    /*
    // Handle Autoplay checkbox toggle
    if (target.classList.contains("gs-checkbox") && target.closest(".gs-option.autoplay-option")) {
      const checkbox = target;
      const input = checkbox.querySelector("input[type='checkbox']");
      
      input.checked = !input.checked;
      
      if (input.checked) {
        checkbox.classList.add("gs-checked");
        checkbox.setAttribute("aria-checked", "true");
      } else {
        checkbox.classList.remove("gs-checked");
        checkbox.setAttribute("aria-checked", "false");
      }
    }
    */

    // Handle Continue Watching Limit dropdown
    if (target.classList.contains("limit-option") || target.closest(".limit-option")) {
      const dropdown = document.querySelector(".gs-dropdown");
      const isOpen = dropdown.style.display === "block";
      
      // Toggle dropdown
      dropdown.style.display = isOpen ? "none" : "block";
      
      // Update focus if dropdown is opening
      if (!isOpen) {
        const firstOption = dropdown.querySelector(".gs-dropdown-option");
        if (firstOption) {
          firstOption.classList.add("gs-focused");
          firstOption.focus();
        }
      }
    }

    // Handle dropdown options selection
    if (target.classList.contains("gs-dropdown-option")) {
      const selectedValue = target.getAttribute("data-value");
      const displayText = target.textContent;
      
      // Update the display
      const limitDisplay = document.querySelector(".gs-limit-display");
      limitDisplay.textContent = displayText;
      
      // Close dropdown
      document.querySelector(".gs-dropdown").style.display = "none";
      
      // Update focus back to the limit option
      const limitOption = document.querySelector(".limit-option");
      limitOption.classList.add("gs-focused");
      limitOption.focus();
    }

    // SAVE button
    if (target.id === "gs-save-btn") {
      // const autoplayChecked = document.querySelector(".autoplay-option .gs-checkbox input[type='checkbox']").checked;
      const limitDisplay = document.querySelector(".gs-limit-display").textContent;
      
      // Map display text to values
      const limitMap = {
        "30 Items": "30",
        "60 Items": "60", 
        "100 Items": "100",
        "No Limit": "nolimit"
      };
      
      const limitValue = limitMap[limitDisplay] || "30";
      
      // Save to localStorage
      const generalSettings = JSON.parse(localStorage.getItem("generalSettings")) || {};
      // generalSettings.autoplay = autoplayChecked;
      generalSettings.continueLimit = limitValue;
      localStorage.setItem("generalSettings", JSON.stringify(generalSettings));

      const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist")) || {};

      if (selectedPlaylist.playlistName) {
        // const autoplaySuccess = updatePlaylistData(selectedPlaylist.playlistName, "autoplay", autoplayChecked);
        const limitSuccess = updatePlaylistData(selectedPlaylist.playlistName, "continueLimit", limitValue);

        // if (autoplaySuccess && limitSuccess) {
        if (limitSuccess) {
          Toaster.showToast("success", "General settings updated successfully");
          Router.showPage("generalSettingsPage");
        } else {
          Toaster.showToast("error", "Failed to update general settings");
        }
      } else {
        Toaster.showToast("success", "General settings updated successfully");
      }
    }

    // BACK button
    if (target.id === "gs-back-btn") {
      localStorage.setItem("currentPage", "settingsPage");
      Router.showPage("settings");
      document.body.style.backgroundImage = "none";
      document.body.style.backgroundColor = "black";
    }
  }

  setTimeout(() => {
    if (GeneralSettingsPage.cleanup) GeneralSettingsPage.cleanup();

    let gsFocusIndex = 0;

    function setGeneralFocus(items, index) {
      items.forEach(el => {
        el.classList.remove("gs-focused");
        el.classList.remove("gs-btn-focused");
      });

      if (items[index]) {
        if (items[index].tagName === "BUTTON") {
          items[index].classList.add("gs-btn-focused");
        } else {
          items[index].classList.add("gs-focused");
        }
        items[index].focus();
      }
    }

    function generalKeydownHandler(e) {
      if (localStorage.getItem("currentPage") !== "generalSettingsPage") return;

      // const autoplayOption = document.querySelector(".autoplay-option");
      const limitOption = document.querySelector(".limit-option");
      const saveBtn = document.querySelector("#gs-save-btn");
      const backBtn = document.querySelector("#gs-back-btn");
      
      const dropdownOptions = document.querySelectorAll(".gs-dropdown-option");
      const isDropdownOpen = document.querySelector(".gs-dropdown").style.display === "block";

      let gsFormItems;
      
      if (isDropdownOpen) {
        // Navigation within dropdown
        gsFormItems = [...dropdownOptions];
        
        switch (e.key) {
          case "ArrowDown":
            gsFocusIndex = (gsFocusIndex + 1) % gsFormItems.length;
            setGeneralFocus(gsFormItems, gsFocusIndex);
            e.preventDefault();
            break;
            
          case "ArrowUp":
            gsFocusIndex = (gsFocusIndex - 1 + gsFormItems.length) % gsFormItems.length;
            setGeneralFocus(gsFormItems, gsFocusIndex);
            e.preventDefault();
            break;
            
          case "Enter":
            if (gsFormItems[gsFocusIndex]) {
              gsFormItems[gsFocusIndex].click();
              gsFocusIndex = 0; // Focus back to limit option (now first item)
              const mainItems = [limitOption, saveBtn, backBtn];
              setGeneralFocus(mainItems, gsFocusIndex);
            }
            e.preventDefault();
            break;
            
          case "Escape":
          case "Back":
          case "BrowserBack":
          case "XF86Back":
            document.querySelector(".gs-dropdown").style.display = "none";
            gsFocusIndex = 0; // Focus back to limit option (now first item)
            const mainItems = [limitOption, saveBtn, backBtn];
            setGeneralFocus(mainItems, gsFocusIndex);
            e.preventDefault();
            break;
        }
      } else {
        // Main navigation
        gsFormItems = [limitOption, saveBtn, backBtn];
        
        switch (e.key) {
          case "ArrowDown":
            if (gsFocusIndex === gsFormItems.length - 1 || gsFocusIndex === gsFormItems.length - 2) {
              e.preventDefault();
              return;
            }
            gsFocusIndex++;
            if (gsFocusIndex >= gsFormItems.length) gsFocusIndex = 0;
            setGeneralFocus(gsFormItems, gsFocusIndex);
            e.preventDefault();
            break;

          case "ArrowUp":
            if (gsFocusIndex === 0) {
              return;
            } else {
              if (gsFocusIndex === gsFormItems.length - 1 || gsFocusIndex === gsFormItems.length - 2) {
                gsFocusIndex = 0; // Skip to limit option (now first item)
              } else {
                gsFocusIndex--;
                if (gsFocusIndex < 0) gsFocusIndex = gsFormItems.length - 1;
              }
              setGeneralFocus(gsFormItems, gsFocusIndex);
              e.preventDefault();
            }
            break;

          case "ArrowRight":
            if (gsFocusIndex === gsFormItems.length - 2) {
              gsFocusIndex = gsFormItems.length - 1;
              setGeneralFocus(gsFormItems, gsFocusIndex);
              e.preventDefault();
            }
            break;

          case "ArrowLeft":
            if (gsFocusIndex === gsFormItems.length - 1) {
              gsFocusIndex = gsFormItems.length - 2;
              setGeneralFocus(gsFormItems, gsFocusIndex);
              e.preventDefault();
            }
            break;

          case "Enter":
            const focused = gsFormItems[gsFocusIndex];
            if (focused === limitOption) {
              focused.click(); // Open dropdown
              const dropdownOptions = document.querySelectorAll(".gs-dropdown-option");
              if (dropdownOptions.length > 0) {
                gsFocusIndex = 0;
                setGeneralFocus(dropdownOptions, gsFocusIndex);
              }
            } 
            /*
            else if (focused === autoplayOption) {
              const checkbox = focused.querySelector(".gs-checkbox");
              checkbox.click();
            }
            */
            else if (focused.tagName === "BUTTON") {
              // Let the button handle its own click
              return;
            }
            break;

          case "Escape":
          case "Back":
          case "BrowserBack":
          case "XF86Back":
            localStorage.setItem("currentPage", "settingsPage");
            Router.showPage("settings");
            document.body.style.backgroundImage = "none";
            document.body.style.backgroundColor = "black";
            break;
        }
      }
    }

    document.addEventListener("click", handleGeneralSettingsClick);
    document.addEventListener("keydown", generalKeydownHandler);

    GeneralSettingsPage.cleanup = function () {
      document.removeEventListener("click", handleGeneralSettingsClick);
      document.removeEventListener("keydown", generalKeydownHandler);
    };

    // --- Initialize saved settings from localStorage ---
    function initializeSettings() {
      // Get settings from localStorage with fallbacks
      const generalSettings = JSON.parse(localStorage.getItem("generalSettings")) || {};
      const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist")) || {};
      
      // Priority: generalSettings > selectedPlaylist > defaults
      /*
      const autoplaySetting = generalSettings.autoplay !== undefined ? 
        generalSettings.autoplay : 
        (selectedPlaylist.autoplay !== undefined ? selectedPlaylist.autoplay : false);
      */
      
      const limitSetting = generalSettings.continueLimit || 
        selectedPlaylist.continueLimit || 
        "30";

      /*
      // Initialize autoplay checkbox
      const autoplayCheckbox = document.querySelector(".autoplay-option .gs-checkbox input[type='checkbox']");
      const autoplayCheckboxDiv = autoplayCheckbox.closest(".gs-checkbox");
      
      if (autoplaySetting) {
        autoplayCheckbox.checked = true;
        autoplayCheckboxDiv.classList.add("gs-checked");
        autoplayCheckboxDiv.setAttribute("aria-checked", "true");
      } else {
        autoplayCheckbox.checked = false;
        autoplayCheckboxDiv.classList.remove("gs-checked");
        autoplayCheckboxDiv.setAttribute("aria-checked", "false");
      }
      */
      
      // Initialize continue watching limit
      const limitMap = {
        "30": "30 Items",
        "60": "60 Items", 
        "100": "100 Items",
        "nolimit": "No Limit"
      };
      
      const limitDisplay = document.querySelector(".gs-limit-display");
      limitDisplay.textContent = limitMap[limitSetting] || "30 Items";

      // Also pre-select the dropdown option visually
      const dropdownOptions = document.querySelectorAll(".gs-dropdown-option");
      dropdownOptions.forEach(option => {
        option.classList.remove("gs-option-selected");
        if (option.getAttribute("data-value") === limitSetting) {
          option.classList.add("gs-option-selected");
        }
      });
    }

    // Initialize settings when component loads
    initializeSettings();

    // Initialize focus
    const initItems = [
      // document.querySelector(".autoplay-option"), 
      document.querySelector(".limit-option"), 
      document.querySelector("#gs-save-btn"), 
      document.querySelector("#gs-back-btn")
    ];
    setGeneralFocus(initItems, gsFocusIndex);
  }, 0);

  return `
    <div class="gs-main-container">
      <div class="gs-header">
        <div class="gs-login-header">
          <img src="/assets/logo.png" alt="Logo" class="gs-header-logo" />
        </div>
        ${DateTimeComponent()}
      </div>
      <div class="gs-content-wrap">
        <div class="gs-panel" role="dialog" aria-labelledby="gsDialogTitle">
          <h1 class="gs-title" id="gsDialogTitle">General Settings</h1>
          <div class="gs-options-list" id="gsOptionsList">
            <!--
            <div class="gs-option autoplay-option" data-index="0" tabindex="-1">
              <div class="gs-checkbox" role="checkbox" aria-checked="false" tabindex="0">
                <input type="checkbox" aria-hidden="true"/>
              </div>
              <label class="gs-option-label">Autoplay in Series/Movies</label>
            </div>
            -->
            <div class="gs-option limit-option" data-index="0" tabindex="-1">
              <div class="gs-limit-content">
                <span class="gs-limit-label">Continue Watching Limit</span>
                <div class="gs-limit-selector">
                  <span class="gs-limit-display">30 Items</span>
                  <span class="gs-limit-arrow">▼</span>
                </div>
              </div>
              <div class="gs-dropdown">
                <div class="gs-dropdown-option" data-value="30">30 Items</div>
                <div class="gs-dropdown-option" data-value="60">60 Items</div>
                <div class="gs-dropdown-option" data-value="100">100 Items</div>
                <div class="gs-dropdown-option" data-value="nolimit">No Limit</div>
              </div>
            </div>
          </div>
          <div class="gs-actions">
            <button class="gs-btn gs-save-btn" id="gs-save-btn">Save Changes</button>
            <button class="gs-btn gs-back-btn" id="gs-back-btn">Back</button>
          </div>
        </div>
      </div>
    </div>
  `;
}