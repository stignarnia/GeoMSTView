import { initMap, applyTheme, applyCssVars } from "./init.js";
import { S } from "./state.js";
import { createWorker, setWorkerMessageHandler } from "./worker-comm.js";
import * as Render from "./render.js";
import * as Anim from "./animation.js";
import { runQueryAndRender, cacheKeyFromQuery } from "./api.js";
import { resetAnimationState } from "./utils.js";
import {
  hideSpinner,
  initCustomModalHandlers,
  openCustomModal,
  updateEditButton,
  loadSavedQuery,
} from "./ui.js";
import { registerServiceWorker } from "./pwa.js";
import { exportAnimationAsGif, initExportModal } from "./export-gif.js";

let prevDataset = "capitals";

// Initialize CSS variables, map and state
applyCssVars();
initMap();
createWorker();

// apply saved theme (if any) and ensure map tiles match
try {
  // determine initial theme: prefer saved user choice, otherwise use
  // system preference, otherwise fall back to settings.json default
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem("theme");
  } catch (e) { }
  if (savedTheme === "light" || savedTheme === "dark") {
    S.currentTheme = savedTheme;
  } else {
    try {
      if (window.matchMedia) {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches)
          S.currentTheme = "dark";
        else if (window.matchMedia("(prefers-color-scheme: light)").matches)
          S.currentTheme = "light";
        else S.currentTheme = S.CFG.DEFAULT_THEME || "dark";
      } else {
        S.currentTheme = S.CFG.DEFAULT_THEME || "dark";
      }
    } catch (e) {
      S.currentTheme = S.CFG.DEFAULT_THEME || "dark";
    }
  }
  applyTheme(S.currentTheme);
  const themeBtn = document.getElementById("themeToggle");
  const themeIcon = themeBtn && themeBtn.querySelector(".themeIcon");
  const iconForAction = (current) => (current === "light" ? "☾" : "☀");
  const animateIconSwap = (el, ch) => {
    if (!el || el.textContent === ch) return;
    let stage = 0;
    const onEnd = (ev) => {
      if (ev.target !== el) return;
      if (stage === 0) {
        el.removeEventListener("transitionend", onEnd, true);
        el.classList.remove("fade-out");
        el.textContent = ch;
        el.classList.add("fade-in");
        stage = 1;
        el.addEventListener("transitionend", onEnd, true);
      } else {
        el.removeEventListener("transitionend", onEnd, true);
        el.classList.remove("fade-in");
      }
    };
    el.addEventListener("transitionend", onEnd, true);
    el.classList.add("fade-out");
  };
  // sync icon to represent the action (opposite of current theme)
  if (themeIcon) themeIcon.textContent = iconForAction(S.currentTheme);
  // animate only on user click
  if (themeBtn)
    themeBtn.addEventListener("click", () => {
      const next = S.currentTheme === "light" ? "dark" : "light";
      S.currentTheme = next;
      try {
        localStorage.setItem("theme", next);
      } catch (e) { }
      applyTheme(next);
      animateIconSwap(themeIcon, iconForAction(next));
    });
} catch (e) { }

setWorkerMessageHandler((msg) => {
  if (msg.type === "result") {
    try {
      hideSpinner();
    } catch (e) { }
    (msg.candidates || []).forEach((item) => {
      try {
        S.gcCacheGlobal.set(item.key, item.latlngs);
      } catch (e) { }
    });
    (msg.mstLatlngs || []).forEach((item) => {
      try {
        S.gcCacheGlobal.set(item.key, item.latlngs);
      } catch (e) { }
    });
    S.neighbors = msg.neighbors || [];
    S.currentMST = msg.mst || [];
    try {
      Render.redrawCandidateLines();
    } catch (e) { }
    const total = (S.currentMST || []).reduce((s, e) => s + e.w, 0).toFixed(2);
    const totalEl = document.getElementById("mstTotal");
    if (totalEl) totalEl.textContent = "MST total length: " + total + " km";
  }
});

// Wire basic controls
document.getElementById("start").addEventListener("click", () => {
  resetAnimationState();
  Anim.startAnimation();
});
document.getElementById("reset").addEventListener("click", () => {
  resetAnimationState();
  try {
    S.map.setView(S.lastDatasetView.center, S.lastDatasetView.zoom);
  } catch (e) {
    S.map.setView(S.CFG.MAP_DEFAULT_CENTER, S.CFG.MAP_DEFAULT_ZOOM);
  }
});

// Wire export GIF button
document.getElementById("exportGif").addEventListener("click", async () => {
  try {
    await exportAnimationAsGif();
  } catch (e) {
    console.error("Export failed:", e);
    alert("Failed to export GIF: " + e.message);
  }
});

// initialize custom modal UI and handlers
initCustomModalHandlers({
  onOk: async (q) => {
    try {
      await runQueryAndRender(q, "Error running custom query: ");
    } catch (e) {
      console.error(e);
    }
  },
  onClose: (reason) => {
    try {
      // If the modal was cancelled (closed with X or ESC), reset the dataset
      // selection to the previous value. If closed with OK, do not reset.
      if (reason === "cancel") {
        try {
          document.getElementById("datasetSelect").value = prevDataset;
        } catch (e) { }
      }
      updateEditButton();
    } catch (e) { }
  },
});
// Collapse toggle wiring
try {
  const collapseToggleBtn = document.getElementById("collapseToggle");
  const controlsPanel = document.querySelector(".controls");
  if (collapseToggleBtn && controlsPanel) {
    collapseToggleBtn.addEventListener("click", () => {
      const isCollapsed = controlsPanel.classList.toggle("collapsed");
      collapseToggleBtn.title = isCollapsed ? "Expand panel" : "Collapse panel";
      collapseToggleBtn.setAttribute(
        "aria-label",
        isCollapsed ? "Expand panel" : "Collapse panel"
      );
    });
  }
} catch (e) { }

// Invalidate cache button wiring
try {
  const invalidateBtn = document.getElementById("invalidateCache");
  invalidateBtn &&
    invalidateBtn.addEventListener("click", async () => {
      try {
        const datasetSelect = document.getElementById("datasetSelect");
        if (!datasetSelect) return;
        let query = "";
        if (datasetSelect.value === "custom") {
          const ta = document.getElementById("customQuery");
          if (ta && ta.value) query = ta.value;
          else {
            const saved = localStorage.getItem(S.CUSTOM_QUERY_KEY);
            query = saved || (S && S.CFG && S.CFG.DEFAULT_CITIES_QUERY) || "";
          }
        } else if (datasetSelect.value === "preset") {
          query = loadSavedQuery(S.PRESET_QUERY_KEY);
        } else {
          alert("No cached query for this dataset to invalidate.");
          return;
        }
        if (!query || !query.trim()) {
          alert("No query to invalidate.");
          return;
        }
        const key = await cacheKeyFromQuery(query);
        try {
          localStorage.removeItem(key);
        } catch (e) { }
        try {
          S.gcCacheGlobal.clear();
        } catch (e) { }
        alert("Cache invalidated for current query.");
      } catch (e) {
        console.error(e);
        alert("Error invalidating cache");
      }
    });
} catch (e) { }

document.getElementById("editCustom").addEventListener("click", () => {
  prevDataset = document.getElementById("datasetSelect").value;
  openCustomModal();
});

document.getElementById("datasetSelect").addEventListener("focus", (e) => {
  prevDataset = e.target.value;
});
document
  .getElementById("datasetSelect")
  .addEventListener("change", async (e) => {
    const v = e.target.value;
    updateEditButton();
    // ensure animation state reset when dataset changes
    resetAnimationState();
    if (v === "custom") {
      openCustomModal();
      return;
    }
    prevDataset = v;
    Render.clearLayers();
    if (v === "capitals") {
      Render.renderCities(S.CFG.CAPITALS);
      S.map.setView(S.CFG.MAP_DEFAULT_CENTER, S.CFG.MAP_DEFAULT_ZOOM);
    } else if (v === "preset") {
      await runQueryAndRender(
        loadSavedQuery(S.PRESET_QUERY_KEY),
        "Error fetching preset: "
      );
    }
  });

// Wire algorithm change to reset animation state as well
try {
  const algoSel = document.getElementById("algoSelect");
  if (algoSel) {
    algoSel.addEventListener("change", (e) => {
      S.currentAlgorithm = e.target.value;
      resetAnimationState();
      try {
        // re-run compute/render for the currently loaded cities so the
        // change in algorithm takes effect immediately
        Render.renderCities(S.currentCities);
      } catch (err) { }
    });
  }
} catch (e) { }

// Endpoint input wiring
try {
  const endpointInput = document.getElementById("endpointInput");
  const resetEndpointBtn = document.getElementById("resetEndpoint");
  const DEFAULT_ENDPOINT = S.CFG.OVERPASS_ENDPOINT;
  if (endpointInput) endpointInput.value = S.CFG.OVERPASS_ENDPOINT;
  endpointInput &&
    endpointInput.addEventListener("input", (e) => {
      S.CFG.OVERPASS_ENDPOINT = e.target.value.trim();
    });
  resetEndpointBtn &&
    resetEndpointBtn.addEventListener("click", () => {
      if (endpointInput) endpointInput.value = DEFAULT_ENDPOINT;
      S.CFG.OVERPASS_ENDPOINT = DEFAULT_ENDPOINT;
    });
} catch (e) { }

// initialize
Render.renderCities(S.CFG.CAPITALS);
try {
  updateEditButton();
} catch (e) { }
try {
  document.getElementById("titleText").textContent = S.CFG.TITLE_TEXT;
} catch (e) { }
try {
  document.getElementById("spinnerText").textContent = S.CFG.SPINNER_TEXT;
} catch (e) { }
try {
  document.title = S.CFG.TITLE_TEXT;
} catch (e) { }

// Register service worker from the module (resolves SW path relative to this file)
try {
  registerServiceWorker();
} catch (e) { }

// Wire animation speed slider (read values only from settings)
try {
  const speedCfg = S && S.CFG && S.CFG.SPEED_RANGE;
  const speedRange = document.getElementById("speedRange");
  const speedLabel = document.getElementById("speedLabel");
  if (speedCfg && speedRange) {
    speedRange.min = speedCfg.min;
    speedRange.max = speedCfg.max;
    if (typeof speedCfg.step !== "undefined") speedRange.step = speedCfg.step;

    // derive slider position from current S.animationDelay (source of truth)
    try {
      const min = Number(speedCfg.min);
      const max = Number(speedCfg.max);
      const currentDelay = Number(S.animationDelay);
      if (!Number.isNaN(currentDelay)) {
        const initial = Math.round(min + max - currentDelay);
        speedRange.value = initial;
      } else if (typeof speedCfg.default !== "undefined") {
        speedRange.value = speedCfg.default;
      }
    } catch (e) { }

    const applyValue = (val) => {
      try {
        const delay = Number(speedCfg.min) + Number(speedCfg.max) - Number(val);
        S.animationDelay = delay;
        if (speedLabel) speedLabel.textContent = String(delay) + " ms";
      } catch (e) {
        if (speedLabel) speedLabel.textContent = "";
      }
    };

    // initialize from state
    try {
      if (typeof speedRange.value !== "undefined") applyValue(speedRange.value);
    } catch (e) { }

    speedRange.addEventListener("input", (e) => {
      const v = e.target.value;
      applyValue(v);
    });
  }
} catch (e) { }

// Initialize export modal
try {
  initExportModal();
} catch (e) { }
