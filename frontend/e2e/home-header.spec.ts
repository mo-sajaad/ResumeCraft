// SHELL-009 / SHELL-010: the Home header stays stuck to the top after jumping to
// an in-page section, and the page does not scroll sideways on a 320px screen.
// Every request that is not to the local dev server is aborted, so the page
// cannot reach Firebase, the API or any other outside service.
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    const { hostname } = new URL(route.request().url());
    return hostname === '127.0.0.1' || hostname === 'localhost'
      ? route.continue()
      : route.abort('blockedbyclient');
  });
});

// Below 1041px the navigation sits behind the "Menu" button.
async function jumpToFaq(page: Page, mobile: boolean) {
  const header = page.locator('header.top-nav');
  const menu = header.getByRole('button', { name: 'Menu' });
  if (mobile) {
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
  }
  await header.getByRole('link', { name: 'FAQ' }).click();
  await expect(page).toHaveURL(/#faq$/);
  // Smooth scrolling may still be running; wait until the page has moved.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  return header;
}

for (const width of [375, 768, 1280]) {
  test(`header stays at the top after jumping to #faq at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const header = await jumpToFaq(page, width <= 1040);

    await expect(header).toBeVisible();
    await expect.poll(async () => Math.round((await header.boundingBox())?.y ?? -1)).toBe(0);
  });
}

test('Home does not scroll horizontally at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await expect(page.locator('header.top-nav')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const menu = page.getByRole('button', { name: 'Menu' });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  const openOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(openOverflow).toBeLessThanOrEqual(0);
});
