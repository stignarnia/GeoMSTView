const CFG = {
  // MAP_DEFAULT_CENTER: initial map center [lat, lon]
  MAP_DEFAULT_CENTER: [41.9, 12.5],
  // MAP_DEFAULT_ZOOM: initial zoom level when centering a dataset
  MAP_DEFAULT_ZOOM: 6,
  // TILE_URL / TILE_MAX_ZOOM / TILE_ATTRIBUTION: tile layer settings
  // Dark tile layer (Carto Dark Matter)
  TILE_URL: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  TILE_MAX_ZOOM: 19,
  TILE_ATTRIBUTION: "© OpenStreetMap contributors, © CARTO",
  // Light-mode tiles (standard OpenStreetMap)
  LIGHT_TILE_URL: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  LIGHT_TILE_ATTRIBUTION: "© OpenStreetMap contributors",
  // default theme: 'dark' or 'light'
  DEFAULT_THEME: "dark",
  // TITLE_TEXT: document title and UI title text
  TITLE_TEXT: "MST Visualization — OpenStreetMap geographic data (Haversine)",
  // WRAP_LON_THRESHOLD: longitude jump threshold (deg) to split polylines
  WRAP_LON_THRESHOLD: 180,
  // SPINNER_TEXT: text shown next to loading spinner
  SPINNER_TEXT: "Downloading data…",
  // SPEED_RANGE: DOM slider attributes for animation speed control.
  // NOTE: slider values are mapped to animation delay in milliseconds with
  // an inverted mapping: `delay_ms = min + max - sliderValue`.
  // Therefore here `min` corresponds to the fastest animation (smallest delay)
  // and `max` corresponds to the slowest (largest delay).
  SPEED_RANGE: { min: 5, max: 1000, step: 5, default: 525 },
  // OVERPASS_ENDPOINT: Overpass API endpoint used to run queries
  OVERPASS_ENDPOINT: "https://overpass-api.de/api/interpreter",
  // CACHE_TTL_MS: how long to keep Overpass responses in localStorage
  CACHE_TTL_MS: 24 * 60 * 60 * 1000,
  // DISTANCE_RADIUS_KM: Earth radius used by Haversine (km)
  DISTANCE_RADIUS_KM: 6371,
  // GC_*: great-circle segmentation tuning
  // GC_MIN_SEGMENTS: minimum number of segments for great-circle
  GC_MIN_SEGMENTS: 6,
  // GC_MAX_SEGMENTS: maximum number of segments for great-circle
  GC_MAX_SEGMENTS: 128,
  // GC_SEGMENT_FACTOR: segments = round(dist * GC_SEGMENT_FACTOR)
  GC_SEGMENT_FACTOR: 0.2,
  // K_MIN / K_MAX: minimum and maximum k for k-nearest candidate lines
  K_MIN: 8,
  K_MAX: 16,
  // HOLD_LEVELS: number of zoom levels to keep k at K_MIN before growing
  HOLD_LEVELS: 2,
  // TARGET_ZOOM_OFFSET: grow to K_MAX by minZoom + TARGET_ZOOM_OFFSET
  TARGET_ZOOM_OFFSET: 7,
  // Marker and highlight styling
  MARKER_RADIUS: 6,
  HIGHLIGHT_RADIUS: 8,
  HIGHLIGHT_COLOR: "blue",
  HIGHLIGHT_FILL: "cyan",
  HIGHLIGHT_FILL_OPACITY: 0.7,
  // Style objects for candidate and MST polylines
  CANDIDATE_STYLE: { color: "#888", weight: 1, opacity: 0.2 },
  MST_STYLE: { color: "red", weight: 3, opacity: 1 },
  // DEFAULT_CITIES_QUERY: default Overpass QL used for the "preset" query
  DEFAULT_CITIES_QUERY: `
            [out:json][timeout:60];
            area["ISO3166-1"="IT"]->.a;
            (
              node["place"~"city|town"]["population"~"^([5-9][0-9]{4}|[1-9][0-9]{5,})$"](area.a);
              way["place"~"city|town"]["population"~"^([5-9][0-9]{4}|[1-9][0-9]{5,})$"](area.a);
              relation["place"~"city|town"]["population"~"^([5-9][0-9]{4}|[1-9][0-9]{5,})$"](area.a);
            );
            out center tags;`,
  // CAPITALS: small sample dataset (region capitals).
  CAPITALS: [
    { name: "Aosta", region: "Aosta Valley", lat: 45.737, lon: 7.315 },
    { name: "Turin", region: "Piedmont", lat: 45.0703, lon: 7.6869 },
    { name: "Genoa", region: "Liguria", lat: 44.4056, lon: 8.9463 },
    { name: "Milan", region: "Lombardy", lat: 45.4642, lon: 9.19 },
    {
      name: "Trento",
      region: "Trentino-Alto Adige",
      lat: 46.0667,
      lon: 11.1167,
    },
    { name: "Venice", region: "Veneto", lat: 45.4386, lon: 12.3267 },
    {
      name: "Trieste",
      region: "Friuli-Venezia Giulia",
      lat: 45.6408,
      lon: 13.7695,
    },
    { name: "Bologna", region: "Emilia-Romagna", lat: 44.4949, lon: 11.3426 },
    { name: "Florence", region: "Tuscany", lat: 43.7711, lon: 11.2486 },
    { name: "Perugia", region: "Umbria", lat: 43.1107, lon: 12.3908 },
    { name: "Ancona", region: "Marche", lat: 43.6158, lon: 13.5189 },
    { name: "Rome", region: "Lazio", lat: 41.9028, lon: 12.4964 },
    { name: "L'Aquila", region: "Abruzzo", lat: 42.3498, lon: 13.3995 },
    { name: "Naples", region: "Campania", lat: 40.8518, lon: 14.2681 },
    { name: "Catanzaro", region: "Calabria", lat: 38.905, lon: 16.5944 },
    { name: "Bari", region: "Puglia", lat: 41.1256, lon: 16.8668 },
    { name: "Potenza", region: "Basilicata", lat: 40.6394, lon: 15.805 },
    { name: "Palermo", region: "Sicily", lat: 38.1157, lon: 13.3615 },
    { name: "Cagliari", region: "Sardinia", lat: 39.2238, lon: 9.1217 },
  ],
};

// Compute ANIMATION_DELAY_DEFAULT from SPEED_RANGE so the slider default
// maps consistently to the animation delay using the inverted mapping
// used elsewhere: delay = min + max - sliderValue
CFG.ANIMATION_DELAY_DEFAULT =
  CFG.SPEED_RANGE.min + CFG.SPEED_RANGE.max - CFG.SPEED_RANGE.default;

const map = L.map("map", {
  zoomControl: false,
}).setView(CFG.MAP_DEFAULT_CENTER, CFG.MAP_DEFAULT_ZOOM);

// base tile layer (we will replace URL on theme toggle)
let baseTileLayer = L.tileLayer(CFG.TILE_URL, {
  maxZoom: CFG.TILE_MAX_ZOOM,
  attribution: CFG.TILE_ATTRIBUTION,
}).addTo(map);
// current theme
let currentTheme = CFG.DEFAULT_THEME || "dark";

function applyTheme(theme) {
  try {
    const useLight = theme === "light";
    const url =
      useLight && CFG.LIGHT_TILE_URL ? CFG.LIGHT_TILE_URL : CFG.TILE_URL;
    const attr =
      useLight && CFG.LIGHT_TILE_ATTRIBUTION
        ? CFG.LIGHT_TILE_ATTRIBUTION
        : CFG.TILE_ATTRIBUTION;
    // remove and recreate base layer to ensure attribution updates cleanly
    try {
      map.removeLayer(baseTileLayer);
    } catch (e) {}
    baseTileLayer = L.tileLayer(url, {
      maxZoom: CFG.TILE_MAX_ZOOM,
      attribution: attr,
    }).addTo(map);
  } catch (e) {
    // non-fatal
  }
}

// Canvas renderers for faster drawing of many polylines
const candidateCanvasRenderer = L.canvas({ padding: 0.5 });
const mstCanvasRenderer = L.canvas({ padding: 0.5 });
// LayerGroups to pool candidate / mst layers and reduce many add/remove ops
const candidateLayerGroup = L.layerGroup().addTo(map);
const mstLayerGroup = L.layerGroup().addTo(map);
// Worker to offload heavy computation (Prim, distances, GC points)
const computeWorker = new Worker("worker.js");
computeWorker._neighbors = [];
computeWorker.addEventListener("error", (e) => {
  console.error("Worker error", e);
});
// handler for worker results
computeWorker.addEventListener("message", (ev) => {
  const msg = ev.data || {};
  if (msg.type === "result") {
    hideSpinner();
    // fill caches with returned latlngs
    (msg.candidates || []).forEach((item) => {
      try {
        gcCacheGlobal.set(item.key, item.latlngs);
      } catch (e) {}
    });
    (msg.mstLatlngs || []).forEach((item) => {
      try {
        gcCacheGlobal.set(item.key, item.latlngs);
      } catch (e) {}
    });
    // store neighbors to use when drawing candidates
    computeWorker._neighbors = msg.neighbors || [];
    // set MST and redraw candidate lines
    currentMST = msg.mst || [];
    try {
      redrawCandidateLines();
    } catch (e) {}
    const total = (currentMST || []).reduce((s, e) => s + e.w, 0).toFixed(2);
    const totalEl = document.getElementById("mstTotal");
    if (totalEl) totalEl.textContent = "MST total length: " + total + " km";
  }
});

// Use shared implementations to avoid duplication with worker
const shared = self.__MST_shared || {};
const haversineShared = shared.haversine;
const greatCirclePointsShared = shared.greatCirclePoints;

// UI helpers for spinner control (centralized to avoid repeated try/catch)
function showSpinner(text) {
  try {
    const s = document.getElementById("spinner");
    const st = document.getElementById("spinnerText");
    if (s) s.style.display = "inline-block";
    if (st) {
      st.style.display = "inline-block";
      st.textContent = text !== undefined ? text : CFG.SPINNER_TEXT;
    }
  } catch (e) {
    // non-fatal UI error
  }
}

function hideSpinner() {
  try {
    const s = document.getElementById("spinner");
    const st = document.getElementById("spinnerText");
    if (s) s.style.display = "none";
    if (st) st.style.display = "none";
  } catch (e) {
    // ignore
  }
}

// Draw latlng arrays but split them when a longitude jump > 180° occurs
// so the line disappears at the map edge and reappears on the other side.
function addWrappedPolyline(latlngs, options, collectArray) {
  if (!latlngs || !latlngs.length) return [];
  const parts = [];
  let seg = [latlngs[0]];
  for (let i = 1; i < latlngs.length; i++) {
    const prevLon = latlngs[i - 1][1];
    const curLon = latlngs[i][1];
    const rawDiff = curLon - prevLon;
    if (Math.abs(rawDiff) > CFG.WRAP_LON_THRESHOLD) {
      // break the segment here to avoid drawing the long wrap-around
      // prefer canvas renderer for candidate / MST styles to reduce SVG overhead
      const polyOpts = Object.assign({}, options);
      try {
        if (options === CFG.CANDIDATE_STYLE)
          polyOpts.renderer = candidateCanvasRenderer;
        else if (options === CFG.MST_STYLE)
          polyOpts.renderer = mstCanvasRenderer;
      } catch (e) {}
      // add to appropriate parent group to enable pooling / bulk clear
      const parent =
        options === CFG.CANDIDATE_STYLE
          ? candidateLayerGroup
          : options === CFG.MST_STYLE
          ? mstLayerGroup
          : map;
      const p = L.polyline(seg, polyOpts).addTo(parent);
      parts.push(p);
      if (Array.isArray(collectArray)) collectArray.push(p);
      seg = [latlngs[i]];
    } else {
      seg.push(latlngs[i]);
    }
  }
  if (seg.length) {
    const parent =
      options === CFG.CANDIDATE_STYLE
        ? candidateLayerGroup
        : options === CFG.MST_STYLE
        ? mstLayerGroup
        : map;
    const p = L.polyline(seg, options).addTo(parent);
    parts.push(p);
    if (Array.isArray(collectArray)) collectArray.push(p);
  }
  return parts;
}

// Globals for current dataset and layers
let currentCities = [];
let currentAlgorithm = "prim"; // Track selected algorithm
let markers = [];
let candidateLines = [];
let mstLines = [];
let highlightMarkers = [];
let currentMST = [];
let animIndex = 0;
let animateRafId = null;
let animateLastStepTs = 0;
// animation delay in ms (controlled by UI)
let animationDelay = CFG.ANIMATION_DELAY_DEFAULT;
let lastDatasetView = {
  center: CFG.MAP_DEFAULT_CENTER.slice(),
  zoom: CFG.MAP_DEFAULT_ZOOM,
};
// global cache for great-circle points to avoid recomputation
let gcCacheGlobal = new Map();
// stable key for currentCities to avoid unnecessary cache clears
let lastCitiesKey = null;

function computeCitiesKey(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  try {
    const arr = list.map((c) => {
      const lat = typeof c.lat === "number" ? c.lat.toFixed(6) : String(c.lat);
      const lon = typeof c.lon === "number" ? c.lon.toFixed(6) : String(c.lon);
      const name = String(c.name || "");
      const pop = c.population || "";
      return lat + "|" + lon + "|" + name + "|" + pop;
    });
    arr.sort();
    return arr.join(";");
  } catch (e) {
    return "";
  }
}
let lastZoom = null;
let mstZoomHandler = null;

function clearLayers() {
  markers.forEach((m) => map.removeLayer(m));
  markers.length = 0;
  // clear pooled groups (more efficient than removing many individual layers)
  try {
    candidateLayerGroup.clearLayers();
  } catch (e) {}
  candidateLines.length = 0;
  try {
    mstLayerGroup.clearLayers();
  } catch (e) {}
  mstLines.length = 0;
  highlightMarkers.forEach((h) => map.removeLayer(h));
  highlightMarkers.length = 0;
  currentMST.length = 0;
  animIndex = 0;
}

// Clear only MST-related layers (used when starting/resetting animation)
function clearMSTLayers() {
  try {
    mstLayerGroup.clearLayers();
  } catch (e) {}
  mstLines.length = 0;
  highlightMarkers.forEach((h) => map.removeLayer(h));
  highlightMarkers.length = 0;
}

// redraw candidate lines (global so worker and other scopes can call it)
function redrawCandidateLines() {
  // clear pooled candidate group and reuse pool instead of many individual removes
  try {
    candidateLayerGroup.clearLayers();
  } catch (e) {}
  candidateLines.length = 0;
  if (!currentCities || !currentCities.length) return;
  const n = currentCities.length;
  const minZ = typeof map.getMinZoom === "function" ? map.getMinZoom() ?? 0 : 0;
  const curZ = map.getZoom();
  const maxZ =
    typeof map.getMaxZoom === "function" ? map.getMaxZoom() ?? 18 : 18;
  const holdLevels = CFG.HOLD_LEVELS;
  let kNearest;
  if (curZ - minZ < holdLevels) {
    kNearest = CFG.K_MIN;
  } else {
    const targetZoom = Math.min(minZ + CFG.TARGET_ZOOM_OFFSET, maxZ);
    const available = Math.max(1, targetZoom - (minZ + holdLevels));
    const frac = Math.min(
      1,
      Math.max(0, (curZ - (minZ + holdLevels)) / available)
    );
    kNearest = CFG.K_MIN + Math.round(frac * (CFG.K_MAX - CFG.K_MIN));
    kNearest = Math.max(CFG.K_MIN, Math.min(CFG.K_MAX, kNearest));
  }
  // use shared key helper when available to avoid mismatch with worker
  const gcKey = (a, b) => {
    try {
      return shared && shared.gcKey
        ? shared.gcKey(a, b)
        : Math.min(a, b) + "|" + Math.max(a, b);
    } catch (e) {
      return Math.min(a, b) + "|" + Math.max(a, b);
    }
  };
  const neighbors = computeWorker._neighbors;
  if (!Array.isArray(neighbors) || neighbors.length !== n) return;
  for (let i = 0; i < n; i++) {
    const top = neighbors[i].slice(0, kNearest);
    top.forEach((j) => {
      const key = gcKey(i, j);
      let latlngs = gcCacheGlobal.get(key);
      if (!latlngs) {
        latlngs = (
          greatCirclePointsShared ||
          function (a, b) {
            return [
              [a.lat, a.lon],
              [b.lat, b.lon],
            ];
          }
        )(currentCities[i], currentCities[j], {
          GC_MIN_SEGMENTS: CFG.GC_MIN_SEGMENTS,
          GC_MAX_SEGMENTS: CFG.GC_MAX_SEGMENTS,
          GC_SEGMENT_FACTOR: CFG.GC_SEGMENT_FACTOR,
          DISTANCE_RADIUS_KM: CFG.DISTANCE_RADIUS_KM,
        });
        gcCacheGlobal.set(key, latlngs);
      }
      const parts = addWrappedPolyline(
        latlngs,
        CFG.CANDIDATE_STYLE,
        candidateLines
      );
      // accumulate returned parts into candidateLines flat array
      if (Array.isArray(parts) && parts.length) {
        // parts have already been pushed into candidateLines by addWrappedPolyline,
        // keep the array coherent (redundant push avoided)
      }
    });
  }
}

// Generic fetcher for an Overpass QL query with caching
async function fetchOverpass(query, cacheKey) {
  const endpoint = CFG.OVERPASS_ENDPOINT;
  const params = new URLSearchParams();
  params.append("data", query);
  const TTL = CFG.CACHE_TTL_MS;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.ts && Array.isArray(parsed.items)) {
        if (Date.now() - parsed.ts < TTL) {
          return parsed.items;
        } else {
          try {
            localStorage.removeItem(cacheKey);
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    /* ignore cache parse errors */
  }

  try {
    // show spinner and explanatory text while waiting network
    showSpinner();
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
      },
      body: params.toString(),
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error("Overpass request failed: " + resp.status + " — " + text);
    }
    const data = JSON.parse(text);
    const items = data.elements
      .map((el) => {
        const name =
          (el.tags && (el.tags.name || el.tags["name:en"])) || "unknown";
        const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
        const lon = el.lon !== undefined ? el.lon : el.center && el.center.lon;
        let pop = null;
        if (el.tags && el.tags.population) {
          const cleaned = String(el.tags.population).replace(/[^0-9]/g, "");
          const n = cleaned ? Number(cleaned) : NaN;
          if (!isNaN(n)) pop = n;
        }
        return { name, lat, lon, population: pop };
      })
      .filter((c) => c.lat && c.lon);

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items }));
    } catch (e) {}
    return items;
  } catch (err) {
    throw err;
  } finally {
    hideSpinner();
  }
}

// presets are treated like any other query
async function runQueryAndRender(query, errPrefix = "Error fetching data: ") {
  try {
    const key = await cacheKeyFromQuery(query);
    const fetched = await fetchOverpass(query, key);
    fetched.sort((a, b) => (b.population || 0) - (a.population || 0));
    renderCities(fetched);
    if (fetched.length)
      map.setView([fetched[0].lat, fetched[0].lon], CFG.MAP_DEFAULT_ZOOM);
    return fetched;
  } catch (err) {
    alert(errPrefix + err.message);
    console.error(err);
    return null;
  }
}

// Render dataset: compute edges, MST and draw candidate lines and markers

function renderCities(list) {
  clearLayers();
  currentCities = list.slice();
  if (list === CFG.CAPITALS) {
    lastDatasetView = {
      center: CFG.MAP_DEFAULT_CENTER.slice(),
      zoom: CFG.MAP_DEFAULT_ZOOM,
    };
  } else if (currentCities && currentCities.length) {
    lastDatasetView = {
      center: [currentCities[0].lat, currentCities[0].lon],
      zoom: CFG.MAP_DEFAULT_ZOOM,
    };
  }
  // draw markers
  currentCities.forEach((c) => {
    const m = L.circleMarker([c.lat, c.lon], {
      radius: CFG.MARKER_RADIUS,
    }).addTo(map);
    try {
      // create a popup element and set textContent to avoid HTML injection
      const container = document.createElement("div");
      const nameNode = document.createElement("div");
      nameNode.textContent = c.name || "";
      container.appendChild(nameNode);
      if (c.population) {
        const popNode = document.createElement("div");
        popNode.textContent = "pop: " + c.population;
        container.appendChild(popNode);
      }
      m.bindPopup(container);
    } catch (e) {
      // fallback to safe string concatenation with escaping of <>&
      const safe = String(c.name || "").replace(
        /[&<>]/g,
        (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch])
      );
      const pop = c.population ? " — pop: " + c.population : "";
      m.bindPopup(safe + pop);
    }
    markers.push(m);
  });

  // Offload heavy computation to worker (Prim, distances, great-circle points)
  try {
    const newKey = computeCitiesKey(currentCities);
    if (newKey !== lastCitiesKey) {
      gcCacheGlobal.clear();
      lastCitiesKey = newKey;
    }
  } catch (e) {
    gcCacheGlobal.clear();
  }
  showSpinner();
  computeWorker.postMessage({
    type: "compute",
    cities: currentCities,
    algorithm: currentAlgorithm, // Pass selected algorithm
    cfg: {
      K_MAX: CFG.K_MAX,
      GC_MIN_SEGMENTS: CFG.GC_MIN_SEGMENTS,
      GC_MAX_SEGMENTS: CFG.GC_MAX_SEGMENTS,
      GC_SEGMENT_FACTOR: CFG.GC_SEGMENT_FACTOR,
      DISTANCE_RADIUS_KM: CFG.DISTANCE_RADIUS_KM,
    },
  });

  // Draw candidate edges faintly: only k-nearest neighbors per node (visual only)
  // initial draw
  redrawCandidateLines();
  // attach zoom handler but only redraw if difference > 1 level
  if (lastZoom === null) lastZoom = map.getZoom();
  if (mstZoomHandler) map.off("zoomend", mstZoomHandler);
  mstZoomHandler = function () {
    const newZ = map.getZoom();
    if (Math.abs(newZ - lastZoom) >= 1) {
      redrawCandidateLines();
    }
    lastZoom = newZ;
  };
  map.on("zoomend", mstZoomHandler);

  // Prepare animation state
  animIndex = 0;
  // show MST weight in the UI
  const total = (currentMST || []).reduce((s, e) => s + e.w, 0).toFixed(2);
  const totalEl = document.getElementById("mstTotal");
  if (totalEl) totalEl.textContent = "MST total length: " + total + " km";
}

function animateStep() {
  if (animIndex >= currentMST.length) {
    return;
  }
  const e = currentMST[animIndex];
  // try to reuse precomputed GC points from worker cache
  const key =
    shared && shared.gcKey
      ? shared.gcKey(e.u, e.v)
      : Math.min(e.u, e.v) + "|" + Math.max(e.u, e.v);
  let latlngs = gcCacheGlobal.get(key);
  if (!latlngs) {
    latlngs = (
      greatCirclePointsShared ||
      function (a, b) {
        return [
          [a.lat, a.lon],
          [b.lat, b.lon],
        ];
      }
    )(currentCities[e.u], currentCities[e.v], {
      GC_MIN_SEGMENTS: CFG.GC_MIN_SEGMENTS,
      GC_MAX_SEGMENTS: CFG.GC_MAX_SEGMENTS,
      GC_SEGMENT_FACTOR: CFG.GC_SEGMENT_FACTOR,
      DISTANCE_RADIUS_KM: CFG.DISTANCE_RADIUS_KM,
    });
    gcCacheGlobal.set(key, latlngs);
  }
  const parts = addWrappedPolyline(latlngs, CFG.MST_STYLE, mstLines);
  const h1 = L.circleMarker([currentCities[e.u].lat, currentCities[e.u].lon], {
    radius: CFG.HIGHLIGHT_RADIUS,
    color: CFG.HIGHLIGHT_COLOR,
    fillColor: CFG.HIGHLIGHT_FILL,
    fillOpacity: CFG.HIGHLIGHT_FILL_OPACITY,
  }).addTo(map);
  const h2 = L.circleMarker([currentCities[e.v].lat, currentCities[e.v].lon], {
    radius: CFG.HIGHLIGHT_RADIUS,
    color: CFG.HIGHLIGHT_COLOR,
    fillColor: CFG.HIGHLIGHT_FILL,
    fillOpacity: CFG.HIGHLIGHT_FILL_OPACITY,
  }).addTo(map);
  highlightMarkers.push(h1, h2);
  animIndex++;
}

function stopAnimation() {
  if (animateRafId) {
    cancelAnimationFrame(animateRafId);
    animateRafId = null;
  }
}

function startAnimation() {
  if (animateRafId) return;
  animateLastStepTs = performance.now();
  function loop(ts) {
    if (!animateRafId) return;
    if (animIndex >= currentMST.length) {
      stopAnimation();
      return;
    }
    if (ts - animateLastStepTs >= animationDelay) {
      try {
        animateStep();
      } catch (e) {}
      animateLastStepTs = ts;
    }
    animateRafId = requestAnimationFrame(loop);
  }
  animateRafId = requestAnimationFrame(loop);
}

// Wire up controls
document.getElementById("start").addEventListener("click", () => {
  // start animation for current dataset
  clearMSTLayers();
  stopAnimation();
  animIndex = 0;
  startAnimation();
});
document.getElementById("reset").addEventListener("click", () => {
  stopAnimation();
  clearMSTLayers();
  animIndex = 0;
  try {
    map.setView(lastDatasetView.center, lastDatasetView.zoom);
  } catch (e) {
    map.setView(CFG.MAP_DEFAULT_CENTER, CFG.MAP_DEFAULT_ZOOM);
  }
});

// Theme toggle button wiring
try {
  const themeToggleBtn = document.getElementById("themeToggle");
  function updateThemeButton() {
    if (!themeToggleBtn) return;
    // show the action the button will perform (switch to other theme)
    const iconChar = currentTheme === "dark" ? "☀" : "🌙";
    themeToggleBtn.title =
      currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    // animate icon change if span present
    const iconEl = themeToggleBtn.querySelector(".themeIcon");
    if (iconEl) {
      // fade-out, swap char, fade-in
      try {
        iconEl.classList.remove("fade-in");
        iconEl.classList.add("fade-out");
        setTimeout(() => {
          iconEl.textContent = iconChar;
          iconEl.classList.remove("fade-out");
          iconEl.classList.add("fade-in");
          setTimeout(() => iconEl.classList.remove("fade-in"), 300);
        }, 180);
      } catch (e) {
        iconEl.textContent = iconChar;
      }
    } else {
      themeToggleBtn.textContent = iconChar;
    }
  }
  themeToggleBtn.addEventListener("click", () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(currentTheme);
    updateThemeButton();
  });
  // initialize theme and button state
  applyTheme(currentTheme);
  // ensure initial icon is correct without animation
  try {
    const iconEl = document.querySelector("#themeToggle .themeIcon");
    if (iconEl) iconEl.textContent = currentTheme === "dark" ? "☀" : "🌙";
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

async function cacheKeyFromQuery(query) {
  try {
    const enc = new TextEncoder().encode(query);
    const hash = await (crypto.subtle || crypto.webkitSubtle).digest(
      "SHA-1",
      enc
    );
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return "overpass_" + hex;
  } catch (e) {
    // fallback: simple hashed numeric key
    let h = 0;
    for (let i = 0; i < query.length; i++) {
      h = (h << 5) - h + query.charCodeAt(i);
      h |= 0;
    }
    return "overpass_" + (h >>> 0).toString(16);
  }
}

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

// Custom query modal logic
let prevDataset = "capitals";
const CUSTOM_QUERY_KEY = "overpass_custom_query_v1";
const PRESET_QUERY_KEY = "overpass_preset_query_v1";
// cache key is derived from the query hash via `cacheKeyFromQuery`
const modal = document.getElementById("customModal");
const textarea = document.getElementById("customQuery");
const revertBtn = document.getElementById("revertQuery");
const okTop = document.getElementById("okTop");
const closeBtn = document.getElementById("closeModal");
const editCustomBtn = document.getElementById("editCustom");
const datasetSelectEl = document.getElementById("datasetSelect");

// Accessibility: focus management for modal
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
  // set ARIA and show
  try {
    _prevFocusBeforeModal = document.activeElement;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    // hide main content from screen readers
    const mapEl = document.getElementById("map");
    const controlsEl = document.querySelector(".controls");
    if (mapEl) mapEl.setAttribute("aria-hidden", "true");
    if (controlsEl) controlsEl.setAttribute("aria-hidden", "true");
    // focus first focusable element in modal (textarea)
    textarea.focus();
    // trap focus and handle Escape
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

// use shared dedent implementation to avoid duplication
const dedent =
  (shared && shared.dedent) ||
  ((str) => String(str || "").replace(/\r\n/g, "\n"));

// load a saved query by storage key (dedented). If not present, write the default and return it.
function loadSavedQuery(storageKey, defaultQuery = CFG.DEFAULT_CITIES_QUERY) {
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
  textarea.value = dedent(CFG.DEFAULT_CITIES_QUERY);
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
  // close modal and restore focus
  closeModal();
  document.getElementById("datasetSelect").value = prevDataset;
  try {
    updateEditButton();
  } catch (e) {}
});

// Edit button opens modal without changing select value
editCustomBtn.addEventListener("click", () => {
  prevDataset = datasetSelectEl.value;
  openCustomModal();
});

document.getElementById("datasetSelect").addEventListener("focus", (e) => {
  prevDataset = e.target.value;
});
// allow re-selecting the already-selected 'custom' to reopen the modal
// reopen modal via the Edit button or by reselecting 'custom'
// override previous change handler: when selecting 'custom' open modal
document
  .getElementById("datasetSelect")
  .addEventListener("change", async (e) => {
    const v = e.target.value;
    updateEditButton();
    if (v === "custom") {
      // open modal to edit/run
      openCustomModal();
      return;
    }
    // otherwise keep original behavior
    prevDataset = v;
    clearLayers();
    if (v === "capitals") {
      renderCities(CFG.CAPITALS);
      map.setView(CFG.MAP_DEFAULT_CENTER, CFG.MAP_DEFAULT_ZOOM);
    } else if (v === "preset") {
      await runQueryAndRender(
        loadSavedQuery(PRESET_QUERY_KEY),
        "Error fetching preset: "
      );
    }
  });

// initialize with capitals
renderCities(CFG.CAPITALS);
// ensure edit button visibility at startup
try {
  updateEditButton();
} catch (e) {}
// set UI texts from CFG
try {
  document.getElementById("titleText").textContent = CFG.TITLE_TEXT;
} catch (e) {}
try {
  document.getElementById("spinnerText").textContent = CFG.SPINNER_TEXT;
} catch (e) {}
try {
  document.title = CFG.TITLE_TEXT;
} catch (e) {}

// Algorithm selection wiring
try {
  document.getElementById("algoSelect").addEventListener("change", (e) => {
    currentAlgorithm = e.target.value;
    // Recompute MST with selected algorithm
    if (currentCities && currentCities.length) {
      renderCities(currentCities);
    }
  });
} catch (e) {}

// speed control wiring (inverted: left = slower)
const speedRange = document.getElementById("speedRange");
const speedLabel = document.getElementById("speedLabel");
// initialize slider attributes from CFG and label to match animationDelay default
try {
  speedRange.min = CFG.SPEED_RANGE.min;
  speedRange.max = CFG.SPEED_RANGE.max;
  speedRange.step = CFG.SPEED_RANGE.step;
  speedRange.value = CFG.SPEED_RANGE.default;
} catch (e) {}
speedLabel.textContent = animationDelay + " ms";
speedRange.addEventListener("input", (e) => {
  const min = Number(speedRange.min);
  const max = Number(speedRange.max);
  const val = Number(e.target.value);
  // invert mapping: slider value small => delay large
  animationDelay = min + max - val;
  speedLabel.textContent = animationDelay + " ms";
});
