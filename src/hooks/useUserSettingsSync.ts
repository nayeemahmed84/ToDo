import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import { AppSettings, DEFAULT_SETTINGS } from '../components/SettingsModal';

const SETTINGS_STORAGE_KEY = 'todo-settings';

function loadLocalSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<AppSettings>;
      const merged = { ...DEFAULT_SETTINGS, ...stored };
      if (!merged.themeModeExplicit && merged.themeMode === 'system') {
        merged.themeMode = 'dark';
      }
      return merged;
    }
    const legacyDark = localStorage.getItem('todo-dark');
    if (legacyDark !== null) {
      return { ...DEFAULT_SETTINGS, themeMode: legacyDark === '1' ? 'dark' : 'light' };
    }
  } catch {
    // ignore corrupt localStorage
  }
  return DEFAULT_SETTINGS;
}

function saveLocalSettings(next: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}

export function useUserSettingsSync(user: User | null) {
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadLocalSettings());
  const settingsRef = useRef<AppSettings>(appSettings);
  settingsRef.current = appSettings;
  const lastRemoteJsonRef = useRef<string>('');

  // Subscribe to Firestore private/settings doc for cross-device sync (settings, templates, saved filters)
  useEffect(() => {
    if (!user) return;
    const settingsDocRef = doc(db, 'users', user.uid, 'private', 'settings');
    const unsub = onSnapshot(
      settingsDocRef,
      (snap) => {
        if (!snap.exists()) {
          // Seed cloud settings from local device on first sign-in
          const current = settingsRef.current;
          void setDoc(
            settingsDocRef,
            {
              ...current,
              updatedAtMs: Date.now(),
            },
            { merge: true }
          ).catch(() => {
            // ignore offline/rules errors
          });
          return;
        }
        const data = snap.data() as Partial<AppSettings> & { updatedAtMs?: number };
        const { updatedAtMs: _ignored, ...rest } = data;
        const merged: AppSettings = { ...DEFAULT_SETTINGS, ...rest };
        const serialized = JSON.stringify(merged);
        if (serialized === lastRemoteJsonRef.current) return;
        lastRemoteJsonRef.current = serialized;
        saveLocalSettings(merged);
        setAppSettings(merged);
      },
      () => {
        // Fallback silently to localStorage if offline or rules not yet deployed
      }
    );
    return () => unsub();
  }, [user]);

  const updateAppSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setAppSettings((prev) => {
        const next: AppSettings = { ...prev, ...patch };
        if ('themeMode' in patch && !('themeModeExplicit' in patch)) {
          next.themeModeExplicit = true;
        }
        const serialized = JSON.stringify(next);
        lastRemoteJsonRef.current = serialized;
        saveLocalSettings(next);
        if (user) {
          const settingsDocRef = doc(db, 'users', user.uid, 'private', 'settings');
          void setDoc(
            settingsDocRef,
            {
              ...next,
              updatedAtMs: Date.now(),
            },
            { merge: true }
          ).catch(() => {
            // ignore offline write errors; Firestore persistence queues writes
          });
        }
        return next;
      });
    },
    [user]
  );

  return { appSettings, updateAppSettings };
}
