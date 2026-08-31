import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } });

test('Synth generates, mutates, shapes sound, routes, shares, and restores on mobile', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');

  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator('.module-choice[data-module-type="synth"]').click();
  await expect(page.getByText('Synth added')).toBeVisible();
  const synth = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'synth module name' }) });

  await synth.getByLabel('Phrase').selectOption({ label: 'Orbit' });
  await synth.getByRole('button', { name: 'Increase Steps' }).click();
  await synth.getByLabel('Density').fill('72');
  await synth.getByLabel('Repeat').fill('48');
  await synth.getByRole('button', { name: 'Mutate' }).click();
  await expect(synth.getByRole('button', { name: 'Revert' })).toBeEnabled();

  await synth.locator('.sound-panel > summary').click();
  await synth.getByLabel('Preset').selectOption({ label: 'Twin path' });
  await synth.getByRole('group', { name: 'Wave' }).getByRole('button', { name: 'Square' }).click();
  await synth.getByLabel('Cutoff').fill('77');
  await synth.locator('.module-advanced > summary').click();
  await synth.getByLabel('Channel', { exact: true }).selectOption('5');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByText('Transport playing')).toBeVisible();
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByText(/Patch link copied/u)).toBeVisible();
  const sharedUrl = page.url();

  const recipient = await context.newPage();
  await recipient.goto(sharedUrl);
  const restored = recipient.locator('article').filter({ has: recipient.getByRole('textbox', { name: 'synth module name' }) });
  await expect(restored.getByLabel('Phrase')).toHaveValue('4');
  await expect(restored.getByRole('spinbutton', { name: 'Steps', exact: true })).toHaveValue('24');
  await restored.locator('.sound-panel > summary').click();
  await expect(restored.getByLabel('Preset')).toHaveValue('synth-wide-v2');
  await expect(restored.getByRole('group', { name: 'Wave' }).getByRole('button', { name: 'Square' })).toHaveAttribute('aria-pressed', 'true');
  await restored.locator('.module-advanced > summary').click();
  await expect(restored.getByLabel('Channel', { exact: true })).toHaveValue('1');

  const results = await new AxeBuilder({ page: recipient }).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});
