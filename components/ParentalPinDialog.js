function ParentalPinDialog(onSuccess, onCancel, currentPlaylist, fromPage) {
  let existing = document.querySelector(".parental-pin-dialog-container");
  if (existing) existing.remove();

  localStorage.setItem("currentPage", "parentalPinDialog");

  const container = document.createElement("div");
  container.className = "parental-pin-dialog-container";
  container.innerHTML = `
    <div class="parental-pin-dialog">
      <h2>Enter Parental PIN</h2>
      <input type="number" id="parental-pin-input" placeholder="Enter PIN" />
      <div class="pin-buttons">
        <button id="pin-submit-btn">Submit</button>
        <button id="pin-cancel-btn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  const input = container.querySelector("#parental-pin-input");
  const submitBtn = container.querySelector("#pin-submit-btn");
  const cancelBtn = container.querySelector("#pin-cancel-btn");

  let focusIndex = 0; // Start with input visually focused
  const focusElements = [input, submitBtn, cancelBtn];
  let isDialogActive = true;

  function updateFocus() {
    if (!isDialogActive) return; 
    
    focusElements.forEach((el, idx) => {
      if (el && el.classList) {
        el.classList.toggle("focused", idx === focusIndex);
      }
    });
  }

  function closeDialog() {
    if (!isDialogActive) return; 
    
    isDialogActive = false;
    
    try {
      document.removeEventListener("keydown", keydownHandler);
      
      if (submitBtn) submitBtn.onclick = null;
      if (cancelBtn) cancelBtn.onclick = null;
      if (input) input.oninput = null;
      
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      
    } catch (e) {
      console.error("Error during dialog cleanup:", e);
    }
    
    localStorage.setItem("currentPage", fromPage);
  }

  function handleSubmit() {
    if (!isDialogActive) return;
    
    const pin = input ? input.value : "";
    
    if (pin === currentPlaylist.parentalPassword) {
      closeDialog();
      
      if (onSuccess && typeof onSuccess === 'function') {
        requestAnimationFrame(() => {
          setTimeout(onSuccess, 50);
        });
      }
    } else {
      Toaster.showToast("error", `Incorrect PIN!`);
    }
  }

  function handleCancel() {
    if (!isDialogActive) return;
    
    closeDialog();
    
    if (onCancel && typeof onCancel === 'function') {
      requestAnimationFrame(() => {
        setTimeout(onCancel, 50);
      });
    }
  }

  function keydownHandler(e) {
    if (!isDialogActive) return;
    
    console.log("Key pressed:", e.key); // Debug log
    
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        // Only allow moving from input to submit button with down arrow
        if (focusIndex === 0) {
          input.blur();
          focusIndex = 1;
          updateFocus();
        }
        break;
      case "ArrowRight":
        e.preventDefault();
        // Only allow moving from submit to cancel with right arrow
        if (focusIndex === 1) {
          focusIndex = 2;
          updateFocus();
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        // Only allow moving from cancel to submit with left arrow
        if (focusIndex === 2) {
          focusIndex = 1;
          updateFocus();
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        // Allow moving from both submit and cancel buttons to input with up arrow
        if (focusIndex === 1 || focusIndex === 2) {
          focusIndex = 0;
          updateFocus();
        }
        break;
case "Enter":
  e.preventDefault();
  if (focusIndex === 0) {
    // When input is visually selected and Enter is pressed, actually focus it
    if (input && input.focus) {
      input.focus();
    }
  } else if (focusIndex === 1) {
    handleSubmit();
  } else if (focusIndex === 2) {
    handleCancel();
  }
  break;

      case "Escape":
        e.preventDefault();
        handleCancel();
        break;
    }
  }

  // Add event listener to document instead of container
  document.addEventListener("keydown", keydownHandler);

  if (submitBtn) {
    submitBtn.onclick = function(e) {
      if (!isDialogActive) return;
      e.preventDefault();
      handleSubmit();
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = function(e) {
      if (!isDialogActive) return;
      e.preventDefault();
      handleCancel();
    };
  }

  // Make the dialog focusable and focus it
  container.setAttribute('tabindex', '-1');
  container.style.outline = 'none';
  
setTimeout(() => {
  if (isDialogActive) {
    focusIndex = 0;
    input && input.blur();
    updateFocus();
    container.focus();
  }
}, 100);


  return {
    close: closeDialog,
    isActive: () => isDialogActive
  };
}