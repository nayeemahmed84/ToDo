import { useEffect, useState } from 'react';
import {
  BeforeInstallPromptEvent,
  consumePwaLaunchAction,
  dismissInstallBanner,
  initServiceWorker,
  isInstallBannerDismissed,
  isIOSDevice,
  isStandaloneMode,
  PwaSharePayload,
  SwController,
} from '../lib/pwa';

interface PwaManagerProps {
  isAuthenticated: boolean;
  onCanInstallChange?: (canInstall: boolean) => void;
  installTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onOpenTask?: (taskId: string, listId?: string | null) => void;
  onQuickNewTask?: () => void;
  onSharedTask?: (payload: PwaSharePayload) => void;
}

export function PwaManager({
  isAuthenticated,
  onCanInstallChange,
  installTriggerRef,
  onOpenTask,
  onQuickNewTask,
  onSharedTask,
}: PwaManagerProps) {
  const [swController, setSwController] = useState<SwController | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [standalone, setStandalone] = useState(() => isStandaloneMode());

  // 1. Register service worker & listen for updates
  useEffect(() => {
    const controller = initServiceWorker({
      onNeedRefresh: () => setUpdateAvailable(true),
    });
    setSwController(controller);
  }, []);

  // 2. Track installability across Android, Desktop (Chrome/Edge), and iOS Safari
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setStandalone(true);
      setShowIosGuide(false);
    };

    const mq = window.matchMedia('(display-mode: standalone)');
    const handleDisplayMode = () => setStandalone(isStandaloneMode());

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    mq.addEventListener?.('change', handleDisplayMode);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mq.removeEventListener?.('change', handleDisplayMode);
    };
  }, []);

  const canInstall =
    !standalone &&
    (Boolean(deferredPrompt) || (isIOSDevice() && !isInstallBannerDismissed()));

  useEffect(() => {
    onCanInstallChange?.(canInstall);
  }, [canInstall, onCanInstallChange]);

  useEffect(() => {
    if (!installTriggerRef) return;
    installTriggerRef.current = async () => {
      if (deferredPrompt) {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      } else if (isIOSDevice()) {
        setShowIosGuide(true);
      }
    };
    return () => {
      installTriggerRef.current = null;
    };
  }, [deferredPrompt, installTriggerRef]);

  // 3. Listen for notification click messages from sw.ts
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        taskId?: string | null;
        listId?: string | null;
      } | null;
      if (data?.type === 'OPEN_NOTIFICATION' && data.taskId) {
        onOpenTask?.(data.taskId, data.listId);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [onOpenTask]);

  // 4. Handle PWA manifest shortcuts & Web Share Target once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const action = consumePwaLaunchAction();
    if (!action) return;
    if (action.type === 'new-task') {
      onQuickNewTask?.();
    } else if (action.type === 'share' && action.share) {
      onSharedTask?.(action.share);
    }
  }, [isAuthenticated, onQuickNewTask, onSharedTask]);

  return (
    <>
      {updateAvailable && (
        <div className="pwa-update-toast" role="status" aria-live="polite">
          <div className="pwa-update-text">
            <strong>Update available</strong>
            <span>A newer version of To Do is ready.</span>
          </div>
          <div className="pwa-update-actions">
            <button
              type="button"
              className="pwa-update-btn-primary"
              onClick={() => {
                try {
                  const currentView = sessionStorage.getItem('todo_current_mobile_view');
                  if (currentView) sessionStorage.setItem('todo_pull_refresh_view', currentView);
                } catch {
                  // ignore storage errors
                }
                void swController?.applyUpdate();
              }}
            >
              Reload
            </button>
            <button
              type="button"
              className="pwa-update-btn-dismiss"
              onClick={() => setUpdateAvailable(false)}
              aria-label="Dismiss update notification"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {showIosGuide && (
        <div
          className="modal-backdrop pwa-ios-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-ios-title"
          onClick={() => setShowIosGuide(false)}
        >
          <div className="modal-card pwa-ios-card" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-ios-header">
              <img src="/icons/icon-192.png" alt="To Do icon" width={44} height={44} className="pwa-ios-icon" />
              <div>
                <h2 id="pwa-ios-title">Install To Do</h2>
                <p>Add to your Home Screen for full-screen, offline access.</p>
              </div>
            </div>
            <ol className="pwa-ios-steps">
              <li>
                Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top-right corner.
              </li>
            </ol>
            <div className="pwa-ios-footer">
              <button
                type="button"
                className="pwa-update-btn-dismiss"
                onClick={() => {
                  dismissInstallBanner();
                  setShowIosGuide(false);
                }}
              >
                Don&apos;t show again
              </button>
              <button
                type="button"
                className="pwa-update-btn-primary"
                onClick={() => setShowIosGuide(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
