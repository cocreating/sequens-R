import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } });

test('Drone evolves, mutates, shapes sound, routes, shares, and restores on mobile', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');

  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator('.module-choice[data-module-type="drone"]').click();
  await expect(page.getByText('Drone added')).toBeVisible();
  const drone = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'drone module name' }) });

  await expect(drone.getByRole('group', { name: /Drone field/u })).toBeVisible();
  await drone.getByLabel('Field', { exact: true }).selectOption({ label: 'Wandering' });
  await drone.getByLabel('Cycle').selectOption({ label: '8 bars' });
  await drone.getByRole('button', { name: 'Increase Voices' }).click();
  await drone.getByLabel('Changes').fill('72');
  await drone.getByLabel('Tension').fill('48');
  await drone.getByRole('button', { name: 'Mutate' }).click();
  await expect(drone.getByRole('button', { name: 'Revert' })).toBeEnabled();

  await drone.locator('.sound-panel > summary').click();
  await drone.getByLabel('Preset').selectOption({ label: 'Tidal Glass' });
  await drone.getByRole('group', { name: 'Body' }).getByRole('button', { name: 'Glass' }).click();
  await drone.getByLabel('Motion').fill('61');
  await drone.locator('.module-advanced > summary').click();
  await drone.getByLabel('Channel', { exact: true }).selectOption('5');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByText('Transport playing')).toBeVisible();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByText(/Patch link copied/u)).toBeVisible();
  const sharedUrl = page.url();

  const recipient = await context.newPage();
  await recipient.goto(sharedUrl);
  const restored = recipient.locator('article').filter({ has: recipient.getByRole('textbox', { name: 'drone module name' }) });
  await expect(restored.getByLabel('Field', { exact: true })).toHaveValue('5');
  await expect(restored.getByLabel('Cycle')).toHaveValue('3');
  await expect(restored.getByRole('spinbutton', { name: 'Voices', exact: true })).toHaveValue('4');
  await restored.locator('.sound-panel > summary').click();
  await expect(restored.getByLabel('Preset')).toHaveValue('drone-glass-v1');
  await expect(restored.getByRole('group', { name: 'Body' }).getByRole('button', { name: 'Glass' })).toHaveAttribute('aria-pressed', 'true');
  await restored.locator('.module-advanced > summary').click();
  await expect(restored.getByLabel('Channel', { exact: true })).toHaveValue('1');

  const results = await new AxeBuilder({ page: recipient }).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});
