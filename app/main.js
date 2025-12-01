import { initMap, applyTheme } from "./init.js";
import { S } from "./state.js";
import { createWorker, setWorkerMessageHandler } from "./worker-comm.js";
import * as Render from "./render.js";
import * as Anim from "./animation.js";
import { runQueryAndRender, cacheKeyFromQuery } from "./api.js";
import { hideSpinner } from "./ui.js";
import { dedent } from "./utils.js";

// Initialize map and state
initMap();
createWorker();

setWorkerMessageHandler((msg) => {
  if (msg.type === "result") {
    try {
      hideSpinner();
    } catch (e) {}
    (msg.candidates || []).forEach((item) => {
      try {
        S.gcCacheGlobal.set(item.key, item.latlngs);
      } catch (e) {}
    });
    (msg.mstLatlngs || []).forEach((item) => {
      try {
        S.gcCacheGlobal.set(item.key, item.latlngs);
      } catch (e) {}
    });
    S._neighbors = msg.neighbors || [];
    S.currentMST = msg.mst || [];
    try {
      Render.redrawCandidateLines();
    } catch (e) {}
    const total = (S.currentMST || []).reduce((s, e) => s + e.w, 0).toFixed(2);
    const totalEl = document.getElementById("mstTotal");
    if (totalEl) totalEl.textContent = "MST total length: " + total + " km";
  }
});

// Wire basic controls
document.getElementById("start").addEventListener("click", () => {
  Render.clearMSTLayers();
  Anim.stopAnimation();
  S.animIndex = 0;
  Anim.currentEdgeAnim = null;
  Anim.startAnimation();
});
document.getElementById("reset").addEventListener("click", () => {
  Anim.stopAnimation();
  Render.clearMSTLayers();
  S.animIndex = 0;
  Anim.currentEdgeAnim = null;
  try {
    S.map.setView(S.lastDatasetView.center, S.lastDatasetView.zoom);
  } catch (e) {
    S.map.setView(S.CFG.MAP_DEFAULT_CENTER, S.CFG.MAP_DEFAULT_ZOOM);
  }
});

// Theme toggle
try {
  const themeToggleBtn = document.getElementById("themeToggle");
  function updateThemeButton() {
    if (!themeToggleBtn) return;
    const iconChar = S.currentTheme === "dark" ? "☀" : "🌙";
    themeToggleBtn.title =
      S.currentTheme === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode";
    const iconEl = themeToggleBtn.querySelector(".themeIcon");
    if (iconEl) {
      try {
        iconEl.classList.remove("fade-in");
        iconEl.classList.add("fade-out");
        setTimeout(() => {
          iconEl.textContent = iconChar;
          iconEl.classList.remove("fade-out");
          iconEl.classList.add("fade-in");
          setTimeout(
            () => iconEl.classList.remove("fade-in"),
            S.CFG.THEME_ICON_FADE_OUT_DURATION_MS
          );
        }, S.CFG.THEME_ICON_SWAP_DELAY_MS);
      } catch (e) {
        iconEl.textContent = iconChar;
      }
    } else {
      themeToggleBtn.textContent = iconChar;
    }
  }
  themeToggleBtn.addEventListener("click", () => {
    S.currentTheme = S.currentTheme === "dark" ? "light" : "dark";
    applyTheme(S.currentTheme);
    updateThemeButton();
  });
  applyTheme(S.currentTheme);
  try {
    const iconEl = document.querySelector("#themeToggle .themeIcon");
    if (iconEl) iconEl.textContent = S.currentTheme === "dark" ? "☀" : "🌙";
  } catch (e) {}
  updateThemeButton();
} catch (e) {}

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
} catch (e) {}

// Modal and custom query handling
let prevDataset = "capitals";
const CUSTOM_QUERY_KEY = "overpass_custom_query_v1";
const PRESET_QUERY_KEY = "overpass_preset_query_v1";
const modal = document.getElementById("customModal");
const textarea = document.getElementById("customQuery");
const revertBtn = document.getElementById("revertQuery");
const okTop = document.getElementById("okTop");
const closeBtn = document.getElementById("closeModal");
const editCustomBtn = document.getElementById("editCustom");
const datasetSelectEl = document.getElementById("datasetSelect");
let _prevFocusBeforeModal = null;
let _modalKeydownHandler = null;

function _getFocusableElements(root) {
  return Array.from(
    root.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(
    (el) =>
      el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

function openCustomModal() {
  textarea.value = loadSavedQuery(CUSTOM_QUERY_KEY);
  try {
    _prevFocusBeforeModal = document.activeElement;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    const mapEl = document.getElementById("map");
    const controlsEl = document.querySelector(".controls");
    if (mapEl) mapEl.setAttribute("aria-hidden", "true");
    if (controlsEl) controlsEl.setAttribute("aria-hidden", "true");
    textarea.focus();
    _modalKeydownHandler = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key === "Tab") {
        const focusable = _getFocusableElements(modal);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", _modalKeydownHandler, true);
  } catch (e) {}
}

function closeModal() {
  try {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    const mapEl = document.getElementById("map");
    const controlsEl = document.querySelector(".controls");
    if (mapEl) mapEl.removeAttribute("aria-hidden");
    if (controlsEl) controlsEl.removeAttribute("aria-hidden");
    if (_modalKeydownHandler) {
      document.removeEventListener("keydown", _modalKeydownHandler, true);
      _modalKeydownHandler = null;
    }
    if (
      _prevFocusBeforeModal &&
      typeof _prevFocusBeforeModal.focus === "function"
    ) {
      try {
        _prevFocusBeforeModal.focus();
      } catch (e) {}
    }
    _prevFocusBeforeModal = null;
  } catch (e) {}
}

function updateEditButton() {
  try {
    editCustomBtn.style.visibility =
      datasetSelectEl.value === "custom" ? "visible" : "hidden";
  } catch (e) {}
}

function loadSavedQuery(storageKey, defaultQuery = S.CFG.DEFAULT_CITIES_QUERY) {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return dedent(saved);
    const def = dedent(defaultQuery);
    try {
      localStorage.setItem(storageKey, def);
    } catch (e) {}
    return def;
  } catch (e) {
    return dedent(defaultQuery);
  }
}

textarea.addEventListener("input", (e) => {
  try {
    localStorage.setItem(CUSTOM_QUERY_KEY, e.target.value);
  } catch (e) {}
});
revertBtn.addEventListener("click", () => {
  textarea.value = dedent(S.CFG.DEFAULT_CITIES_QUERY);
  try {
    localStorage.setItem(CUSTOM_QUERY_KEY, textarea.value);
  } catch (e) {}
});
okTop.addEventListener("click", async () => {
  const q = textarea.value;
  closeModal();
  await runQueryAndRender(q, "Error running custom query: ");
});
closeBtn.addEventListener("click", () => {
  closeModal();
  document.getElementById("datasetSelect").value = prevDataset;
  try {
    updateEditButton();
  } catch (e) {}
});
editCustomBtn.addEventListener("click", () => {
  prevDataset = datasetSelectEl.value;
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
        loadSavedQuery(PRESET_QUERY_KEY),
        "Error fetching preset: "
      );
    }
  });

// invalidate cache button
document
  .getElementById("invalidateCache")
  .addEventListener("click", async () => {
    try {
      const sel = document.getElementById("datasetSelect").value;
      if (sel === "capitals") {
        alert('No cache for preset "capitals"');
        return;
      }
      let query = null;
      if (sel === "preset") query = loadSavedQuery(PRESET_QUERY_KEY);
      else if (sel === "custom") query = loadSavedQuery(CUSTOM_QUERY_KEY);
      if (!query) {
        alert("No query to invalidate");
        return;
      }
      const key = await cacheKeyFromQuery(query);
      try {
        localStorage.removeItem(key);
      } catch (e) {}
      alert("Cache invalidated");
      await runQueryAndRender(query, "Error fetching data: ");
    } catch (e) {
      alert("Error clearing cache");
      console.error(e);
    }
  });

// Endpoint input wiring
try {
  const endpointInput = document.getElementById("endpointInput");
  const resetEndpointBtn = document.getElementById("resetEndpoint");
  const DEFAULT_ENDPOINT = S.CFG.OVERPASS_ENDPOINT;
  endpointInput.value = S.CFG.OVERPASS_ENDPOINT;
  endpointInput.addEventListener("input", (e) => {
    S.CFG.OVERPASS_ENDPOINT = e.target.value.trim();
  });
  resetEndpointBtn.addEventListener("click", () => {
    endpointInput.value = DEFAULT_ENDPOINT;
    S.CFG.OVERPASS_ENDPOINT = DEFAULT_ENDPOINT;
  });
} catch (e) {}

// Speed control wiring
const speedRange = document.getElementById("speedRange");
const speedLabel = document.getElementById("speedLabel");
try {
  speedRange.min = S.CFG.SPEED_RANGE.min;
  speedRange.max = S.CFG.SPEED_RANGE.max;
  speedRange.step = S.CFG.SPEED_RANGE.step;
  speedRange.value = S.CFG.SPEED_RANGE.default;
} catch (e) {}
speedLabel.textContent = S.animationDelay + " ms";
speedRange.addEventListener("input", (e) => {
  const min = Number(speedRange.min);
  const max = Number(speedRange.max);
  const val = Number(e.target.value);
  S.animationDelay = min + max - val;
  speedLabel.textContent = S.animationDelay + " ms";
});

// Algorithm select
try {
  document.getElementById("algoSelect").addEventListener("change", (e) => {
    S.currentAlgorithm = e.target.value;
    if (S.currentCities && S.currentCities.length) {
      Render.renderCities(S.currentCities);
    }
  });
} catch (e) {}

// initialize
Render.renderCities(S.CFG.CAPITALS);
try {
  updateEditButton();
} catch (e) {}
try {
  document.getElementById("titleText").textContent = S.CFG.TITLE_TEXT;
} catch (e) {}
try {
  document.getElementById("spinnerText").textContent = S.CFG.SPINNER_TEXT;
} catch (e) {}
try {
  document.title = S.CFG.TITLE_TEXT;
} catch (e) {}
