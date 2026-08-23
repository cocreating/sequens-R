import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } });

test('the mobile critical path loads, plays, changes, shares, and reopens', async ({ page, context }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'sequens-R' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Playing' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const value = await page.locator('.session-status').getAttribute('data-scheduler-jitter-ms');
    return value === null || value === '' ? null : Number(value);
  }).not.toBeNull();
  const jitter = Number(await page.locator('.session-status').getAttribute('data-scheduler-jitter-ms'));
  console.log(`Chrome scheduler message jitter: ${jitter.toFixed(3)} ms σ`);
  expect(jitter).toBeLessThan(20);

  await page.getByRole('button', { name: 'Random' }).click();
  const density = page.getByLabel('Density');
  await density.fill('72');
  await expect(density).toHaveValue('72');

  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByText(/Patch link copied/)).toBeVisible();
  const sharedUrl = page.url();
  expect(new URL(sharedUrl).hash).toMatch(/^#p=[A-Za-z0-9_-]+$/);

  const recipient = await context.newPage();
  recipient.on('pageerror', (error) => pageErrors.push(error));
  await recipient.goto(sharedUrl);
  await expect(recipient.getByText('Shared patch loaded locally')).toBeVisible();
  await recipient.getByRole('button', { name: 'Share' }).click();
  await expect.poll(() => new URL(recipient.url()).hash).toBe(new URL(sharedUrl).hash);
  await recipient.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(recipient.getByRole('button', { name: 'Playing' })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('modules can change while transport is running', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('New module').selectOption('acid');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Delete Acid' }).click();
  await expect(page.locator('article')).toHaveCount(3);

  await page.getByLabel('New module').selectOption('mixer');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Mute Bass from mixer' }).click();
  await expect(page.getByRole('button', { name: 'Mute Bass', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const firstStep = page.getByRole('listitem', { name: 'Drums' }).getByRole('button', { name: 'Lane 1, step 1', exact: true });
  const before = await firstStep.getAttribute('aria-pressed');
  await firstStep.click();
  await expect(firstStep).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Transport stopped')).toBeVisible();
});
