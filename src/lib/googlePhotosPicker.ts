import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup, type User } from 'firebase/auth';
import { auth } from './firebase';

export const GOOGLE_PHOTOS_PICKER_SCOPE =
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

const PHOTOS_TOKEN_STORAGE_KEY = 'todo.gphotos.session.v1';

interface StoredPhotosSession {
  accessToken: string;
  expiresAtMs: number;
}

interface PickerSessionResponse {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: {
    pollInterval?: string;
    timeoutIn?: string;
  };
}

interface PickerMediaItem {
  id: string;
  type?: string;
  mediaFile?: {
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
  };
}

let memorySession: StoredPhotosSession | null = null;

function readStoredSession(): StoredPhotosSession | null {
  if (memorySession && memorySession.expiresAtMs > Date.now()) {
    return memorySession;
  }
  try {
    const raw = sessionStorage.getItem(PHOTOS_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPhotosSession>;
    if (
      typeof parsed.accessToken === 'string' &&
      parsed.accessToken.length > 0 &&
      typeof parsed.expiresAtMs === 'number' &&
      parsed.expiresAtMs > Date.now()
    ) {
      memorySession = { accessToken: parsed.accessToken, expiresAtMs: parsed.expiresAtMs };
      return memorySession;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function setPhotosAccessToken(accessToken: string, ttlMs = 50 * 60 * 1000): void {
  const session: StoredPhotosSession = {
    accessToken,
    expiresAtMs: Date.now() + ttlMs,
  };
  memorySession = session;
  try {
    sessionStorage.setItem(PHOTOS_TOKEN_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

export function getPhotosAccessToken(): string | null {
  return readStoredSession()?.accessToken ?? null;
}

export function clearPhotosSession(): void {
  memorySession = null;
  try {
    sessionStorage.removeItem(PHOTOS_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function connectGooglePhotos(currentUser?: User | null): Promise<string> {
  const provider = new GoogleAuthProvider();
  provider.addScope(GOOGLE_PHOTOS_PICKER_SCOPE);
  if (currentUser?.email) {
    provider.setCustomParameters({ login_hint: currentUser.email });
  }

  const user = currentUser ?? auth.currentUser;
  const result = user
    ? await reauthenticateWithPopup(user, provider)
    : await signInWithPopup(auth, provider);

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) {
    throw new Error('Google did not return a Photos access token. Please try again.');
  }
  setPhotosAccessToken(accessToken);
  return accessToken;
}

export function parseGoogleDurationMs(duration?: string, fallbackMs = 2000): number {
  if (!duration) return fallbackMs;
  const match = /^(\d+(?:\.\d+)?)s$/i.exec(duration.trim());
  if (!match) return fallbackMs;
  const ms = Math.round(Number(match[1]) * 1000);
  return Number.isFinite(ms) && ms >= 500 ? Math.min(ms, 10_000) : fallbackMs;
}

async function photosFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearPhotosSession();
    throw new Error('Google Photos session expired. Please try again.');
  }
  return res;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Opens the official Google Photos Picker API popup so the user can choose a single photo,
 * downloads it as a File, and cleans up the session. Returns null if the user cancels.
 */
export async function pickPhotoFromGooglePhotos(options: {
  user?: User | null;
  onStatus?: (message: string) => void;
} = {}): Promise<File | null> {
  options.onStatus?.('Connecting to Google Photos…');
  let token = getPhotosAccessToken();
  if (!token) {
    token = await connectGooglePhotos(options.user);
  }

  // 1. Create a Google Photos Picker session (max 1 photo)
  const createRes = await photosFetch(token, 'https://photospicker.googleapis.com/v1/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pickingConfig: {
        maxItemCount: '1',
      },
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    if (createRes.status === 403) {
      throw new Error(
        'Google Photos Picker API is not enabled for this project. Enable "Google Photos Picker API" in Google Cloud Console.'
      );
    }
    throw new Error(`Failed to open Google Photos Picker (${createRes.status}): ${text.slice(0, 140)}`);
  }

  const session = (await createRes.json()) as PickerSessionResponse;
  const sessionId = session.id;
  const pickerUrl = `${session.pickerUri}/autoclose`;
  const pollMs = parseGoogleDurationMs(session.pollingConfig?.pollInterval, 2000);

  // 2. Open the Google Photos picker popup
  const width = 960;
  const height = 720;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const popup = window.open(
    pickerUrl,
    'todo-google-photos-picker',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
  if (!popup) {
    void photosFetch(token, `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }).catch(() => {});
    throw new Error('Popup was blocked by your browser. Please allow popups and try again.');
  }

  options.onStatus?.('Choose a photo in Google Photos…');

  try {
    // 3. Poll session until user picks a photo or closes popup
    const deadline = Date.now() + 3 * 60 * 1000;
    let ready = Boolean(session.mediaItemsSet);

    while (!ready && Date.now() < deadline) {
      await sleep(pollMs);
      const statusRes = await photosFetch(
        token,
        `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`
      );
      if (statusRes.ok) {
        const latest = (await statusRes.json()) as PickerSessionResponse;
        if (latest.mediaItemsSet) {
          ready = true;
          break;
        }
      }
      if (popup.closed) {
        // Give one final grace check in case /autoclose closed right as mediaItemsSet flipped
        await sleep(600);
        const finalRes = await photosFetch(
          token,
          `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`
        );
        if (finalRes.ok) {
          const latest = (await finalRes.json()) as PickerSessionResponse;
          ready = Boolean(latest.mediaItemsSet);
        }
        break;
      }
    }

    if (!ready) {
      return null;
    }

    // 4. Fetch picked media item
    options.onStatus?.('Downloading selected photo…');
    const itemsRes = await photosFetch(
      token,
      `https://photospicker.googleapis.com/v1/mediaItems?sessionId=${encodeURIComponent(sessionId)}&pageSize=1`
    );
    if (!itemsRes.ok) {
      throw new Error(`Failed to fetch selected photo (${itemsRes.status}).`);
    }
    const itemsData = (await itemsRes.json()) as { mediaItems?: PickerMediaItem[] };
    const picked = itemsData.mediaItems?.[0];
    const baseUrl = picked?.mediaFile?.baseUrl;
    if (!baseUrl) {
      throw new Error('Selected item did not contain a downloadable image.');
    }
    const mimeType = picked.mediaFile?.mimeType || 'image/jpeg';
    if (!mimeType.startsWith('image/')) {
      throw new Error('Please choose a photo (videos cannot be used as a background).');
    }

    // 5. Download scaled background image (1920x1080 max)
    const imgRes = await photosFetch(token, `${baseUrl}=w1920-h1080`);
    if (!imgRes.ok) {
      throw new Error(`Failed to download image from Google Photos (${imgRes.status}).`);
    }
    const blob = await imgRes.blob();
    const fileName = picked.mediaFile?.filename || 'google-photo.jpg';
    return new File([blob], fileName, { type: blob.type || mimeType });
  } finally {
    if (!popup.closed) {
      try {
        popup.close();
      } catch {
        // ignore cross-origin close restrictions
      }
    }
    void photosFetch(
      token,
      `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' }
    ).catch(() => {});
  }
}
