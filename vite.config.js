import { defineConfig } from 'vite';

export default defineConfig({
    optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            // 'credentialless' allows external resources (like map tiles) 
            // to load without CORP headers, while still enabling SharedArrayBuffer.
            'Cross-Origin-Embedder-Policy': 'credentialless',
        },
    },
});