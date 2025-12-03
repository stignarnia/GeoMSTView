import { readCachedBinary, writeCachedBinary } from "./utils.js";

// Fetch or read cached wasm and return an object with the load URL and a flag
export async function fetchWasm(remoteWasmURL, wasmKey, progressManager, abortSignal) {
    let wasmLoadURL = remoteWasmURL;
    let isBlob = false;

    try {
        const cached = await readCachedBinary(wasmKey);
        if (cached) {
            const blob = new Blob([cached], { type: "application/wasm" });
            wasmLoadURL = URL.createObjectURL(blob);
            isBlob = true;
            try { progressManager.updateStageProgress("loading", 1, `Loaded from cache`, "Using cached ffmpeg"); } catch (e) { }
            return { wasmLoadURL, isBlob };
        }

        // Not cached: fetch with streaming progress if available
        const resp = await fetch(remoteWasmURL);
        if (!resp.ok) {
            return { wasmLoadURL: remoteWasmURL, isBlob: false };
        }

        const contentLengthHeader = resp.headers.get("content-length");
        const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
        if (resp.body && typeof resp.body.getReader === "function") {
            const reader = resp.body.getReader();
            const chunks = [];
            let received = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length || value.byteLength || 0;
                const frac = totalBytes ? Math.min(1, received / totalBytes) : 0;
                try { progressManager.updateStageProgress("loading", frac, `${(received / 1024 / 1024).toFixed(2)} MB`, "Downloading ffmpeg..."); } catch (e) { }
                if (abortSignal?.aborted) {
                    try { reader.cancel(); } catch (e) { }
                    throw new Error("ABORTED");
                }
            }

            const ab = new Uint8Array(received);
            let offset = 0;
            for (const chunk of chunks) {
                ab.set(chunk, offset);
                offset += chunk.length || chunk.byteLength || 0;
            }

            try { await writeCachedBinary(wasmKey, ab.buffer); } catch (e) { }

            const blob = new Blob([ab.buffer], { type: "application/wasm" });
            wasmLoadURL = URL.createObjectURL(blob);
            isBlob = true;
            try { progressManager.updateStageProgress("loading", 1, `Downloaded ${(received / 1024 / 1024).toFixed(2)} MB`, "Download complete"); } catch (e) { }
            return { wasmLoadURL, isBlob };
        }

        // Fallback to arrayBuffer
        const ab = await resp.arrayBuffer();
        try { await writeCachedBinary(wasmKey, ab); } catch (e) { }
        const blob = new Blob([ab], { type: "application/wasm" });
        wasmLoadURL = URL.createObjectURL(blob);
        isBlob = true;
        try { progressManager.updateStageProgress("loading", 1, `Downloaded ${((ab.byteLength || ab.length) / 1024 / 1024).toFixed(2)} MB`, "Download complete"); } catch (e) { }
        return { wasmLoadURL, isBlob };
    } catch (e) {
        return { wasmLoadURL: remoteWasmURL, isBlob: false };
    }
}
