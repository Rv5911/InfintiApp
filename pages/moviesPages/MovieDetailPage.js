async function MovieDetailPage() {
    if (MovieDetailPage.cleanup) MovieDetailPage.cleanup();

    const castImageUrl = "https://image.tmdb.org/t/p/w500";
    const loadingOverlay = document.getElementById("loading-overlay");

    // --- Setup back navigation handler FIRST ---
    let navigationInterrupted = false;

    function handleBackNavigationDuringLoading(e) {
        if (
            (e.keyCode === 10009 ||
                e.key === "Escape" ||
                e.key === "Back" ||
                e.key === "BrowserBack" ||
                e.key === "XF86Back") &&
            localStorage.getItem("currentPage") === "moviesDetailPage"
        ) {
            e.preventDefault();
            e.stopPropagation();

            navigationInterrupted = true;

            if (loadingOverlay) loadingOverlay.classList.add("hidden");

            document.removeEventListener(
                "keydown",
                handleBackNavigationDuringLoading
            );

            localStorage.removeItem("selectedMovieId");
            localStorage.setItem("currentPage", "moviesPage");
            Router.showPage("movies");
            document.body.style.backgroundImage = "none";
            document.body.style.backgroundColor = "black";

            return true;
        }
    }

    document.addEventListener("keydown", handleBackNavigationDuringLoading);

    // --- Load movie data from localStorage ---
    var movieDetailId = localStorage.getItem("selectedMovieId");
    var selectedMovieItem = localStorage.getItem("selectedMovieData");
    if (!selectedMovieItem) {
        console.error("No selectedMovieData in localStorage");
        document.removeEventListener("keydown", handleBackNavigationDuringLoading);
        return;
    }
    selectedMovieItem = JSON.parse(selectedMovieItem);

    if (loadingOverlay) loadingOverlay.classList.remove("hidden");

    // --- Fetch movie details ---
    var movieDetailData = await getMovieDetail(movieDetailId);

    // Check if navigation was interrupted during await
    if (navigationInterrupted) {
        document.removeEventListener("keydown", handleBackNavigationDuringLoading);
        return;
    }

    if (!movieDetailData) {
        if (loadingOverlay) loadingOverlay.classList.add("hidden");
        localStorage.setItem("currentPage", "moviesPage");
        Router.showPage("movies");
        document.body.style.backgroundImage = "none";
        document.body.style.backgroundColor = "black";
        document.removeEventListener("keydown", handleBackNavigationDuringLoading);
        return;
    }

    var tmdbId =
        movieDetailData.info && movieDetailData.info.tmdb_id ?
        movieDetailData.info.tmdb_id :
        0;
    // var getMovieCastData = await getMovieCast(tmdbId);
    var getMovieCastData = [];

    // Check again if navigation was interrupted during second await
    if (navigationInterrupted) {
        document.removeEventListener("keydown", handleBackNavigationDuringLoading);
        return;
    }

    // Remove the loading navigation handler since we're done loading
    document.removeEventListener("keydown", handleBackNavigationDuringLoading);

    // --- Continue Watching logic ---
    var selectedPlaylistData = localStorage.getItem("selectedPlaylist");
    var currentPlaylistName = "";
    if (selectedPlaylistData) {
        var parsedPlaylist = JSON.parse(selectedPlaylistData);
        currentPlaylistName = parsedPlaylist.playlistName ?
            parsedPlaylist.playlistName :
            "";
    }

    var playlistsData = localStorage.getItem("playlistsData");
    var currentPlaylist = null;
    if (playlistsData) {
        playlistsData = JSON.parse(playlistsData);
        for (var i = 0; i < playlistsData.length; i++) {
            if (playlistsData[i].playlistName === currentPlaylistName) {
                currentPlaylist = playlistsData[i];
                break;
            }
        }
    }

    var continueWatchingIds = [];
    if (
        currentPlaylist &&
        currentPlaylist.continueWatchingMovies &&
        Array.isArray(currentPlaylist.continueWatchingMovies)
    ) {
        continueWatchingIds = currentPlaylist.continueWatchingMovies.map(function(
            item
        ) {
            return item.itemId ? Number(item.itemId) : 0;
        });
    }

    var isContinueWatchingMovie = false;
    if (selectedMovieItem && selectedMovieItem.stream_id) {
        isContinueWatchingMovie = continueWatchingIds.includes(
            Number(selectedMovieItem.stream_id)
        );
    }

    if (loadingOverlay) loadingOverlay.classList.add("hidden");

    renderMovieDetailPage(movieDetailData);

    var currentFocusIndex = 0;
    var focusableEls = [];

    function setFocus(el) {
        for (var i = 0; i < focusableEls.length; i++) {
            if (focusableEls[i])
                focusableEls[i].classList.remove("movie-detail-button-focused");
        }

        if (el) {
            el.classList.add("movie-detail-button-focused");
            try {
                el.focus();
                if (el.classList.contains("movie-cast-item-image")) {
                    var parent = el.parentElement;
                    if (parent) {
                        if (parent.scrollIntoViewIfNeeded)
                            parent.scrollIntoViewIfNeeded(true);
                        else
                            parent.scrollIntoView({
                                block: "center",
                                inline: "nearest",
                            });
                    } else {
                        if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(true);
                        else
                            el.scrollIntoView({
                                block: "center",
                                inline: "nearest",
                            });
                    }
                } else {
                    if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(true);
                    else if (el.scrollIntoView)
                        el.scrollIntoView({
                            block: "nearest",
                            inline: "nearest",
                        });
                }
            } catch (err) {}
        }
    }

    function initFocus() {
        var fromStartBtn = document.querySelector(
            ".movie-detail-from-start-button"
        );
        focusableEls = [
            document.querySelector(".movie-detail-play-button"),
            fromStartBtn,
            document.querySelector(".movie-detail-more-info-button"),
            document.querySelector(".movie-detail-fav-button"),
            document.querySelector(".movie-detail-page-header-menu"),
        ];

        var castEls = document.querySelectorAll(".movie-cast-item-image");
        if (castEls && castEls.length > 0) {
            for (var j = 0; j < castEls.length; j++) {
                focusableEls.push(castEls[j]);
            }
        }

        focusableEls = focusableEls.filter(Boolean);
        currentFocusIndex = 0;
        setFocus(focusableEls[currentFocusIndex]);
    }

    setTimeout(initFocus, 0);

    // --- Reset Resume Time ---
    function resetResumeTime(movieId) {
        if (!movieId) return;
        var playlistsData = localStorage.getItem("playlistsData");
        if (!playlistsData) return;
        playlistsData = JSON.parse(playlistsData);

        var selectedPlaylist = localStorage.getItem("selectedPlaylist");
        if (!selectedPlaylist) return;
        selectedPlaylist = JSON.parse(selectedPlaylist);
        var playlistName = selectedPlaylist.playlistName;

        for (var i = 0; i < playlistsData.length; i++) {
            if (
                playlistsData[i].playlistName === playlistName &&
                playlistsData[i].continueWatchingMovies
            ) {
                for (
                    var j = 0; j < playlistsData[i].continueWatchingMovies.length; j++
                ) {
                    if (
                        Number(playlistsData[i].continueWatchingMovies[j].itemId) ===
                        Number(movieId)
                    ) {
                        playlistsData[i].continueWatchingMovies[j].resumeTime = 0;
                    }
                }
            }
        }

        localStorage.setItem("playlistsData", JSON.stringify(playlistsData));
    }

    // --- Keydown navigation ---
    function moviesDetailPageKeydownHandler(e) {
        if (localStorage.getItem("currentPage") !== "moviesDetailPage") return;
        var focused = focusableEls[currentFocusIndex];
        if (!focused) return;

        var playBtn = document.querySelector(".movie-detail-play-button");
        var fromStartBtn = document.querySelector(
            ".movie-detail-from-start-button"
        );
        var trailerBtn = document.querySelector(".movie-detail-more-info-button");
        var favBtn = document.querySelector(".movie-detail-fav-button");
        var menuBtn = document.querySelector(".movie-detail-page-header-menu");
        var castItems = document.querySelectorAll(".movie-cast-item-image");

        // --- Enter key ---
        if (e.key === "Enter") {
            if (focused === playBtn || focused === fromStartBtn) {
                if (focused === fromStartBtn)
                    resetResumeTime(selectedMovieItem.stream_id);

                var currentPlaylistData = localStorage.getItem("currentPlaylistData");
                if (!currentPlaylistData) return;
                currentPlaylistData = JSON.parse(currentPlaylistData);

                var movieVideoUrl = "";
                if (
                    currentPlaylistData.server_info &&
                    currentPlaylistData.user_info &&
                    movieDetailData.movie_data &&
                    movieDetailData.movie_data.stream_id &&
                    movieDetailData.movie_data.container_extension
                ) {
                    movieVideoUrl =
                        currentPlaylistData.server_info.server_protocol +
                        "://" +
                        currentPlaylistData.server_info.url +
                        ":" +
                        currentPlaylistData.server_info.port +
                        "/movie/" +
                        currentPlaylistData.user_info.username +
                        "/" +
                        currentPlaylistData.user_info.password +
                        "/" +
                        movieDetailData.movie_data.stream_id +
                        "." +
                        movieDetailData.movie_data.container_extension;
                }

                localStorage.setItem(
                    "playingItemData",
                    JSON.stringify(movieDetailData.movie_data)
                );
                localStorage.setItem("selectedVideoItemUrl", movieVideoUrl);
                localStorage.setItem("from", "movie");
                localStorage.setItem("currentPage", "videoJsPlayer");

                Router.showPage("videoJsPlayer");
                document.body.style.backgroundImage = "none";
                document.body.style.backgroundColor = "black";
                return;
            }

            // if (focused === trailerBtn) {
            //   if (movieDetailData.info && movieDetailData.info.youtube_trailer) {
            //     var trailerUrl =
            //       "https://www.youtube.com/watch?v=" +
            //       movieDetailData.info.youtube_trailer;
            //     localStorage.setItem("selectedVideoItemUrl", trailerUrl);
            //     localStorage.setItem("from", "trailer_movie");
            //     localStorage.setItem("currentPage", "videoJsPlayer");
            //     Router.showPage("videoJsPlayer");
            //     document.body.style.backgroundImage = "none";
            //     document.body.style.backgroundColor = "black";
            //   } else alert("No trailer available");
            // }

            if (focused === favBtn) {
                var res = toggleFavoriteItem(
                    movieDetailData.movie_data && movieDetailData.movie_data.stream_id ?
                    movieDetailData.movie_data.stream_id :
                    0,
                    "favouriteMovies"
                );
                if (res && res.success) {
                    if (favBtn) {
                        var heartIcon = favBtn.querySelector(".heart-icon");
                        var favText = favBtn.querySelector(".fav-text");

                        if (heartIcon)
                            heartIcon.innerHTML = res.isFav ?
                            '<i class="fa-solid fa-heart"></i>' :
                            '<i class="fa-regular fa-heart"></i>';
                        if (favText)
                            favText.textContent = res.isFav ?
                            "Remove from Favorites" :
                            "Add to Favorites";

                        Toaster.showToast(
                            res.isFav ? "success" : "error",
                            res.isFav ? "Added to Favorites" : "Removed from Favorites"
                        );
                    }
                } else {
                    alert(res.message || "Unable to update favorites");
                }
            }

            if (focused === menuBtn) {
                e.preventDefault();
                localStorage.setItem("sidebarPage", "moviesDetailPage");
                var sidebar = document.querySelector(".sidebar-container-movie-detail");
                if (sidebar && sidebar.style.display === "none")
                    openSidebar("moviesDetailPage");
                else closeSidebar("moviesDetailPage");
                return;
            }
        }

        // --- Arrow navigation ---
        if (e.key === "ArrowRight" && currentFocusIndex < focusableEls.length - 1)
            currentFocusIndex++;
        if (e.key === "ArrowLeft" && currentFocusIndex > 0) currentFocusIndex--;
        if (e.key === "ArrowUp") {
            if ([playBtn, fromStartBtn, favBtn].includes(focused) && menuBtn)
                currentFocusIndex = focusableEls.indexOf(menuBtn);
            else if (Array.from(castItems).includes(focused) && playBtn)
                currentFocusIndex = focusableEls.indexOf(playBtn);
        }
        if (e.key === "ArrowDown") {
            if (focused === menuBtn && playBtn)
                currentFocusIndex = focusableEls.indexOf(playBtn);
            else if (
                [playBtn, fromStartBtn, favBtn].includes(focused) &&
                castItems.length > 0
            )
                currentFocusIndex = focusableEls.indexOf(castItems[0]);
        }

        // --- Back / Exit ---
        if (
            e.keyCode === 10009 ||
            e.key === "Escape" ||
            e.key === "Back" ||
            e.key === "BrowserBack" ||
            e.key === "XF86Back"
        ) {
            localStorage.removeItem("selectedMovieId");
            localStorage.setItem("currentPage", "moviesPage");
            Router.showPage("movies");
            document.body.style.backgroundImage = "none";
            document.body.style.backgroundColor = "black";
            return;
        }

        setFocus(focusableEls[currentFocusIndex]);
    }

    document.addEventListener("keydown", moviesDetailPageKeydownHandler);
    MovieDetailPage.cleanup = function() {
        document.removeEventListener("keydown", moviesDetailPageKeydownHandler);
    };

    // --- Render Movie Detail Page Function ---
    function renderMovieDetailPage(data) {
        var isFav =
            data.movie_data && data.movie_data.stream_id ?
            isItemFavoriteForPlaylist(
                data.movie_data.stream_id,
                "favouriteMovies"
            ) :
            false;
        var heartIconHtml = isFav ?
            '<i class="fa-solid fa-heart"></i>' :
            '<i class="fa-regular fa-heart"></i>';
        var backdrop =
            data.info && data.info.backdrop_path && data.info.backdrop_path[0] ?
            data.info.backdrop_path[0] :
            "https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png";
        var movieName =
            data.movie_data && data.movie_data.name ?
            data.movie_data.name :
            "No title available";
        var director = data.info && data.info.director ? data.info.director : "N/A";
        var releaseDate =
            data.info && data.info.releasedate ? data.info.releasedate : "N/A";
        var duration = data.info && data.info.duration ? data.info.duration : "N/A";
        var genre = data.info && data.info.genre ? data.info.genre : "N/A";
        var description =
            data.info && data.info.description ?
            data.info.description :
            "No description available";
        var poster =
            data.info && data.info.movie_image ? data.info.movie_image : "";

        var castHtml = "";
        if (
            getMovieCastData &&
            getMovieCastData.cast &&
            getMovieCastData.cast.length > 0
        ) {
            for (var i = 0; i < getMovieCastData.cast.length; i++) {
                var item = getMovieCastData.cast[i];
                var profile = item.profile_path ?
                    castImageUrl + item.profile_path :
                    "/assets/placeholder-img.png";
                var name = item.name ? item.name : "";

                castHtml +=
                    '<div class="movie-cast-item" tabindex="0">' +
                    '<img src="' +
                    profile +
                    '" alt="' +
                    name +
                    '" class="movie-cast-item-image" ' +
                    "onerror=\"this.src='/assets/placeholder-img.png'\" />" +
                    '<p class="movie-cast-item-name">' +
                    name +
                    "</p>" +
                    "</div>";
            }
        }

        document.querySelector("#movies-detail-page").innerHTML = `
<div class="movie-detail-page-container" style="background-image:linear-gradient(290.14deg, rgba(5, 113, 155, 0.7) -93.41%, #010E26 98.1%), url('${backdrop}')">
  <div class="movie-detail-page-content-container">
    <div class="movie-detail-page-header">
      <div class="movie-detail-logo-container"><img src="/assets/app-logo.png" alt="Logo" class="movieDetail-header-logo"/></div>
      <div class="movie-detail-page-header-title"><p>Info</p></div>
      <div class="movie-detail-page-header-menu" tabindex="0">
        <svg width="14" height="58" viewBox="0 0 14 58" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="7" cy="7" r="7" fill="white"/>
          <circle cx="7" cy="29" r="7" fill="white"/>
          <circle cx="7" cy="51" r="7" fill="white"/>
        </svg>
        <div class="sidebar-container-movie-detail" style="display:none;">
          ${Sidebar({
            from: "movieDetailPage",
            onSort: () => console.log("Sorting..."),
            onRemoveItemFromContinueWatching: removeItemfromContiueWatching,
            showOpenContinueButton: isContinueWatchingMovie ? true : false,
          })}
        </div>
      </div>
    </div>
    <div class="movie-detail-content-container">
      <div class="movie-detail-content">
        <div class="first-content">
          <div class="first-item"><p class="movie-detail-title">${movieName}</p></div>
<div class="mdetail-time-date"><p class="movie-detail-time">${duration}</p><p class="movie-detail-date">${releaseDate}</p></div>
   <div class="directed-first-item"><p class="first">Directed By:</p></div>
<p class="directed-p">${director}</p>
   <div class="directed-first-item" style="margin-top: 10px;"><p class="first">Genre:</p></div>
<p class="directed-p">${genre}</p>
    <div class="movie-detail-description"><p>${description}</p></div>
          <div class="first-item">
          </div>
          <div class="first-item">
            <div class="movie-detail-buttons">
              <button class="movie-detail-play-button" tabindex="0"><i class="fa-solid fa-play" style="margin-right: 15px;"></i> ${
                isContinueWatchingMovie ? "Resume" : "Play Now"
              }</button>
              ${
                isContinueWatchingMovie
                  ? '<button class="movie-detail-from-start-button" tabindex="0"><i class="fa-solid fa-play" style="margin-right: 15px;"></i> Start from the beginning</button>'
                  : ""
              }
              ${
                // data.info && data.info.youtube_trailer
                //   ? '<button class="movie-detail-more-info-button" tabindex="0"><i class="fa-solid fa-play" style="margin-right: 15px;"></i> Watch Trailer</button>'
                //   : ""
                ""
              }
              <button class="movie-detail-fav-button" tabindex="0">
                <span class="heart-icon">${heartIconHtml}</span>
                <span class="fav-text">${
                  isFav ? "Remove from Favorites" : "Add to Favorites"
                }</span>
              </button>
            </div>
          </div>
        </div>
        <div class="second-item">
          <div class="inner-card">
            <img src="${poster}" class="movie-detail-card-poster"/>
            <div class="card-rating">
              ${Array.from(
                { length: Math.min(Math.floor(data.info.rating || 0), 5) },
                () =>
                  '<img src="/assets/start-icon.png" alt="Logo" class="movie-card-start-icon"/>'
              ).join("")}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="cast-section-container">
      <p class="cast-section-title">Cast & Crew</p>
      <div class="movie-detail-cast">${
        castHtml || '<p class="no-cast-found">No Cast and Crew Found</p>'
      }</div>
    </div>
  </div>
</div>
`;

        const movieContentContainer = document.querySelector(
            ".movie-detail-page-content-container"
        );
        if (movieContentContainer) {
            if (castHtml) {
                movieContentContainer.style.height = "auto";
            } else {
                movieContentContainer.style.height = "140vh";
            }
        }

        function removeItemfromContiueWatching() {
            removeItemFromHistoryById(
                selectedMovieItem.stream_id,
                "continueWatchingMovies"
            );
            localStorage.setItem(
                "selectedMovieId",
                selectedMovieItem.stream_id.toString()
            );
            localStorage.setItem("currentPage", "moviesDetailPage");
            localStorage.setItem(
                "selectedMovieData",
                JSON.stringify(selectedMovieItem)
            );
            var loader = document.querySelector("#loading-progress");
            if (loader) loader.style.display = "none";
            Router.showPage("movieDetail");
        }
    }
}