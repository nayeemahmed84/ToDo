import { expect, test } from '@playwright/test';

test.describe('ToDo PWA smoke tests', () => {
  test('renders application shell without uncaught runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/To Do/i);
    await expect(page.locator('#root')).not.toBeEmpty();

    // Ensure no uncaught JS exceptions occurred on boot
    expect(errors).toEqual([]);
  });

  test('serves PWA web manifest with expected metadata', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const manifest = (await res.json()) as { name?: string; display?: string };
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
  });
});
