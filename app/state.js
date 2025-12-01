import CFG from "../settings.json" with { type: "json" };
export const S = {
  CFG,
  map: null,
  // storage keys
  CUSTOM_QUERY_KEY: "overpass_custom_query_v1",
  PRESET_QUERY_KEY: "overpass_preset_query_v1",
  baseTileLayer: null,
  currentTheme: CFG.DEFAULT_THEME || "dark",
  candidateCanvasRenderer: null,
  mstCanvasRenderer: null,
  candidateLayerGroup: null,
  mstLayerGroup: null,
  markers: [],
  candidateLines: [],
  mstLines: [],
  highlightMarkers: [],
  currentCities: [],
  currentAlgorithm: "prim",
  currentMST: [],
  animIndex: 0,
  animateRafId: null,
  animateLastStepTs: 0,
  animationDelay:
    (CFG.SPEED_RANGE && CFG.SPEED_RANGE.min + CFG.SPEED_RANGE.max - CFG.SPEED_RANGE.default) || 1000,
  lastDatasetView: {
    center: (CFG.MAP_DEFAULT_CENTER || [0, 0]).slice(),
    zoom: CFG.MAP_DEFAULT_ZOOM,
  },
  gcCacheGlobal: new Map(),
  lastCitiesKey: null,
  computeWorker: null,
  _neighbors: [],
};
