import { readFile } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } });

// The studio refresh (AD-017) reserves the signal colour for playing, armed and
// selected states and renders them as a fill: it is never a border. This
// asserts the same intent against the background it now paints.
async function expectPlayingFill(button: Locator): Promise<void> {
  const colors = await button.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--signal)';
    element.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { actual: getComputedStyle(element).backgroundColor, expected };
  });
  expect(colors.actual).toBe(colors.expected);
}

test('activated buttons use the playing color as their fill', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const bass = page.getByRole('listitem', { name: 'Bass' });

  await expectPlayingFill(bass.getByRole('button', { name: 'Bass slot 1' }));
  await expectPlayingFill(bass.locator('.step-lane button[aria-pressed="true"]').first());

  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await expectPlayingFill(page.locator('.rack-tabs button[aria-selected="true"]'));
});

test('lists and loads a bundled demo project', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
  await expect(page.locator('.import-project')).toBeVisible();
  await page.getByRole('button', { name: 'Demos projects' }).click();
  await expect(page.getByRole('heading', { name: 'Demos projects' })).toBeVisible();
  await expect(page.locator('.demo-projects-list button')).toHaveCount(20);
  for (const [genre, count] of [['Minimal Techno', 7], ['Minimal House Techno', 7], ['Ambient Techno & Breakbeats', 6]] as const) {
    const group = page.locator('.demo-projects-group').filter({ has: page.getByRole('heading', { name: genre, exact: true }) });
    await expect(group).toBeVisible();
    await expect(group.locator('.demo-projects-list button')).toHaveCount(count);
  }
  await expect(page.getByRole('button', { name: /Sequencer Field/u })).toBeVisible();
  await page.locator('.demo-projects-list button').filter({ has: page.getByText('Basement Ledger', { exact: true }) }).click();
  await expect(page.getByText('Basement Ledger demo loaded and saved locally')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Project' })).toHaveValue('Basement Ledger');
  await expect(page.getByRole('listitem', { name: 'Ledger Grid' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Sub Anchor' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Hollow Cell' })).toBeVisible();
});

test('slots, editable seeds, mutate, and revert stay deterministic', async ({ page }) => {
  await page.goto('/');
  const bass = page.getByRole('listitem', { name: 'Bass' });
  await bass.locator('.module-advanced > summary').click();
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

  await bass.getByRole('checkbox', { name: 'Auto mutate' }).check();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => seed.inputValue(), { timeout: 5000 }).not.toBe(firstSeed);
  await expect(page.getByText('Scheduled mutation applied')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
});

test('continuous parameter input is one undo step', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
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

test('rotary parameters support fine drag, keyboard input, reset, and undo boundaries', async ({ page }) => {
  await page.goto('/');
  const density = page.getByRole('listitem', { name: 'Bass' }).getByLabel('Density');
  await expect(density).toHaveAttribute('type', 'range');
  await expect(density).toHaveAttribute('aria-valuetext', '55 %');
  await density.scrollIntoViewIfNeeded();

  const bounds = await density.boundingBox();
  if (bounds === null) throw new Error('The Density knob is not measurable.');
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(centerX, centerY - 20, { steps: 4 });
  await page.keyboard.up('Shift');
  await page.mouse.up();
  await expect(density).toHaveValue('57');
  await expect(density).toHaveAttribute('aria-valuetext', '57 %');

  await density.focus();
  await page.keyboard.press('ArrowUp');
  await expect(density).toHaveValue('58');

  await density.dblclick();
  await expect(density).toHaveValue('55');

  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(density).toHaveValue('58');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(density).toHaveValue('57');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(density).toHaveValue('55');
});

test('saving restores the exact project after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project' }).fill('Persistent Session');
  await page.getByRole('button', { name: 'Close workspace' }).click();
  await page.getByRole('button', { name: /^Tempo \d+ BPM$/u }).click();
  await page.getByRole('spinbutton', { name: 'Tempo' }).fill('138');
  await page.getByRole('spinbutton', { name: 'Tempo' }).blur();
  await page.getByRole('button', { name: 'Close tempo controls' }).click();
  const bass = page.getByRole('listitem', { name: 'Bass' });
  await bass.locator('.module-advanced > summary').click();
  await bass.getByRole('button', { name: 'Bass slot 3' }).click();
  await bass.getByLabel('Seed', { exact: true }).fill('987654321');
  await bass.getByLabel('Seed', { exact: true }).blur();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/Project saved/)).toBeVisible();

  await page.reload();
  await expect(page.getByText('Local project restored')).toBeVisible();
  await page.getByRole('button', { name: /^Tempo \d+ BPM$/u }).click();
  await expect(page.getByRole('spinbutton', { name: 'Tempo' })).toHaveValue('138');
  await page.getByRole('button', { name: 'Close tempo controls' }).click();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Project' })).toHaveValue('Persistent Session');
  await page.getByRole('button', { name: 'Close workspace' }).click();
  const restoredBass = page.getByRole('listitem', { name: 'Bass' });
  await restoredBass.locator('.module-advanced > summary').click();
  await expect(restoredBass.getByRole('button', { name: 'Bass slot 3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(restoredBass.getByLabel('Seed', { exact: true })).toHaveValue('987654321');
});

test('opening a shared link remains a draft and does not overwrite the local project', async ({ page, context, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Close workspace' }).click();
  const localBass = page.getByRole('listitem', { name: 'Bass' });
  await localBass.locator('.module-advanced > summary').click();
  await localBass.getByLabel('Seed', { exact: true }).fill('111111111');
  await localBass.getByLabel('Seed', { exact: true }).blur();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/Project saved/)).toBeVisible();

  const donorContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const donor = await donorContext.newPage();
  await donor.goto('/');
  const donorBass = donor.getByRole('listitem', { name: 'Bass' });
  await donorBass.locator('.module-advanced > summary').click();
  await donorBass.getByLabel('Seed', { exact: true }).fill('222222222');
  await donorBass.getByLabel('Seed', { exact: true }).blur();
  await donor.getByRole('button', { name: 'Workspace', exact: true }).click();
  await donor.getByRole('button', { name: 'Share' }).click();
  await expect(donor.getByText(/Patch link copied/)).toBeVisible();
  const sharedUrl = donor.url();
  await donorContext.close();

  const draft = await context.newPage();
  await draft.goto(sharedUrl);
  await expect(draft.getByText('Shared patch loaded locally')).toBeVisible();
  await draft.getByRole('listitem', { name: 'Bass' }).locator('.module-advanced > summary').click();
  await expect(draft.getByRole('listitem', { name: 'Bass' }).getByLabel('Seed', { exact: true })).toHaveValue('222222222');
  await draft.close();

  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.getByText('Local project restored')).toBeVisible();
  await reopened.getByRole('listitem', { name: 'Bass' }).locator('.module-advanced > summary').click();
  await expect(reopened.getByRole('listitem', { name: 'Bass' }).getByLabel('Seed', { exact: true })).toHaveValue('111111111');
});

test('a project exports, imports identically elsewhere, and protects local-only modules', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project' }).fill('Portable Session');
  await page.getByRole('button', { name: 'Close workspace' }).click();
  const bass = page.getByRole('listitem', { name: 'Bass' });
  await bass.locator('.module-advanced > summary').click();
  await bass.getByLabel('Seed', { exact: true }).fill('314159265');
  await bass.getByLabel('Seed', { exact: true }).blur();

  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error('The exported project has no readable path.');

  const recipientContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const recipient = await recipientContext.newPage();
  await recipient.goto('/');
  await recipient.getByRole('button', { name: 'Workspace', exact: true }).click();
  await recipient.locator('#project-import').setInputFiles(path);
  await expect(recipient.getByText('Project imported and saved locally')).toBeVisible();
  await expect(recipient.getByRole('textbox', { name: 'Project' })).toHaveValue('Portable Session');
  await recipient.getByRole('button', { name: 'Close workspace' }).click();
  await recipient.getByRole('listitem', { name: 'Bass' }).locator('.module-advanced > summary').click();
  await expect(recipient.getByRole('listitem', { name: 'Bass' }).getByLabel('Seed', { exact: true })).toHaveValue('314159265');

  const localOnly = JSON.parse(await readFile(path, 'utf8')) as {
    racks: Array<{ state: { modules: Array<{ shareable: boolean }> } }>;
  };
  localOnly.racks[0]!.state.modules[0]!.shareable = false;
  await recipient.getByRole('button', { name: 'Workspace', exact: true }).click();
  await recipient.locator('#project-import').setInputFiles({
    name: 'local-only.sequens-r.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(localOnly)),
  });
  await recipient.getByRole('button', { name: 'Close workspace' }).click();
  await recipient.getByRole('button', { name: 'Workspace', exact: true }).click();
  await recipient.getByRole('button', { name: 'Share' }).click();
  await expect(recipient.locator('.error')).toContainText('Drums');
  await expect(recipient.locator('.error')).toContainText('Export the project instead');
  await recipientContext.close();
});
