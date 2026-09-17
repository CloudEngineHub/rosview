import { test, expect } from '@playwright/test';
import { BVH_MINIMAL, BVH_MINIMAL_URL, requireFixture } from './fixturePaths';
import { attachBrowserDiagnostics } from './helpers/rosview';

test.describe.configure({ timeout: 60_000 });

test.beforeAll(() => {
  requireFixture(BVH_MINIMAL);
});

test('BVH sample loads and exposes skeleton topic in the sidebar', async ({ page }) => {
  const diagnostics = attachBrowserDiagnostics(page);
  await page.goto(`/?url=${BVH_MINIMAL_URL}`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('body')).toContainText('/bvh/skeleton', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Play playback' })).toBeVisible();

  const canvasHost = page.getByTestId('three-canvas');
  await expect(canvasHost).toBeVisible();
  await expect(canvasHost.locator('canvas')).toHaveCount(1);
  expect(diagnostics.pageErrors, `page errors:\n${diagnostics.pageErrors.join('\n')}`).toEqual([]);
});
