import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

test('CC Control explains its external-only sound contract and keeps mobile automation available', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('New module').selectOption('cc');
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  const cc = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'cc module name' }) });

  await cc.getByText('Sound', { exact: true }).click();
  await expect(cc.getByText(/sends MIDI control data to external hardware/u)).toBeVisible();
  await expect(cc.getByText(/no internal voice, panorama, or effect sends/u)).toBeVisible();
  await expect(cc.getByLabel('Pan')).toHaveCount(0);
  await expect(cc.getByLabel('Delay send')).toHaveCount(0);
  await expect(cc.getByLabel('Reverb send')).toHaveCount(0);

  await cc.getByRole('button', { name: 'Record movement' }).click();
  await cc.getByLabel('Control 1 value').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '96';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(cc.getByText('1 recorded point')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Transport stopped')).toBeVisible();
});
