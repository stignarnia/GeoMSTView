import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'credentialless',
        },
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.png'], // Ensures favicon is cached too
            devOptions: {
                enabled: true
            },
            workbox: {
                // Pre-caches your app shell (index.html, JS, CSS)
                globPatterns: ['**/*.{js,css,html,png,svg,json,woff2}'],
                runtimeCaching: [
                    {
                        // Caches map tiles (OpenStreetMap, CartoDB, etc.)
                        // Matches /z/x/y.png AND /z/x/y@2x.png
                        urlPattern: /\/(\d+)\/(\d+)\/(\d+)(@[\w-]+)?\.(png|jpg|jpeg|webp)/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'map-tiles',
                            expiration: {
                                maxEntries: 1000,
                                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            },
            manifest: {
                id: "/",
                name: "GeoMSTView - MST Visualization",
                short_name: "GeoMSTView",
                description: "Interactive Minimum Spanning Tree visualization over OpenStreetMap data using Prim and Kruskal algorithms",
                start_url: "/",
                display: "standalone",
                background_color: "#04101b",
                theme_color: "#04101b",
                orientation: "any",
                icons: [
                    {
                        src: "favicon.png", // Plugin will resolve this to the correct hashed path if needed
                        sizes: "192x192 512x512 1024x1024",
                        type: "image/png",
                        purpose: "any"
                    },
                    {
                        src: "favicon.png",
                        sizes: "192x192 512x512 1024x1024",
                        type: "image/png",
                        purpose: "maskable"
                    }
                ],
                categories: [
                    "education",
                    "utilities",
                    "maps"
                ],
                screenshots: []
            }
        })
    ]
});