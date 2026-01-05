const Router = (() => {
  const pages = {
    login: {
      el: document.getElementById("login-page"),
      render: LoginPage,
    },
    splash: {
      el: document.getElementById("splash-page"),
      render: SplashScreen,
    },
    dashboard: {
      el: document.getElementById("dashboard-page"),
      render: DashboardPage,
    },
    settings: {
      el: document.getElementById("settings-page"),
      render: SettingsPage,
    },
    movies: {
      el: document.getElementById("movies-page"),
      render: MoviesPage,
    },
    series: {
      el: document.getElementById("series-page"),
      render: SeriesPage,
    },
    liveTvPage: {
      el: document.getElementById("livetv-page"),
      render: LivePage,
    },
    accountPage: {
      el: document.getElementById("account-page"),
      render: AccountPage,
    },
    movieDetail: {
      el: document.getElementById("movies-detail-page"),
      render: MovieDetailPage,
    },
    seriesDetail: {
      el: document.getElementById("series-detail-page"),
      render: SeriesDetailPage,
    },
    playlistPage: {
      el: document.getElementById("playlist-page"),
      render: ListPlaylistPage,
    },
    streamModal: {
      el: document.getElementById("stream-modal"),
      render: StreamFormatModal,
    },
    timeModal: {
      el: document.getElementById("time-modal"),
      render: TimeModal,
    },
    parentalModal: {
      el: document.getElementById("parental-modal"),
      render: ParentalModal,
    },
    cacheModal: {
      el: document.getElementById("cache-modal"),
      render: NoCacheModal,
    },
    videoJsPlayer: {
      el: document.getElementById("videojs-player"),
      render: VideoJsPlayer,
    },
    exitModal: {
      el: document.getElementById("exit-modal"),
      render: ExitModal,
    },
    generalSettingsPage: {
      el: document.getElementById("general-settings"),
      render: GeneralSettingsPage,
    },
    preLoginPage: {
      el: document.getElementById("prelogin-page"),
      render: PreLoginPage,
    },
  };

  let currentPageName = null;

  function showPage(name) {
    // Run cleanup of the current page if available
    if (
      currentPageName &&
      typeof pages[currentPageName].cleanup === "function"
    ) {
      pages[currentPageName].cleanup();
    }

    // Hide all pages
    Object.values(pages).forEach((p) => {
      if (p.el) p.el.style.display = "none";
    });

    const page = pages[name];
    if (!page) return;

    // Render new content
    if (typeof page.render === "function") {
      page.el.innerHTML = page.render();
    }

    // Show the page
    page.el.style.display = "block";

    // Run page-specific init
    if (typeof page.init === "function") {
      page.init(page.el);
    }

    currentPageName = name;
  }

  return {
    showPage,
  };
})();

window.Router = Router;
