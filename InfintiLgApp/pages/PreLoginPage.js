function PreLoginPage() {
    setTimeout(() => {
        localStorage.setItem("currentPage", "preLoginPage");
        const loadingEl = document.querySelector("#loading-overlay");
        if (loadingEl && localStorage.getItem("currentPage") === "preLoginPage") {
            loadingEl.style.background = "transparent";
            loadingEl.style.marginTop = "40%";
        }

        const fallbackToLogin = (message) => {
            localStorage.removeItem("isLogin");
            localStorage.removeItem("selectedPlaylist");
            localStorage.removeItem("currentPlaylistData");
            localStorage.setItem("currentPage", "loginPage");

            const overlay = document.querySelector("#loading-overlay");
            if (overlay) {
                overlay.classList.add("hidden");
                overlay.style.background = "";
                overlay.style.marginTop = "";
            }

            if (typeof disableKeyBlock === "function") {
                disableKeyBlock();
            }
            if (typeof resetLoadingPercentage === "function") {
                resetLoadingPercentage();
            }

            document.removeEventListener("keydown", blockPreLoginKeys, true);
            Router.showPage("login");

            if (message && typeof Toaster !== "undefined" && Toaster.showToast) {
                Toaster.showToast("error", message);
            }
        };

        let selectedPlaylist = null;
        try {
            selectedPlaylist = JSON.parse(
                localStorage.getItem("selectedPlaylist")
            );
        } catch (err) {
            fallbackToLogin("Invalid saved playlist. Please login again.");
            return;
        }

        if (selectedPlaylist) {
            loginApi(
                "",
                "",
                selectedPlaylist.playlistName,
                true,
                selectedPlaylist.playlistUrl
            ).then((response) => {
                if (!response && localStorage.getItem("currentPage") === "preLoginPage") {
                    fallbackToLogin();
                }
            }).catch((error)=>{
                fallbackToLogin(
                    error && error.message
                        ? error.message
                        : "Login failed. Please login again."
                );
            })
        } else {
            fallbackToLogin();
            return;
        }

        // Block all keys while on PreLoginPage
        function blockPreLoginKeys(e) {
            if (localStorage.getItem("currentPage") === "preLoginPage") {
                e.preventDefault();
                e.stopPropagation();
                console.log("PreLoginPage: Key blocked");
            } else {
                // Self-cleanup if we are no longer on PreLoginPage
                document.removeEventListener("keydown", blockPreLoginKeys, true);
            }
        }
        document.addEventListener("keydown", blockPreLoginKeys, true);
    }, 0);
    return `
    <div class="prelogin-page-container">
    <img src="./assets/app-logo.png" alt="Logo" class="prelogin-logo" />
    </div>
    `;
}
