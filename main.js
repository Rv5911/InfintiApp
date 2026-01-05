window.onload = function () {
  // Movies Data Save
  window.moviesCategories = [];
  window.allMoviesStreams = [];

  // Series Data Save
  window.allSeriesStreams = [];
  window.allSeriesCategories = [];

  // Live Data Save
  window.allLiveStreams = [];
  window.liveCategories = [];

  //  Register remote keys (Tizen TV)
  if (typeof tizen !== "undefined" && tizen.tvinputdevice) {
    const keys = tizen.tvinputdevice.getSupportedKeys();
    keys.forEach((key) => {
      tizen.tvinputdevice.registerKey(key.name);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (localStorage.getItem("currentPage") !== "dashboard") {
      if (e.key === "XF86Exit" && typeof tizen !== "undefined") {
        const app = tizen.application.getCurrentApplication();
        if (app) app.exit();
      }
    }
  });

  Toaster();

  let selectedPlaylistData = null;

  if (localStorage.getItem("selectedPlaylist")) {
    try {
      selectedPlaylistData = JSON.parse(
        localStorage.getItem("selectedPlaylist")
      );
    } catch (error) {
      console.log("error selectedPlaylist is null or undefined");
    }
  } else {
    selectedPlaylistData = null;
  }

  showSplashScreen();

  setTimeout(() => {
    const isLogin = localStorage.getItem("isLogin") === "true";

    if (isLogin) {
      Router.showPage("preLoginPage");
    } else if (selectedPlaylistData && !isLogin) {
      localStorage.setItem("currentPage", "playlistPage");
      Router.showPage("playlistPage");
    } else {
      Router.showPage("login");
    }

    // Router.showPage("dashboard");
  }, 5000);

  if (typeof logAllDnsEntries === "function") {
    logAllDnsEntries();
  }

  if (typeof getTmbdId === "function") {
    getTmbdId();
  }
};

function showSplashScreen() {
  const splashPage = document.getElementById("splash-page");
  splashPage.innerHTML = `
    <div class="splash-page-container" style="background-image: url('/assets/bg-img.png');">
      <img src="/assets/app-logo.png" alt="Logo" class="logo" />
    </div>
  `;
  splashPage.style.display = "block";

  const allPages = document.querySelectorAll(".page");
  allPages.forEach((page) => {
    if (page.id !== "splash-page") {
      page.style.display = "none";
    }
  });
}
