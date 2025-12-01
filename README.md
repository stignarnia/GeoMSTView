# Prim MST — Minimum Spanning Tree visualization (OpenStreetMap)

Simple interactive demo that computes and visualizes a Minimum Spanning Tree (MST) over a set of cities sourced from OpenStreetMap. The map is rendered with Leaflet and heavy computation (distance matrix, Prim, great-circle points) runs in a Web Worker to keep the UI responsive.

## Quick start
1. Open `index.html` in a modern browser. For best results serve the folder with a local static server (see notes below).
2. Choose a dataset from the `Dataset` control: `capitals` (built-in sample), `preset` (a larger preset Overpass query), or `custom` to paste/run your own Overpass QL query.
3. Press the ▶ `Start` button to animate MST edges being added. Use `Reset` to clear the animation or `🗑` to invalidate cached Overpass results for the current query.
4. Use the `Animation speed` slider to slow down or speed up the edge animation.

## Settings
If you want to change default behavior (tile server, animation defaults, k-nearest limits, etc.) edit the `CFG` object at the top of `script.js`.

Key `CFG` entries you might change:
- `TILE_URL`: map tile server URL (default: Carto dark tiles).
- `OVERPASS_ENDPOINT`: URL used to run Overpass queries.
- `CACHE_TTL_MS`: how long Overpass results are kept in `localStorage` (milliseconds).
- `SPEED_RANGE`: slider configuration and default value (min/max/step/default). Note: the code maps the slider inversely to animation delay.
- `K_MIN`, `K_MAX`, `HOLD_LEVELS`, `TARGET_ZOOM_OFFSET`: control how many candidate neighbor lines are shown at different zoom levels.
- `GC_*` values (`GC_MIN_SEGMENTS`, `GC_MAX_SEGMENTS`, `GC_SEGMENT_FACTOR`): control visual segmentation for great-circle curves between cities.

After editing `script.js`, reload the page.

## Performance & limits
- The demo builds a full pairwise distance matrix and runs Prim's algorithm; it's fast for small and medium datasets (tens–low hundreds of cities) but will slow down for thousands of cities.
- If a query returns a very large number of results the page may become slow or the Overpass server may time out — choose smaller areas or refine queries.

## Serving locally (recommended)
Opening the file directly in a browser works, but using a local server avoids worker/credential limitations in some browsers. A quick way:

```bash
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

## Files
- `index.html` — page entry and layout.
- `styles.css` — UI styles.
- `script.js` — main UI logic, Leaflet rendering, caching and worker communication.
- `worker.js` — performs MST, distance computations and great-circle point generation in a worker.
- `shared.js` — math helpers shared between main thread and worker (`haversine`, `greatCirclePoints`, `dedent`, `gcKey`).

## Troubleshooting
- Overpass is very slow: try a different Overpass endpoint or reduce the query area/complexity.