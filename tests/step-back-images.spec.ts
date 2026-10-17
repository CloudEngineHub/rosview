import { test, expect } from '@playwright/test';
import { MCAP_3CAM_URL, requireExamplesDir } from './fixturePaths';
import { openFixtureByUrl } from './helpers/rosview';

test.beforeAll(() => {
  requireExamplesDir();
});

test('stepping back one message while paused keeps every image panel showing a frame', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFixtureByUrl(page, MCAP_3CAM_URL);
  const waiting = page.getByText('Waiting for image data');
  const panels = page.locator('canvas');
  await expect(panels).toHaveCount(3, { timeout: 30_000 });
  await expect(waiting).toHaveCount(0, { timeout: 30_000 });

  // Paused: step forward a few messages, then back. Each backward step rewinds
  // the panels, which must be refilled at the new time on every camera.
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const pause = page.getByRole('button', { name: 'Pause playback' });
  if (await pause.isVisible()) await pause.click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(i % 2 ? 40 : 400);
  }
  await page.waitForTimeout(1_000);
  await expect(waiting).toHaveCount(0);
});
