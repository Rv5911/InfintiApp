function SeriesDetailPage() {
    (async () => {
        if (SeriesDetailPage.cleanup) SeriesDetailPage.cleanup();
        const castImageUrl = "https://image.tmdb.org/t/p/w500";
        const selectedSeriesItem = JSON.parse(
            localStorage.getItem("selectedSeriesItem")
        );

        let seriesIsContinueWatching = false;
        let castList = [];
        let getAllSeriesCastResults = [];
        let getSerieByName = [];
        let selectedSeason = 1;
        let lastFocused = null;
        let focusableEls = [];
        let currentFocusIndex = 0;
        let isDropdownOpen = false;
        let dropdownFocusIndex = 0;

        const seriesDetailId = localStorage.getItem("selectedSeriesId");

        const loadingOverlay = document.getElementById("loading-overlay");

        // Create custom loader
        // Loader handled by global overlay

        // --- Setup back navigation handler FIRST ---
        let navigationInterrupted = false;

        function handleBackNavigationDuringLoading(e) {
            if (
                (e.keyCode === 10009 ||
                    e.key === "Escape" ||
                    e.key === "Back" ||
                    e.key === "BrowserBack" ||
                    e.key === "XF86Back") &&
                localStorage.getItem("currentPage") === "seriesDetailPage"
            ) {
                e.preventDefault();
                e.stopPropagation();

                navigationInterrupted = true;

                if (loadingOverlay) loadingOverlay.classList.add("hidden");

                document.removeEventListener(
                    "keydown",
                    handleBackNavigationDuringLoading
                );

                localStorage.removeItem("selectedSeriesId");
                localStorage.setItem("currentPage", "seriesPage");
                Router.showPage("series");
                document.body.style.backgroundImage = "none";
                document.body.style.backgroundColor = "black";

                return true;
            }
        }

        document.addEventListener("keydown", handleBackNavigationDuringLoading);

        if (loadingOverlay) loadingOverlay.classList.remove("hidden");

        const seriesDetailData = await getSeriesDetail(seriesDetailId);
        if (navigationInterrupted) {
            document.removeEventListener(
                "keydown",
                handleBackNavigationDuringLoading
            );
            return;
        }

        if (!seriesDetailData || !seriesDetailData.info) {
            if (loadingOverlay) loadingOverlay.classList.add("hidden");
            document.removeEventListener(
                "keydown",
                handleBackNavigationDuringLoading
            );

            Toaster.showToast("error", "No Data Found of Selected Series");
            localStorage.removeItem("selectedSeriesId");
            localStorage.setItem("currentPage", "seriesPage");
            Router.showPage("series");
            document.body.style.backgroundImage = "none";
            document.body.style.backgroundColor = "black";
            return;
        }

        const lastPlayedEpisodeId = localStorage.getItem("lastPlayedEpisodeId");

        if (seriesDetailData) {
            localStorage.setItem(
                "seriesEpisodesData",
                JSON.stringify(seriesDetailData.episodes || {})
            );
        }

        localStorage.setItem("selectedSeason", selectedSeason.toString());

        // if (seriesDetailData && seriesDetailData.info && seriesDetailData.info.name) {
        //   getAllSeriesCastResults = await getSeriesTmbdId(
        //     seriesDetailData.info.name.trim()
        //   );
        //   if (navigationInterrupted) {
        //     document.removeEventListener(
        //       "keydown",
        //       handleBackNavigationDuringLoading
        //     );
        //     return;
        //   }
        // }

        // if (getAllSeriesCastResults && getAllSeriesCastResults.results) {
        //   getSerieByName = getAllSeriesCastResults.results.find(
        //     (s) => s.original_name === seriesDetailData.info.name.trim()
        //   );
        // } else {
        //   getSerieByName = null;
        //   console.warn("No series cast results found");
        // }

        const currentPlaylistName = JSON.parse(
            localStorage.getItem("selectedPlaylist")
        ).playlistName;
        const currentPlaylist = JSON.parse(
            localStorage.getItem("playlistsData")
        ).filter((pl) => pl.playlistName === currentPlaylistName)[0];

        const continueWatchingEpisodes =
            currentPlaylist.continueWatchingSeries || [];
        if (continueWatchingEpisodes.length > 0) {
            seriesIsContinueWatching = continueWatchingEpisodes.some(
                (item) => item.itemId === seriesDetailId
            );
        }

        const continueWatchingMap = {};
        (continueWatchingEpisodes || []).forEach((item) => {
            if (!item || !item.episodeId) return;

            const seasonKey = 1; // Use 1 if season info is not present
            const episodeKey = Number(item.episodeId); // Must match episode.id

            if (!continueWatchingMap[seasonKey]) continueWatchingMap[seasonKey] = {};

            const progress = item.duration ?
                Math.min(Math.max((item.resumeTime / item.duration) * 100, 0), 100) :
                0;

            continueWatchingMap[seasonKey][episodeKey] = progress;
        });

        let getSeriesCastData = [];
        if (getSerieByName && getSerieByName.id) {
            // const seriesCast = await getSeriesCast(getSerieByName.id);
            const seriesCast = [];

            getSeriesCastData = seriesCast || [];
            if (navigationInterrupted) {
                document.removeEventListener(
                    "keydown",
                    handleBackNavigationDuringLoading
                );
                return;
            }
        } else {
            getSeriesCastData = [];
        }

        document.removeEventListener("keydown", handleBackNavigationDuringLoading);

        if (loadingOverlay) loadingOverlay.classList.add("hidden");

        if (!seriesDetailData) {
            localStorage.removeItem("selectedSeriesId");
            localStorage.setItem("currentPage", "seriesPage");
            Router.showPage("series");
            document.body.style.backgroundImage = "none";
            document.body.style.backgroundColor = "black";
            return;
        }

        const scrollToElement = (el) => {
            if (!el) return;
            const container =
                el.closest(".series-cards-list-container") ||
                el.closest(".series-channels-list") ||
                el.closest(".series-detail-cast") ||
                el.closest(".series-detail-page-content-container");
            if (!container) return;

            if (container.classList.contains("series-detail-cast")) {
                container.scrollLeft =
                    el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2;
            } else {
                container.scrollTop =
                    el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
            }
        };

        let currentEpisodeIndex = 0;

        // Cached DOM Elements
        let navRoot_SD = null;
        let detailContainer_SD = null;
        let episodesContainer_SD = null;

        const episodes = seriesDetailData.episodes || {};

        if (lastPlayedEpisodeId) {
            Object.keys(episodes).forEach((seasonKey) => {
                const seasonEpisodes = episodes[seasonKey];
                const playedEpisode = seasonEpisodes.find(
                    (ep) => ep.id.toString() === lastPlayedEpisodeId
                );
                if (playedEpisode) {
                    selectedSeason = parseInt(seasonKey);
                }
            });
        }

        const seasons = Object.keys(episodes)
            .map((seasonKey) => ({
                season_number: parseInt(seasonKey),
                episode_count: episodes[seasonKey].length,
            }))
            .sort((a, b) => a.season_number - b.season_number);
        const seriesInfo = seriesDetailData.info || {};

        const clearSeriesDetailFocusFast = (className) => {
            const elements = document.getElementsByClassName(className);
            while (elements.length > 0) {
                elements[0].classList.remove(className);
            }
        };

        const setFocus = (el, skipScroll = false) => {
            if (lastFocused) {
                lastFocused.classList.remove("series-detail-button-focused");
                const lastTitle = lastFocused.querySelector(".episode-title");
                if (lastTitle) lastTitle.classList.remove("marquee-active");
            }
            if (!el) return;

            el.classList.add("series-detail-button-focused");

            el.classList.add("series-detail-button-focused");

            // Hide navbar when focusing on episodes, show when on top buttons
            if (!navRoot_SD) navRoot_SD = document.querySelector("#navbar-root");
            if (navRoot_SD) {
                if (el.classList.contains("seasons-episodes-item")) {
                    navRoot_SD.style.display = "none";
                } else {
                    navRoot_SD.style.display = "block";
                }
            }

            const title = el.querySelector(".episode-title");
            if (title && title.scrollWidth > title.clientWidth) {
                title.classList.add("marquee-active");
            }

            // Don't scroll for seasons button specifically
            if (!skipScroll && el.id !== "seasons-button") {
                if (el.classList.contains("seasons-episodes-item")) {
                    if (!detailContainer_SD)
                        detailContainer_SD = document.querySelector(
                            ".series-detail-page-content-container"
                        );
                    if (detailContainer_SD)
                        detailContainer_SD.scrollTop = detailContainer_SD.scrollHeight;

                    if (!episodesContainer_SD)
                        episodesContainer_SD = document.querySelector(
                            ".series-detail-cast"
                        );
                    if (episodesContainer_SD) {
                        const elementLeft = el.offsetLeft;
                        const elementWidth = el.offsetWidth;
                        const containerWidth = episodesContainer_SD.clientWidth;
                        const currentScrollLeft = episodesContainer_SD.scrollLeft;

                        if (elementLeft < currentScrollLeft) {
                            episodesContainer_SD.scrollLeft = elementLeft - 30;
                        } else if (
                            elementLeft + elementWidth >
                            currentScrollLeft + containerWidth
                        ) {
                            episodesContainer_SD.scrollLeft =
                                elementLeft + elementWidth - containerWidth + 30;
                        }
                    }
                } else {
                    scrollToElement(el);
                }
            }

            lastFocused = el;
        };

        const rebuildFocusable = () => {
            const playBtn = document.querySelector(".series-detail-play-button");
            const startOverBtn = document.querySelector(
                ".series-detail-start-over-button"
            );
            const menuBtn = document.querySelector(".series-detail-page-header-menu");
            const favBtn = document.querySelector(".series-detail-fav-button");
            const seasonsBtn = document.querySelector("#seasons-button");
            const castBtn = document.querySelector("#cast-button");
            const episodeItems = Array.from(
                document.getElementsByClassName("seasons-episodes-item")
            );
            const castItems = Array.from(
                document.getElementsByClassName("series-cast-item")
            );

            focusableEls = [
                playBtn,
                startOverBtn,
                favBtn,
                menuBtn,
                seasonsBtn,
                castBtn,
                ...episodeItems,
                ...castItems,
            ].filter(Boolean);
        };

        const initFocus = () => {
            rebuildFocusable();
            if (lastPlayedEpisodeId) {
                const playedEpisodeItem = document.querySelector(
                    `[data-episode-id="${lastPlayedEpisodeId}"]`
                );
                if (playedEpisodeItem) {
                    currentFocusIndex = focusableEls.indexOf(playedEpisodeItem);
                    setFocus(playedEpisodeItem);
                    localStorage.setItem("navigationFocus", "seriesDetailPage");
                    return;
                }
            }
            const menuBtn = document.querySelector(".series-detail-page-header-menu");
            const firstBtn = document.querySelector(".series-detail-play-button");
            if (firstBtn) {
                currentFocusIndex = focusableEls.indexOf(firstBtn);
                setFocus(firstBtn);
            } else if (focusableEls.length > 0) {
                currentFocusIndex = 0;
                setFocus(focusableEls[currentFocusIndex]);
            }
            localStorage.setItem("navigationFocus", "seriesDetailPage");
        };

        const formatTime = (seconds) => {
            if (!seconds || isNaN(seconds)) return "0:00:00";

            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);

            if (hours > 0) {
                return `${hours}:${mins < 10 ? "0" : ""}${mins}:${
          secs < 10 ? "0" : ""
        }${secs}`;
            } else {
                return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
            }
        };

        const getEpisodeDurationInSeconds = (episode) => {
            if (episode.info && episode.info.duration_secs) {
                return parseInt(episode.info.duration_secs);
            }
            if (episode.duration) {
                return parseInt(episode.duration); // Assuming seconds
            }
            if (episode.info && episode.info.duration) {
                const val = parseInt(episode.info.duration);
                if (!isNaN(val)) {
                    return val * 60; // Assuming minutes
                }
            }

            // Check continueWatchingEpisodes from closure
            if (continueWatchingEpisodes) {
                const found = continueWatchingEpisodes.find(
                    (item) => item.episodeId === episode.id.toString()
                );
                if (found && found.duration) {
                    return parseInt(found.duration);
                }
            }

            return 0;
        };

        const scrollDropdownToFocused = () => {
            const dropdown = document.querySelector(".seasons-dropdown");
            const focusedItem = document.querySelector(".dropdown-item-focused");
            if (!dropdown || !focusedItem) return;

            const itemTop = focusedItem.offsetTop;
            const itemHeight = focusedItem.offsetHeight;
            const dropdownHeight = dropdown.clientHeight;
            const currentScrollTop = dropdown.scrollTop;

            if (itemTop < currentScrollTop) {
                dropdown.scrollTop = itemTop;
            } else if (itemTop + itemHeight > currentScrollTop + dropdownHeight) {
                dropdown.scrollTop = itemTop + itemHeight - dropdownHeight;
            }
        };

        const showDropdown = () => {
            // If only one season, show episodes directly instead of dropdown
            if (Object.keys(episodes).length <= 1) {
                showSeasons(); // Show episodes for the single season
                return;
            }

            const dropdown = document.querySelector(".seasons-dropdown");
            const mainContainer = document.querySelector(
                ".series-detail-page-content-container"
            );
            if (dropdown) {
                dropdown.style.display = "block";
                isDropdownOpen = true;
                if (mainContainer) mainContainer.classList.add("dropdown-open");

                dropdownFocusIndex = selectedSeason - 1;
                updateDropdownFocus();

                setTimeout(scrollDropdownToFocused, 50);
            }
        };

        const hideDropdown = () => {
            const dropdown = document.querySelector(".seasons-dropdown");
            const mainContainer = document.querySelector(
                ".series-detail-page-content-container"
            );
            if (dropdown) {
                dropdown.style.display = "none";
                isDropdownOpen = false;
                if (mainContainer) mainContainer.classList.remove("dropdown-open");

                const seasonsBtn = document.querySelector("#seasons-button");
                currentFocusIndex = focusableEls.indexOf(seasonsBtn);
                setFocus(focusableEls[currentFocusIndex], true);
            }
        };

        const updateDropdownFocus = () => {
            const dropdownItems = [...document.querySelectorAll(".dropdown-item")];
            dropdownItems.forEach((item, i) => {
                item.classList.toggle(
                    "dropdown-item-focused",
                    i === dropdownFocusIndex
                );
            });
            setTimeout(scrollDropdownToFocused, 10);
        };

        const updateSeasonButton = () => {
            const seasonsBtn = document.querySelector("#seasons-button");
            if (seasonsBtn) {
                let seasonNumber = selectedSeason.toString().padStart(2, "0");
                // Show dropdown arrow only if there are multiple seasons
                const dropdownArrow =
                    Object.keys(episodes).length > 1 ?
                    ' <i class="fas fa-chevron-down"></i>' :
                    "";
                seasonsBtn.innerHTML = `Season ${seasonNumber}${dropdownArrow}`;
            }
        };

        const updatePlayButton = () => {
            const playBtn = document.querySelector(".series-detail-play-button");
            const startOverBtn = document.querySelector(
                ".series-detail-start-over-button"
            );

            if (!playBtn) return;

            // Check if we have continue watching data
            const continueWatchingEpisodes =
                currentPlaylist.continueWatchingSeries || [];
            const lastWatchedEpisode = continueWatchingEpisodes.find(
                (item) => item.itemId === seriesDetailId
            );

            console.log(
                continueWatchingEpisodes,
                "continueWatchingEpisodescontinueWatchingEpisodes"
            );
            if (lastWatchedEpisode && lastWatchedEpisode.episodeId) {
                // Find which season and episode this belongs to
                let foundSeason = null;
                let foundEpisode = null;
                let foundSeasonKey = null;

                Object.keys(episodes).forEach((seasonKey) => {
                    const seasonEpisodes = episodes[seasonKey];
                    const episode = seasonEpisodes.find(
                        (ep) => ep.id.toString() === lastWatchedEpisode.episodeId.toString()
                    );

                    if (episode) {
                        foundSeason = parseInt(seasonKey);
                        foundEpisode = episode;
                        foundSeasonKey = seasonKey;
                    }
                });

                if (foundEpisode && foundSeason && foundSeasonKey) {
                    const seasonNum = foundSeason.toString().padStart(2, "0");
                    const episodeNum = foundEpisode.episode_num
                        .toString()
                        .padStart(2, "0");

                    // Update button text AND data attributes
                    playBtn.textContent = `Resume - S${seasonNum}.E${episodeNum}`;
                    playBtn.setAttribute("data-last-season", foundSeasonKey);
                    playBtn.setAttribute(
                        "data-last-episode-index",
                        episodes[foundSeasonKey].findIndex(
                            (ep) => ep.id === foundEpisode.id
                        )
                    );
                    playBtn.setAttribute("data-last-episode-id", foundEpisode.id);

                    // Update start over button if it exists
                    if (startOverBtn) {
                        startOverBtn.textContent = `Start From Beginning - S${seasonNum}.E${episodeNum}`;
                        startOverBtn.setAttribute("data-last-season", foundSeasonKey);
                        startOverBtn.setAttribute(
                            "data-last-episode-index",
                            episodes[foundSeasonKey].findIndex(
                                (ep) => ep.id === foundEpisode.id
                            )
                        );
                        startOverBtn.setAttribute("data-last-episode-id", foundEpisode.id);
                    }
                    return;
                }
            }

            // Default to first episode if no continue watching data
            const firstSeasonKey = Object.keys(episodes).sort(
                (a, b) => parseInt(a) - parseInt(b)
            )[0];
            const firstSeasonEpisodes = episodes[firstSeasonKey] || [];
            const firstEpisode = firstSeasonEpisodes[0];

            if (firstEpisode) {
                const seasonNum = firstSeasonKey.toString().padStart(2, "0");
                const episodeNum = firstEpisode.episode_num.toString().padStart(2, "0");

                playBtn.textContent = `Play - S${seasonNum}.E${episodeNum}`;
                playBtn.setAttribute("data-last-season", firstSeasonKey);
                playBtn.setAttribute("data-last-episode-index", "0");
                playBtn.setAttribute("data-last-episode-id", firstEpisode.id);
            }
        };
        const showSeasons = () => {
            const container = document.querySelector(".series-detail-cast");
            if (!container) return;
            const seasonEpisodes = episodes[selectedSeason.toString()] || [];

            const episodeHtml = seasonEpisodes
                .map((episode, j) => {
                    const seasonKey = 1; // must match above
                    const episodeKey = Number(episode.id); // match continueWatchingMap

                    let progress = 0;
                    if (
                        continueWatchingMap[seasonKey] &&
                        continueWatchingMap[seasonKey][episodeKey] != null
                    ) {
                        progress = continueWatchingMap[seasonKey][episodeKey];
                    }

                    return `
      <div class="seasons-episodes-item" tabindex="0" data-episode-index="${j}" data-episode-id="${
            episode.id
          }">
        
        <!-- Image Container -->
        <div class="episode-image-container">
          <img src="${
            episode.info.movie_image ||
            seriesInfo.cover ||
            "./assets/placeholder-img.png"
          }" class="episode-thumbnail" 
          onerror="this.src='./assets/placeholder-img.png'" />
          
          <div class="play-icon-overlay">
            <img src="./assets/playicon.png" />
          </div>
          
          ${
            getEpisodeDurationInSeconds(episode) > 0
              ? `<div class="episode-duration">${formatTime(
                  getEpisodeDurationInSeconds(episode)
                )}</div>`
              : ""
          }

          <!-- Progress Bar -->
          <div class="episode-progress-container" style="${
            progress == 0 ? "display: none;" : ""
          }">
            <div class="episode-progress-bar" style="width: ${progress}%;"></div>
          </div>
        </div>

        <!-- Info Container -->
        <div class="episode-info-container">
          <div class="episode-info-row-1">
            <span class="episode-number">Ep.${(episode.episode_num || j + 1)
              .toString()
              .padStart(2, "0")}</span>
            <div class="episode-title-wrapper">
                <span class="episode-title">${
                  episode.title || `Episode ${episode.episode_num}`
                }</span>
            </div>
            <span class="episode-rating">
              <img src="./assets/rating-star.png" style="width: 14px; height: 14px; margin-right: 4px;">
              ${episode.info.rating_5based || seriesInfo.rating_5based || "N/A"}
            </span>
          </div>
          <p class="episode-description">${
            episode.info.plot ||
            episode.plot ||
            seriesInfo.plot ||
            "No description available."
          }</p>
        </div>
      </div>
    `;
                })
                .join("");

            container.innerHTML = `<div class="seasons-episodes-list">${episodeHtml}</div>`;
            rebuildFocusable();
        };

        const showCast = () => {
            const container = document.querySelector(".series-detail-cast");

            castList = Array.isArray(getSeriesCastData) ?
                getSeriesCastData :
                (getSeriesCastData && getSeriesCastData.cast) || [];

            if (!castList.length) {
                container.innerHTML =
                    '<p class="no-cast-found">No Cast and Crew Found</p>';
                rebuildFocusable();

                // Ensure cast button remains focusable
                const castBtn = document.querySelector("#cast-button");
                if (castBtn && !focusableEls.includes(castBtn)) {
                    rebuildFocusable();
                }
                return;
            }
            const castHtml = castList
                .map(
                    (castMember) => `<div class="series-cast-item" tabindex="0">
        <img src="${
          castMember.profile_path
            ? castImageUrl + castMember.profile_path
            : "./assets/placeholder-img.png"
        }" alt="${
            castMember.original_name || "Unknown"
          }" class="series-cast-item-image"
        onerror="this.src='./assets/placeholder-img.png'"/>
        <p class="series-cast-item-name">${
          castMember.original_name || "Unknown"
        }</p>
      </div>`
                )
                .join("");

            container.innerHTML = castHtml;
            rebuildFocusable();

            const castBtn = document.querySelector("#cast-button");
            currentFocusIndex = focusableEls.indexOf(castBtn);
            setFocus(focusableEls[currentFocusIndex]);
        };

        const playEpisode = (
            episodeId,
            episodeIndex,
            startFromBeginning = false
        ) => {
            const seasonEpisodes = episodes[selectedSeason.toString()] || [];
            const episode = seasonEpisodes[episodeIndex];

            if (episode) {
                currentEpisodeIndex = episodeIndex;
                updatePlayButton();

                localStorage.setItem("selectedEpisodeId", episodeId);

                localStorage.setItem("selectedSeason", selectedSeason.toString());

                const currentPlaylist = JSON.parse(
                    localStorage.getItem("currentPlaylistData")
                );

                const seriesEpisodeVideoUrl = `${currentPlaylist.server_info.server_protocol}://${currentPlaylist.server_info.url}:${currentPlaylist.server_info.port}/series/${currentPlaylist.user_info.username}/${currentPlaylist.user_info.password}/${episodeId}.${episode.container_extension}`;

                // Create a clean copy of the episode data
                const playingItemData = {
                    ...episode,
                };

                // FIX: If starting from beginning, explicitly set resumeTime to 0
                // AND remove any existing continue watching data
                if (startFromBeginning) {
                    playingItemData.resumeTime = 0;

                    // Remove from continue watching to ensure fresh start
                    const username = currentPlaylist.user_info.username;
                    removeItemFromHistoryById(
                        episodeId,
                        "continueWatchingSeries",
                        username
                    );

                    // Also update the current playlist data in localStorage
                    const playlistsData = JSON.parse(
                        localStorage.getItem("playlistsData") || "[]"
                    );
                    const updatedPlaylists = playlistsData.map((playlist) => {
                        if (playlist.playlistName === currentPlaylistName) {
                            const updatedContinueWatching = (
                                playlist.continueWatchingSeries || []
                            ).filter((item) => item.episodeId !== episodeId);
                            return {
                                ...playlist,
                                continueWatchingSeries: updatedContinueWatching,
                            };
                        }
                        return playlist;
                    });
                    localStorage.setItem(
                        "playlistsData",
                        JSON.stringify(updatedPlaylists)
                    );
                }

                localStorage.setItem(
                    "playingItemData",
                    JSON.stringify(playingItemData)
                );
                localStorage.setItem("selectedVideoItemUrl", seriesEpisodeVideoUrl);
                localStorage.setItem("from", "series");

                localStorage.setItem("currentPage", "videoJsPlayer");
                const navbarEl = document.querySelector("#navbar-root");
                if (navbarEl) {
                    navbarEl.style.display = "none";
                }
                Router.showPage("videoJsPlayer");
                document.body.style.backgroundImage = "none";
                document.body.style.backgroundColor = "black";
            }
        };

        const seriesDetailPageKeydownHandler = (e) => {
            if (
                localStorage.getItem("currentPage") == "seriesDetailPage" &&
                localStorage.getItem("navigationFocus") == "seriesDetailPage"
            ) {
                rebuildFocusable();

                // Sync internal state with actual focused element
                const activeEl = document.activeElement;
                if (activeEl && focusableEls.includes(activeEl)) {
                    if (lastFocused && lastFocused !== activeEl) {
                        lastFocused.classList.remove("series-detail-button-focused");
                    }
                    lastFocused = activeEl;
                    activeEl.classList.add("series-detail-button-focused");
                    currentFocusIndex = focusableEls.indexOf(activeEl);
                }

                const playBtn = document.querySelector(".series-detail-play-button");
                const startOverBtn = document.querySelector(
                    ".series-detail-start-over-button"
                );
                const trailerBtn = document.querySelector(
                    ".series-detail-more-info-button"
                );
                const menuBtn = document.querySelector(
                    ".series-detail-page-header-menu"
                );
                const seasonsBtn = document.querySelector("#seasons-button");
                const castBtn = document.querySelector("#cast-button");
                const favBtn = document.querySelector(".series-detail-fav-button");

                const topButtons = [
                    playBtn,
                    startOverBtn,
                    // trailerBtn,
                    favBtn,
                    seasonsBtn,
                    castBtn,
                ].filter(Boolean);
                const episodeItems = [
                    ...document.querySelectorAll(".seasons-episodes-item"),
                ];
                const castItems = [...document.querySelectorAll(".series-cast-item")];

                const focused = focusableEls[currentFocusIndex];

                // ✅ Handle dropdown navigation
                if (isDropdownOpen) {
                    e.preventDefault();
                    e.stopPropagation();

                    if (e.key === "ArrowDown") {
                        dropdownFocusIndex = Math.min(
                            dropdownFocusIndex + 1,
                            seasons.length - 1
                        );
                        updateDropdownFocus();
                        return;
                    } else if (e.key === "ArrowUp") {
                        dropdownFocusIndex = Math.max(dropdownFocusIndex - 1, 0);
                        updateDropdownFocus();
                        return;
                    } else if (e.key === "Enter") {
                        const seasonObj = seasons[dropdownFocusIndex];
                        if (!seasonObj) {
                            console.warn(
                                "No season found for dropdownFocusIndex:",
                                dropdownFocusIndex,
                                seasons
                            );
                            hideDropdown();
                            return;
                        }

                        selectedSeason = seasonObj.season_number || seasonObj.season || 1;
                        localStorage.setItem("selectedSeason", selectedSeason.toString());
                        updateSeasonButton();
                        hideDropdown();
                        showSeasons();
                        updatePlayButton();
                        return;
                    } else if (
                        ["Escape", "Back", "BrowserBack", "XF86Back"].includes(e.key) ||
                        e.keyCode === 10009
                    ) {
                        hideDropdown();
                        return;
                    }
                    return;
                }

                if (e.key === "ArrowUp") {
                    e.preventDefault();

                    // If on Menu Button
                    if (focused === menuBtn) {
                        // Close sidebar if open
                        const sidebar = document.querySelector(
                            ".sidebar-container-series-detail"
                        );
                        if (sidebar && sidebar.style.display !== "none") {
                            closeSidebar("seriesDetailPage");
                        }

                        if (playBtn) {
                            setFocus(playBtn);
                            playBtn.focus();
                        }
                        return;
                    }

                    // If in Top Buttons -> Smart Navigation or Go to Navbar
                    if (topButtons.includes(focused) || focused === menuBtn) {
                        const currentRect = focused.getBoundingClientRect();

                        // Filter out hidden buttons for calculation
                        const visibleTopButtons = topButtons.filter(
                            (b) => b.offsetWidth > 0 && b.offsetHeight > 0
                        );

                        // Use getBoundingClientRect for robust visual position checking
                        // Filter buttons strictly above
                        const buttonsAbove = visibleTopButtons.filter(
                            (btn) => btn.getBoundingClientRect().top < currentRect.top - 10
                        );

                        if (buttonsAbove.length > 0) {
                            // Of the buttons above, find the one closest horizontally
                            // 1. Find the "lowest" of the buttons above (closest to current line)
                            const maxTop = Math.max(
                                ...buttonsAbove.map((b) => b.getBoundingClientRect().top)
                            );
                            const immediateRowAbove = buttonsAbove.filter(
                                (b) => Math.abs(b.getBoundingClientRect().top - maxTop) < 10
                            );

                            // 2. Find closest by horizontal center
                            const currentCenter = currentRect.left + currentRect.width / 2;
                            let closestBtn = immediateRowAbove[0];
                            let minDist = Infinity;

                            immediateRowAbove.forEach((btn) => {
                                const btnRect = btn.getBoundingClientRect();
                                const btnCenter = btnRect.left + btnRect.width / 2;
                                const dist = Math.abs(btnCenter - currentCenter);
                                if (dist < minDist) {
                                    minDist = dist;
                                    closestBtn = btn;
                                }
                            });

                            if (closestBtn) {
                                setFocus(closestBtn);
                                closestBtn.focus();
                                return;
                            }
                        }

                        // If NO buttons above, check if Menu Button is available (before going to Navbar)
                        if (menuBtn && topButtons.includes(focused)) {
                            setFocus(menuBtn);
                            menuBtn.focus();
                            return;
                        }

                        // If NO buttons above and not going to menu, go to Navbar
                        localStorage.setItem("navigationFocus", "navbar");
                        // Remove focus styling from current
                        if (focused)
                            focused.classList.remove("series-detail-button-focused");

                        // Focus appropriate navbar item
                        const navItem = document.querySelector(
                            ".nav-item[data-page='seriesPage']"
                        );
                        if (navItem) {
                            navItem.focus();
                            navItem.classList.add("active");
                        } else {
                            const firstNav = document.querySelector(".nav-item");
                            if (firstNav) firstNav.focus();
                        }
                        return;
                    }

                    // If in Episodes/Cast -> Go to Top Buttons (Play Button)
                    if (episodeItems.includes(focused) || castItems.includes(focused)) {
                        if (playBtn) {
                            setFocus(playBtn);
                            playBtn.focus();
                        }
                        return;
                    }
                }

                if (e.key === "ArrowDown") {
                    e.preventDefault();

                    // Smart Navigation for Top Buttons
                    if (topButtons.includes(focused) || focused === menuBtn) {
                        // SPECIAL CASE: Season Button always goes to Episodes/Cast
                        if (focused === seasonsBtn) {
                            if (episodeItems.length > 0) {
                                setFocus(episodeItems[0]);
                                episodeItems[0].focus();
                            } else if (castItems.length > 0) {
                                setFocus(castItems[0]);
                                castItems[0].focus();
                            }
                            return;
                        }

                        const currentRect = focused.getBoundingClientRect();

                        // Filter out hidden buttons
                        const visibleTopButtons = topButtons.filter(
                            (b) => b.offsetWidth > 0 && b.offsetHeight > 0
                        );

                        // Find all buttons strictly below the current one
                        const buttonsBelow = visibleTopButtons.filter(
                            (btn) => btn.getBoundingClientRect().top > currentRect.top + 10
                        );

                        if (buttonsBelow.length > 0) {
                            // 1. Find the "highest" of the buttons below (immediate next line)
                            const minTop = Math.min(
                                ...buttonsBelow.map((b) => b.getBoundingClientRect().top)
                            );
                            const immediateRowBelow = buttonsBelow.filter(
                                (b) => Math.abs(b.getBoundingClientRect().top - minTop) < 10
                            );

                            // 2. Find closest by horizontal center
                            const currentCenter = currentRect.left + currentRect.width / 2;
                            let closestBtn = immediateRowBelow[0];
                            let minDist = Infinity;

                            immediateRowBelow.forEach((btn) => {
                                const btnRect = btn.getBoundingClientRect();
                                const btnCenter = btnRect.left + btnRect.width / 2;
                                const dist = Math.abs(btnCenter - currentCenter);
                                if (dist < minDist) {
                                    minDist = dist;
                                    closestBtn = btn;
                                }
                            });

                            if (closestBtn) {
                                setFocus(closestBtn);
                                closestBtn.focus();
                                return;
                            }
                        }

                        // If no button is visually below (we are on the last line), go to Episodes/Cast
                        if (episodeItems.length > 0) {
                            setFocus(episodeItems[0]);
                            episodeItems[0].focus();
                        } else if (castItems.length > 0) {
                            setFocus(castItems[0]);
                            castItems[0].focus();
                        }
                        return;
                    }

                    // Case for Menu Button
                    if (focused === menuBtn) {
                        if (playBtn) {
                            setFocus(playBtn);
                            playBtn.focus();
                        }
                        return;
                    }

                    // Standard Navigation (Episodes/Cast linear flow)
                    const nextIndex = currentFocusIndex + 1;
                    if (nextIndex < focusableEls.length) {
                        setFocus(focusableEls[nextIndex]);
                        focusableEls[nextIndex].focus();
                    }
                    return;
                }

                if (e.key === "ArrowRight") {
                    e.preventDefault();

                    // If on Menu Button
                    if (focused === menuBtn) {
                        // Close sidebar if open
                        const sidebar = document.querySelector(
                            ".sidebar-container-series-detail"
                        );
                        if (sidebar && sidebar.style.display !== "none") {
                            closeSidebar("seriesDetailPage");
                        }

                        if (playBtn) {
                            setFocus(playBtn);
                            playBtn.focus();
                        }
                        return;
                    }

                    // If in Top Buttons
                    if (topButtons.includes(focused)) {
                        const currentIndexInTop = topButtons.indexOf(focused);
                        if (currentIndexInTop < topButtons.length - 1) {
                            const nextBtn = topButtons[currentIndexInTop + 1];
                            setFocus(nextBtn);
                            nextBtn.focus();
                        }
                        return;
                    }

                    // If in Cast Items - stay within cast
                    if (castItems.includes(focused)) {
                        const currentCastIndex = castItems.indexOf(focused);
                        if (currentCastIndex < castItems.length - 1) {
                            const nextCast = castItems[currentCastIndex + 1];
                            setFocus(nextCast);
                            nextCast.focus();
                        }
                        return;
                    }

                    // If in Episodes
                    if (episodeItems.includes(focused)) {
                        const nextIndex = currentFocusIndex + 1;
                        if (
                            nextIndex < focusableEls.length &&
                            episodeItems.includes(focusableEls[nextIndex])
                        ) {
                            setFocus(focusableEls[nextIndex]);
                            focusableEls[nextIndex].focus();
                        }
                    }
                    return;
                }

                if (e.key === "ArrowLeft") {
                    e.preventDefault();

                    // If on Menu Button
                    if (focused === menuBtn) {
                        // Close sidebar if open
                        const sidebar = document.querySelector(
                            ".sidebar-container-series-detail"
                        );
                        if (sidebar && sidebar.style.display !== "none") {
                            closeSidebar("seriesDetailPage");
                        }

                        if (playBtn) {
                            setFocus(playBtn);
                            playBtn.focus();
                        }
                        return;
                    }

                    // If in Top Buttons
                    if (topButtons.includes(focused)) {
                        const currentIndexInTop = topButtons.indexOf(focused);
                        if (currentIndexInTop > 0) {
                            const prevBtn = topButtons[currentIndexInTop - 1];
                            setFocus(prevBtn);
                            prevBtn.focus();
                        } else if (currentIndexInTop === 0) {
                            // Optional: Go to Menu Button if it exists?
                            if (menuBtn) {
                                setFocus(menuBtn);
                                menuBtn.focus();
                            }
                        }
                        return;
                    }

                    // If in Cast Items - stay within cast
                    if (castItems.includes(focused)) {
                        const currentCastIndex = castItems.indexOf(focused);
                        if (currentCastIndex > 0) {
                            const prevCast = castItems[currentCastIndex - 1];
                            setFocus(prevCast);
                            prevCast.focus();
                        }
                        return;
                    }

                    // If in Episodes
                    if (episodeItems.includes(focused)) {
                        const prevIndex = currentFocusIndex - 1;
                        if (
                            prevIndex >= 0 &&
                            episodeItems.includes(focusableEls[prevIndex])
                        ) {
                            setFocus(focusableEls[prevIndex]);
                            focusableEls[prevIndex].focus();
                        }
                    }
                    return;
                }

                // ✅ FIXED: Start from beginning functionality in Enter key handler
                if (e.key === "Enter") {
                    e.preventDefault();

                    if (focused === playBtn) {
                        if (playBtn.textContent.includes("Resume")) {
                            // Use the stored season and episode data from data attributes
                            const lastSeason = playBtn.getAttribute("data-last-season");
                            const lastEpisodeIndex = parseInt(
                                playBtn.getAttribute("data-last-episode-index")
                            );
                            const lastEpisodeId = playBtn.getAttribute(
                                "data-last-episode-id"
                            );

                            if (lastSeason && lastEpisodeIndex !== null && lastEpisodeId) {
                                // Set the selected season to the correct one
                                selectedSeason = parseInt(lastSeason);
                                updateSeasonButton();
                                showSeasons(); // Update the episodes display

                                playEpisode(lastEpisodeId, lastEpisodeIndex, false); // FALSE = resume from last position
                            }
                        } else {
                            // Regular play from beginning - Use the stored data from attributes
                            const firstSeason = playBtn.getAttribute("data-last-season");
                            const firstEpisodeIndex = parseInt(
                                playBtn.getAttribute("data-last-episode-index")
                            );
                            const firstEpisodeId = playBtn.getAttribute(
                                "data-last-episode-id"
                            );

                            if (firstSeason && firstEpisodeIndex !== null && firstEpisodeId) {
                                // Set the selected season to the correct one
                                selectedSeason = parseInt(firstSeason);
                                updateSeasonButton();
                                showSeasons(); // Update the episodes display

                                playEpisode(firstEpisodeId, firstEpisodeIndex, true); // TRUE = start from beginning
                            }
                        }
                    } else if (focused === startOverBtn) {
                        // Use the stored season and episode data from data attributes
                        const lastSeason = startOverBtn.getAttribute("data-last-season");
                        const lastEpisodeIndex = parseInt(
                            startOverBtn.getAttribute("data-last-episode-index")
                        );
                        const lastEpisodeId = startOverBtn.getAttribute(
                            "data-last-episode-id"
                        );

                        if (lastSeason && lastEpisodeIndex !== null && lastEpisodeId) {
                            // Set the selected season to the correct one
                            selectedSeason = parseInt(lastSeason);
                            updateSeasonButton();
                            showSeasons(); // Update the episodes display

                            playEpisode(lastEpisodeId, lastEpisodeIndex, true); // TRUE = start from beginning
                        }
                        // } else if (focused === trailerBtn) {
                        //   if (seriesInfo.youtube_trailer) {
                        //     const trailerUrl = `https://www.youtube.com/watch?v=${seriesInfo.youtube_trailer}`;
                        //     localStorage.setItem("selectedVideoItemUrl", trailerUrl);
                        //     localStorage.setItem("from", "trailer_series");

                        //     // Navigate to videoJsPlayer page
                        //     localStorage.setItem("currentPage", "videoJsPlayer");

                        //     const navbarEl = document.querySelector("#navbar-root");
                        //     if (navbarEl) {
                        //       navbarEl.style.display = "none";
                        //     }
                        //     Router.showPage("videoJsPlayer");

                        //     document.body.style.backgroundImage = "none";
                        //     document.body.style.backgroundColor = "black";
                        //   } else {
                        //     alert("No trailer available");
                        //   }
                    } else if (focused === favBtn) {
                        const result = toggleFavoriteItem(
                            selectedSeriesItem.series_id,
                            "favouriteSeries"
                        );

                        const heart = favBtn.querySelector(".heart-icon");
                        const text = favBtn.querySelector(".fav-text");

                        if (heart) {
                            heart.innerHTML = result.isFav ?
                                `<i class="fa-solid fa-heart"></i>` :
                                `<i class="fa-regular fa-heart"></i>`;
                        }
                        if (text) {
                            text.textContent = result.isFav ?
                                "Remove from Favorites" :
                                "Add to Favorites";
                        }

                        favBtn.setAttribute(
                            "aria-label",
                            result.isFav ? "Remove from Favorites" : "Add to Favorites"
                        );

                        Toaster.showToast(
                            result.isFav ? "success" : "error",
                            result.isFav ? "Added to Favorites" : "Removed from Favorites"
                        );
                    } else if (focused === seasonsBtn) {
                        showDropdown();
                    } else if (focused === castBtn) {
                        showCast();
                    } else if (episodeItems.includes(focused)) {
                        const episodeIndex = parseInt(
                            focused.getAttribute("data-episode-index")
                        );
                        const episodeId = focused.getAttribute("data-episode-id");

                        // Check if this episode has progress data
                        const seasonKey = 1; // Use 1 if season info is not present
                        const episodeKey = Number(episodeId);
                        let hasProgress = false;

                        if (
                            continueWatchingMap[seasonKey] &&
                            continueWatchingMap[seasonKey][episodeKey] != null
                        ) {
                            hasProgress = continueWatchingMap[seasonKey][episodeKey] > 0;
                        }

                        // Only start from beginning if there's NO progress
                        playEpisode(episodeId, episodeIndex, !hasProgress);
                    } else if (focused === menuBtn) {
                        e.preventDefault();
                        localStorage.setItem("sidebarPage", "seriesDetailPage");

                        const sidebar = document.querySelector(
                            ".sidebar-container-series-detail"
                        );
                        if (!sidebar || sidebar.style.display === "none") {
                            openSidebar("seriesDetailPage");
                        } else {
                            closeSidebar("seriesDetailPage");
                        }
                    }
                    return;
                }
                // Back/Escape
                if (
                    ["Escape", "Back", "BrowserBack", "XF86Back"].includes(e.key) ||
                    e.keyCode === 10009
                ) {
                    e.preventDefault();

                    if (isDropdownOpen) {
                        hideDropdown();
                        return;
                    }
                    localStorage.removeItem("selectedSeriesId");
                    localStorage.removeItem("lastPlayedEpisodeId");
                    localStorage.setItem("currentPage", "seriesPage");
                    Router.showPage("series");
                    document.body.style.backgroundImage = "none";
                    document.body.style.backgroundColor = "black";
                    return;
                }
            } else {
                return;
            }
        };

        document.addEventListener("keydown", seriesDetailPageKeydownHandler);
        SeriesDetailPage.cleanup = function() {
            document.removeEventListener("keydown", seriesDetailPageKeydownHandler);
        };

        setTimeout(function() {
            showSeasons(); // Show Season 1 episodes by default
            updateSeasonButton(); // Update the season button text and arrow
            initFocus();
            updatePlayButton();

            const favBtn = document.querySelector(".series-detail-fav-button");
            if (favBtn) {
                favBtn.addEventListener("click", () => {
                    const result = toggleFavoriteItem(
                        selectedSeriesItem.series_id,
                        "favouriteSeries"
                    );
                    favBtn.textContent = result.isFav ?
                        "Remove from Favorites" :
                        "Add to Favorites";
                    Toaster.showToast(
                        result.isFav ? "success" : "error",
                        result.isFav ? "Added to Favorites" : "Removed from Favorites"
                    );
                });
            }
        }, 50);

        var htmlContent = renderSeriesDetailPage(seriesDetailData);
        const container = document.getElementById("series-detail-page");
        if (container) container.innerHTML = htmlContent;

        function removeItemfromContiueWatchingSerie() {
            removeItemFromHistoryById(
                selectedSeriesItem.series_id,
                "continueWatchingSeries"
            );
            if (selectedSeriesItem) {
                localStorage.setItem(
                    "selectedSeriesId",
                    selectedSeriesItem.series_id.toString()
                );
                localStorage.setItem("currentPage", "seriesDetailPage");
                localStorage.setItem(
                    "selectedSeriesItem",
                    JSON.stringify(selectedSeriesItem)
                );
                Router.showPage("seriesDetail");
            }
        }

        function renderSeriesDetailPage(data) {
            const seasons = data.seasons || [];
            const episodes = data.episodes || {};
            const dynamicSeasons = Object.keys(episodes)
                .map((seasonKey) => ({
                    season_number: parseInt(seasonKey),
                    episode_count: episodes[seasonKey].length,
                }))
                .sort((a, b) => a.season_number - b.season_number);

            const seriesInfo = data.info || {};

            const seasonsDropdownHtml = dynamicSeasons
                .map((season) => {
                    const seasonNum = season.season_number.toString().padStart(2, "0");
                    const episodeCount = season.episode_count.toString().padStart(2, "0");
                    return `<div class="dropdown-item" data-season="${season.season_number}">Season ${seasonNum} (${episodeCount} Episodes)</div>`;
                })
                .join("");

            // Generate buttons HTML
            let buttonsHtml = "";

            const continueWatchingEpisodes =
                currentPlaylist.continueWatchingSeries || [];
            const lastWatchedEpisode = continueWatchingEpisodes.find(
                (item) => item.itemId === seriesDetailId
            );

            if (lastWatchedEpisode && lastWatchedEpisode.episodeId) {
                let foundSeason = null;
                let foundEpisodeIndex = null;
                let foundEpisode = null;
                let foundSeasonKey = null;

                Object.keys(episodes).forEach((seasonKey) => {
                    const seasonEpisodes = episodes[seasonKey];
                    const episodeIndex = seasonEpisodes.findIndex(
                        (ep) => ep.id.toString() === lastWatchedEpisode.episodeId.toString()
                    );

                    if (episodeIndex !== -1) {
                        foundSeason = parseInt(seasonKey);
                        foundEpisodeIndex = episodeIndex;
                        foundEpisode = seasonEpisodes[episodeIndex];
                        foundSeasonKey = seasonKey;
                    }
                });

                if (foundEpisode && foundSeason && foundSeasonKey) {
                    const seasonNum = foundSeason.toString().padStart(2, "0");
                    const episodeNum = foundEpisode.episode_num
                        .toString()
                        .padStart(2, "0");

                    buttonsHtml = `
                <button class="series-detail-play-button" tabindex="0"
                    data-last-season="${foundSeasonKey}"
                    data-last-episode-index="${foundEpisodeIndex}"
                    data-last-episode-id="${foundEpisode.id}">
                    <i class="fa-solid fa-play" style="margin-right: 15px;"></i> Resume - S${seasonNum}.E${episodeNum}
                </button>
                <button class="series-detail-start-over-button" tabindex="0"
                    data-last-season="${foundSeasonKey}"
                    data-last-episode-index="${foundEpisodeIndex}"
                    data-last-episode-id="${foundEpisode.id}">
                    <i class="fa-solid fa-play" style="margin-right: 15px;"></i> Start From Beginning - S${seasonNum}.E${episodeNum}
                </button>
            `;
                }
            } else {
                // Default play button
                const firstSeasonKey = Object.keys(episodes).sort(
                    (a, b) => parseInt(a) - parseInt(b)
                )[0];
                const firstSeasonEpisodes = episodes[firstSeasonKey] || [];
                if (firstSeasonEpisodes.length > 0) {
                    const firstEpisode = firstSeasonEpisodes[0];
                    buttonsHtml = `
                <button class="series-detail-play-button" tabindex="0"
                    data-last-season="${firstSeasonKey}"
                    data-last-episode-index="0"
                    data-last-episode-id="${firstEpisode.id}">
                    <i class="fa-solid fa-play" style="margin-right: 15px;"></i> Play - S${firstSeasonKey
                      .toString()
                      .padStart(2, "0")}.E${firstEpisode.episode_num
            .toString()
            .padStart(2, "0")}
                </button>
            `;
                } else {
                    buttonsHtml = `<button class="series-detail-play-button" tabindex="0"><i class="fa-solid fa-play" style="margin-right: 15px;"></i> Play</button>`;
                }
            }

            // Add trailer button if available
            // if (data.info && data.info.youtube_trailer) {
            //   buttonsHtml += `<button class="series-detail-more-info-button" style="display: none;" tabindex="0">Watch Trailer</button>`;
            // }

            // Add favorite button
            const isFavorite = isItemFavoriteForPlaylist(
                selectedSeriesItem.series_id,
                "favouriteSeries"
            );

            return `
        <div class="series-detail-page-container"  style="background-image:linear-gradient(290.14deg, rgba(5, 113, 155, 0.7) -93.41%, #010E26 98.1%), url('${
          seriesInfo.cover || seriesInfo.backdrop
        }')">
            <div class="series-detail-page-header">
                <div class="series-detail-logo-container"><img src="/assets/app-logo.png" alt="Logo" class="seriesDetail-header-logo"/></div>
                <div class="series-detail-page-header-title"><p>Info</p></div>
                <div class="series-detail-page-header-menu" tabindex="0">
                  <svg width="14" height="58" viewBox="0 0 14 58" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="7" cy="7" r="7" fill="white"/>
                    <circle cx="7" cy="29" r="7" fill="white"/>
                    <circle cx="7" cy="51" r="7" fill="white"/>
                  </svg>
                  <div class="sidebar-container-series-detail" style="display:none;">
                    ${Sidebar({
                      from: "seriesDetailPage",
                      onSort: () => console.log("Sorting..."),
                      onRemoveItemFromContinueWatching:
                        removeItemfromContiueWatchingSerie,
                      showOpenContinueButton: seriesIsContinueWatching
                        ? true
                        : false,
                    })}
                  </div>
                </div>
            </div>
            <div class="series-detail-page-content-container">
                <div class="series-detail-content-container">
                    <div class="series-detail-content-main">
                        <div class="series-detail-image">
                            <img src="${
                              seriesInfo.cover || "./assets/placeholder-img.png"
                            }" 
                                onerror="this.onerror=null; this.src='./assets/placeholder-img.png';"
                                class="series-detail-card-poster" />
                        </div>

                        <div class="series-detail-info-div">
                            <div class="first-item"><p class="series-detail-title">${
                              seriesInfo.name || "Unknown Series"
                            }</p></div>
                            <div class="sdetail-time-date">
                                <p class="series-detail-time">${
                                  seriesInfo.duration || "N/A"
                                }</p>
                                <p class="series-detail-date">${
                                  seriesInfo.releaseDate || "N/A"
                                }</p>
                            </div>
                            <div class="directed-first-item"><p class="first">Directed By:</p></div>
                            <p class="directed-p">${
                              seriesInfo.director || "N/A"
                            }</p>
                            <div class="directed-first-item" style="margin-top: 10px;"><p class="first">Genre:</p></div>
                            <p class="directed-p">${
                              seriesInfo.genre || "N/A"
                            }</p>
                            <div class="series-detail-description"><p>${
                              seriesInfo.plot || "No description available."
                            }</p></div>
                            <div class="first-item">
                            </div>
                            <div class="first-item">
                                <div class="series-detail-buttons">
                                    ${buttonsHtml}
                                    ${
                                      // data.info && data.info.youtube_trailer
                                      //   ? '<button class="series-detail-more-info-button" tabindex="0"><i class="fa-solid fa-play" style="margin-right: 15px;"></i> Watch Trailer</button>'
                                      //   : ""
                                      ""
                                    }
                                    <button class="series-detail-fav-button" tabindex="0">
                                        <span class="heart-icon">${
                                          isFavorite
                                            ? '<i class="fa-solid fa-heart"></i>'
                                            : '<i class="fa-regular fa-heart"></i>'
                                        }</span>
                                        <span class="fav-text">${
                                          isFavorite
                                            ? "Remove from Favorites"
                                            : "Add to Favorites"
                                        }</span>
                                    </button>
                                    
                                    <div class="seasons-button-container">
                                        <button class="seasons-button" id="seasons-button" tabindex="0">Season 01</button>
                                        <div class="seasons-dropdown" style="display: none;">
                                            ${seasonsDropdownHtml}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="seasons-and-cast-container">
                        <div class="seasons-and-cast-buttons">
                            <p class="episodes-title-upper">Episodes</p>
                            <button class="cast-button" id="cast-button" style="display: none;" tabindex="0">Cast</button>
                        </div>
                        <div class="series-detail-cast"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
        }
    })();

    return "";
}