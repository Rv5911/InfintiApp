function Toaster() {
  function handleToastClick(target) {
    if (target instanceof Event) target = target.target;
    if (!target) return;

    if (target.classList.contains("toast-close")) {
      const toast = target.closest(".toast");
      if (toast) {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
      }
    }
  }

  // make sure handler added once
  if (!Toaster.initialized) {
    document.addEventListener("click", handleToastClick);
    Toaster.initialized = true;
  }

  Toaster.showToast = function (type, message) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    // 🔥 remove existing toast if already present
    const existing = container.querySelector(".toast");
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-message">${message}</span>
      <!-- <button class="toast-close">×</button> -->
    `;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 100);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  };
}

