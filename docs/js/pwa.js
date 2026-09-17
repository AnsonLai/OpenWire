/**
 * pwa.js
 * 
 * Progressive Web App registration and installation lifecycle handler.
 * Enables offline shell caching and mobile "Add to Home Screen" support.
 * 
 * SOLID: Single Responsibility Principle - PWA installation & service worker registration only.
 */

let deferredInstallPrompt = null;

export function initPWA() {
  // 1. Register Service Worker if supported
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/OpenWire/sw.js', { scope: '/OpenWire/' });
        // Force update check on every load
        await registration.update();
        console.info({ scope: registration.scope }, 'ServiceWorker registered and updated');
      } catch (error) {
        console.warn({ error: error?.message }, 'ServiceWorker registration failed');
      }
    });
  }

  // 2. Capture 'beforeinstallprompt' event for installable PWA UI
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent standard mini-infobar from appearing on mobile
    e.preventDefault();
    deferredInstallPrompt = e;

    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
      installBtn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        console.info({ outcome }, 'User responded to PWA install prompt');
        deferredInstallPrompt = null;
        installBtn.style.display = 'none';
      });
    }
  });

  // 3. Listen for app installed event
  window.addEventListener('appinstalled', () => {
    console.info('PWA installed to home screen');
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) installBtn.style.display = 'none';
    deferredInstallPrompt = null;
  });
}
