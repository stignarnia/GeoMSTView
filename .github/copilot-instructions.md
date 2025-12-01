# Copilot Instructions for GeoMSTView

## Project Overview

GeoMSTView is an interactive web application that visualizes Minimum Spanning Trees (MST) over geographic data from OpenStreetMap. The application demonstrates MST algorithms (Prim and Kruskal) on real-world city data, rendering the results on an interactive map using Leaflet.

## Technology Stack

- **Pure JavaScript ES Modules** - No framework, no build step
- **Leaflet** - Interactive map rendering
- **Web Workers** - Heavy computation (distance matrices, MST algorithms) runs in background
- **OpenStreetMap** - Geographic data source via Overpass API
- **LocalStorage** - Caching and user preferences
- **Progressive Web App (PWA)** - Service worker for offline capabilities

## Project Structure

```
/
├── index.html           # Main HTML entry point
├── styles.css           # All application styles
├── settings.json        # Configuration (tile servers, animation, limits)
├── manifest.json        # PWA manifest
├── favicon.png          # Application icon
└── app/                 # ES module sources
    ├── main.js          # Application entry and orchestration
    ├── init.js          # Map initialization and theme handling
    ├── render.js        # Leaflet rendering and layer management
    ├── animation.js     # MST edge animation logic
    ├── worker.js        # Web Worker (MST computation, distances)
    ├── shared.js        # Shared utilities (haversine, great circles)
    ├── utils.js         # App-specific utility functions
    ├── worker-comm.js   # Worker creation and messaging
    ├── state.js         # Shared runtime state
    ├── api.js           # Overpass API fetch and caching
    ├── ui.js            # UI helpers (spinner, modals)
    ├── pwa.js           # Service worker registration (module)
    └── sw.js            # Service worker for PWA
```

## Development Workflow

### Serving the Application

The application must be served via HTTP(S), not opened directly as a file:

```bash
# Python
python -m http.server 8000

# Node.js (if available)
npx http-server -p 8000
```

Then navigate to `http://localhost:8000` in a browser.

### No Build Step

This project has **no build process**. All code is vanilla JavaScript ES modules loaded directly by the browser. Changes to `.js` files take effect on page reload.

### Configuration

All application configuration lives in `settings.json`, including:
- Map tile servers and attribution
- Animation defaults and speed ranges
- Overpass API endpoints
- Distance calculation parameters
- Great circle rendering parameters
- k-nearest neighbor limits
- UI colors and theme variables

After editing `settings.json`, reload the page to see changes.

## Code Conventions

### JavaScript Style

- **ES Modules**: Use `import`/`export`, no CommonJS
- **No semicolons** at end of statements (except where required for disambiguation)
- **Prefer `const`** over `let`; avoid `var` entirely
- **Arrow functions** for callbacks and short functions
- **Template literals** for string interpolation
- **Destructuring** where it improves readability
- **Async/await** over raw promises
- **Early returns** to reduce nesting

### Naming Conventions

- **Variables/Functions**: camelCase (e.g., `computeDistance`, `cityData`)
- **Constants**: UPPER_SNAKE_CASE for config values (e.g., `K_MAX`, `CACHE_TTL_MS`)
- **State object**: Use `S` as shorthand for the shared state module
- **Modules**: Use PascalCase for module namespace imports (e.g., `import * as Render from "./render.js"`)

### Comments

- Add comments for complex algorithms (MST, great circle calculations)
- Document non-obvious parameter choices
- Explain "why" not "what" - code should be self-documenting
- No redundant comments stating the obvious

### Error Handling

- Use try-catch for localStorage operations (can fail in private mode)
- Gracefully handle API failures (Overpass can be unreliable)
- Log errors to console for debugging
- Show user-friendly messages in UI for failures

## Architecture Patterns

### State Management

The `state.js` module exports a single shared state object `S` that holds:
- Current theme
- Configuration from settings.json
- Map instance reference
- Current cities data
- Animation state
- Worker computation results

Access state via `import { S } from "./state.js"`.

### Worker Communication

Heavy computation runs in a Web Worker to keep UI responsive:
- Main thread sends city data to worker via `worker-comm.js`
- Worker computes distance matrix and MST
- Worker sends results back with great circle points pre-calculated
- Results are cached in state for rendering

### Rendering Strategy

- **Markers**: Circle markers for cities
- **Candidate edges**: Light gray lines showing k-nearest neighbors
- **MST edges**: Red lines showing computed MST, animated one at a time
- **Great circles**: Geographic curves following Earth's surface (not straight lines)
- **Dynamic k**: Number of candidate edges shown varies with zoom level

### Caching

- Overpass query results cached in localStorage with TTL
- Cache key based on query hash
- Great circle points cached per edge pair to avoid recomputation
- User preferences (theme, last query) persisted to localStorage

## Common Tasks

### Adding New Configuration Options

1. Add the option to `settings.json` with a default value
2. Access it in code via `S.CFG.YOUR_OPTION_NAME`
3. Update README.md if it's a user-facing option

### Modifying MST Algorithms

Edit `app/worker.js`:
- Kruskal's algorithm: lines ~28-61
- Prim's algorithm: lines ~63-89
- Both use the pre-computed distance matrix

### Changing Map Appearance

- Tile servers: Edit `TILE_URL` in `settings.json`
- Colors/styling: Edit CSS custom properties in `settings.json` under `CSS_VARS`
- Marker/edge styling: Edit constants in `settings.json` (e.g., `MST_STYLE`)

### Adding UI Controls

1. Add HTML elements to `index.html`
2. Add event listeners in `app/main.js`
3. Add styling to `styles.css`
4. Update state in `app/state.js` if needed

## Testing

No automated test suite exists. Test changes by:
1. Serving the app locally
2. Testing with different datasets (capitals, preset, custom queries)
3. Testing theme switching (dark/light)
4. Testing animation controls (start, reset, speed)
5. Testing on different zoom levels
6. Checking browser console for errors
7. Testing PWA functionality (offline mode, installation)

## Geographic Math

### Haversine Distance

The `haversine()` function in `shared.js` calculates great-circle distances between two lat/lon points on a sphere. Uses Earth radius of 6371 km by default.

### Great Circle Curves

The `greatCirclePoints()` function generates intermediate points along the shortest path between two points on Earth's surface. The number of segments varies with distance to balance smoothness and performance.

## Browser Compatibility

Target modern browsers with ES module support:
- Chrome/Edge 61+
- Firefox 60+
- Safari 11+

No IE11 support (uses ES modules, arrow functions, etc.).

## Performance Considerations

- For datasets with 100+ cities, computation can take seconds
- Worker prevents UI blocking but delays before rendering
- LocalStorage caching reduces repeated Overpass queries
- Great circle points cached to avoid recomputation
- Animation frame rate controlled by `requestAnimationFrame`

## Common Pitfalls

1. **CORS**: Must serve via HTTP(S), not `file://`
2. **Overpass rate limiting**: Can hit API rate limits; use caching
3. **LocalStorage limits**: ~5-10 MB per origin; clear cache if full
4. **Worker scope**: Worker can't access DOM or main thread state directly
5. **Great circle wrapping**: Handle date line crossing carefully

## Additional Resources

- Overpass API documentation: https://wiki.openstreetmap.org/wiki/Overpass_API
- Leaflet documentation: https://leafletjs.com/reference.html
- ISO 3166 country codes: https://www.iso.org/obp/ui/#search
- Great circle math: https://en.wikipedia.org/wiki/Great-circle_distance
