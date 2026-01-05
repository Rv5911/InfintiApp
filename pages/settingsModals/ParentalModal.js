function ParentalModal() {
  function handleParentalClick(target) {
    if (localStorage.getItem("currentPage") !== "parentalModal") return;

    if (target instanceof Event) target = target.target;
    if (!target) return;

    // Eye icon click handler
    if (target.classList.contains("eye-icon")) {
      const input = target.previousElementSibling;
      if (input && input.classList.contains("parent-option")) {
        togglePasswordVisibility(input, target);
      }
      return;
    }

    // SAVE button
    if (target.id === "saveBtnPassword") {
      const inputs = document.querySelectorAll(".parent-option");
      const pass1 = inputs[0].value.trim();
      const pass2 = inputs[1].value.trim();

      if (!pass1 || !pass2) {
        Toaster.showToast("error", "Please fill both password fields!");
        return;
      }

      if (pass1 !== pass2) {
        Toaster.showToast("error", "Passwords do not match!");
        return;
      }

      if (pass1.length === 0) {
        Toaster.showToast("error", "Password cannot be empty!");
        return;
      }

      const selectedPlaylist =
        JSON.parse(localStorage.getItem("selectedPlaylist")) || {};
      if (!selectedPlaylist.playlistName) {
        Toaster.showToast("error", "No playlist selected!");
        return;
      }

      const updated = updatePlaylistData(
        selectedPlaylist.playlistName,
        "parentalPassword",
        pass1
      );

      if (updated) {
        Toaster.showToast("success", "Parental Password Saved");
      } else {
        Toaster.showToast("error", "Playlist not found!");
      }
    }

// REMOVE button
if (target.id === "removeBtnPassword") {
  const selectedPlaylist =
    JSON.parse(localStorage.getItem("selectedPlaylist")) || {};
  if (!selectedPlaylist.playlistName) {
    Toaster.showToast("error", "No playlist selected!");
    return;
  }

  const updated = updatePlaylistData(
    selectedPlaylist.playlistName,
    "parentalPassword",
    "" 
  );

  if (updated) {
    const inputs = document.querySelectorAll(".parent-option");
    inputs.forEach((i) => (i.value = ""));
    // Reset eye icons to default state
    const eyeIcons = document.querySelectorAll(".eye-icon");
    eyeIcons.forEach(eye => {
      eye.classList.remove("fa-eye-slash");
      eye.classList.add("fa-eye");
    });
    // Reset input types to password
    inputs.forEach(input => input.type = "password");
    Toaster.showToast("success", "Parental Password Removed");
  } else {
    Toaster.showToast("error", "Playlist not found!");
  }
}

    // BACK button
    if (target.id === "backBtnPassword") {
      localStorage.setItem("currentPage", "settingsPage");
      Router.showPage("settings");
      document.body.style.backgroundImage = "none";
      document.body.style.backgroundColor = "black";
    }
  }

  function togglePasswordVisibility(input, eyeIcon) {
    if (input.type === "password") {
      input.type = "text";
      eyeIcon.classList.remove("fa-eye");
      eyeIcon.classList.add("fa-eye-slash");
    } else {
      input.type = "password";
      eyeIcon.classList.remove("fa-eye-slash");
      eyeIcon.classList.add("fa-eye");
    }
  }

  setTimeout(() => {
    if (ParentalModal.cleanup) ParentalModal.cleanup();

    let parentalFocusIndex = 0;

    function setParentalFocus(items, index) {
      items.forEach((el) => {
        el.classList.remove("parent-focused");
        el.classList.remove("parent-btn-focused");
        el.classList.remove("eye-focused");
        if (el.classList.contains("clear-btn")) {
          el.style.color = ""; // reset when not focused
        }
      });

      if (!items[index]) return;

      if (items[index].classList.contains("clear-btn")) {
        // Special styling for Clear Fields
        items[index].style.color = "var(--gold)";
      } else if (items[index].classList.contains("eye-icon")) {
        // Special styling for Eye icon
        items[index].classList.add("eye-focused");
      } else if (items[index].tagName === "BUTTON") {
        items[index].classList.add("parent-btn-focused");
      } else {
        items[index].classList.add("parent-focused");
      }
    }

function parentalKeydownHandler(e) {
  if (localStorage.getItem("currentPage") !== "parentalModal") return;

  const clearBtn = document.querySelector(".clear-btn");
  const parentInputs = Array.from(document.querySelectorAll(".parent-option"));
  const eyeIcons = Array.from(document.querySelectorAll(".eye-icon"));
  const saveBtn = document.querySelector("#saveBtnPassword");
  const backBtn = document.querySelector("#backBtnPassword");
  const buttons = [saveBtn, backBtn];

  const allItems = [clearBtn, ...parentInputs, ...eyeIcons, ...buttons];
  
  const inClear = parentalFocusIndex === 0;
  const inInputs = parentalFocusIndex > 0 && parentalFocusIndex <= parentInputs.length;
  const inEyes = parentalFocusIndex > parentInputs.length && parentalFocusIndex <= (parentInputs.length + eyeIcons.length);
  const inButtons = parentalFocusIndex > (parentInputs.length + eyeIcons.length);

  switch (e.key) {
    case "ArrowDown":
      const lastBtnIndex = allItems.length - 1;
      const saveBtnIndex = allItems.indexOf(saveBtn);
      const backBtnIndex = allItems.indexOf(backBtn);

      if (
        parentalFocusIndex === saveBtnIndex ||
        parentalFocusIndex === backBtnIndex ||
        parentalFocusIndex === lastBtnIndex
      ) {
        e.preventDefault();
        break;
      }

      const current = allItems[parentalFocusIndex];
      
      // If currently on eye icon, go back to corresponding input
      if (current && current.classList.contains("eye-icon")) {
        const currentEyeIndex = parentalFocusIndex - (parentInputs.length + 1);
        if (currentEyeIndex >= 0 && currentEyeIndex < parentInputs.length) {
          parentalFocusIndex = currentEyeIndex + 1; // +1 because clearBtn is index 0
          const targetInput = allItems[parentalFocusIndex];
          if (targetInput) targetInput.blur(); // Don't focus, just add visual class
        }
      } 
      // If currently on input, blur it when moving away
      else if (current && current.classList.contains("parent-option")) {
        current.blur();
        
        // If it's the last input, go to first button
        const currentInputIndex = parentalFocusIndex - 1;
        if (currentInputIndex === parentInputs.length - 1) {
          parentalFocusIndex = parentInputs.length + eyeIcons.length + 1;
        } else {
          parentalFocusIndex++;
        }
      }
      // For other elements (clear button), just move down
      else {
        if (parentalFocusIndex < allItems.length - 1) {
          parentalFocusIndex++;
        }
      }

      setParentalFocus(allItems, parentalFocusIndex);
      e.preventDefault();
      break;

case "ArrowUp":
  if (parentalFocusIndex > 0) {
    const current = allItems[parentalFocusIndex];
    
    // If currently on eye icon, go back to corresponding input
    if (current && current.classList.contains("eye-icon")) {
      const currentEyeIndex = parentalFocusIndex - (parentInputs.length + 1);
      if (currentEyeIndex >= 0 && currentEyeIndex < parentInputs.length) {
        parentalFocusIndex = currentEyeIndex + 1; // +1 because clearBtn is index 0
        const targetInput = allItems[parentalFocusIndex];
        if (targetInput) targetInput.blur(); // Don't focus, just add visual class
      }
    } 
    // If currently on button, go directly to last input (skip eye icons)
    else if (inButtons) {
      parentalFocusIndex = parentInputs.length; // index of last input
      const targetInput = allItems[parentalFocusIndex];
      if (targetInput) targetInput.blur(); // Don't focus, just add visual class
    }
    // If currently on input, blur it when moving away
    else if (current && current.classList.contains("parent-option")) {
      current.blur();
      parentalFocusIndex--;
    }
    // For other elements, just move up
    else {
      parentalFocusIndex--;
    }
  }
  setParentalFocus(allItems, parentalFocusIndex);
  e.preventDefault();
  break;

    case "ArrowRight":
      if (inInputs) {
        // From input to its corresponding eye icon
        const currentInputIndex = parentalFocusIndex - 1; // because clearBtn is index 0
        if (currentInputIndex >= 0 && currentInputIndex < eyeIcons.length) {
          // Blur the input before moving to eye icon
          const currentInput = allItems[parentalFocusIndex];
          if (currentInput) currentInput.blur();
          
          parentalFocusIndex = parentInputs.length + 1 + currentInputIndex;
          setParentalFocus(allItems, parentalFocusIndex);
          e.preventDefault();
        }
      } else if (inEyes) {
        // From eye icon to next input or button
        const currentEyeIndex = parentalFocusIndex - (parentInputs.length + 1);
        if (currentEyeIndex === 0 && parentInputs.length > 1) {
          // From first eye to second input
          parentalFocusIndex = 2; // index of second input
          setParentalFocus(allItems, parentalFocusIndex);
          e.preventDefault();
        } else if (currentEyeIndex === 1 && buttons.length > 0) {
          // From second eye to first button
          parentalFocusIndex = parentInputs.length + eyeIcons.length + 1;
          setParentalFocus(allItems, parentalFocusIndex);
          e.preventDefault();
        }
      } else if (inButtons && parentalFocusIndex < allItems.length - 1) {
        parentalFocusIndex++;
        setParentalFocus(allItems, parentalFocusIndex);
        e.preventDefault();
      }
      break;

    case "ArrowLeft":
      if (inEyes) {
        // From eye icon back to its corresponding input
        const currentEyeIndex = parentalFocusIndex - (parentInputs.length + 1);
        if (currentEyeIndex >= 0 && currentEyeIndex < parentInputs.length) {
          parentalFocusIndex = currentEyeIndex + 1; // +1 because clearBtn is index 0
          const targetInput = allItems[parentalFocusIndex];
          if (targetInput) targetInput.blur(); // Don't focus, just add visual class
          setParentalFocus(allItems, parentalFocusIndex);
          e.preventDefault();
        }
      } else if (inButtons && parentalFocusIndex > (parentInputs.length + eyeIcons.length + 1)) {
        parentalFocusIndex--;
        setParentalFocus(allItems, parentalFocusIndex);
        e.preventDefault();
      } else if (inInputs) {
        // From input to previous element
        const currentInputIndex = parentalFocusIndex - 1;
        if (currentInputIndex === 1) {
          // From second input to first eye icon
          const currentInput = allItems[parentalFocusIndex];
          if (currentInput) currentInput.blur();
          
          parentalFocusIndex = parentInputs.length + 1;
          setParentalFocus(allItems, parentalFocusIndex);
          e.preventDefault();
        } else if (currentInputIndex === 0 && clearBtn) {
          // From first input to clear button
          const currentInput = allItems[parentalFocusIndex];
          if (currentInput) currentInput.blur();
          
          parentalFocusIndex = 0;
          setParentalFocus(allItems, parentalFocusIndex);
          e.preventDefault();
        }
      }
      break;

case "Enter":
  const focused = allItems[parentalFocusIndex];
  if (focused.tagName === "BUTTON") {
    focused.click();
  } else if (focused.tagName === "P" && focused.classList.contains("clear-btn")) {
    // Handle Clear action - remove password from storage
    const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist")) || {};
    if (selectedPlaylist.playlistName) {
      updatePlaylistData(selectedPlaylist.playlistName, "parentalPassword", "");
    }
    
    // Clear UI fields
    const inputs = document.querySelectorAll(".parent-option");
    inputs.forEach((i) => (i.value = ""));
    // Reset eye icons to default state
    const eyeIcons = document.querySelectorAll(".eye-icon");
    eyeIcons.forEach(eye => {
      eye.classList.remove("fa-eye-slash");
      eye.classList.add("fa-eye");
    });
    // Reset input types to password
    inputs.forEach(input => input.type = "password");
    Toaster.showToast("success", "Parental Password Removed");
  } else if (focused.classList.contains("eye-icon")) {
    // Handle Eye icon toggle
    const input = focused.previousElementSibling;
    if (input && input.classList.contains("parent-option")) {
      togglePasswordVisibility(input, focused);
    }
  } else if (focused.classList.contains("parent-option")) {
    // Focus the input when Enter is pressed on it
    focused.focus();
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

    default:
      break;
  }
}

    document.addEventListener("click", handleParentalClick);
    document.addEventListener("keydown", parentalKeydownHandler);

    ParentalModal.cleanup = function () {
      document.removeEventListener("click", handleParentalClick);
      document.removeEventListener("keydown", parentalKeydownHandler);
    };

    // Pre-fill saved password if exists
    const selectedPlaylist =
      JSON.parse(localStorage.getItem("selectedPlaylist")) || {};
    if (selectedPlaylist.parentalPassword) {
      const inputs = document.querySelectorAll(".parent-option");
      if (inputs[0] && inputs[1]) {
        inputs[0].value = selectedPlaylist.parentalPassword;
        inputs[1].value = selectedPlaylist.parentalPassword;
      }
    }

    // Init focus - ALWAYS focus on passwordInput1
    const clearBtn = document.querySelector(".clear-btn");
    const passwordInput1 = document.querySelector("#passwordInput1");
    const passwordInput2 = document.querySelector("#passwordInput2");
    const eyeIcon1 = document.querySelector(".eye-icon-1");
    const eyeIcon2 = document.querySelector(".eye-icon-2");
    const saveBtn = document.querySelector("#saveBtnPassword");
    const backBtn = document.querySelector("#backBtnPassword");
    
    // Use the same order as in keydown handler: Clear → Inputs → Eye Icons → Buttons
    const initItems = [clearBtn, passwordInput1, passwordInput2, eyeIcon1, eyeIcon2, saveBtn, backBtn];
    
    // Always set focus to passwordInput1 (index 1 because clearBtn is index 0)
    parentalFocusIndex = 1;
    setParentalFocus(initItems, parentalFocusIndex);
  }, 0);

  return `
    <div class="parental-main-container">
      <div class="settings-header">
        <div class="setting-login-header">
          <img src="/assets/logo.png" alt="Logo" class="setting-header-logo" />
        </div>
        ${DateTimeComponent()}
      </div>
      <div class="parent-wrap">
        <div class="parent-panel" role="dialog" aria-labelledby="dialogTitle">
          <h1 class="parent-title" id="dialogTitle">Set Parental Password</h1>
          <div class="parent-options" id="optionsList">
            <div class="parent-option-passwordInput1">
              <p class="clear-btn" id="removeBtnPassword">Clear Fields</p>
              <div class="password-input-wrapper">
                <input type="password" id="passwordInput1" class="parent-option" placeholder="Enter Your Password" />
                <i class="fas fa-eye eye-icon eye-icon-1"></i>
              </div>
            </div>
            <div class="password-input-wrapper">
              <input type="password" id="passwordInput2" class="parent-option" placeholder="Confirm Password" />
              <i class="fas fa-eye eye-icon eye-icon-2"></i>
            </div>
          </div>
          <div class="actions">
            <button class="btn save" id="saveBtnPassword">Save Password</button>
            <button class="btn back" id="backBtnPassword">Back</button>
          </div>
        </div>
      </div>
    </div>
  `;
}