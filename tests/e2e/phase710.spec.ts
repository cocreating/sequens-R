import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

test('Mod keeps three maximum-rate LFOs external-MIDI-only on mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator('.module-choice[data-module-type="mod"]').click();
  const mod = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'mod module name' }) });

  await mod.getByText('Sound', { exact: true }).click();
  await expect(mod.getByText(/sends tempo-synchronised MIDI CC data to external hardware/u)).toBeVisible();
  await expect(mod.getByText(/no internal voice, panorama, or effect sends/u)).toBeVisible();
  await expect(mod.getByLabel('Pan')).toHaveCount(0);
  await expect(mod.getByLabel('Delay send')).toHaveCount(0);
  await expect(mod.getByLabel('Reverb send')).toHaveCount(0);

  const lfoGroups = mod.locator('.mobile-parameter-groups > details');
  for (const index of [1, 2, 3]) {
    if (index > 1) await lfoGroups.nth(index - 1).locator('summary').click();
    const enabled = mod.getByRole('checkbox', { name: `LFO ${index}`, exact: true });
    if (!(await enabled.isChecked())) await enabled.click();
    await mod.getByLabel(`LFO ${index} rate`).selectOption('0');
    await mod.getByLabel(`LFO ${index} depth`).fill('63');
  }
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Transport stopped')).toBeVisible();
});
