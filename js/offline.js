/**
 * Letterloom offline support — registers the service worker (sw.js), reports
 * whether the full game is stored on the device, and exposes the browser's
 * install prompt where one exists.
 *
 * Fires a `letterloom-offline` event on window whenever the state changes.
 */
(function (global) {
  'use strict';

  const state = {
    supported: false,
    ready: false,
    installable: false,
    standalone: false,
    ios: false,
  };
  let deferredPrompt = null;

  function emit() {
    try {
      global.dispatchEvent(new CustomEvent('letterloom-offline', { detail: getState() }));
    } catch (err) {
      /* very old browsers: no CustomEvent constructor */
    }
  }

  function getState() {
    return Object.assign({}, state);
  }

  function detectStandalone() {
    const nav = global.navigator || {};
    if (nav.standalone === true) return true;
    try {
      return Boolean(global.matchMedia && global.matchMedia('(display-mode: standalone)').matches);
    } catch (err) {
      return false;
    }
  }

  function detectIos() {
    const nav = global.navigator || {};
    const ua = String(nav.userAgent || '');
    // iPadOS reports itself as Macintosh; touch points give it away.
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  }

  function askStatus(worker) {
    if (worker) worker.postMessage({ type: 'status' });
  }

  function register(scriptUrl) {
    const nav = global.navigator;
    state.standalone = detectStandalone();
    state.ios = detectIos();

    global.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      state.installable = true;
      emit();
    });
    global.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      state.installable = false;
      state.standalone = true;
      emit();
    });

    if (!nav || !('serviceWorker' in nav) || global.location.protocol === 'file:') {
      emit();
      return;
    }
    state.supported = true;

    nav.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'offline-status') {
        state.ready = Boolean(data.ready);
        emit();
      }
    });

    nav.serviceWorker
      .register(scriptUrl || 'sw.js')
      .then((registration) => {
        // Ask persistent storage so the browser is less likely to evict the dictionaries.
        if (nav.storage && nav.storage.persist) nav.storage.persist().catch(() => {});
        if (registration.active) askStatus(registration.active);
        return nav.serviceWorker.ready;
      })
      .then((registration) => askStatus(registration.active))
      .catch(() => {
        state.supported = false;
        emit();
      });

    nav.serviceWorker.addEventListener('controllerchange', () => {
      askStatus(nav.serviceWorker.controller);
    });
    emit();
  }

  function promptInstall() {
    if (!deferredPrompt) return Promise.resolve(false);
    const prompt = deferredPrompt;
    deferredPrompt = null;
    state.installable = false;
    emit();
    prompt.prompt();
    return prompt.userChoice.then((choice) => choice && choice.outcome === 'accepted').catch(() => false);
  }

  global.LetterloomOffline = { register, getState, promptInstall };
})(typeof window !== 'undefined' ? window : globalThis);
