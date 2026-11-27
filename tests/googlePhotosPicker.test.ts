import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPhotosSession,
  getPhotosAccessToken,
  parseGoogleDurationMs,
  setPhotosAccessToken,
} from '../src/lib/googlePhotosPicker';

describe('googlePhotosPicker helpers', () => {
  afterEach(() => {
    clearPhotosSession();
  });

  it('stores and clears the Google Photos access token in memory', () => {
    expect(getPhotosAccessToken()).toBeNull();
    setPhotosAccessToken('photos-tok-1', 60_000);
    expect(getPhotosAccessToken()).toBe('photos-tok-1');
    clearPhotosSession();
    expect(getPhotosAccessToken()).toBeNull();
  });

  it('parses Google protobuf duration strings safely', () => {
    expect(parseGoogleDurationMs('3s')).toBe(3000);
    expect(parseGoogleDurationMs('1.5s')).toBe(1500);
    expect(parseGoogleDurationMs('0.1s', 2000)).toBe(2000);
    expect(parseGoogleDurationMs('30s')).toBe(10_000);
    expect(parseGoogleDurationMs(undefined, 2500)).toBe(2500);
  });
});
