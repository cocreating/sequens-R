import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } });

test('slots, editable seeds, mutate, and revert stay deterministic', async ({ page }) => {
  await page.goto('/');
  const bass = page.getByRole('listitem', { name: 'Bass' });
  const seed = bass.getByLabel('Seed', { exact: true });
  const firstSeed = await seed.inputValue();

  await bass.getByRole('button', { name: 'Bass slot 2' }).click();
  await expect(seed).not.toHaveValue(firstSeed);
  await seed.fill('424242');
  await seed.blur();
  await expect(seed).toHaveValue('424242');

  await bass.getByRole('button', { name: 'Mutate', exact: true }).click();
  await expect(seed).not.toHaveValue('424242');
  await bass.getByRole('button', { name: 'Revert', exact: true }).click();
  await expect(seed).toHaveValue('424242');

  await bass.getByRole('button', { name: 'Bass slot 1' }).click();
  await expect(seed).toHaveValue(firstSeed);

  await bass.getByRole('checkbox', { name: 'Auto' }).check();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => seed.inputValue(), { timeout: 5000 }).not.toBe(firstSeed);
  await expect(page.getByText('Scheduled mutation applied')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
});

test('continuous parameter input is one undo step', async ({ page }) => {
  await page.goto('/');
  const density = page.getByRole('listitem', { name: 'Bass' }).getByLabel('Density');
  const original = await density.inputValue();

  await density.evaluate((element) => {
    const input = element as HTMLInputElement;
    for (const value of ['61', '67', '73']) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(density).toHaveValue('73');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(density).toHaveValue(original);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(density).toHaveValue('73');
});

test('saving restores the exact project after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Project' }).fill('Persistent Session');
  await page.getByLabel('Tempo').fill('137.5');
  await page.getByLabel('Tempo').blur();
  const bass = page.getByRole('listitem', { name: 'Bass' });
  await bass.getByRole('button', { name: 'Bass slot 3' }).click();
  await bass.getByLabel('Seed', { exact: true }).fill('987654321');
  await bass.getByLabel('Seed', { exact: true }).blur();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/Project saved/)).toBeVisible();

  await page.reload();
  await expect(page.getByText('Local project restored')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Project' })).toHaveValue('Persistent Session');
  await expect(page.getByLabel('Tempo')).toHaveValue('137.5');
  const restoredBass = page.getByRole('listitem', { name: 'Bass' });
  await expect(restoredBass.getByRole('button', { name: 'Bass slot 3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(restoredBass.getByLabel('Seed', { exact: true })).toHaveValue('987654321');
});

test('opening a shared link remains a draft and does not overwrite the local project', async ({ page, context, browser }) => {
  await page.goto('/');
  const localBass = page.getByRole('listitem', { name: 'Bass' });
  await localBass.getByLabel('Seed', { exact: true }).fill('111111111');
  await localBass.getByLabel('Seed', { exact: true }).blur();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/Project saved/)).toBeVisible();

  const donorContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const donor = await donorContext.newPage();
  await donor.goto('/');
  const donorBass = donor.getByRole('listitem', { name: 'Bass' });
  await donorBass.getByLabel('Seed', { exact: true }).fill('222222222');
  await donorBass.getByLabel('Seed', { exact: true }).blur();
  await donor.getByRole('button', { name: 'Share' }).click();
  await expect(donor.getByText(/Patch link copied/)).toBeVisible();
  const sharedUrl = donor.url();
  await donorContext.close();

  const draft = await context.newPage();
  await draft.goto(sharedUrl);
  await expect(draft.getByText('Shared patch loaded locally')).toBeVisible();
  await expect(draft.getByRole('listitem', { name: 'Bass' }).getByLabel('Seed', { exact: true })).toHaveValue('222222222');
  await draft.close();

  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.getByText('Local project restored')).toBeVisible();
  await expect(reopened.getByRole('listitem', { name: 'Bass' }).getByLabel('Seed', { exact: true })).toHaveValue('111111111');
});

test('a project exports, imports identically elsewhere, and protects local-only modules', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Project' }).fill('Portable Session');
  const bass = page.getByRole('listitem', { name: 'Bass' });
  await bass.getByLabel('Seed', { exact: true }).fill('314159265');
  await bass.getByLabel('Seed', { exact: true }).blur();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error('The exported project has no readable path.');

  const recipientContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const recipient = await recipientContext.newPage();
  await recipient.goto('/');
  await recipient.locator('#project-import').setInputFiles(path);
  await expect(recipient.getByText('Project imported and saved locally')).toBeVisible();
  await expect(recipient.getByRole('textbox', { name: 'Project' })).toHaveValue('Portable Session');
  await expect(recipient.getByRole('listitem', { name: 'Bass' }).getByLabel('Seed', { exact: true })).toHaveValue('314159265');

  const localOnly = JSON.parse(await readFile(path, 'utf8')) as {
    racks: Array<{ state: { modules: Array<{ shareable: boolean }> } }>;
  };
  localOnly.racks[0]!.state.modules[0]!.shareable = false;
  await recipient.locator('#project-import').setInputFiles({
    name: 'local-only.sequens-r.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(localOnly)),
  });
  await recipient.getByRole('button', { name: 'Share' }).click();
  await expect(recipient.locator('.error')).toContainText('Drums');
  await expect(recipient.locator('.error')).toContainText('Export the project instead');
  await recipientContext.close();
});
