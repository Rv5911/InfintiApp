function ExitModal() {
  // Remove existing modal and listeners if any
  const existingModal = document.querySelector('.exit-main-container');
  if (existingModal) {
    existingModal.remove();
    if (ExitModal.cleanup) ExitModal.cleanup();
  }

  function handleExitClick(target) {
    if (localStorage.getItem("currentPage") !== "exitPage") return;
    if (target instanceof Event) target = target.target;
    if (!target) return;

    const saveBtnExit = document.querySelector("#saveBtnExit");
    const backBtnExit = document.querySelector("#backBtnExit");

    if (target === saveBtnExit) {
      if (ExitModal.cleanup) ExitModal.cleanup();

      try {
              const app = tizen.application.getCurrentApplication();
      if (app) app.exit();
      } catch (err) {
        Toaster.showToast("error", "Failed to exit app");
      }

      closeModal();
    }

    if (target === backBtnExit) {
      closeModal();
    }
  }

  function closeModal() {
    if (ExitModal.cleanup) ExitModal.cleanup();

    const modal = document.querySelector('.exit-main-container');
    if (modal) modal.remove();
    localStorage.setItem("currentPage", "dashboard");
    Router.showPage("dashboard");
    document.body.style.backgroundImage = "none";
    document.body.style.backgroundColor = "black";
  }

  setTimeout(() => {
    // Cleanup previous listeners
    if (ExitModal.cleanup) ExitModal.cleanup();

    let focusIndex = 0;
    const buttons = [
      document.querySelector("#saveBtnExit"),
      document.querySelector("#backBtnExit")
    ].filter(Boolean);

    function setFocus(index) {
      buttons.forEach((btn, i) => {
        btn.classList.toggle("exit-focused", i === index);
        if (i === index) btn.focus();
      });
    }

    function exitKeydownHandler(e) {
      if (localStorage.getItem("currentPage") !== "exitPage") return;

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
          handleExitClick(buttons[focusIndex]);
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

    const modalContainer = document.querySelector(".exit-main-container");
    modalContainer.addEventListener("click", handleExitClick);
    document.addEventListener("keydown", exitKeydownHandler);

    ExitModal.cleanup = function () {
      modalContainer.removeEventListener("click", handleExitClick);
      document.removeEventListener("keydown", exitKeydownHandler);
    };

    setFocus(focusIndex);
  }, 0);

  return `
    <div class="exit-main-container">
      <div class="settings-header">
        <div class="setting-login-header">
          <img src="/assets/app-logo.png" alt="Logo" class="exitModal-header-logo" />
        </div>
        ${DateTimeComponent()}
      </div>

      <div class="clear-wrap">
        <div class="clear-panel" role="dialog" aria-labelledby="dialogTitle">
          <h1 class="clear-title" id="dialogTitle">Do you want to Exit the App?</h1>
          <div class="clear-actions">
            <button class="btn save" id="saveBtnExit">Yes</button>
            <button class="btn back" id="backBtnExit">No</button>
          </div>
        </div>
      </div>
    </div>
  `;
}