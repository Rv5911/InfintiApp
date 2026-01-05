function NoCacheModal() {
  // Remove existing modal and listeners if any
  const existingModal = document.querySelector('.nocache-main-container');
  if (existingModal) {
    existingModal.remove();
    if (NoCacheModal.cleanup) NoCacheModal.cleanup();
  }

  function handleNoCacheClick(target) {
    if (localStorage.getItem("currentPage") !== "nocachePage") return;
    if (target instanceof Event) target = target.target;
    if (!target) return;

    const saveBtnCache = document.querySelector("#saveBtnCache");
    const backBtnCache = document.querySelector("#backBtnCache");

    if (target === saveBtnCache) {
      // Remove listeners before executing logic to prevent double calls
      if (NoCacheModal.cleanup) NoCacheModal.cleanup();

      try {
        Toaster.showToast("success", "App cache cleared");
        // localStorage.clear();
      } catch (err) {
        Toaster.showToast("error", "Failed to clear cache/data");
      }

      closeModal();
    }

    if (target === backBtnCache) {
      closeModal();
    }
  }

  function closeModal() {
    if (NoCacheModal.cleanup) NoCacheModal.cleanup();

    const modal = document.querySelector('.nocache-main-container');
    if (modal) modal.remove();

    localStorage.setItem("currentPage", "settingsPage");
    Router.showPage("settings");
    document.body.style.backgroundImage = "none";
    document.body.style.backgroundColor = "black";
  }

  setTimeout(() => {
    // Cleanup previous listeners
    if (NoCacheModal.cleanup) NoCacheModal.cleanup();

    let focusIndex = 0;
    const buttons = [
      document.querySelector("#saveBtnCache"),
      document.querySelector("#backBtnCache")
    ].filter(Boolean);

    function setFocus(index) {
      buttons.forEach((btn, i) => {
        btn.classList.toggle("nocache-focused", i === index);
        if (i === index) btn.focus();
      });
    }

    function noCacheKeydownHandler(e) {
      if (localStorage.getItem("currentPage") !== "nocachePage") return;

      switch (e.key) {
        case "ArrowRight":
        case "39":
        case "40":
          if (focusIndex < buttons.length - 1) focusIndex++;
          setFocus(focusIndex);
          e.preventDefault();
          break;

        case "ArrowLeft":
        case "37":
        case "38":
          if (focusIndex > 0) focusIndex--;
          setFocus(focusIndex);
          e.preventDefault();
          break;

        case "Enter":
        case "13":
          handleNoCacheClick(buttons[focusIndex]);
          break;

        case "Escape":
        case "Back":
        case "BrowserBack":
        case "XF86Back":
        case "SoftLeft":
          closeModal();
          break;
      }
    }

    const modalContainer = document.querySelector(".nocache-main-container");
    modalContainer.addEventListener("click", handleNoCacheClick);
    document.addEventListener("keydown", noCacheKeydownHandler);

    NoCacheModal.cleanup = function () {
      modalContainer.removeEventListener("click", handleNoCacheClick);
      document.removeEventListener("keydown", noCacheKeydownHandler);
    };

    setFocus(focusIndex);
  }, 0);

  return `
    <div class="nocache-main-container">
      <div class="settings-header">
        <div class="setting-login-header">
          <img src="/assets/logo.png" alt="Logo" class="setting-header-logo" />
        </div>
        ${DateTimeComponent()}
      </div>

      <div class="clear-wrap">
        <div class="clear-panel" role="dialog" aria-labelledby="dialogTitle">
          <h1 class="clear-title" id="dialogTitle">Do you want to clear App Cache and Data?</h1>
          <div class="clear-actions">
            <button class="btn save" id="saveBtnCache">Yes</button>
            <button class="btn back" id="backBtnCache">No</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
