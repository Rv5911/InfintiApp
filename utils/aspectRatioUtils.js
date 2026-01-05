// aspectRatioUtils.js

/**
 * Aspect Ratio Utility for Video Players
 * Provides consistent aspect ratio management across all video players
 */

window.VideoAspectRatio = (function() {
  // Aspect ratio configurations
  const ASPECT_RATIOS = [
    { label: "16:9", className: "video-aspect-169", value: "16:9" },
    { label: "4:3", className: "video-aspect-43", value: "4:3" },
    { label: "2.35:1", className: "video-aspect-235", value: "2.35:1" },
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
      console.warn('Invalid parameters for applyAspectRatio');
      return null;
    }

    // Remove all aspect ratio classes
    ASPECT_RATIOS.forEach(ratio => {
      if (ratio.className) {
        videoElement.classList.remove(ratio.className);
      }
    });

    // Apply new aspect ratio
    const selectedRatio = ASPECT_RATIOS[index];
    if (selectedRatio.className) {
      videoElement.classList.add(selectedRatio.className);
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
    const index = ASPECT_RATIOS.findIndex(ratio => ratio.value === value);
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
    getCurrentIndex: () => currentIndex
  };
})();

// Initialize with default values
window.VideoAspectRatio.initialize();