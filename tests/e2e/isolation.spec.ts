import { expect, test } from '@playwright/test';

test('the local production preview is cross-origin isolated', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'sequens-R' })).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});
