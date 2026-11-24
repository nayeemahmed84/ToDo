import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export interface PwaSharePayload {
  title: string;
  note: string;
}

export interface PwaLaunchAction {
  type: 'new-task' | 'share';
  share?: PwaSharePayload;
}

const INSTALL_DISMISSED_KEY = 'todo.pwa.installDismissedAt';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isInstallBannerDismissed(): boolean {
  try {
    const raw = localStorage.getItem(INSTALL_DISMISSED_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function dismissInstallBanner(): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Syncs the OS-level app icon badge (Windows taskbar, macOS dock, Android/iOS home screen)
 * with the current count of active focus tasks.
 */
export function updateAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && typeof nav.setAppBadge === 'function') {
      void nav.setAppBadge(count).catch(() => {});
    } else if (typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge().catch(() => {});
    }
  } catch {
    // Unsupported or permission-restricted
  }
}

/**
 * Parses PWA launch actions from manifest shortcuts (/?action=new-task)
 * and Web Share Target (/?action=share&title=...&text=...&url=...).
 */
export function consumePwaLaunchAction(): PwaLaunchAction | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const action = url.searchParams.get('action');
  if (!action) return null;

  let result: PwaLaunchAction | null = null;

  if (action === 'new-task') {
    result = { type: 'new-task' };
  } else if (action === 'share') {
    const rawTitle = (url.searchParams.get('title') || '').trim();
    const rawText = (url.searchParams.get('text') || '').trim();
    const rawUrl = (url.searchParams.get('url') || '').trim();

    const title = rawTitle || rawText.split(/\r?\n/)[0]?.slice(0, 140) || rawUrl || 'Shared item';
    const noteParts: string[] = [];
    if (rawText && rawText !== title) noteParts.push(rawText);
    if (rawUrl && !rawText.includes(rawUrl) && rawUrl !== title) noteParts.push(rawUrl);

    result = {
      type: 'share',
      share: {
        title,
        note: noteParts.join('\n'),
      },
    };
  }

  if (result) {
    url.searchParams.delete('action');
    url.searchParams.delete('title');
    url.searchParams.delete('text');
    url.searchParams.delete('url');
    url.searchParams.delete('source');
    const clean = url.pathname + (url.search ? url.search : '') + url.hash;
    window.history.replaceState({}, '', clean);
  }

  return result;
}

export interface SwController {
  applyUpdate: () => Promise<void>;
}

/**
 * Registers the PWA service worker with graceful update notifications and
 * automatic background update checks on tab focus and hourly intervals.
 */
export function initServiceWorker(callbacks: {
  onNeedRefresh: () => void;
  onOfflineReady?: () => void;
}): SwController {
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  let swRegistration: ServiceWorkerRegistration | null = null;

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        callbacks.onNeedRefresh();
      },
      onOfflineReady() {
        callbacks.onOfflineReady?.();
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        swRegistration = registration;
        // Periodically check for updates (every 60 min)
        window.setInterval(() => {
          if (navigator.onLine) {
            void registration.update().catch(() => {});
          }
        }, 60 * 60 * 1000);

        // Also check when user returns to the app after being away
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void registration.update().catch(() => {});
          }
        });
      },
    });
  }

  return {
    applyUpdate: async () => {
      let reloaded = false;
      const reloadOnce = () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      };

      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true });
      }

      // Fallback: if controllerchange doesn't fire (e.g. waiting SW already activated), reload anyway.
      window.setTimeout(reloadOnce, 1200);

      try {
        if (swRegistration?.waiting) {
          swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        if (updateSW) {
          await updateSW(true);
        } else {
          reloadOnce();
        }
      } catch {
        reloadOnce();
      }
    },
  };
}
