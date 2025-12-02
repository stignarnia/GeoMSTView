import { S } from "./state.js";
import * as Anim from "./animation.js";
import * as Render from "./render.js";

let exportModal = null;
let exportStatus = null;
let exportProgressBar = null;
let exportDetails = null;
let closeExportModalBtn = null;

// Create inline worker script to avoid CORS issues
function createWorkerBlob() {
  // Fetch the worker script and create a blob URL
  return fetch("https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js")
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to fetch worker script: ${response.status} ${response.statusText}`
        );
      }
      return response.text();
    })
    .then((workerCode) => {
      const blob = new Blob([workerCode], { type: "application/javascript" });
      return URL.createObjectURL(blob);
    });
}

function showExportModal() {
  if (!exportModal) {
    exportModal = document.getElementById("exportModal");
    exportStatus = document.getElementById("exportStatus");
    exportProgressBar = document.getElementById("exportProgressBar");
    exportDetails = document.getElementById("exportDetails");
    closeExportModalBtn = document.getElementById("closeExportModal");
  }
  if (!exportModal) return;
  // Force visibility and on-top stacking in case CSS variables/pane order
  try {
    exportModal.style.display = "flex";
    exportModal.style.zIndex =
      (
        getComputedStyle(document.documentElement).getPropertyValue(
          "--z-modal"
        ) || 2000
      ).trim() || 2000;
    exportModal.style.pointerEvents = "auto";
    exportModal.offsetWidth; // force reflow
    exportModal.classList.add("visible");
    exportModal.setAttribute("aria-hidden", "false");
    // also ensure modalContent is visible immediately
    try {
      const mc = exportModal.querySelector(".modalContent");
      if (mc) {
        mc.style.transform = "translateY(0) scale(1)";
        mc.style.opacity = "1";
      }
    } catch (e) {}
  } catch (e) {}
}

function hideExportModal() {
  if (!exportModal) return;
  exportModal.classList.remove("visible");
  try {
    const mc = exportModal.querySelector(".modalContent");
    if (mc) {
      mc.style.transform = "";
      mc.style.opacity = "";
    }
  } catch (e) {}
  setTimeout(() => {
    try {
      exportModal.style.display = "none";
    } catch (e) {}
    try {
      exportModal.setAttribute("aria-hidden", "true");
    } catch (e) {}
  }, 300);
}

function updateExportProgress(progress, status, details = "") {
  try {
    if (!exportProgressBar && !exportStatus && !exportDetails) return;
    if (exportProgressBar) {
      exportProgressBar.style.transition = "width 0.12s linear";
      exportProgressBar.style.width = `${progress}%`;
      // force reflow to prompt paint
      void exportProgressBar.offsetWidth;
    }
    if (exportStatus) exportStatus.textContent = status;
    if (exportDetails) exportDetails.textContent = details;
  } catch (e) {}
}

function logExportStep(msg) {
  try {
    const t = new Date().toISOString().substr(11, 8);
    const out = `${t} — ${msg}`;
    console.log("EXPORT:", out);
    if (exportDetails) {
      // prepend so latest is visible
      exportDetails.textContent =
        out + "\n" + (exportDetails.textContent || "");
    }
  } catch (e) {}
}

async function captureMapFrame() {
  const mapContainer = S.map.getContainer();
  if (!mapContainer) throw new Error("Map container not found");

  try {
    const canvas = await html2canvas(mapContainer, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      logging: false,
      scale: 1,
      width: mapContainer.offsetWidth,
      height: mapContainer.offsetHeight,
    });
    return canvas;
  } catch (error) {
    // Check if it's a CORS/tainted canvas issue
    if (
      error.message &&
      (error.message.includes("tainted") || error.message.includes("CORS"))
    ) {
      throw new Error("CORS_ERROR");
    }
    throw error;
  }
}

// NOTE: We no longer replay the animation internally. Export should
// observe the on-screen animation rendered by `animation.js` and
// capture frames directly.

export async function exportAnimationAsGif() {
  // Basic prechecks
  if (typeof GIF === "undefined") {
    alert("GIF library not loaded. Please refresh the page and try again.");
    return;
  }
  if (typeof html2canvas === "undefined") {
    alert(
      "html2canvas library not loaded. Please refresh the page and try again."
    );
    return;
  }
  if (!S.currentMST || S.currentMST.length === 0) {
    alert(
      "No MST animation to export. Please load a dataset and compute the MST first."
    );
    return;
  }

  showExportModal();
  updateExportProgress(0, "Preparing export...", "");
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));

  // Prepare temp tracking and helpers
  const tempHighlights = [];
  const tempPolylines = [];
  let workerUrl = null;

  const cleanupTempLayers = () => {
    tempHighlights.forEach((h) => {
      try {
        S.map.removeLayer(h);
      } catch (e) {}
    });
    tempHighlights.length = 0;
    tempPolylines.forEach((p) => {
      try {
        S.map.removeLayer(p);
      } catch (e) {}
    });
    tempPolylines.length = 0;
  };

  const disableMapInteractions = () => {
    try {
      S.map.dragging.disable();
      S.map.touchZoom.disable();
      S.map.doubleClickZoom.disable();
      S.map.scrollWheelZoom.disable();
      S.map.boxZoom.disable();
      S.map.keyboard.disable();
      if (S.map.tap) S.map.tap.disable();
    } catch (e) {}
  };

  const enableMapInteractions = () => {
    try {
      S.map.dragging.enable();
      S.map.touchZoom.enable();
      S.map.doubleClickZoom.enable();
      S.map.scrollWheelZoom.enable();
      S.map.boxZoom.enable();
      S.map.keyboard.enable();
      if (S.map.tap) S.map.tap.enable();
    } catch (e) {}
  };

  const cleanup = () => {
    cleanupTempLayers();
    enableMapInteractions();
    document.body.classList.remove("exporting-gif");
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
      workerUrl = null;
    }
  };

  try {
    // Save map state and prepare
    const currentCenter = S.map.getCenter();
    const currentZoom = S.map.getZoom();
    disableMapInteractions();

    try {
      S.mstLayerGroup.clearLayers();
    } catch (e) {}
    S.highlightMarkers.forEach((h) => S.map.removeLayer(h));
    S.highlightMarkers.length = 0;
    document.body.classList.add("exporting-gif");
    await new Promise((r) => setTimeout(r, 100));
    updateExportProgress(
      5,
      "Capturing frames...",
      "Frame 0 of " + S.currentMST.length
    );
    // give browser time to paint modal and progress bar before heavy work
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 150));

    // Load worker script
    try {
      logExportStep("Loading GIF worker blob");
      workerUrl = await createWorkerBlob();
      logExportStep("GIF worker blob loaded");
    } catch (workerError) {
      console.error("Failed to load worker script:", workerError);
      logExportStep(
        "Failed to load GIF worker blob: " +
          (workerError && workerError.message
            ? workerError.message
            : String(workerError))
      );
      cleanup();
      hideExportModal();
      alert(
        "Failed to load GIF encoder worker. Please check your internet connection."
      );
      return;
    }

    // Use only user GIF config
    const gifConfig = S.CFG.GIF_EXPORT;
    if (!gifConfig) {
      cleanup();
      hideExportModal();
      alert("GIF export configuration missing (S.CFG.GIF_EXPORT)");
      return;
    }
    const required = [
      "WORKERS",
      "QUALITY",
      "INITIAL_FRAME_DELAY_MS",
      "FINAL_FRAME_DELAY_MS",
    ];
    for (const k of required) {
      if (typeof gifConfig[k] === "undefined") {
        cleanup();
        hideExportModal();
        alert("GIF export missing key: " + k);
        return;
      }
    }
    if (typeof S.animationDelay === "undefined" || S.animationDelay === null) {
      cleanup();
      hideExportModal();
      alert(
        "Animation speed unknown (S.animationDelay). Configure animation before exporting."
      );
      return;
    }

    logExportStep("Initializing GIF encoder");
    const gif = new GIF({
      workers: gifConfig.WORKERS,
      quality: gifConfig.QUALITY,
      workerScript: workerUrl,
      width: S.map.getContainer().offsetWidth,
      height: S.map.getContainer().offsetHeight,
    });
    logExportStep("GIF encoder initialized");

    // initial hold frame
    try {
      logExportStep("Capturing initial frame");
      const initialCanvas = await captureMapFrame();
      gif.addFrame(initialCanvas, { delay: gifConfig.INITIAL_FRAME_DELAY_MS });
      logExportStep("Initial frame captured");
    } catch (error) {
      if (error.message === "CORS_ERROR") {
        cleanup();
        hideExportModal();
        alert(
          "GIF export failed due to CORS restrictions from the tile server. Use CORS-compatible tiles or server-side export."
        );
        return;
      }
      throw error;
    }

    // Start on-screen animation
    try {
      Anim.stopAnimation();
    } catch (e) {}
    try {
      Render.clearMSTLayers();
    } catch (e) {}
    try {
      S.animIndex = 0;
      Anim.clearCurrentEdgeAnim();
    } catch (e) {}
    logExportStep("Starting on-screen animation");
    Anim.startAnimation();
    logExportStep("On-screen animation started");

    // Capture at high rate into buffer with caps
    const MAX_CAPTURE_FRAMES = gifConfig.MAX_CAPTURE_FRAMES
      ? Number(gifConfig.MAX_CAPTURE_FRAMES)
      : 200;
    const MAX_MULTIPLIER = gifConfig.MAX_MULTIPLIER
      ? Number(gifConfig.MAX_MULTIPLIER)
      : 8;
    const MAX_BLEND_STEPS = gifConfig.MAX_BLEND_STEPS
      ? Number(gifConfig.MAX_BLEND_STEPS)
      : 6;

    const framesBuffer = [];
    const captureInterval = 16;
    const animStart = performance.now();
    while (S.animateRafId) {
      await new Promise((r) => setTimeout(r, captureInterval));
      try {
        if (framesBuffer.length < MAX_CAPTURE_FRAMES) {
          const c = await captureMapFrame();
          framesBuffer.push(c);
          updateExportProgress(
            Math.min(
              65,
              5 + (framesBuffer.length / Math.max(1, S.currentMST.length)) * 60
            ),
            "Capturing frames...",
            `Captured ${framesBuffer.length} frames`
          );
          logExportStep(`Captured frame ${framesBuffer.length}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      } catch (err) {
        if (err.message === "CORS_ERROR") throw err;
        console.warn("Frame capture failed, continuing:", err);
      }
    }
    logExportStep(`Finished capture: ${framesBuffer.length} frames collected`);
    const animEnd = performance.now();
    const animDuration = Math.max(0, animEnd - animStart);
    if (framesBuffer.length === 0) {
      try {
        framesBuffer.push(await captureMapFrame());
      } catch (e) {
        if (e.message === "CORS_ERROR") throw e;
      }
    }

    // Interpolate lightly, bounded
    const targetFPS = gifConfig.TARGET_FPS ? Number(gifConfig.TARGET_FPS) : 240;
    const capturedFPS = Math.max(
      1,
      Math.round((framesBuffer.length / Math.max(1, animDuration)) * 1000)
    );
    let multiplier = Math.max(1, Math.ceil(targetFPS / capturedFPS));
    if (multiplier > MAX_MULTIPLIER) multiplier = MAX_MULTIPLIER;

    const extendedFrames = [];
    const blendCanvases = (cA, cB, steps) => {
      const w = cA.width,
        h = cA.height;
      const out = [];
      const actual = Math.min(steps, MAX_BLEND_STEPS);
      for (let s = 0; s < actual; s++) {
        const t = (s + 1) / (actual + 1);
        const canv = document.createElement("canvas");
        canv.width = w;
        canv.height = h;
        const ctx = canv.getContext("2d");
        ctx.drawImage(cA, 0, 0);
        ctx.globalAlpha = t;
        ctx.drawImage(cB, 0, 0);
        ctx.globalAlpha = 1;
        out.push(canv);
      }
      return out;
    };
    for (let i = 0; i < framesBuffer.length - 1; i++) {
      const a = framesBuffer[i];
      const b = framesBuffer[i + 1];
      extendedFrames.push(a);
      if (multiplier > 1) {
        try {
          const blends = blendCanvases(a, b, multiplier - 1);
          for (const cb of blends) extendedFrames.push(cb);
        } catch (e) {
          // skip blending on error
        }
      }
      // update progress and yield to allow UI repaint
      try {
        updateExportProgress(
          Math.min(65, 5 + (i / Math.max(1, framesBuffer.length)) * 60),
          "Preparing frames...",
          `Prepared ${extendedFrames.length} intermediate frames`
        );
        logExportStep(`Prepared ${extendedFrames.length} frames so far`);
        await new Promise((r) => setTimeout(r, 0));
      } catch (e) {}
    }
    extendedFrames.push(framesBuffer[framesBuffer.length - 1]);
    logExportStep(`Prepared total extended frames: ${extendedFrames.length}`);
    const perFrameDelay = Math.max(
      1,
      Math.round(animDuration / extendedFrames.length)
    );
    for (let i = 0; i < extendedFrames.length; i++) {
      try {
        gif.addFrame(extendedFrames[i], { delay: perFrameDelay });
      } catch (e) {}
      // periodically update UI and yield
      if (i % 8 === 0) {
        try {
          updateExportProgress(
            65 + Math.min(4, Math.round((i / extendedFrames.length) * 30)),
            "Adding frames to GIF...",
            `Frame ${i + 1} of ${extendedFrames.length}`
          );
          await new Promise((r) => setTimeout(r, 0));
        } catch (e) {}
      }
      extendedFrames[i] = null;
    }
    for (let i = 0; i < framesBuffer.length; i++) framesBuffer[i] = null;

    // final hold frame
    try {
      const finalCanvas = await captureMapFrame();
      gif.addFrame(finalCanvas, { delay: gifConfig.FINAL_FRAME_DELAY_MS });
    } catch (err) {
      if (err.message === "CORS_ERROR") throw err;
    }

    updateExportProgress(70, "Encoding GIF...", "This may take a moment");

    gif.on("progress", (progress) => {
      updateExportProgress(
        70 + progress * 25,
        "Encoding GIF...",
        `${Math.round(progress * 100)}% complete`
      );
    });
    gif.on("finished", (blob) => {
      updateExportProgress(100, "Complete!", "Downloading...");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mst-animation-${Date.now()}.gif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      cleanup();
      setTimeout(() => hideExportModal(), 1500);
    });

    gif.render();
  } catch (error) {
    console.error("Export error:", error);
    cleanup();
    hideExportModal();
    alert(
      "Failed to export GIF: " +
        (error && error.message ? error.message : String(error))
    );
  }
}

export function initExportModal() {
  exportModal = document.getElementById("exportModal");
  exportStatus = document.getElementById("exportStatus");
  exportProgressBar = document.getElementById("exportProgressBar");
  exportDetails = document.getElementById("exportDetails");
  closeExportModalBtn = document.getElementById("closeExportModal");

  if (closeExportModalBtn) {
    closeExportModalBtn.addEventListener("click", () => {
      hideExportModal();
    });
  }
}
