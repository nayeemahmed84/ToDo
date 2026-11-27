import { expect, test } from '@playwright/test';

interface WebManifest {
  name?: string;
  short_name?: string;
  display?: string;
  icons?: Array<{ src: string; sizes?: string; purpose?: string }>;
  shortcuts?: Array<{ name: string; url: string }>;
  share_target?: {
    action?: string;
    method?: string;
    enctype?: string;
    params?: {
      title?: string;
      text?: string;
      url?: string;
      files?: Array<{ name: string; accept: string[] }>;
    };
  };
}

test.describe('ToDo PWA smoke, manifest, share target & accessibility tests', () => {
  test('renders application shell without uncaught runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/To Do/i);
    await expect(page.locator('#root')).not.toBeEmpty();

    // Verify semantic landmark & accessible heading exist
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Ensure no uncaught JS exceptions occurred on boot
    expect(errors).toEqual([]);
  });

  test('serves PWA web manifest with POST Share Target, files support, shortcuts, and icons', async ({
    request,
  }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();

    const manifest = (await res.json()) as WebManifest;
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe('standalone');

    // Verify PWA Share Target supports POST multipart/form-data + file uploads
    expect(manifest.share_target?.action).toBe('/share-target');
    expect(manifest.share_target?.method).toBe('POST');
    expect(manifest.share_target?.enctype).toBe('multipart/form-data');
    expect(manifest.share_target?.params?.title).toBe('title');
    expect(manifest.share_target?.params?.text).toBe('text');
    expect(manifest.share_target?.params?.url).toBe('url');
    expect(manifest.share_target?.params?.files?.length).toBeGreaterThan(0);

    // Verify shortcuts and maskable icon exist
    expect(manifest.shortcuts?.some((s) => s.url.includes('action=new-task'))).toBe(true);
    expect(manifest.icons?.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  test('handles GET share target deep-link without runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(
      '/?action=share&title=Read%20article&text=Great%20summary&url=https%3A%2F%2Fexample.com'
    );
    await expect(page.locator('#root')).not.toBeEmpty();
    expect(errors).toEqual([]);
  });

  test('renders cleanly on mobile viewport without horizontal overflow and supports keyboard focus', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);

    // Wait for an interactive control (e.g. Sign in button) if present, then verify keyboard focusability
    const firstButton = page.getByRole('button').first();
    if (await firstButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.keyboard.press('Tab');
      const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
      expect(['BUTTON', 'A', 'INPUT']).toContain(activeTag);
    }
    expect(errors).toEqual([]);
  });
});
