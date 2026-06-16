// useInstallPrompt.js
// Captures the browser's beforeinstallprompt event so we can show a custom
// "Add to Home Screen" button at the right moment instead of relying on the
// browser's own (easily-missed) banner.
//
// Returns:
//   canInstall   — true when the prompt is available (not yet installed, browser supports it)
//   install()    — call this to show the native install dialog
//   isInstalled  — true when already running as a standalone PWA (no button needed)

import { useState, useEffect } from 'react';

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled,    setIsInstalled]    = useState(false);

  useEffect(() => {
    // Already running as installed PWA — standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }
    // iOS Safari doesn't support beforeinstallprompt but it does support
    // "Add to Home Screen" via the share sheet — we can still show a hint.
    // For simplicity we just let canInstall stay false on iOS and the
    // hint text covers it.

    function onBeforeInstall(e) {
      e.preventDefault();         // stop the mini-infobar showing immediately
      setDeferredPrompt(e);       // stash it so we can trigger on our own button click
    }

    function onAppInstalled() {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled',        onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled',        onAppInstalled);
    };
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  }

  // iOS Safari: show a hint even though we can't trigger the prompt programmatically
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
                && !window.matchMedia('(display-mode: standalone)').matches;

  return {
    canInstall:  !!deferredPrompt,
    isInstalled,
    isIos,
    install,
  };
}
