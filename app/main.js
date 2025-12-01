import { initMap, applyTheme, applyCssVars } from "./init.js";
import { S } from "./state.js";
import { createWorker, setWorkerMessageHandler } from "./worker-comm.js";
import * as Render from "./render.js";
import * as Anim from "./animation.js";
import { runQueryAndRender, cacheKeyFromQuery } from "./api.js";
import {
  hideSpinner,
  initCustomModalHandlers,
  openCustomModal,
  updateEditButton,
  loadSavedQuery,
} from "./ui.js";

// Initialize CSS variables, map and state
applyCssVars();
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
  Anim.clearCurrentEdgeAnim();
  Anim.startAnimation();
});
document.getElementById("reset").addEventListener("click", () => {
  Anim.stopAnimation();
  Render.clearMSTLayers();
  S.animIndex = 0;
  Anim.clearCurrentEdgeAnim();
  try {
    S.map.setView(S.lastDatasetView.center, S.lastDatasetView.zoom);
  } catch (e) {
    S.map.setView(S.CFG.MAP_DEFAULT_CENTER, S.CFG.MAP_DEFAULT_ZOOM);
  }
});

let prevDataset = "capitals";
const PRESET_QUERY_KEY = "overpass_preset_query_v1";

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
        } catch (e) {}
      }
      updateEditButton();
    } catch (e) {}
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
} catch (e) {}

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
    if (v === "custom") {
      try {
        Anim.stopAnimation();
        Render.clearMSTLayers();
        S.animIndex = 0;
        Anim.clearCurrentEdgeAnim();
      } catch (e) {}
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
