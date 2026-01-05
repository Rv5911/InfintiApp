const TMBD_API_KEY = localStorage.getItem("tmbdId");
// const TMBD_API_KEY = localStorage.getItem("tmbdId") ? localStorage.getItem("tmbdId") : "a21eeaca44af5d2a4349214ecba1b338";

const castImageUrl = "https://image.tmdb.org/t/p/w500";

let currentAnimationId = null;
let currentLoadingValue = 0;

function resetLoadingPercentage() {
  const progressElement = document.getElementById("loading-progress");
  if (progressElement) {
    progressElement.textContent = "0%";
    progressElement.style.display = "block"; // Ensure it's visible
  }

  if (currentAnimationId) {
    cancelAnimationFrame(currentAnimationId);
    currentAnimationId = null;
  }

  currentLoadingValue = 0;

  const messageElement = document.getElementById("loading-message");
  if (messageElement) {
    messageElement.textContent = "";
    messageElement.style.display = "block"; // Ensure it's visible
  }
}

function updateLoadingPercentage(targetPercentage, message = "") {
  const progressElement = document.getElementById("loading-progress");
  const messageElement = document.getElementById("loading-message");

  if (messageElement && message) {
    messageElement.textContent = message;
  }

  if (!progressElement) return;

  if (currentAnimationId) {
    cancelAnimationFrame(currentAnimationId);
    currentAnimationId = null;
  }

  // Use the stored value instead of parsing the DOM
  const currentPercentage = currentLoadingValue;

  // If already at target, just ensure it's displayed
  if (targetPercentage === currentPercentage) {
    progressElement.textContent = `${targetPercentage}%`;
    return;
  }

  const duration = 300;
  const startTime = Date.now();
  const startPercentage = currentPercentage;

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    const currentValue = Math.round(
      startPercentage + (targetPercentage - startPercentage) * easeOutQuart
    );

    currentLoadingValue = currentValue;
    progressElement.textContent = `${currentValue}%`;

    if (progress < 1) {
      currentAnimationId = requestAnimationFrame(animate);
    } else {
      currentLoadingValue = targetPercentage;
      progressElement.textContent = `${targetPercentage}%`;
      currentAnimationId = null;
    }
  }

  // Start animation immediately
  currentAnimationId = requestAnimationFrame(animate);
}

function buildLoginUrl(dns, username, password) {
  dns = dns.trim();
  if (!dns.endsWith("/")) {
    dns += "/";
  }
  return `${dns}player_api.php?username=${username}&password=${password}`;
}

async function loginApi(
  username,
  password,
  playlistName,
  fromPlaylist = false,
  playlistUrl = ""
) {
  const defaultDns = "http://mega2025.site:8080/";
  let alldns = JSON.parse(localStorage.getItem("all_dns")) || [];
  // let alldns = [];

  if (alldns.length === 0) {
    alldns = [defaultDns];
  }

  const existingPlaylists =
    JSON.parse(localStorage.getItem("playlistsData")) || [];

  if (!fromPlaylist) {
    const duplicate = existingPlaylists.find(
      (p) =>
        p.playlistName.toLowerCase().trim() ===
        playlistName.toLowerCase().trim()
    );

    if (duplicate) {
      Toaster.showToast("error", "Playlist name already exists!");
      return null;
    }
  }

  // RESET loading percentage before starting
  resetLoadingPercentage();

  const loadingOverlay = document.getElementById("loading-overlay");
  loadingOverlay.classList.remove("hidden");

  let lastStatusCode = null;
  let loginCancelled = false;

  enableKeyBlock(() => {
    loginCancelled = true;
    loadingOverlay.classList.add("hidden");
    resetLoadingPercentage();
    Toaster.showToast("error", "Login Aborted!");
  });

  try {
    if (fromPlaylist && playlistUrl) {
      try {
        updateLoadingPercentage(10, "Validating playlist URL...");
        const response = await fetch(playlistUrl);
        if (loginCancelled) {
          return null;
        }

        if (!response.ok) {
          lastStatusCode = response.status;
          throw new Error(`Invalid response ${response.status}`);
        }

        updateLoadingPercentage(20, "Processing playlist data...");
        const data = await response.json();
        if (loginCancelled) {
          return null;
        }

        if (data && data.user_info) {
          if (data.user_info.auth === 1 && data.user_info.status === "Active") {
            const newPlaylist = {
              playlistName,
              playlistUrl,
              playlistUsername: username,
            };

            localStorage.setItem(
              "selectedPlaylist",
              JSON.stringify(newPlaylist)
            );
            const newCurrentPlaylistData = {
              ...data,
              playlistName: playlistName,
            };
            localStorage.setItem(
              "currentPlaylistData",
              JSON.stringify(newCurrentPlaylistData)
            );

            updateLoadingPercentage(30, "Loading movies data...");
            const vodMovies = await getAllVodMovies();
            if (loginCancelled || !vodMovies) {
              throw new Error("Failed to load movies data");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(40, "Loading movie categories...");
            const moviesCategories = await getMoviesCategories();
            if (loginCancelled || !moviesCategories) {
              throw new Error("Failed to load movie categories");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(50, "Loading series data...");
            const vodSeries = await getAllVodSeries();
            if (loginCancelled || !vodSeries) {
              throw new Error("Failed to load series data");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(60, "Loading series categories...");
            const seriesCategories = await getSeriesCategories();
            if (loginCancelled || !seriesCategories) {
              throw new Error("Failed to load series categories");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(70, "Loading live streams...");
            const vodAllLiveStreams = await getAllLiveStreams();
            if (loginCancelled || !vodAllLiveStreams) {
              throw new Error("Failed to load live streams");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(80, "Loading live categories...");
            const liveCategories = await getLiveCategories();
            if (loginCancelled || !liveCategories) {
              throw new Error("Failed to load live categories");
            }
            await new Promise((r) => setTimeout(r, 100));

            window.allMoviesStreams = vodMovies;
            window.moviesCategories = moviesCategories;
            window.allSeriesStreams = vodSeries;
            window.allseriesCategories = seriesCategories;
            window.allLiveStreams = vodAllLiveStreams;
            window.liveCategories = liveCategories;

            updateLoadingPercentage(100, "Login successful!");

            if (!fromPlaylist) {
              existingPlaylists.push(newPlaylist);
              localStorage.setItem(
                "playlistsData",
                JSON.stringify(existingPlaylists)
              );
            }

            setTimeout(() => {
              localStorage.setItem("isLogin", true);
              localStorage.setItem("currentPage", "dashboard");
              loadingOverlay.classList.add("hidden");
              disableKeyBlock();
              resetLoadingPercentage();
              Router.showPage("dashboard");
            }, 500);
            return true;
          } else {
            throw new Error("Account not activated");
          }
        } else {
          throw new Error("Invalid Playlist Data");
        }
      } catch (error) {
        if (loginCancelled) return null;

        console.log("❌ Failed to load playlist:", playlistUrl, error);
        throw new Error(
          `Invalid Playlist URL ${
            lastStatusCode ? `(Status: ${lastStatusCode})` : ""
          }`
        );
      }
    }

    const dnsToCheck = alldns.slice(0, 5);
    let success = false;

    for (let i = 0; i < dnsToCheck.length; i++) {
      if (loginCancelled) {
        return null;
      }

      const apiUrl = buildLoginUrl(dnsToCheck[i], username, password);
      updateLoadingPercentage(10 + i * 5, "");

      try {
        const response = await fetch(apiUrl);
        if (loginCancelled) {
          return null;
        }

        if (!response.ok) {
          lastStatusCode = response.status;
          console.log(
            `❌ Failed DNS: ${dnsToCheck[i]} (Status: ${response.status})`
          );
          continue;
        }

        const data = await response.json();
        if (loginCancelled) {
          return null;
        }

        if (data && data.user_info) {
          if (data.user_info.auth === 1 && data.user_info.status === "Active") {
            const newPlaylist = {
              playlistName,
              playlistUrl: apiUrl,
              playlistUsername: username,
            };

            localStorage.setItem(
              "selectedPlaylist",
              JSON.stringify(newPlaylist)
            );
            const newCurrentPlaylistData = {
              ...data,
              playlistName: playlistName,
            };
            localStorage.setItem(
              "currentPlaylistData",
              JSON.stringify(newCurrentPlaylistData)
            );

            updateLoadingPercentage(35, "Loading movies data...");
            const vodMovies = await getAllVodMovies();
            if (loginCancelled || !vodMovies) {
              throw new Error("Failed to load movies data");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(45, "Loading movie categories...");
            const moviesCategories = await getMoviesCategories();
            if (loginCancelled || !moviesCategories) {
              throw new Error("Failed to load movie categories");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(55, "Loading series data...");
            const vodSeries = await getAllVodSeries();
            if (loginCancelled || !vodSeries) {
              throw new Error("Failed to load series data");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(65, "Loading series categories...");
            const seriesCategories = await getSeriesCategories();
            if (loginCancelled || !seriesCategories) {
              throw new Error("Failed to load series categories");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(75, "Loading live streams...");
            const vodAllLiveStreams = await getAllLiveStreams();
            if (loginCancelled || !vodAllLiveStreams) {
              throw new Error("Failed to load live streams");
            }
            await new Promise((r) => setTimeout(r, 100));

            updateLoadingPercentage(85, "Loading live categories...");
            const liveCategories = await getLiveCategories();
            if (loginCancelled || !liveCategories) {
              throw new Error("Failed to load live categories");
            }
            await new Promise((r) => setTimeout(r, 100));

            window.allMoviesStreams = vodMovies;
            window.moviesCategories = moviesCategories;
            window.allSeriesStreams = vodSeries;
            window.allseriesCategories = seriesCategories;
            window.allLiveStreams = vodAllLiveStreams;
            window.liveCategories = liveCategories;

            if (!fromPlaylist) {
              existingPlaylists.push(newPlaylist);
              localStorage.setItem(
                "playlistsData",
                JSON.stringify(existingPlaylists)
              );
            }

            updateLoadingPercentage(100, "Login successful!");
            success = true;

            setTimeout(() => {
              localStorage.setItem("isLogin", true);
              localStorage.setItem("currentPage", "dashboard");
              loadingOverlay.classList.add("hidden");
              disableKeyBlock();
              resetLoadingPercentage();
              Router.showPage("dashboard");
            }, 500);
            return true;
          } else {
            throw new Error("Account not activated");
          }
        }
      } catch (error) {
        if (loginCancelled) return null;
        console.log("❌ Failed DNS:", dnsToCheck[i], error);
        continue;
      }
    }

    if (!success) {
      throw new Error(
        `Invalid Credentials${
          lastStatusCode ? ` (Status: ${lastStatusCode})` : ""
        }`
      );
    }
  } catch (error) {
    if (loginCancelled) return null;

    console.log("❌ Login failed:", error);
    updateLoadingPercentage(100, "Login failed");

    // Check if it's an "Invalid Playlist Data" error
    const isInvalidPlaylistError =
      error.message && error.message.includes("Invalid Playlist Data");

    setTimeout(() => {
      loadingOverlay.classList.add("hidden");
      disableKeyBlock();
      resetLoadingPercentage();

      // If Invalid Playlist Data error, clear session and navigate to login
      if (isInvalidPlaylistError) {
        console.log("🔄 Invalid Playlist Data detected - redirecting to login");

        // Clear login state
        localStorage.removeItem("isLogin");
        localStorage.removeItem("selectedPlaylist");
        localStorage.removeItem("currentPlaylistData");

        // Navigate to login page
        localStorage.setItem("navigationFocus", "navbar");
        localStorage.setItem("currentPage", "loginPage");
        Router.showPage("loginPage");

        Toaster.showToast(
          "error",
          "Invalid Playlist Data. Please login again."
        );
      } else {
        // Show normal error toast
        Toaster.showToast("error", error.message);
      }
    }, 500);
    return null;
  }
}

// ✅ Get movies categories
async function getMoviesCategories() {
  const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist"));
  try {
    if (selectedPlaylist) {
      const response = await fetch(
        `${selectedPlaylist.playlistUrl}&action=get_vod_categories`
      );
      if (!response.ok) throw new Error("Failed to fetch categories");
      return await response.json();
    }
  } catch (error) {
    console.log("❌ Failed to get movies categories:", error);
  }
  return null;
}

// ✅ Get all VOD movies
async function getAllVodMovies() {
  const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist"));
  try {
    if (selectedPlaylist) {
      const response = await fetch(
        `${selectedPlaylist.playlistUrl}&action=get_vod_streams`
      );
      if (!response.ok) throw new Error("Failed to fetch movies");
      return await response.json();
    }
  } catch (error) {
    console.log("❌ Failed to get movies:", error);
  }
  return null;
}

async function getMovieDetail(movieId) {
  const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist"));
  try {
    if (selectedPlaylist) {
      const response = await fetch(
        `${selectedPlaylist.playlistUrl}&action=get_vod_info&vod_id=${movieId}`
      );
      if (!response.ok) throw new Error("Failed to fetch movies");
      return await response.json();
    }
  } catch (error) {
    console.log("❌ Failed to get movies:", error);
  }
  return null;
}

//series API's
async function getAllVodSeries() {
  const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist"));
  try {
    if (selectedPlaylist) {
      const response = await fetch(
        `${selectedPlaylist.playlistUrl}&action=get_series`
      );
      if (!response.ok) throw new Error("Failed to fetch get_series");
      return await response.json();
    }
  } catch (error) {
    console.log("❌ Failed to get get_series:", error);
  }
  return null;
}

async function getSeriesCategories() {
  const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist"));
  try {
    if (selectedPlaylist) {
      const response = await fetch(
        `${selectedPlaylist.playlistUrl}&action=get_series_categories`
      );
      if (!response.ok)
        throw new Error("Failed to get_series_categories categories");
      return await response.json();
    }
  } catch (error) {
    console.log("❌ Failed to get get_series_categories categories:", error);
  }
  return null;
}

async function getSeriesDetail(seriesId) {
  const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist"));
  try {
    if (selectedPlaylist) {
      const response = await fetch(
        `${selectedPlaylist.playlistUrl}&action=get_series_info&series_id=${seriesId}`
      );
      if (!response.ok) throw new Error("Failed to get_series_detail item");
      return await response.json();
    }
  } catch (error) {
    console.log("❌ Failed to get_series_detail item:", error);
  }
  return null;
}
//Live API's

async function getAllLiveStreams() {
  const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist"));
  try {
    if (selectedPlaylist) {
      const response = await fetch(
        `${selectedPlaylist.playlistUrl}&action=get_live_streams`
      );
      if (!response.ok) throw new Error("Failed to fetch get_live_streams");
      return await response.json();
    }
  } catch (error) {
    console.log("❌ Failed to get get_live_streams:", error);
  }
  return null;
}

async function getLiveCategories() {
  const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist"));
  try {
    if (selectedPlaylist) {
      const response = await fetch(
        `${selectedPlaylist.playlistUrl}&action=get_live_categories`
      );
      if (!response.ok)
        throw new Error("Failed to get_live_categories categories");
      return await response.json();
    }
  } catch (error) {
    console.log("❌ Failed to get get_live_categories categories:", error);
  }
  return null;
}

async function getSeriesTmbdId(seriesName) {
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/tv?api_key=${localStorage.getItem(
        "tmbdId"
      )}&query=${seriesName}`
    );

    if (!response.ok) throw new Error("Failed to fetch getSeriesTmbdId");
    return await response.json();
  } catch (error) {
    console.log("❌ Failed to get getSeriesTmbdId:", error);
  }
}

async function getSeriesCast(seriesId) {
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/tv/${seriesId}/credits?api_key=${localStorage.getItem(
        "tmbdId"
      )}`
    );
    if (!response.ok) throw new Error("Failed to fetch getSeriesCasts");
    return await response.json();
  } catch (error) {
    console.log("❌ Failed to get getSeriesCasts:", error);
  }
}

async function getMovieCast(movies_tmbd_id) {
  try {
    const repsonse = await fetch(
      `https://api.themoviedb.org/3/movie/${movies_tmbd_id}/credits?api_key=${localStorage.getItem(
        "tmbdId"
      )}`
    );

    if (!repsonse.ok) throw new Error("Failed to fetch getMovieCast");
    return await repsonse.json();
  } catch (error) {
    console.log("❌ Failed to get getMovieCast:", error);
  }
}

async function getLiveStreamEpg(liveStreamId) {
  const selectedPlaylist = JSON.parse(localStorage.getItem("selectedPlaylist"));
  try {
    if (selectedPlaylist) {
      const response = await fetch(
        `${selectedPlaylist.playlistUrl}&action=get_short_epg&stream_id=${liveStreamId}`
      );
      if (!response.ok) throw new Error("Failed to fetch getLiveStreamEpg");
      return await response.json();
    }
  } catch (error) {
    console.log("❌ Failed to get getLiveStreamEpg:", error);
  }
  return null;
}
