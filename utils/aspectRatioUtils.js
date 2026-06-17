// aspectRatioUtils.js

/**
 * Aspect Ratio Utility for Video Players
 * Provides consistent aspect ratio management across all video players
 */

window.VideoAspectRatio = (function () {
  // Aspect ratio configurations
  const ASPECT_RATIOS = [
    {
      label: "16:9",
      value: "16:9",
      style: {
        width: "100%",
        height: "100vh",
        top: "0",
        bottom: "0",
        left: "0",
        right: "0",
        position: "absolute",
        objectFit: "fill",
        transform: "none",
        clipPath: "none",
        overflow: "hidden",
        padding: "0",
        margin: "0",
      },
    },
    {
      label: "4:3",
      value: "4:3",
      style: {
        width: "75%",
        height: "100vh",
        top: "0",
        bottom: "0",
        left: "12.5%",
        right: "12.5%",
        position: "absolute",
        objectFit: "fill",
        transform: "none",
        clipPath: "none",
        overflow: "hidden",
        padding: "0",
        margin: "0",
      },
    },
  
  ];

  let currentIndex = 0;

  /**
   * Apply aspect ratio to video element
   * @param {number} index - Index of aspect ratio in ASPECT_RATIOS array
   * @param {HTMLElement} videoElement - Video element to apply aspect ratio to
   * @returns {string} Label of applied aspect ratio
   */
  function applyAspectRatio(index, videoElement) {
    if (!videoElement || index < 0 || index >= ASPECT_RATIOS.length) {
      console.warn("Invalid parameters for applyAspectRatio");
      return null;
    }

    // Apply new aspect ratio styles directly
    const selectedRatio = ASPECT_RATIOS[index];
    if (selectedRatio.style) {
      Object.keys(selectedRatio.style).forEach((prop) => {
        // Convert camelCase to kebab-case for setProperty
        const kebabProp = prop
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .toLowerCase();
        videoElement.style.setProperty(
          kebabProp,
          selectedRatio.style[prop],
          "important",
        );
      });
    }

    currentIndex = index;
    return selectedRatio.label;
  }

  /**
   * Cycle to next aspect ratio
   * @param {HTMLElement} videoElement - Video element to apply aspect ratio to
   * @returns {string} Label of applied aspect ratio
   */
  function cycleAspectRatio(videoElement) {
    currentIndex = (currentIndex + 1) % ASPECT_RATIOS.length;
    return applyAspectRatio(currentIndex, videoElement);
  }

  /**
   * Get current aspect ratio information
   * @returns {Object} Current aspect ratio object
   */
  function getCurrentAspectRatio() {
    return ASPECT_RATIOS[currentIndex];
  }

  /**
   * Set aspect ratio by value
   * @param {string} value - Aspect ratio value (e.g., "16:9", "4:3")
   * @param {HTMLElement} videoElement - Video element to apply aspect ratio to
   * @returns {string} Label of applied aspect ratio
   */
  function setAspectRatioByValue(value, videoElement) {
    const index = ASPECT_RATIOS.findIndex((ratio) => ratio.value === value);
    if (index !== -1) {
      return applyAspectRatio(index, videoElement);
    }
    console.warn(`Aspect ratio "${value}" not found`);
    return null;
  }

  /**
   * Show aspect ratio overlay
   * @param {string} label - Text to show in overlay
   */
  function showAspectOverlay(label) {
    let overlay = document.getElementById("aspectRatioOverlay");

    // Create overlay if it doesn't exist
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "aspectRatioOverlay";
      overlay.className = "aspect-ratio-overlay";
      document.body.appendChild(overlay);
    }

    overlay.textContent = label;
    overlay.classList.add("show");

    // Auto-hide after 1 second
    clearTimeout(window._aspectOverlayTimeout);
    window._aspectOverlayTimeout = setTimeout(() => {
      overlay.classList.remove("show");
    }, 1000);
  }

  /**
   * Initialize aspect ratio with default (16:9)
   * @param {HTMLElement} videoElement - Video element to initialize
   */
  function initialize(videoElement) {
    if (videoElement) {
      applyAspectRatio(0, videoElement); // Default to 16:9
    }
    return getCurrentAspectRatio();
  }

  /**
   * Reset to default aspect ratio (16:9)
   * @param {HTMLElement} videoElement - Video element to reset
   */
  function resetToDefault(videoElement) {
    currentIndex = 0;
    return applyAspectRatio(0, videoElement);
  }

  // Public API
  return {
    apply: applyAspectRatio,
    cycle: cycleAspectRatio,
    getCurrent: getCurrentAspectRatio,
    setByValue: setAspectRatioByValue,
    showOverlay: showAspectOverlay,
    initialize: initialize,
    reset: resetToDefault,
    getAllRatios: () => ASPECT_RATIOS,
    getCurrentIndex: () => currentIndex,
  };
})();

// Initialize with default values
window.VideoAspectRatio.initialize();
