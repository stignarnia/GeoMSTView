// PWA - Service Worker registration module
// Export a helper so the app can register the SW relative to this file
export function registerServiceWorker(options = {}) {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const swUrl = new URL("./sw.js", import.meta.url).href;
      navigator.serviceWorker
        .register(swUrl, options)
        .then((registration) => {
          console.log(
            "[PWA] Service Worker registered successfully:",
            registration.scope
          );

          // Check for updates periodically
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            console.log("[PWA] New service worker installing...");

            newWorker &&
              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  console.log(
                    "[PWA] New service worker installed, update available"
                  );
                }
              });
          });
        })
        .catch((error) => {
          console.error("[PWA] Service Worker registration failed:", error);
        });
    });
  }
}

export default registerServiceWorker;
