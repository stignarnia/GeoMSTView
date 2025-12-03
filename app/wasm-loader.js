import { readCachedBinary, writeCachedBinary } from "./utils.js";

export async function fetchWasm(remoteWasmURL, wasmKey, progressManager, abortSignal) {
    let wasmLoadURL = remoteWasmURL;
    let isBlob = false;

    // A conservative estimate. 
    // If the file compresses 3x, the bar reaches ~75% then jumps to 100%.
    // If the file compresses 5x, the bar reaches 100% perfectly.
    const SAFETY_COMPRESSION_RATIO = 4.0;

    try {
        // 1. Check Cache
        const cached = await readCachedBinary(wasmKey);
        if (cached) {
            const blob = new Blob([cached], { type: "application/wasm" });
            wasmLoadURL = URL.createObjectURL(blob);
            isBlob = true;
            try { progressManager.updateStageProgress("loading", 1, `Loaded from cache`, "Using cached ffmpeg"); } catch (e) { }
            return { wasmLoadURL, isBlob };
        }

        // 2. Fetch
        const resp = await fetch(remoteWasmURL);
        if (!resp.ok) {
            return { wasmLoadURL: remoteWasmURL, isBlob: false };
        }

        // 3. Get Compressed Size (The "Wire" Size)
        const contentLengthHeader = resp.headers.get("content-length");
        const totalCompressedBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

        // 4. Stream & Estimate
        if (resp.body && typeof resp.body.getReader === "function") {
            const reader = resp.body.getReader();
            const chunks = [];
            let receivedUncompressed = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedUncompressed += value.length || value.byteLength || 0;

                // --- PROGRESS CALCULATION ---
                let progressFraction = 0;
                let progressText = "";

                if (totalCompressedBytes > 0) {
                    // Estimate the "compressed bytes received" so far
                    const estimatedCompressed = receivedUncompressed / SAFETY_COMPRESSION_RATIO;

                    // Calculate fraction against the REAL compressed total
                    progressFraction = Math.min(1, estimatedCompressed / totalCompressedBytes);

                    // Display meaningful text to the user
                    // We stick to the TOTAL (8MB) as the anchor, and estimate the current progress towards it.
                    const displayCurrent = Math.min(estimatedCompressed, totalCompressedBytes);

                    progressText = `${(displayCurrent / 1024 / 1024).toFixed(2)} MB / ${(totalCompressedBytes / 1024 / 1024).toFixed(2)} MB`;
                } else {
                    // Fallback: No content-length header
                    progressText = `${(receivedUncompressed / 1024 / 1024).toFixed(2)} MB`;
                }

                try {
                    progressManager.updateStageProgress("loading", progressFraction, progressText, "Downloading ffmpeg...");
                } catch (e) { }

                if (abortSignal?.aborted) {
                    try { reader.cancel(); } catch (e) { }
                    throw new Error("ABORTED");
                }
            }

            // 5. Assemble & Cache
            const ab = new Uint8Array(receivedUncompressed);
            let offset = 0;
            for (const chunk of chunks) {
                ab.set(chunk, offset);
                offset += chunk.length || chunk.byteLength || 0;
            }

            try { await writeCachedBinary(wasmKey, ab.buffer); } catch (e) { }

            const blob = new Blob([ab.buffer], { type: "application/wasm" });
            wasmLoadURL = URL.createObjectURL(blob);
            isBlob = true;

            // 6. Final Polish: Snap to 100%
            try {
                progressManager.updateStageProgress(
                    "loading",
                    1,
                    totalCompressedBytes
                        ? `${(totalCompressedBytes / 1024 / 1024).toFixed(2)} MB / ${(totalCompressedBytes / 1024 / 1024).toFixed(2)} MB`
                        : `${(receivedUncompressed / 1024 / 1024).toFixed(2)} MB`,
                    "Download complete"
                );
            } catch (e) { }

            return { wasmLoadURL, isBlob };
        }

        // Fallback for non-streaming browsers
        const ab = await resp.arrayBuffer();
        try { await writeCachedBinary(wasmKey, ab); } catch (e) { }
        const blob = new Blob([ab], { type: "application/wasm" });
        wasmLoadURL = URL.createObjectURL(blob);
        isBlob = true;
        try { progressManager.updateStageProgress("loading", 1, "Download complete", "Download complete"); } catch (e) { }
        return { wasmLoadURL, isBlob };

    } catch (e) {
        return { wasmLoadURL: remoteWasmURL, isBlob: false };
    }
}