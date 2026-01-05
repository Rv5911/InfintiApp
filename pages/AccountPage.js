function AccountPage() {
  const currentPlaylistData=JSON.parse(localStorage.getItem("currentPlaylistData")) || {}
  const existingModal = document.querySelector(".account-page-container");
  if (existingModal) {
    existingModal.remove();
    if (AccountPage.cleanup) AccountPage.cleanup();
  }

  function accountPageClick(target) {
    if (localStorage.getItem("currentPage") !== "accountPage") return;
    if (target instanceof Event) target = target.target;
    if (!target) return;

    const accountBackBtn = document.querySelector("#accountBackBtn");

    if (target === accountBackBtn) {
      closeModal();
    }
  }

  function closeModal() {
    if (AccountPage.cleanup) AccountPage.cleanup();

    const modal = document.querySelector(".account-page-container");
    if (modal) modal.remove();

    localStorage.setItem("currentPage", "dashboard");
    Router.showPage("dashboard");
    document.body.style.backgroundImage = "none";
    document.body.style.backgroundColor = "black";
  }

  setTimeout(() => {
    if (AccountPage.cleanup) AccountPage.cleanup();

    let focusIndex = 0;
    const buttons = [document.querySelector("#accountBackBtn")].filter(Boolean);

    function setFocus(index) {
      buttons.forEach((btn, i) => {
        btn.classList.toggle("nocache-focused", i === index);
        if (i === index) btn.focus();
      });
    }

    function accountPageKeydownHandler(e) {
      if (localStorage.getItem("currentPage") !== "accountPage") return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "39":
        case "40":
          if (focusIndex < buttons.length - 1) focusIndex++;
          setFocus(focusIndex);
          e.preventDefault();
          break;

        case "ArrowLeft":
        case "ArrowUp":
        case "37":
        case "38":
          if (focusIndex > 0) focusIndex--;
          setFocus(focusIndex);
          e.preventDefault();
          break;

        case "Enter":
        case "13":
          accountPageClick(buttons[focusIndex]);
          break;

        case "Escape":
        case "Back":
        case "BrowserBack":
        case "XF86Back":
        case "SoftLeft":
          case "10009":
                  localStorage.setItem("currentPage", "dashboard");
        Router.showPage("dashboard");
          // return;
          // closeModal();
          break;
      }
    }

    const modalContainer = document.querySelector(".account-page-container");
    modalContainer.addEventListener("click", accountPageClick);
    document.addEventListener("keydown", accountPageKeydownHandler);

    NoCacheModal.cleanup = function () {
      modalContainer.removeEventListener("click", accountPageClick);
      document.removeEventListener("keydown", accountPageKeydownHandler);
    };

    setFocus(focusIndex);
  }, 0);

  return `
    <div class="account-page-container">
      <div class="settings-header">
        <div class="setting-login-header">
          <img src="/assets/app-logo.png" alt="Logo" class="account-header-logo" />
        </div>
   ${DateTimeComponent()}
      </div>

      <div class="clear-wrap">
        <div class="clear-panel" role="dialog" aria-labelledby="dialogTitle">
          <h1 class="clear-title" id="dialogTitle">Account Page</h1>
          <div>

        <div class="account-page-content">
  <div class="account-item">
    <p>Username</p>
    <p>${(JSON.parse(localStorage.getItem("currentPlaylistData")) || {}).user_info.username || "N/A"}</p>
  </div>

  <div class="account-item">
    <p>Account Status</p>
    <p class="account-status">${(JSON.parse(localStorage.getItem("currentPlaylistData")) || {}).user_info.status || "N/A"}</p>
  </div>

  <div class="account-item">
    <p>Expiry Date</p>
    <p>${formatUnixDate((JSON.parse(localStorage.getItem("currentPlaylistData")) || {}).user_info.exp_date  || "N/A")}</p>
  </div>

  <div class="account-item">
    <p>Active Connections</p>
    <p>${(JSON.parse(localStorage.getItem("currentPlaylistData")) || {}).user_info.active_cons  || "N/A"}</p>
  </div>
</div>

      
        </div>
            <div class="clear-actions">
            <button class="btn back" id="accountBackBtn">Back</button>
          </div>
      </div>
    </div>
  `;
}
