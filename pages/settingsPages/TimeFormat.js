function TimeFormat() {
  setTimeout(function () {
    var container = document.querySelector(".time-format-container");
    if (!container) return;

    var radios = container.querySelectorAll("input[type='radio']");
    var saveButton = container.querySelector("#timeSaveBtn");
    var timeOptions = container.querySelectorAll(".time-option");
    var currentFocus = 0;

    // Load saved value from currentPlaylist
    var currentPlaylist = getCurrentPlaylist();
    var savedTimeFormat =
      currentPlaylist && currentPlaylist.timeFormat
        ? currentPlaylist.timeFormat
        : null;

    if (savedTimeFormat) {
      for (var i = 0; i < radios.length; i++) {
        if (radios[i].value === savedTimeFormat) {
          radios[i].checked = true;
          currentFocus = i;
          break;
        }
      }
    } else {
      // Pre-check the 12 hours option by default if no saved value
      if (radios.length > 0) {
        radios[0].checked = true;
        currentFocus = 0;
      }
    }

    // Focus the first radio button
    if (radios.length > 0) {
      radios[currentFocus].focus();
      updateFocusStyles();
    }

    function updateFocusStyles() {
      // Remove focus from all options
      timeOptions.forEach(function (option) {
        option.classList.remove("time-focused");
      });

      // Remove focus from save button
      saveButton.classList.remove("time-save-btn-focused");

      // Add focus to current element
      if (currentFocus < radios.length) {
        timeOptions[currentFocus].classList.add("time-focused");
      } else {
        saveButton.classList.add("time-save-btn-focused");
      }
    }

    function removeAllFocusStyles() {
      // Completely remove all focus styles
      timeOptions.forEach(function (option) {
        option.classList.remove("time-focused");
      });
      saveButton.classList.remove("time-save-btn-focused");
    }

    function timeFormatKeydownEvents(e) {
      switch (e.key) {
        case "ArrowDown":
          currentFocus = (currentFocus + 1) % (radios.length + 1);
          if (currentFocus < radios.length) {
            radios[currentFocus].focus();
          } else {
            saveButton.focus();
          }
          updateFocusStyles();
          e.preventDefault();
          break;

        case "ArrowUp":
          currentFocus =
            (currentFocus - 1 + radios.length + 1) % (radios.length + 1);
          if (currentFocus < radios.length) {
            radios[currentFocus].focus();
          } else {
            saveButton.focus();
          }
          updateFocusStyles();
          e.preventDefault();
          break;

        case "ArrowLeft":
          // Exit subpage back to Settings list
          removeAllFocusStyles();
          if (
            document.activeElement &&
            typeof document.activeElement.blur === "function"
          ) {
            document.activeElement.blur();
          }
          if (saveButton && typeof saveButton.blur === "function") {
            saveButton.blur();
          }
          document.removeEventListener("keydown", timeFormatKeydownEvents);
          // document.querySelector(".settings-second-container").innerHTML = ""; // Don't clear content

          // Dispatch exit event
          document.dispatchEvent(new Event("settings-subpage-exit"));

          localStorage.setItem("currentPage", "settingsPage");
          localStorage.setItem("settingPage", "settingsPage");
          e.preventDefault();
          break;

        case "ArrowRight":
          // Move to next radio in group
          if (currentFocus < radios.length) {
            currentFocus = (currentFocus + 1) % radios.length;
            radios[currentFocus].focus();
            updateFocusStyles();
          }
          e.preventDefault();
          break;

        case "Enter":
          if (currentFocus < radios.length) {
            radios[currentFocus].checked = true;
            // Trigger change event for custom styling
            radios[currentFocus].dispatchEvent(
              new Event("change", { bubbles: true })
            );

            // Show toast message for selected option
            var selectedOption = radios[currentFocus].value;
            var optionLabel = "";
            if (selectedOption === "12h") {
              optionLabel = "12 Hours Format";
            } else if (selectedOption === "24h") {
              optionLabel = "24-Hour Format";
            }

            // Focus stays on the currently selected radio button
            updateFocusStyles();
          } else {
            saveButton.click();
          }
          e.preventDefault();
          break;

        case "Backspace":
        case "Escape":
        case "Back":
        case "BrowserBack":
        case "XF86Back":
        case "10009":
          // Remove all focus styles before exiting
          removeAllFocusStyles();
          if (
            document.activeElement &&
            typeof document.activeElement.blur === "function"
          ) {
            document.activeElement.blur();
          }
          if (saveButton && typeof saveButton.blur === "function") {
            saveButton.blur();
          }
          document.removeEventListener("keydown", timeFormatKeydownEvents);
        localStorage.setItem("currentPage", "dashboard");
        Router.showPage("dashboard");
          break;

        default:
          break;
      }
    }

    document.addEventListener("keydown", timeFormatKeydownEvents);

    // Add click handlers for custom radio buttons
    timeOptions.forEach(function (option, index) {
      option.addEventListener("click", function () {
        var radio = this.querySelector("input[type='radio']");
        radio.checked = true;
        currentFocus = index;
        radio.focus();
        updateFocusStyles();
      });
    });

    // Add focus event listeners to update styles
    radios.forEach(function (radio, index) {
      radio.addEventListener("focus", function () {
        currentFocus = index;
        updateFocusStyles();
      });

      // Remove focus styles when radio loses focus (except when moving to save button)
      radio.addEventListener("blur", function () {
        // Only remove if not moving to save button
        if (currentFocus !== radios.length) {
          timeOptions[index].classList.remove("time-focused");
        }
      });
    });

    saveButton.addEventListener("focus", function () {
      currentFocus = radios.length;
      updateFocusStyles();
    });

    saveButton.addEventListener("blur", function () {
      // Only remove if not moving to a radio button
      if (currentFocus === radios.length) {
        saveButton.classList.remove("time-save-btn-focused");
      }
    });

    saveButton.addEventListener("click", function () {
      var selectedValue = "";
      for (var i = 0; i < radios.length; i++) {
        if (radios[i].checked) {
          selectedValue = radios[i].value;
          break;
        }
      }

      // Save to localStorage
      const currentPlaylist = getCurrentPlaylist();

      updatePlaylistData(
        currentPlaylist.playlistName,
        "timeFormat",
        selectedValue
      );

      // Remove focus styles after saving
      removeAllFocusStyles();
      Toaster.showToast("success", selectedValue + " selected");

      // Reset focus to first radio
      if (radios.length > 0) {
        currentFocus = 0;
        radios[currentFocus].focus();
        updateFocusStyles();
      }

      console.log("Time format saved:", selectedValue);
    });

    // Clean up when component is destroyed
    return function cleanup() {
      document.removeEventListener("keydown", timeFormatKeydownEvents);
      removeAllFocusStyles();
    };
  }, 0);

  return `
    <div class="time-format-container" tabindex="0">
      <div class="time-radio-group">
        <label class="time-option">
          <input type="radio" name="timeFormat" value="12h">
          <span class="time-custom-radio"></span>
          <div>
            <div class="time-option-label">12 Hours Format</div>
          </div>
        </label>
        <label class="time-option">
          <input type="radio" name="timeFormat" value="24h">
          <span class="time-custom-radio"></span>
          <div>
            <div class="time-option-label">24-Hour Format</div>
          </div>
        </label>
      </div>
      <div class="time-saveBtn-div">
        <button id="timeSaveBtn">Save Changes</button>
      </div>
    </div>`;
}
