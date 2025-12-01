// PWA - Service Worker Registration
// Register service worker for PWA functionality

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered successfully:', registration.scope);
        
        // Check for updates periodically
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('[PWA] New service worker installing...');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New service worker installed, update available');
              // Could show a notification to the user here
            }
          });
        });
      })
      .catch((error) => {
        console.error('[PWA] Service Worker registration failed:', error);
      });
  });
}
