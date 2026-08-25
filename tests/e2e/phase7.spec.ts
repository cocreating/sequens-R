import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } });

test('sound state has one accessible mobile shell independent from generator controls', async ({ page }) => {
  await page.goto('/');
  const drums = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'drums module name' }) });
  await drums.getByText('Sound', { exact: true }).click();

  await expect(drums.getByLabel('Kit')).toHaveValue('drums-core-v2');
  await expect(drums.getByLabel('Tone')).toBeVisible();
  await expect(drums.getByLabel('Punch')).toBeVisible();
  await expect(drums.getByLabel('Decay')).toBeVisible();
  await expect(drums.getByLabel('Pan')).toBeVisible();
  await expect(drums.getByLabel('Delay send')).toBeVisible();
  await expect(drums.getByLabel('Reverb send')).toBeVisible();

  await drums.getByLabel('Kit').selectOption('legacy-drums-v1');
  await expect(page.locator('.session-status')).toHaveText('Legacy Drums selected');
  await drums.getByRole('button', { name: 'Upgrade sound' }).click();
  await expect(drums.getByLabel('Kit')).toHaveValue('drums-core-v2');
  await expect(page.locator('.session-status')).toContainText('Undo is available');
});

test('legacy projects expose a reversible upgrade and control modules stay silent', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Workspace', { exact: true }).click();
  await page.locator('#project-import').setInputFiles(fileURLToPath(new URL('../../public/projects/basic-electro.sequens-r.json', import.meta.url)));
  await expect(page.locator('.session-status')).toHaveText('Project imported and saved locally');

  const drums = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'drums module name' }) });
  await drums.getByText('Sound', { exact: true }).click();
  await expect(drums.getByLabel('Kit')).toHaveValue('legacy-drums-v1');
  await drums.getByRole('button', { name: 'Upgrade sound' }).click();
  await expect(page.locator('.session-status')).toContainText('Undo is available');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(drums.getByLabel('Kit')).toHaveValue('legacy-drums-v1');

  await page.getByLabel('New module').selectOption('cc');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const control = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'cc module name' }) });
  await control.getByText('Sound', { exact: true }).click();
  await expect(control.getByText('Silent control module')).toBeVisible();
  await expect(control.getByLabel('Pan')).toHaveCount(0);
});

test('mixer exposes channel sends, pan, rack returns, character, and live meters', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByLabel('New module').selectOption('mixer');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const mixer = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'mixer module name' }) });
  await expect(mixer.getByRole('region', { name: 'Drums channel' })).toBeVisible();
  await expect(mixer.getByLabel('Rack master')).toBeVisible();
  await expect(mixer.getByLabel('Delay division')).toBeVisible();
  await expect(mixer.getByLabel('Delay feedback')).toBeVisible();
  await expect(mixer.getByLabel('Delay return')).toBeVisible();
  await expect(mixer.getByLabel('Reverb return')).toBeVisible();
  await expect(mixer.getByLabel('Master character')).toBeVisible();

  const drums = mixer.getByRole('region', { name: 'Drums channel' });
  await expect(drums.getByLabel('Pan')).toBeVisible();
  await expect(drums.getByLabel('Delay')).toBeVisible();
  await expect(drums.getByLabel('Reverb')).toBeVisible();
  await drums.getByLabel('Pan').fill('35');
  await expect(drums.getByLabel('Pan')).toHaveValue('35');
  await expect(drums.locator('.mix-meter')).toHaveAttribute('aria-label', /Drums peak/);

  await page.getByLabel('New module').selectOption('mixer');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const mixers = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'mixer module name' }) });
  await expect(mixers).toHaveCount(2);
  await mixers.nth(0).getByLabel('Delay return').fill('41');
  await expect(mixers.nth(1).getByLabel('Delay return')).toHaveValue('41');
});
