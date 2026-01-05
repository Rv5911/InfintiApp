function StreamFormatModal() {
  function handleStreamClick(target) {
    if (localStorage.getItem("currentPage") !== "streamFormat") return;

    if (target instanceof Event) target = target.target;
    if (!target) return;

    if (target.classList.contains("option")) {
      const allOptions = document.querySelectorAll(".option");
      allOptions.forEach(opt => {
        const box = opt.querySelector(".checkbox");
        const input = box.querySelector("input[type='checkbox']");
        input.checked = false;
        box.classList.remove("checked");
        box.setAttribute("aria-checked", "false");
      });

      const checkboxDiv = target.querySelector(".checkbox");
      const input = checkboxDiv.querySelector("input[type='checkbox']");
      input.checked = true;
      checkboxDiv.classList.add("checked");
      checkboxDiv.setAttribute("aria-checked", "true");
      
      // Store the selected stream option immediately when user selects
      const selectedFormat = input.value;
      const optionType = target.querySelector("label").textContent.toLowerCase();
      
      // Store both format and option type to distinguish between default and hls
      localStorage.setItem("selectedStreamOption", optionType);
      localStorage.setItem("selectedStreamFormat", selectedFormat);
    }

    // SAVE button
    if (target.id === "saveBtn") {
      const checkedOption = document.querySelector(".option .checkbox input[type='checkbox']:checked");

      if (checkedOption) {
        const selectedFormat = checkedOption.value;
        const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist")) || {};
        const selectedOption = localStorage.getItem("selectedStreamOption") || "default";

        if (selectedPlaylist.playlistName) {
          const success = updatePlaylistData(selectedPlaylist.playlistName, "streamFormat", selectedFormat);
          // Also update the stream option type
          updatePlaylistData(selectedPlaylist.playlistName, "streamOptionType", selectedOption);
          
          if (success) {
            const optionLabel = document.querySelector(".option .checkbox input[type='checkbox']:checked")
              .closest(".option")
              .querySelector("label").textContent;
            Toaster.showToast("success", "Stream Format changed to " + optionLabel);
          } else {
            Toaster.showToast("error", "Failed to update stream format");
          }
        }
      } else {
        Toaster.showToast("error", "Please select a stream format");
      }
    }

    // BACK button
    if (target.id === "backBtn") {
      localStorage.setItem("currentPage", "settingsPage");
      Router.showPage("settings");
      document.body.style.backgroundImage = "none";
      document.body.style.backgroundColor = "black";
    }
  }

  setTimeout(() => {
    if (StreamFormatModal.cleanup) StreamFormatModal.cleanup();

    let streamFocusIndex = 0;

    function setStreamFocus(items, index) {
      items.forEach(el => {
        el.classList.remove("stream-focused");
        el.classList.remove("stream-btn-focused");
      });

      if (items[index]) {
        if (items[index].tagName === "BUTTON") {
          items[index].classList.add("stream-btn-focused");
        } else {
          items[index].classList.add("stream-focused");
        }
        items[index].focus();
      }
    }

    function streamKeydownHandler(e) {
      if (localStorage.getItem("currentPage") !== "streamFormat") return;

      const streamFormInputs = document.querySelectorAll(".option");
      const saveBtn = document.querySelector("#saveBtn");
      const backBtn = document.querySelector("#backBtn");
      const streamFormItems = [...streamFormInputs, saveBtn, backBtn];

      switch (e.key) {
        case "ArrowDown":
          if (streamFocusIndex === streamFormItems.length - 1 || streamFocusIndex === streamFormItems.length - 2) {
            e.preventDefault();
            return;
          }
          streamFocusIndex++;
          if (streamFocusIndex >= streamFormItems.length) streamFocusIndex = 0;
          setStreamFocus(streamFormItems, streamFocusIndex);
          e.preventDefault();
          break;

        case "ArrowUp":
          if (streamFocusIndex === 0) {
            return;
          } else {
            if (streamFocusIndex === streamFormItems.length - 1 || streamFocusIndex === streamFormItems.length - 2) {
              streamFocusIndex = streamFormInputs.length - 1;
            } else {
              streamFocusIndex--;
              if (streamFocusIndex < 0) streamFocusIndex = streamFormItems.length - 1;
            }
            setStreamFocus(streamFormItems, streamFocusIndex);
            e.preventDefault();
          }
          break;

        case "ArrowRight":
          if (streamFocusIndex === streamFormItems.length - 2) {
            streamFocusIndex = streamFormItems.length - 1;
            setStreamFocus(streamFormItems, streamFocusIndex);
            e.preventDefault();
          }
          break;

        case "ArrowLeft":
          if (streamFocusIndex === streamFormItems.length - 1) {
            streamFocusIndex = streamFormItems.length - 2;
            setStreamFocus(streamFormItems, streamFocusIndex);
            e.preventDefault();
          }
          break;

        case "Enter":
          const focused = streamFormItems[streamFocusIndex];
          if (focused.tagName === "BUTTON") {
            return;
          } else {
            handleStreamClick(focused);
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

    document.addEventListener("click", handleStreamClick);
    document.addEventListener("keydown", streamKeydownHandler);

    StreamFormatModal.cleanup = function () {
      document.removeEventListener("click", handleStreamClick);
      document.removeEventListener("keydown", streamKeydownHandler);
    };

    // Initialize focus and pre-select saved option
    const initItems = [...document.querySelectorAll(".option"), document.querySelector("#saveBtn"), document.querySelector("#backBtn")];

    const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist")) || {};
    const savedFormat = selectedPlaylist.streamFormat;
    const savedOptionType = selectedPlaylist.streamOptionType || localStorage.getItem("selectedStreamOption") || "default";

    let matchingOption = null;

    // Find the matching option based on both format and option type
    document.querySelectorAll(".option").forEach(option => {
      const input = option.querySelector("input[type='checkbox']");
      const label = option.querySelector("label").textContent.toLowerCase();
      
      if (savedOptionType === "default" && label === "default") {
        matchingOption = input;
      } else if (savedOptionType === "mpegts(.ts)" && label === "mpegts(.ts)") {
        matchingOption = input;
      } else if (savedOptionType === "hls(.m3u8)" && label === "hls(.m3u8)") {
        matchingOption = input;
      } else if (savedFormat && input.value === savedFormat) {
        // Fallback: match by format value only
        if (savedFormat === "m3u8" && !matchingOption) {
          matchingOption = input; // Take the first m3u8 option found
        } else if (savedFormat === "ts") {
          matchingOption = input;
        }
      }
    });

    // If no match found, use default
    if (!matchingOption) {
      matchingOption = document.getElementById("defaultStreamFormat");
    }

    // Apply the selection
    if (matchingOption) {
      document.querySelectorAll(".option .checkbox").forEach(box => {
        const input = box.querySelector("input[type='checkbox']");
        input.checked = false;
        box.classList.remove("checked");
        box.setAttribute("aria-checked", "false");
      });

      const checkboxDiv = matchingOption.closest(".checkbox");
      matchingOption.checked = true;
      checkboxDiv.classList.add("checked");
      checkboxDiv.setAttribute("aria-checked", "true");

      // Store the current selection
      const selectedOption = matchingOption.closest(".option").querySelector("label").textContent.toLowerCase();
      localStorage.setItem("selectedStreamOption", selectedOption);
      localStorage.setItem("selectedStreamFormat", matchingOption.value);
    }

    setStreamFocus(initItems, streamFocusIndex);
  }, 0);

  return `
    <div class="stream-main-container">
       <div class="settings-header">
            <div class="setting-login-header">
                <img src="/assets/logo.png" alt="Logo" class="setting-header-logo" />
            </div>
          ${DateTimeComponent()}
        </div>
        <div class="main-wrap">
          <div class="panel" role="dialog" aria-labelledby="dialogTitle">
            <h1 class="title" id="dialogTitle">Stream Format</h1>
            <div class="options" id="optionsList">
              <div class="option" data-index="0" tabindex="-1">
                <div class="checkbox" role="checkbox" aria-checked="false" tabindex="0">
                  <input type="checkbox" value="m3u8" aria-hidden="true" id="defaultStreamFormat" name="streamFormat" />
                </div>
                <label>Default</label>
              </div>
              <div class="option highlighted" data-index="1" tabindex="-1">
                <div class="checkbox" role="checkbox" aria-checked="false" tabindex="0">
                  <input type="checkbox" aria-hidden="true" value="ts" />
                </div>
                <label>MPEGTS(.TS)</label>
              </div>
              <div class="option" data-index="2" tabindex="-1">
                <div class="checkbox" role="checkbox" aria-checked="false" tabindex="0">
                  <input type="checkbox" aria-hidden="true" value="m3u8" />
                </div>
                <label>HLS(.m3u8)</label>
              </div>
            </div>
            <div class="actions">
              <button class="btn save" id="saveBtn">Save Changes</button>
              <button class="btn back" id="backBtn">Back</button>
            </div>
          </div>
        </div>
    </div>
  `;
}