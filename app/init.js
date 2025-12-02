import { S } from "./state.js";

export function applyCssVars() {
  try {
    const vars = (S && S.CFG && S.CFG.CSS_VARS) || {};
    const root =
      typeof document !== "undefined" ? document.documentElement : null;
    if (!root) return;

    // Inject font stylesheet from CSS_VARS.font-import-url if provided (avoid duplicates)
    try {
      const fontUrl =
        vars["font-import-url"] || vars["font_import_url"] || null;
      if (fontUrl && typeof document !== "undefined") {
        const existing = Array.from(
          document.querySelectorAll('link[rel="stylesheet"]')
        ).some((l) => l.href === fontUrl);
        if (!existing) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = fontUrl;
          document.head.appendChild(link);
        }
      }
    } catch (e) {}

    Object.entries(vars).forEach(([k, v]) => {
      try {
        const name = k.startsWith("--") ? k : `--${k}`;
        root.style.setProperty(name, v);
      } catch (e) {}
    });
  } catch (e) {}
}

export function initMap() {
  // Compute derived default if not already computed
  try {
    if (!S.CFG.ANIMATION_DELAY_DEFAULT) {
      S.CFG.ANIMATION_DELAY_DEFAULT =
        S.CFG.SPEED_RANGE.min +
        S.CFG.SPEED_RANGE.max -
        S.CFG.SPEED_RANGE.default;
      S.animationDelay = S.CFG.ANIMATION_DELAY_DEFAULT;
    }
  } catch (e) {}

  S.map = L.map("map", { zoomControl: false }).setView(
    S.CFG.MAP_DEFAULT_CENTER,
    S.CFG.MAP_DEFAULT_ZOOM
  );

  // panes
  S.map.createPane("mstPane");
  S.map.getPane("mstPane").style.zIndex = 400;
  S.map.createPane("highlightPane");
  S.map.getPane("highlightPane").style.zIndex = 650;

  S.baseTileLayer = L.tileLayer(S.CFG.TILE_URL, {
    maxZoom: S.CFG.TILE_MAX_ZOOM,
    attribution: S.CFG.TILE_ATTRIBUTION,
  }).addTo(S.map);

  S.candidateCanvasRenderer = L.canvas({ padding: 0.5 });
  S.mstCanvasRenderer = L.canvas({ padding: 0.5 });

  S.candidateLayerGroup = L.layerGroup().addTo(S.map);
  S.mstLayerGroup = L.layerGroup().addTo(S.map);
  S.mstLayerGroup.options.pane = "overlayPane";
}

export function applyTheme(theme) {
  try {
    S.currentTheme = theme;
    const useLight = theme === "light";
    const url =
      useLight && S.CFG.LIGHT_TILE_URL ? S.CFG.LIGHT_TILE_URL : S.CFG.TILE_URL;
    const attr =
      useLight && S.CFG.LIGHT_TILE_ATTRIBUTION
        ? S.CFG.LIGHT_TILE_ATTRIBUTION
        : S.CFG.TILE_ATTRIBUTION;
    try {
      S.map.removeLayer(S.baseTileLayer);
    } catch (e) {}
    S.baseTileLayer = L.tileLayer(url, {
      maxZoom: S.CFG.TILE_MAX_ZOOM,
      attribution: attr,
    }).addTo(S.map);
  } catch (e) {}
}
