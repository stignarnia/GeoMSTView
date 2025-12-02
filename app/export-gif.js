import { S } from "./state.js";
import * as Anim from "./animation.js";
import * as Render from "./render.js";
import { resetAnimationState } from "./utils.js";
import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js";

// FFmpeg encoding constants
const FFMPEG_MAX_COLORS = 256; // Max colors for palette generation
const FFMPEG_BAYER_SCALE = 5; // Dithering scale (0-5, higher = less dithering)
const MIN_FPS = 10; // Minimum frame rate for smooth playback
const MAX_FPS = 30; // Maximum frame rate to avoid large file sizes

let exportModal,
  exportStatus,
  exportProgressBar,
  exportDetails,
  closeExportModalBtn;
let exportAbort = null;
let ffmpegInstance = null;
let currentCleanup = null;

function initModalElements() {
  if (!exportModal) {
    exportModal = document.getElementById("exportModal")
    exportStatus = document.getElementById("exportStatus")
    exportProgressBar = document.getElementById("exportProgressBar")
    exportDetails = document.getElementById("exportDetails")
    closeExportModalBtn = document.getElementById("closeExportModal")
  }
}

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance
  
  const ffmpeg = new FFmpeg()
  
  ffmpeg.on("log", ({ message }) => {
    console.log("[FFmpeg]", message)
  })
  
  ffmpeg.on("progress", ({ progress }) => {
    if (progress > 0 && progress <= 1) {
      updateExportProgress(
        70 + progress * 25,
        "Encoding...",
        `${Math.round(progress * 100)}%`
      )
    }
  })
  
  const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm"
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
  })
  
  ffmpegInstance = ffmpeg
  return ffmpeg
}

function showExportModal() {
  initModalElements()
  if (!exportModal) return
  try {
    const z =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--z-modal")
        .trim() || 2000
    exportModal.style.cssText = `display: flex; z-index: ${z}; pointer-events: auto;`
    exportModal.offsetWidth
    exportModal.classList.add("visible")
    exportModal.setAttribute("aria-hidden", "false")
    const mc = exportModal.querySelector(".modalContent")
    if (mc) {
      mc.style.transform = "translateY(0) scale(1)"
      mc.style.opacity = "1"
    }
  } catch (e) {}
}

function hideExportModal() {
  if (!exportModal) return
  try {
    exportModal.classList.remove("visible")
    const mc = exportModal.querySelector(".modalContent")
    if (mc) {
      mc.style.transform = `translateY(${
        getComputedStyle(document.documentElement)
          .getPropertyValue("--anim-offset-y")
          .trim() || "6px"
      }) scale(${
        getComputedStyle(document.documentElement)
          .getPropertyValue("--anim-scale")
          .trim() || "0.98"
      })`
      mc.style.opacity = "0"
    }
  } catch (e) {}
  setTimeout(() => {
    try {
      exportModal.style.display = "none"
      exportModal.setAttribute("aria-hidden", "true")
    } catch (e) {}
  }, 300)
}

function updateExportProgress(progress, status, details = "") {
  initModalElements()
  if (exportProgressBar) exportProgressBar.style.width = `${progress}%`
  if (exportStatus) exportStatus.textContent = status
  if (exportDetails) exportDetails.textContent = details
}

async function captureMapFrame() {
  const mapContainer = S.map.getContainer()
  if (!mapContainer) throw new Error("Map container not found")
  try {
    const canvas = await html2canvas(mapContainer, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      logging: false,
      scale: 1,
      width: mapContainer.offsetWidth,
      height: mapContainer.offsetHeight,
    })
    return canvas
  } catch (error) {
    if (
      error.message &&
      (error.message.includes("tainted") || error.message.includes("CORS"))
    ) {
      throw new Error("CORS_ERROR")
    }
    throw error
  }
}

function disableMapInteractions() {
  try {
    S.map.dragging.disable()
    S.map.touchZoom.disable()
    S.map.doubleClickZoom.disable()
    S.map.scrollWheelZoom.disable()
    S.map.boxZoom.disable()
    S.map.keyboard.disable()
    if (S.map.tap) S.map.tap.disable()
  } catch (e) {}
}

function enableMapInteractions() {
  try {
    S.map.dragging.enable()
    S.map.touchZoom.enable()
    S.map.doubleClickZoom.enable()
    S.map.scrollWheelZoom.enable()
    S.map.boxZoom.enable()
    S.map.keyboard.enable()
    if (S.map.tap) S.map.tap.enable()
  } catch (e) {}
}

export async function exportAnimationAsGif() {
  if (typeof html2canvas === "undefined") {
    alert("html2canvas not loaded. Please refresh the page.")
    return
  }
  if (!S.currentMST || S.currentMST.length === 0) {
    alert("No MST to export. Please load a dataset first.")
    return
  }

  showExportModal()
  updateExportProgress(0, "Preparing...", "")

  exportAbort = { aborted: false }
  S.exportingGif = true

  const cleanup = () => {
    S.exportingGif = false
    enableMapInteractions()
    document.body.classList.remove("exporting-gif")
    exportAbort = null
    currentCleanup = null
  }
  currentCleanup = cleanup

  try {
    disableMapInteractions()
    document.body.classList.add("exporting-gif")
    await new Promise((r) => setTimeout(r, 100))

    const cfg = S.CFG.GIF_EXPORT || {}
    
    updateExportProgress(5, "Loading FFmpeg...", "")
    const ffmpeg = await getFFmpeg()
    
    if (exportAbort?.aborted || !S.exportingGif) {
      cleanup()
      hideExportModal()
      return
    }

    updateExportProgress(10, "Capturing frames...", "")
    
    const firstFrame = await captureMapFrame()
    if (exportAbort?.aborted || !S.exportingGif) {
      cleanup()
      hideExportModal()
      return
    }

    Anim.stopAnimation()
    Render.clearMSTLayers()
    S.animIndex = 0
    Anim.clearCurrentEdgeAnim()
    if (exportAbort?.aborted || !S.exportingGif) {
      cleanup()
      hideExportModal()
      return
    }
    Anim.startAnimation()

    const maxFrames = Number(cfg.MAX_CAPTURE_FRAMES ?? 200)
    const buffer = []
    const start = performance.now()

    // Capture initial frame
    buffer.push(firstFrame)

    while (S.animateRafId && buffer.length < maxFrames) {
      if (exportAbort?.aborted) break
      await new Promise((r) => setTimeout(r, 16))
      try {
        buffer.push(await captureMapFrame())
        updateExportProgress(
          10 + (buffer.length / Math.max(1, S.currentMST.length)) * 50,
          "Capturing...",
          `${buffer.length} frames`
        )
        await new Promise((r) => setTimeout(r, 0))
      } catch (e) {
        if (e.message === "CORS_ERROR") throw e
      }
    }

    const duration = Math.max(0, performance.now() - start)
    if (!buffer.length) buffer.push(await captureMapFrame())

    // Add final frame hold
    const finalFrame = await captureMapFrame()
    for (let i = 0; i < 10; i++) {
      buffer.push(finalFrame)
    }

    if (exportAbort?.aborted) throw new Error("ABORTED")

    updateExportProgress(60, "Preparing frames...", "")
    
    // Convert canvases to PNG blobs for FFmpeg
    const framePromises = buffer.map((canvas, i) => {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve({ blob, index: i })
        }, "image/png")
      })
    })
    
    const frames = await Promise.all(framePromises)
    
    updateExportProgress(65, "Writing frames to FFmpeg...", "")
    
    // Write frames to FFmpeg virtual filesystem
    for (let i = 0; i < frames.length; i++) {
      const frameData = new Uint8Array(await frames[i].blob.arrayBuffer())
      await ffmpeg.writeFile(`frame${String(i).padStart(5, "0")}.png`, frameData)
      
      if (i % 10 === 0) {
        updateExportProgress(
          65 + (i / frames.length) * 5,
          "Writing frames...",
          `${i + 1}/${frames.length}`
        )
      }
    }
    
    if (exportAbort?.aborted) throw new Error("ABORTED")
    
    updateExportProgress(70, "Encoding GIF...", "Starting FFmpeg")
    
    // Calculate frame rate based on capture duration (bounded by MIN_FPS and MAX_FPS)
    const fps = Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(buffer.length / (duration / 1000))))
    
    // Run FFmpeg to create GIF with palette generation for better quality
    await ffmpeg.exec([
      "-framerate", String(fps),
      "-i", "frame%05d.png",
      "-vf", `split[s0][s1];[s0]palettegen=max_colors=${FFMPEG_MAX_COLORS}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${FFMPEG_BAYER_SCALE}`,
      "-loop", "0",
      "output.gif"
    ])
    
    if (exportAbort?.aborted) throw new Error("ABORTED")
    
    updateExportProgress(95, "Reading output...", "")
    
    // Read the output GIF
    const data = await ffmpeg.readFile("output.gif")
    const gifBlob = new Blob([data.buffer], { type: "image/gif" })
    
    updateExportProgress(100, "Done!", "Downloading...")
    
    // Download the GIF
    const url = URL.createObjectURL(gifBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = `mst-anim-${Date.now()}.gif`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    // Cleanup FFmpeg files
    try {
      for (let i = 0; i < frames.length; i++) {
        await ffmpeg.deleteFile(`frame${String(i).padStart(5, "0")}.png`)
      }
      await ffmpeg.deleteFile("output.gif")
    } catch (e) {
      console.warn("FFmpeg cleanup error:", e)
    }
    
    cleanup()
    setTimeout(hideExportModal, 1500)
    
  } catch (e) {
    cleanup()
    hideExportModal()
    if (e.message === "ABORTED") return
    alert(
      e.message === "CORS_ERROR"
        ? "CORS error on map tiles. Try switching to light theme."
        : `Export failed: ${e.message}`
    )
  }
}

export function initExportModal() {
  initModalElements()
  if (closeExportModalBtn)
    closeExportModalBtn.addEventListener("click", () => {
      if (exportAbort) {
        try {
          resetAnimationState()
        } catch (e) {}
        exportAbort.aborted = true
        try {
          currentCleanup && currentCleanup()
        } catch (e) {}
        hideExportModal()
      } else hideExportModal()
    })
}
