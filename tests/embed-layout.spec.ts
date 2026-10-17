import { test, expect, type Page } from '@playwright/test';
import { MCAP_BASIC_URL, requireExamplesDir } from './fixturePaths';
import { openFixtureByUrl } from './helpers/rosview';

test.beforeAll(() => {
  requireExamplesDir();
});

async function layoutBoxes(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const content = document.querySelector('[data-layout]');
    return {
      layout: content?.getAttribute('data-layout') ?? null,
      content: box(content),
      sidebar: box(document.querySelector('aside')),
      main: box(document.querySelector('[data-testid="rosview-dockview"]')),
      playback: box(document.querySelector('[data-testid="playback-bar"]')),
      root: box(document.querySelector('#rosview-root')),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test('wide container: sidebar beside the panels, viewer fills the window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFixtureByUrl(page, MCAP_BASIC_URL);
  const b = await layoutBoxes(page);
  expect(b.layout).toBe('split');
  expect(b.root!.w).toBeCloseTo(b.viewport.w, 0);
  expect(b.root!.h).toBeCloseTo(b.viewport.h, 0);
  expect(b.sidebar!.x).toBeLessThan(b.main!.x);
  expect(b.playback!.y + b.playback!.h).toBeCloseTo(b.viewport.h, 0);
  expect(b.pageScroll).toBe(0);
});

test('narrow container: sidebar stacks under the panels and keeps the full width', async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 900 });
  await openFixtureByUrl(page, MCAP_BASIC_URL);
  const b = await layoutBoxes(page);
  expect(b.layout).toBe('stacked');
  expect(b.sidebar!.y).toBeGreaterThan(b.main!.y);
  expect(b.sidebar!.w).toBeCloseTo(b.content!.w, 0);
  expect(b.main!.w).toBeCloseTo(b.content!.w, 0);
  expect(b.pageScroll).toBe(0);
  // Focus order follows the visual order: panels first, then the sidebar.
  const order = await page.evaluate(() => {
    const main = document.querySelector('[data-testid="rosview-dockview"]')!;
    const aside = document.querySelector('aside')!;
    return main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING ? 'main-first' : 'aside-first';
  });
  expect(order).toBe('main-first');
});

test('a narrow host container stacks the sidebar while the window stays wide', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFixtureByUrl(page, MCAP_BASIC_URL);
  await expect(page.locator('[data-layout="split"]')).toBeVisible();
  // Narrow the element that hosts the viewer, not the window: layout must follow the container.
  await page.evaluate(() => {
    document.getElementById('rosview-root')!.parentElement!.style.width = '600px';
  });
  await expect(page.locator('[data-layout="stacked"]')).toBeVisible();
  const b = await layoutBoxes(page);
  expect(b.viewport.w).toBe(1280);
  expect(b.root!.w).toBeCloseTo(600, 0);
  expect(b.sidebar!.y).toBeGreaterThan(b.main!.y);
  expect(b.sidebar!.w).toBeCloseTo(b.content!.w, 0);
  // Widening the host again restores the split layout.
  await page.evaluate(() => {
    document.getElementById('rosview-root')!.parentElement!.style.width = '1000px';
  });
  await expect(page.locator('[data-layout="split"]')).toBeVisible();
});

test('crossing the breakpoint keeps the panels mounted', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFixtureByUrl(page, MCAP_BASIC_URL);
  await page.evaluate(() => {
    document.querySelector('[data-testid="rosview-dockview"]')!.setAttribute('data-probe', 'kept');
    document.querySelector('aside')!.setAttribute('data-probe', 'kept');
  });
  await page.setViewportSize({ width: 500, height: 900 });
  await expect(page.locator('[data-layout="stacked"]')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('[data-layout="split"]')).toBeVisible();
  await expect(page.locator('[data-testid="rosview-dockview"][data-probe="kept"]')).toHaveCount(1);
  await expect(page.locator('aside[data-probe="kept"]')).toHaveCount(1);
});

test('sidebar tabs have accessible names and never clip their labels', async ({ page }) => {
  for (const width of [1280, 900, 500]) {
    await page.setViewportSize({ width, height: 800 });
    await openFixtureByUrl(page, MCAP_BASIC_URL);
    const tabs = page.getByRole('tab');
    for (const name of ['Topics', 'Quality', 'Settings']) {
      await expect(page.getByRole('tab', { name })).toHaveCount(1);
    }
    const clipped = await tabs.evaluateAll((els) =>
      els
        .filter((el) => el.closest('aside'))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.getAttribute('aria-label') ?? el.textContent),
    );
    expect(clipped, `clipped tabs at ${width}px`).toEqual([]);
  }
});

test('Space on a focused sidebar tab does not toggle playback', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFixtureByUrl(page, MCAP_BASIC_URL);
  const play = page.getByRole('button', { name: /Play playback|Pause playback/ });
  const before = await play.getAttribute('aria-label');
  await page.getByRole('tab', { name: 'Quality' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await expect(play).toHaveAttribute('aria-label', before!);
  // Arrow moved focus between tabs instead of stepping playback.
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeFocused();
});

for (const width of [390, 1280]) {
  test(`navbar at ${width}px: the file name never overlaps the controls and keeps its full name as a title`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await openFixtureByUrl(page, MCAP_BASIC_URL);
    const result = await page.evaluate(() => {
      const name = document.querySelector('[data-testid="rosview-navbar-source-name"]');
      if (!name) return null;
      const n = name.getBoundingClientRect();
      const nav = name.closest('nav')!;
      const overlaps = [...nav.querySelectorAll('button')]
        .map((b) => ({ label: b.getAttribute('aria-label') ?? b.textContent ?? '', r: b.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.left < n.right - 0.5 && r.right > n.left + 0.5)
        .map(({ label }) => label);
      const style = getComputedStyle(name);
      return {
        title: name.getAttribute('title'),
        text: name.textContent,
        overlaps,
        ellipsis: style.textOverflow,
        pointerEvents: style.pointerEvents,
        pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(result).not.toBeNull();
    expect(result!.overlaps).toEqual([]);
    expect(result!.title).toContain('test_5s.mcap');
    expect(result!.ellipsis).toBe('ellipsis');
    expect(result!.pointerEvents).toBe('auto');
    expect(result!.pageScroll).toBe(0);
  });
}

for (const width of [390, 1280]) {
  test(`playback bar at ${width}px shows the whole clock`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openFixtureByUrl(page, MCAP_BASIC_URL);
    const r = await page.evaluate(() => {
      const time = document.querySelector('[data-testid="playback-time-line"]') as HTMLElement;
      const transport = document.querySelector('[data-testid="playback-transport"]') as HTMLElement;
      const t = time.getBoundingClientRect();
      const p = transport.getBoundingClientRect();
      return {
        text: time.textContent ?? '',
        clipped: time.scrollWidth > time.clientWidth + 1,
        transportBelow: p.top >= t.bottom - 1,
      };
    });
    expect(r.text).toMatch(/\d\d:\d\d\.\d{3} \/ \d\d:\d\d\.\d{3}/);
    expect(r.clipped).toBe(false);
    expect(r.transportBelow).toBe(width < 640);
  });
}
