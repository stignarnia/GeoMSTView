import { S } from "./state.js";
import { gcKey, greatCirclePoints, computeCitiesKey } from "./utils.js";
import { postComputeMessage } from "./worker-comm.js";
import { showSpinner } from "./ui.js";

export function addWrappedPolyline(latlngs, options, collectArray) {
  if (!latlngs || !latlngs.length) return [];
  const parts = [];
  let seg = [latlngs[0]];
  for (let i = 1; i < latlngs.length; i++) {
    const prevLon = latlngs[i - 1][1];
    const curLon = latlngs[i][1];
    const rawDiff = curLon - prevLon;
    if (Math.abs(rawDiff) > S.CFG.WRAP_LON_THRESHOLD) {
      const polyOpts = Object.assign({}, options);
      try {
        if (options === S.CFG.CANDIDATE_STYLE)
          polyOpts.renderer = S.candidateCanvasRenderer;
        else if (options === S.CFG.MST_STYLE) {
          polyOpts.renderer = S.mstCanvasRenderer;
          polyOpts.pane = "mstPane";
        }
      } catch (e) {}
      const parent =
        options === S.CFG.CANDIDATE_STYLE
          ? S.candidateLayerGroup
          : options === S.CFG.MST_STYLE
          ? S.mstLayerGroup
          : S.map;
      const p = L.polyline(seg, polyOpts).addTo(parent);
      parts.push(p);
      if (Array.isArray(collectArray)) collectArray.push(p);
      seg = [latlngs[i]];
    } else {
      seg.push(latlngs[i]);
    }
  }
  if (seg.length) {
    const polyOpts = Object.assign({}, options);
    if (options === S.CFG.MST_STYLE) polyOpts.pane = "mstPane";
    const parent =
      options === S.CFG.CANDIDATE_STYLE
        ? S.candidateLayerGroup
        : options === S.CFG.MST_STYLE
        ? S.mstLayerGroup
        : S.map;
    const p = L.polyline(seg, polyOpts).addTo(parent);
    parts.push(p);
    if (Array.isArray(collectArray)) collectArray.push(p);
  }
  return parts;
}

export function clearLayers() {
  S.markers.forEach((m) => S.map.removeLayer(m));
  S.markers.length = 0;
  try {
    S.candidateLayerGroup.clearLayers();
  } catch (e) {}
  S.candidateLines.length = 0;
  try {
    S.mstLayerGroup.clearLayers();
  } catch (e) {}
  S.mstLines.length = 0;
  S.highlightMarkers.forEach((h) => S.map.removeLayer(h));
  S.highlightMarkers.length = 0;
  S.currentMST.length = 0;
  S.animIndex = 0;
}

export function clearMSTLayers() {
  try {
    S.mstLayerGroup.clearLayers();
  } catch (e) {}
  S.mstLines.length = 0;
  S.highlightMarkers.forEach((h) => S.map.removeLayer(h));
  S.highlightMarkers.length = 0;
}

export function redrawCandidateLines() {
  try {
    S.candidateLayerGroup.clearLayers();
  } catch (e) {}
  S.candidateLines.length = 0;
  if (!S.currentCities || !S.currentCities.length) return;
  const n = S.currentCities.length;
  const minZ =
    typeof S.map.getMinZoom === "function" ? S.map.getMinZoom() ?? 0 : 0;
  const curZ = S.map.getZoom();
  const maxZ =
    typeof S.map.getMaxZoom === "function" ? S.map.getMaxZoom() ?? 18 : 18;
  const holdLevels = S.CFG.HOLD_LEVELS;
  let kNearest;
  if (curZ - minZ < holdLevels) kNearest = S.CFG.K_MIN;
  else {
    const targetZoom = Math.min(minZ + S.CFG.TARGET_ZOOM_OFFSET, maxZ);
    const available = Math.max(1, targetZoom - (minZ + holdLevels));
    const frac = Math.min(
      1,
      Math.max(0, (curZ - (minZ + holdLevels)) / available)
    );
    kNearest = S.CFG.K_MIN + Math.round(frac * (S.CFG.K_MAX - S.CFG.K_MIN));
    kNearest = Math.max(S.CFG.K_MIN, Math.min(S.CFG.K_MAX, kNearest));
  }
  const neighbors = S._neighbors || [];
  if (!Array.isArray(neighbors) || neighbors.length !== n) return;
  for (let i = 0; i < n; i++) {
    const top = neighbors[i].slice(0, kNearest);
    top.forEach((j) => {
      const key = gcKey(i, j);
      let latlngs = S.gcCacheGlobal.get(key);
      if (!latlngs) {
        latlngs = (
          greatCirclePoints ||
          function (a, b) {
            return [
              [a.lat, a.lon],
              [b.lat, b.lon],
            ];
          }
        )(S.currentCities[i], S.currentCities[j], {
          GC_MIN_SEGMENTS: S.CFG.GC_MIN_SEGMENTS,
          GC_MAX_SEGMENTS: S.CFG.GC_MAX_SEGMENTS,
          GC_SEGMENT_FACTOR: S.CFG.GC_SEGMENT_FACTOR,
          DISTANCE_RADIUS_KM: S.CFG.DISTANCE_RADIUS_KM,
        });
        S.gcCacheGlobal.set(key, latlngs);
      }
      addWrappedPolyline(latlngs, S.CFG.CANDIDATE_STYLE, S.candidateLines);
    });
  }
}

export async function renderCities(list, postCompute = true) {
  clearLayers();
  S.currentCities = list.slice();
  if (list === S.CFG.CAPITALS) {
    S.lastDatasetView = {
      center: S.CFG.MAP_DEFAULT_CENTER.slice(),
      zoom: S.CFG.MAP_DEFAULT_ZOOM,
    };
  } else if (S.currentCities && S.currentCities.length) {
    S.lastDatasetView = {
      center: [S.currentCities[0].lat, S.currentCities[0].lon],
      zoom: S.CFG.MAP_DEFAULT_ZOOM,
    };
  }
  S.currentCities.forEach((c) => {
    const m = L.circleMarker([c.lat, c.lon], {
      radius: S.CFG.MARKER_RADIUS,
    }).addTo(S.map);
    try {
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
      const safe = String(c.name || "").replace(
        /[&<>]/g,
        (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch])
      );
      const pop = c.population ? " — pop: " + c.population : "";
      m.bindPopup(safe + pop);
    }
    S.markers.push(m);
  });

  try {
    const newKey = computeCitiesKey(S.currentCities);
    if (newKey !== S.lastCitiesKey) {
      S.gcCacheGlobal.clear();
      S.lastCitiesKey = newKey;
    }
  } catch (e) {
    S.gcCacheGlobal.clear();
  }

  // ask worker to compute MST/neighbors
  if (postCompute) {
    try {
      showSpinner(undefined, S.CFG.SPINNER_TEXT);
    } catch (e) {}
    postComputeMessage({
      type: "compute",
      cities: S.currentCities,
      algorithm: S.currentAlgorithm,
      cfg: {
        K_MAX: S.CFG.K_MAX,
        GC_MIN_SEGMENTS: S.CFG.GC_MIN_SEGMENTS,
        GC_MAX_SEGMENTS: S.CFG.GC_MAX_SEGMENTS,
        GC_SEGMENT_FACTOR: S.CFG.GC_SEGMENT_FACTOR,
        DISTANCE_RADIUS_KM: S.CFG.DISTANCE_RADIUS_KM,
      },
    });
  }

  redrawCandidateLines();

  // zoom handler
  if (typeof S.map.getZoom === "function") {
    if (!S.lastZoom) S.lastZoom = S.map.getZoom();
    if (S._mstZoomHandler) S.map.off("zoomend", S._mstZoomHandler);
    S._mstZoomHandler = function () {
      const newZ = S.map.getZoom();
      if (Math.abs(newZ - S.lastZoom) >= S.CFG.ZOOM_REDRAW_THRESHOLD)
        redrawCandidateLines();
      S.lastZoom = newZ;
    };
    S.map.on("zoomend", S._mstZoomHandler);
  }

  S.animIndex = 0;
  const total = (S.currentMST || []).reduce((s, e) => s + e.w, 0).toFixed(2);
  const totalEl = document.getElementById("mstTotal");
  if (totalEl) totalEl.textContent = "MST total length: " + total + " km";
}
