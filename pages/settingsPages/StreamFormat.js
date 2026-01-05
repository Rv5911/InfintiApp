function StreamFormat() {
  setTimeout(function () {
    var container = document.querySelector(".stream-format-container");
    if (!container) return;

    var radios = container.querySelectorAll("input[type='radio']");
    var saveButton = container.querySelector("#saveBtn");
    var radioOptions = container.querySelectorAll(".radio-option");
    var currentFocus = 0;

    // Load saved value from currentPlaylist
    var currentPlaylist = getCurrentPlaylist();
    var savedFormat =
      currentPlaylist && currentPlaylist.streamFormat
        ? currentPlaylist.streamFormat
        : null;

    if (savedFormat) {
      for (var i = 0; i < radios.length; i++) {
        if (radios[i].value === savedFormat) {
          radios[i].checked = true;
          currentFocus = i;
          break;
        }
      }
    } else {
      // Pre-check the default option (m3u8) if no saved value
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
      radioOptions.forEach(function (option) {
        option.classList.remove("radio-focused");
      });

      // Remove focus from save button
      saveButton.classList.remove("save-btn-focused");

      // Add focus to current element
      if (currentFocus < radios.length) {
        radioOptions[currentFocus].classList.add("radio-focused");
      } else {
        saveButton.classList.add("save-btn-focused");
      }
    }

    function removeAllFocusStyles() {
      radioOptions.forEach(function (option) {
        option.classList.remove("radio-focused");
      });
      if (saveButton) saveButton.classList.remove("save-btn-focused");
    }

    function streamFormatKeydownEvents(e) {
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
          document.removeEventListener("keydown", streamFormatKeydownEvents);
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
            if (selectedOption === "m3u8") {
              optionLabel = "Default";
            } else if (selectedOption === "ts") {
              optionLabel = "MPEGTS(.TS)";
            } else if (selectedOption === "hls") {
              optionLabel = "HLS(.m3u8)";
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
          // Only back keys remove the subpage
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
          document.removeEventListener("keydown", streamFormatKeydownEvents);
        localStorage.setItem("currentPage", "dashboard");
        Router.showPage("dashboard");
          break;

        default:
          break;
      }
    }

    document.addEventListener("keydown", streamFormatKeydownEvents);

    // Add click handlers for custom radio buttons
    radioOptions.forEach(function (option, index) {
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
          radioOptions[index].classList.remove("radio-focused");
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
        saveButton.classList.remove("save-btn-focused");
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
      const currentPlaylist = getCurrentPlaylist();
      console.log(
        currentPlaylist,
        "currentPlaylistcurrentPlaylistcurrentPlaylist"
      );

      updatePlaylistData(
        currentPlaylist.playlistName,
        "streamFormat",
        selectedValue
      );

      // Remove focus styles after saving
      removeAllFocusStyles();

      Toaster.showToast("success", selectedValue + " format selected");

      // Reset focus to first radio
      if (radios.length > 0) {
        currentFocus = 0;
        radios[currentFocus].focus();
        updateFocusStyles();
      }

      console.log("Stream format saved:", selectedValue);
    });

    // Clean up when component is destroyed
    return function cleanup() {
      document.removeEventListener("keydown", streamFormatKeydownEvents);
      removeAllFocusStyles();
    };
  }, 0);

  return `
    <div class="stream-format-container" tabindex="0">
      <div class="radio-group">
        <label class="radio-option">
          <input type="radio" name="format" value="m3u8">
          <span class="custom-radio"></span>
          <div>
            <div class="option-label">Default</div>
          </div>
        </label>
        <label class="radio-option">
          <input type="radio" name="format" value="ts">
          <span class="custom-radio"></span>
          <div>
            <div class="option-label">MPEGTS(.TS)</div>
          </div>
        </label>
        <label class="radio-option">
          <input type="radio" name="format" value="hls">
          <span class="custom-radio"></span>
          <div>
            <div class="option-label">HLS(.m3u8)</div>
          </div>
        </label>
      </div>
      <div class="saveBtn-div">
        <button id="saveBtn">Save Changes</button>
      </div>
    </div>`;
}
