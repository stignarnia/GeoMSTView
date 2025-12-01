import { S } from "./state.js"
import { gcKey, greatCirclePoints } from "./utils.js"

let exportModal = null
let exportStatus = null
let exportProgressBar = null
let exportDetails = null
let closeExportModalBtn = null

// Create inline worker script to avoid CORS issues
function createWorkerBlob() {
  // Fetch the worker script and create a blob URL
  return fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js')
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch worker script: ${response.status} ${response.statusText}`)
      }
      return response.text()
    })
    .then(workerCode => {
      const blob = new Blob([workerCode], { type: 'application/javascript' })
      return URL.createObjectURL(blob)
    })
}

function showExportModal() {
  if (!exportModal) {
    exportModal = document.getElementById("exportModal")
    exportStatus = document.getElementById("exportStatus")
    exportProgressBar = document.getElementById("exportProgressBar")
    exportDetails = document.getElementById("exportDetails")
    closeExportModalBtn = document.getElementById("closeExportModal")
  }
  if (!exportModal) return
  
  exportModal.style.display = "flex"
  exportModal.offsetWidth // force reflow
  exportModal.classList.add("visible")
  exportModal.setAttribute("aria-hidden", "false")
}

function hideExportModal() {
  if (!exportModal) return
  exportModal.classList.remove("visible")
  setTimeout(() => {
    exportModal.style.display = "none"
    exportModal.setAttribute("aria-hidden", "true")
  }, 300)
}

function updateExportProgress(progress, status, details = "") {
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
      height: mapContainer.offsetHeight
    })
    return canvas
  } catch (error) {
    // Check if it's a CORS/tainted canvas issue
    if (error.message && (error.message.includes("tainted") || error.message.includes("CORS"))) {
      throw new Error("CORS_ERROR")
    }
    throw error
  }
}

function replayAnimationStep(edgeIndex) {
  if (edgeIndex >= S.currentMST.length) {
    return null
  }
  
  const e = S.currentMST[edgeIndex]
  const key = gcKey(e.u, e.v)
  
  let latlngs = S.gcCacheGlobal.get(key)
  if (!latlngs) {
    latlngs = greatCirclePoints(S.currentCities[e.u], S.currentCities[e.v], {
      GC_MIN_SEGMENTS: S.CFG.GC_MIN_SEGMENTS,
      GC_MAX_SEGMENTS: S.CFG.GC_MAX_SEGMENTS,
      GC_SEGMENT_FACTOR: S.CFG.GC_SEGMENT_FACTOR,
      DISTANCE_RADIUS_KM: S.CFG.DISTANCE_RADIUS_KM,
    })
    S.gcCacheGlobal.set(key, latlngs)
  }

  // Add highlight markers
  const h1 = L.circleMarker(
    [S.currentCities[e.u].lat, S.currentCities[e.u].lon],
    {
      radius: S.CFG.HIGHLIGHT_RADIUS,
      color: S.CFG.HIGHLIGHT_COLOR,
      fillColor: S.CFG.HIGHLIGHT_FILL,
      fillOpacity: S.CFG.HIGHLIGHT_FILL_OPACITY,
      opacity: 1,
      className: "highlight-marker",
      pane: "highlightPane",
    }
  ).addTo(S.map)
  
  const h2 = L.circleMarker(
    [S.currentCities[e.v].lat, S.currentCities[e.v].lon],
    {
      radius: S.CFG.HIGHLIGHT_RADIUS,
      color: S.CFG.HIGHLIGHT_COLOR,
      fillColor: S.CFG.HIGHLIGHT_FILL,
      fillOpacity: S.CFG.HIGHLIGHT_FILL_OPACITY,
      opacity: 1,
      className: "highlight-marker",
      pane: "highlightPane",
    }
  ).addTo(S.map)

  // Add MST edge
  const polyOpts = Object.assign({}, S.CFG.MST_STYLE)
  try {
    polyOpts.renderer = S.mstCanvasRenderer
    polyOpts.pane = "mstPane"
  } catch (e) {}
  
  const parent = S.mstLayerGroup || S.map
  const polylines = []
  
  // Handle wrapped polylines
  let seg = [latlngs[0]]
  for (let i = 1; i < latlngs.length; i++) {
    const prevLon = latlngs[i - 1][1]
    const curLon = latlngs[i][1]
    const rawDiff = curLon - prevLon
    if (Math.abs(rawDiff) > S.CFG.WRAP_LON_THRESHOLD) {
      const p = L.polyline(seg, polyOpts).addTo(parent)
      polylines.push(p)
      seg = [latlngs[i]]
    } else {
      seg.push(latlngs[i])
    }
  }
  if (seg.length) {
    const p = L.polyline(seg, polyOpts).addTo(parent)
    polylines.push(p)
  }

  return { highlights: [h1, h2], polylines }
}

export async function exportAnimationAsGif() {
  // Check if gif.js is loaded
  if (typeof GIF === 'undefined') {
    alert("GIF library not loaded. Please refresh the page and try again.")
    return
  }

  // Check if html2canvas is loaded
  if (typeof html2canvas === 'undefined') {
    alert("html2canvas library not loaded. Please refresh the page and try again.")
    return
  }

  // Check if we have an MST to export
  if (!S.currentMST || S.currentMST.length === 0) {
    alert("No MST animation to export. Please load a dataset and compute the MST first.")
    return
  }

  showExportModal()
  updateExportProgress(0, "Preparing export...", "")

  // Track temporary layers for cleanup
  const tempHighlights = []
  const tempPolylines = []
  let workerUrl = null
  
  // Helper function to clean up temporary layers
  const cleanupTempLayers = () => {
    tempHighlights.forEach((h) => {
      try {
        S.map.removeLayer(h)
      } catch (e) {}
    })
    tempHighlights.length = 0
    
    tempPolylines.forEach((p) => {
      try {
        S.map.removeLayer(p)
      } catch (e) {}
    })
    tempPolylines.length = 0
  }
  
  // Helper function to disable map interactions
  const disableMapInteractions = () => {
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
  
  // Helper function to enable map interactions
  const enableMapInteractions = () => {
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
  
  // Centralized cleanup function
  const cleanup = () => {
    cleanupTempLayers()
    enableMapInteractions()
    document.body.classList.remove("exporting-gif")
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl)
      workerUrl = null
    }
  }

  try {
    // Save current map state
    const currentCenter = S.map.getCenter()
    const currentZoom = S.map.getZoom()
    
    // Disable map interactions during export
    disableMapInteractions()
    
    // Clear existing MST visualization
    try {
      S.mstLayerGroup.clearLayers()
    } catch (e) {}
    
    S.highlightMarkers.forEach((h) => S.map.removeLayer(h))
    S.highlightMarkers.length = 0

    // Hide UI elements
    document.body.classList.add("exporting-gif")
    
    // Small delay to ensure UI is hidden
    await new Promise(resolve => setTimeout(resolve, 100))

    updateExportProgress(5, "Capturing frames...", "Frame 0 of " + S.currentMST.length)

    // Create worker blob URL to avoid CORS issues
    try {
      workerUrl = await createWorkerBlob()
    } catch (workerError) {
      console.error("Failed to load worker script:", workerError)
      cleanup()
      hideExportModal()
      alert("Failed to load GIF encoder worker. Please check your internet connection.")
      return
    }

    // Initialize GIF encoder
    const gifConfig = S.CFG.GIF_EXPORT || {}
    const gif = new GIF({
      workers: gifConfig.WORKERS || 2,
      quality: gifConfig.QUALITY || 10,
      workerScript: workerUrl,
      width: S.map.getContainer().offsetWidth,
      height: S.map.getContainer().offsetHeight
    })

    // Capture initial frame (before animation starts)
    try {
      const initialCanvas = await captureMapFrame()
      gif.addFrame(initialCanvas, { delay: gifConfig.INITIAL_FRAME_DELAY_MS || 500 })
    } catch (error) {
      if (error.message === "CORS_ERROR") {
        cleanup()
        hideExportModal()
        alert(
          "GIF export failed due to CORS restrictions from the tile server.\n\n" +
          "Solutions:\n" +
          "1. Use a CORS-compatible tile server (like the default OpenStreetMap tiles)\n" +
          "2. Some tile servers may block cross-origin canvas access\n" +
          "3. Consider using a server-side export solution for production use"
        )
        return
      }
      throw error
    }

    // Capture frames for each MST edge
    const totalFrames = S.currentMST.length
    let frameCount = 0

    for (let i = 0; i < S.currentMST.length; i++) {
      const stepLayers = replayAnimationStep(i)
      if (stepLayers) {
        tempHighlights.push(...stepLayers.highlights)
        tempPolylines.push(...stepLayers.polylines)
      }

      // Small delay for rendering
      await new Promise(resolve => setTimeout(resolve, gifConfig.RENDER_DELAY_MS || 50))

      // Capture frame
      const canvas = await captureMapFrame()
      gif.addFrame(canvas, { delay: gifConfig.EDGE_FRAME_DELAY_MS || 200 })
      frameCount++

      const progress = 5 + (frameCount / totalFrames) * 60
      updateExportProgress(
        progress,
        "Capturing frames...",
        `Frame ${i + 1} of ${S.currentMST.length}`
      )
    }

    // Capture final frame (hold the complete MST)
    const finalCanvas = await captureMapFrame()
    gif.addFrame(finalCanvas, { delay: gifConfig.FINAL_FRAME_DELAY_MS || 1000 })

    updateExportProgress(70, "Encoding GIF...", "This may take a moment")

    // Generate GIF
    gif.on('progress', (progress) => {
      const encodingProgress = 70 + (progress * 25)
      updateExportProgress(encodingProgress, "Encoding GIF...", `${Math.round(progress * 100)}% complete`)
    })

    gif.on('finished', (blob) => {
      updateExportProgress(100, "Complete!", "Downloading...")
      
      // Download the GIF
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mst-animation-${Date.now()}.gif`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Cleanup all resources
      cleanup()
      
      setTimeout(() => {
        hideExportModal()
      }, 1500)
    })

    gif.render()

  } catch (error) {
    console.error("Export error:", error)
    cleanup()
    hideExportModal()
    alert("Failed to export GIF: " + error.message)
  }
}

export function initExportModal() {
  exportModal = document.getElementById("exportModal")
  closeExportModalBtn = document.getElementById("closeExportModal")
  
  if (closeExportModalBtn) {
    closeExportModalBtn.addEventListener("click", () => {
      hideExportModal()
    })
  }
}
