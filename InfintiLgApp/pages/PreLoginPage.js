function PreLoginPage() {
    setTimeout(() => {
        localStorage.setItem("currentPage", "preLoginPage");
        const loadingEl = document.querySelector("#loading-overlay");
        if (loadingEl && localStorage.getItem("currentPage") === "preLoginPage") {
            loadingEl.style.background = "transparent";
            loadingEl.style.marginTop = "40%";
        }
        const selectedPlaylist = JSON.parse(
            localStorage.getItem("selectedPlaylist")
        );
        if (selectedPlaylist) {
            loginApi(
                "",
                "",
                selectedPlaylist.playlistName,
                true,
                selectedPlaylist.playlistUrl
            ).then((response) => {
                const res = response;
            });
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
    <img src="/assets/app-logo.png" alt="Logo" class="prelogin-logo" />
    </div>
    `;
}