# Prim MST — Minimum Spanning Tree visualization (OpenStreetMap)

Simple interactive demo that computes and visualizes a Minimum Spanning Tree (MST) over a set of cities sourced from OpenStreetMap. The map is rendered with Leaflet and heavy computation (distance matrix, Prim, great-circle points) runs in a Web Worker to keep the UI responsive.

## Quick start

1. View the hosted demo at: https://geomstview.pages.dev.
2. To run locally you must use a local static server (see below) — double-clicking `index.html` will not work.
3. Choose a dataset from the `Dataset` control: `capitals` (built-in sample), `preset` (a larger preset Overpass query), or `custom` to paste/run your own Overpass QL query.
4. Press the ▶ `Start` button to animate MST edges being added. Use `Reset` to clear the animation or `🗑` to invalidate cached Overpass results for the current query.
5. Use the `Animation speed` slider to slow down or speed up the edge animation.

## Custom Overpass queries

- Do not put comments in your Overpass query, as they may break parsing. (no `//` or `/* ... */`).
- Overpass is very slow and sometimes it will rate limit you: try a different Overpass endpoint or reduce the query area/complexity.
- You can ask AI to help you with making custom overpass queries for your area of interest, just give it the preset one to make it understand what you are talking about.
- if you just want to change region, country, or local administrative area, you must change change the area at line 2 with the desired ISO 3166 code. You can find that at https://www.iso.org/obp/ui/#search.
- To change which places you get, edit the filter `["place"~"city|town"]` by replacing or adding place types (e.g., "city", "town", "village", "hamlet", "suburb", "neighbourhood"), such as `["place"="city"]` for only cities, `["place"~"city|town|village"]` for multiple types, or simply `["place"]` to include any place.

## Settings (only if running locally)

If you want to change default behavior (tile server, animation defaults, k-nearest limits, etc.) edit the `settings.json` file.

Key `CFG` entries you might change:

- `TILE_URL`: map tile server URL (default: Carto dark tiles).
- `CACHE_TTL_MS`: how long Overpass results are kept in `localStorage` (milliseconds).
- `SPEED_RANGE`: slider configuration and default value (min/max/step/default). Note: the code maps the slider inversely to animation delay.
- `K_MIN`, `K_MAX`, `HOLD_LEVELS`, `TARGET_ZOOM_OFFSET`: control how many candidate neighbor lines are shown at different zoom levels.
- `GC_*` values (`GC_MIN_SEGMENTS`, `GC_MAX_SEGMENTS`, `GC_SEGMENT_FACTOR`): control visual segmentation for great-circle curves between cities.

After editing `settings.json`, reload the page.

## Performance & limits

- The demo builds a full pairwise distance matrix and runs Prim's algorithm; it's fast for small and medium datasets (tens–low hundreds of cities) but will slow down for thousands of cities.
- If a query returns a very large number of results the page may become slow or the Overpass server may time out — choose smaller areas or refine queries.

## Serving locally (required if not using the hosted demo)

As an example, a quick way to make a local static server:

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

## Files

- `index.html` — page entry and layout.
- `styles.css` — UI styles.
- `settings.json` — configuration defaults (tile server, animation and performance settings).
- `app/` — ES module sources for the application and worker:
  - `app/main.js` — application entry (wires UI, worker and rendering).
  - `app/init.js` — map initialization and theme handling.
  - `app/render.js` — rendering and layer management (markers, candidate/MST drawing).
  - `app/animation.js` — animation logic for growing MST edges.
  - `app/worker.js` — Web Worker implementation (MST, distances, great-circle points).
  - `app/shared.js` — pure math helpers shared between main thread and worker (`haversine`, `greatCirclePoints`, `gcKey`, `dedent`).
  - `app/utils.js` — app utility helpers (`computeCitiesKey`, `lerpColor`, wrappers).
  - `app/worker-comm.js` — worker creation and messaging helpers.
  - `app/state.js` — shared runtime state object.
  - `app/api.js` — Overpass fetch, caching and query helpers.
  - `app/ui.js` — small UI helpers (spinner etc.).
- `LICENSE` — project license.
- `README.md` — this file.
