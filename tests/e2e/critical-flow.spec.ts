import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } });

test('the mobile critical path loads, plays, changes, shares, and reopens', async ({ page, context }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'sequens-R' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause' }).locator('svg')).toBeVisible();
  await expect.poll(async () => {
    const value = await page.locator('.session-status').getAttribute('data-scheduler-jitter-ms');
    return value === null || value === '' ? null : Number(value);
  }).not.toBeNull();
  const jitter = Number(await page.locator('.session-status').getAttribute('data-scheduler-jitter-ms'));
  console.log(`Chrome scheduler message jitter: ${jitter.toFixed(3)} ms σ`);
  expect(jitter).toBeLessThan(20);
  await expect(page.locator('.scheduler-jitter')).toContainText(/Scheduler jitter \d+\.\d{3} ms σ/);

  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Randomize' }).click();
  await page.getByRole('button', { name: 'Close workspace' }).click();
  const density = page.getByLabel('Density');
  await density.fill('72');
  await expect(density).toHaveValue('72');

  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByText(/Patch link copied/)).toBeVisible();
  const sharedUrl = page.url();
  expect(new URL(sharedUrl).hash).toMatch(/^#p=[A-Za-z0-9_-]+$/);

  const recipient = await context.newPage();
  recipient.on('pageerror', (error) => pageErrors.push(error));
  await recipient.goto(sharedUrl);
  await expect(recipient.getByText('Shared patch loaded locally')).toBeVisible();
  await recipient.getByRole('button', { name: 'Workspace', exact: true }).click();
  await recipient.getByRole('button', { name: 'Share' }).click();
  await expect.poll(() => new URL(recipient.url()).hash).toBe(new URL(sharedUrl).hash);
  await recipient.getByRole('button', { name: 'Close workspace' }).click();
  await recipient.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(recipient.getByRole('button', { name: 'Pause' })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('modules can change while transport is running', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator('.module-choice[data-module-type="acid"]').click();
  await expect(page.locator('article')).toHaveCount(4);
  const acid = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'acid module name' }) });
  await acid.locator('.module-menu > summary').click();
  await acid.getByRole('button', { name: 'Delete Acid' }).click();
  await expect(page.locator('article')).toHaveCount(3);

  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator('.module-choice[data-module-type="mixer"]').click();
  await page.getByRole('button', { name: 'Mute Bass from mixer' }).click();
  await expect(page.getByRole('button', { name: 'Mute Bass', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const firstStep = page.getByRole('listitem', { name: 'Drums' }).getByRole('button', { name: 'Kick, step 1', exact: true });
  const before = await firstStep.getAttribute('aria-pressed');
  await firstStep.click();
  await expect(firstStep).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Transport stopped')).toBeVisible();
});

test('the dedicated drag handle reorders modules', async ({ page }) => {
  await page.goto('/');

  for (const name of ['Drums', 'Bass', 'Chords']) await page.getByRole('button', { name: `Collapse ${name}` }).click();

  const drumsHandle = page.getByRole('button', { name: 'Reorder Drums' });
  const bassModule = page.getByRole('listitem', { name: 'Bass' });
  const start = await drumsHandle.boundingBox();
  const target = await bassModule.boundingBox();
  if (start === null || target === null) throw new Error('Reorder controls are not measurable.');

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.85, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByText('Modules reordered')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.locator('.module-name').first()).toHaveValue('Bass');
});
