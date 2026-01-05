function TimeModal() {
  function handleTimeClick(target) {
    if (localStorage.getItem("currentPage") !== "timeModal") return;

    if (target instanceof Event) target = target.target;
    if (!target) return;

    if (target.classList.contains("part-option")) {
      const allOptions = document.querySelectorAll(".part-option");
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
    }

    // SAVE button
    if (target.id === "saveBtnTime") {
      const checkedOption = document.querySelector(".part-option .checkbox input[type='checkbox']:checked");
      if (checkedOption) {
        const selectedFormat = checkedOption.value;
        const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist")) || {};

        if (selectedPlaylist.playlistName) {
          const success = updatePlaylistData(selectedPlaylist.playlistName, "timeFormat", selectedFormat);

          if (success) {
            Toaster.showToast("success", `Time Format changed to ${selectedFormat}`);
                 Router.showPage("timeModal");

          } else {
            Toaster.showToast("error", "Failed to update time format");
          }
        }
      } else {
        Toaster.showToast("error", "Please select a time format!");
      }
    }

    // BACK button
    if (target.id === "backBtnTime") {
      localStorage.setItem("currentPage", "settingsPage");
      Router.showPage("settings");
      document.body.style.backgroundImage = "none";
      document.body.style.backgroundColor = "black";
    }
  }

  setTimeout(() => {
    if (TimeModal.cleanup) TimeModal.cleanup();

    let timeFocusIndex = 0;

    function setTimeFocus(items, index) {
      items.forEach(el => {
        el.classList.remove("time-focused");
        el.classList.remove("time-btn-focused");
      });

      if (items[index]) {
        if (items[index].tagName === "BUTTON") {
          items[index].classList.add("time-btn-focused");
        } else {
          items[index].classList.add("time-focused");
        }
        items[index].focus();
      }
    }

    function timeKeydownHandler(e) {
      if (localStorage.getItem("currentPage") !== "timeModal") return;

      const timeFormInputs = document.querySelectorAll(".part-option");
      const saveBtnTime = document.querySelector("#saveBtnTime");
      const backBtnTime = document.querySelector("#backBtnTime");

      const timeFormItems = [...timeFormInputs, saveBtnTime, backBtnTime];

      switch (e.key) {
        case "ArrowDown":
          if (timeFocusIndex === timeFormItems.length - 1 || timeFocusIndex === timeFormItems.length - 2) {
            e.preventDefault();
            return;
          }
          timeFocusIndex++;
          if (timeFocusIndex >= timeFormItems.length) timeFocusIndex = 0;
          setTimeFocus(timeFormItems, timeFocusIndex);
          e.preventDefault();
          break;

        case "ArrowUp":
          if (timeFocusIndex === 0) {
            return;
          } else {
            if (timeFocusIndex === timeFormItems.length - 1 || timeFocusIndex === timeFormItems.length - 2) {
              timeFocusIndex = timeFormInputs.length - 1;
            } else {
              timeFocusIndex--;
              if (timeFocusIndex < 0) timeFocusIndex = timeFormItems.length - 1;
            }
            setTimeFocus(timeFormItems, timeFocusIndex);
            e.preventDefault();
          }
          break;

        case "ArrowRight":
          if (timeFocusIndex === timeFormItems.length - 2) {
            timeFocusIndex = timeFormItems.length - 1;
            setTimeFocus(timeFormItems, timeFocusIndex);
            e.preventDefault();
          }
          break;

        case "ArrowLeft":
          if (timeFocusIndex === timeFormItems.length - 1) {
            timeFocusIndex = timeFormItems.length - 2;
            setTimeFocus(timeFormItems, timeFocusIndex);
            e.preventDefault();
          }
          break;

        case "Enter":
          const focused = timeFormItems[timeFocusIndex];
          if (focused.tagName === "BUTTON") {
            return;
          } else {
            handleTimeClick(focused);
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

    document.addEventListener("click", handleTimeClick);
    document.addEventListener("keydown", timeKeydownHandler);

    TimeModal.cleanup = function () {
      document.removeEventListener("click", handleTimeClick);
      document.removeEventListener("keydown", timeKeydownHandler);
    };

    // --- pre-check saved format ---
    const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist")) || {};
    let savedFormat = selectedPlaylist.timeFormat || "12hrs"; // default 12hrs

    let matchingOption = document.querySelector(`.part-option input[value="${savedFormat}"]`);
    if (!matchingOption) {
      matchingOption = document.querySelector(`.part-option input[value="12hrs"]`);
      savedFormat = "12hrs";
    }

    if (matchingOption) {
      document.querySelectorAll(".part-option .checkbox").forEach(box => {
        const input = box.querySelector("input[type='checkbox']");
        input.checked = false;
        box.classList.remove("checked");
        box.setAttribute("aria-checked", "false");
      });

      const checkboxDiv = matchingOption.closest(".checkbox");
      matchingOption.checked = true;
      checkboxDiv.classList.add("checked");
      checkboxDiv.setAttribute("aria-checked", "true");
    }

    // initialize focus
    const initItems = [...document.querySelectorAll(".part-option"), document.querySelector("#saveBtnTime"), document.querySelector("#backBtnTime")];
    setTimeFocus(initItems, timeFocusIndex);
  }, 0);

  return `
    <div class="time-main-container">
      <div class="settings-header">
        <div class="setting-login-header">
          <img src="/assets/logo.png" alt="Logo" class="setting-header-logo" />
        </div>
    ${DateTimeComponent()}
      </div>
      <div class="part-wrap">
        <div class="part-panel" role="dialog" aria-labelledby="dialogTitle">
          <h1 class="part-title" id="dialogTitle">Time Format</h1>
          <div class="part-options" id="optionsList">
            <div class="part-option" data-index="0" tabindex="-1">
              <div class="checkbox" role="checkbox" aria-checked="false" tabindex="0">
                <input type="checkbox" aria-hidden="true" value="24hrs"/>
              </div>
              <label>24 Hours Format</label>
            </div>
            <div class="part-option highlighted" data-index="1" tabindex="-1">
              <div class="checkbox" role="checkbox" aria-checked="false" tabindex="0">
                <input type="checkbox" aria-hidden="true" value="12hrs"/>
              </div>
              <label>12 Hours Format</label>
            </div>
          </div>
          <div class="actions">
            <button class="btn save" id="saveBtnTime">Save Changes</button>
            <button class="btn back" id="backBtnTime">Back</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
