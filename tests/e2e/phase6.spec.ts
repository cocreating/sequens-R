import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const labels = {
  acid: 'Acid',
  arp: 'Arp',
  cc: 'CC Control',
  euclid: 'Euclid',
  mod: 'Mod',
  piano: 'Piano roll',
  synth: 'Synth',
  drone: 'Drone',
} as const;

async function addModule(page: Page, type: keyof typeof labels): Promise<void> {
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.locator(`.module-choice[data-module-type="${type}"]`).click();
  await expect(page.getByText(`${labels[type]} added`)).toBeVisible();
}

for (const viewport of [{ width: 375, height: 667 }, { width: 375, height: 812 }]) {
  test(`adds and plays all eleven module types at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.goto('/');

    const addModuleButton = page.getByRole('button', { name: 'Add Module', exact: true });
    await expect(addModuleButton).toContainText('Add');
    expect(await addModuleButton.evaluate((button) => button.closest('.mobile-transport-dock') !== null)).toBe(true);
    const transportFieldTops = await page.locator('.mobile-context-bar .transport-fields > button:visible').evaluateAll((fields) => fields.map((field) => field.getBoundingClientRect().top));
    expect(new Set(transportFieldTops).size).toBe(1);
    await addModuleButton.click();
    await expect(page.locator('.module-choice')).toHaveCount(11);
    await page.getByRole('button', { name: 'Close module library' }).click();
    for (const type of ['acid', 'arp', 'euclid', 'piano', 'cc', 'mod', 'synth', 'drone'] as const) await addModule(page, type);
    await expect(page.locator('.module-list > article')).toHaveCount(11);

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Transport playing')).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Stop' }).click();
  });
}

test.describe('Phase 6 mobile editors', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('edits Arp and Euclid while keeping one dense mobile body expanded', async ({ page }) => {
    await page.goto('/');
    await addModule(page, 'arp');
    const arp = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'arp module name' }) });
    await expect(arp.getByLabel('Direction')).toBeVisible();
    await arp.getByLabel('Direction').selectOption({ label: 'Random' });

    await addModule(page, 'euclid');
    const euclid = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'euclid module name' }) });
    await expect(arp.getByRole('button', { name: 'Expand Arp' })).toHaveAttribute('aria-expanded', 'false');
    await expect(euclid.getByRole('spinbutton', { name: 'Ring 1 steps', exact: true })).toBeVisible();
    await euclid.getByRole('button', { name: 'Decrease Ring 1 steps' }).click();

    await arp.getByRole('button', { name: 'Expand Arp' }).click();
    await expect(arp.getByLabel('Direction')).toHaveValue('3');
    await expect(euclid.getByRole('button', { name: 'Expand Euclid' })).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('progressively discloses CC and Mod controls without removing recording or routing', async ({ page }) => {
    await page.goto('/');
    await addModule(page, 'cc');
    const cc = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'cc module name' }) });
    await cc.getByRole('button', { name: 'Record movement' }).click();
    await cc.getByLabel('Control 1 value').evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '90';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(cc.getByText('1 recorded point')).toBeVisible();
    await cc.locator('.mobile-parameter-groups > details').nth(1).locator('summary').click();
    await expect(cc.getByRole('spinbutton', { name: 'Control 2 CC', exact: true })).toBeVisible();

    await addModule(page, 'mod');
    const mod = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'mod module name' }) });
    await expect(cc.getByRole('button', { name: 'Expand CC Control' })).toHaveAttribute('aria-expanded', 'false');
    await expect(mod.getByRole('spinbutton', { name: 'LFO 1 CC', exact: true })).toBeVisible();
    await mod.locator('.mobile-parameter-groups > details').nth(1).locator('summary').click();
    await expect(mod.getByRole('checkbox', { name: 'LFO 2', exact: true })).toBeVisible();
    await mod.locator('.module-advanced > summary').click();
    await expect(mod.getByLabel('MIDI out')).toBeVisible();
    await expect(mod.getByLabel('Channel', { exact: true })).toBeVisible();
  });

  test('authors Piano notes in a full-screen editor and restores focus on close', async ({ page }) => {
    await page.goto('/');
    await addModule(page, 'piano');
    const piano = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'piano module name' }) });
    const trigger = piano.getByRole('button', { name: 'Open Piano roll editor' });
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Piano roll' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Melody tools', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Transform', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Load melody example')).toBeHidden();
    await dialog.getByText('Melody tools', { exact: true }).click();
    await expect(dialog.getByLabel('Load melody example')).toBeVisible();
    await dialog.getByText('Melody tools', { exact: true }).click();
    await expect(dialog.getByRole('group', { name: 'Length' })).toBeVisible();
    await dialog.getByRole('button', { name: '32 steps' }).click();
    await dialog.getByRole('button', { name: 'Add note' }).click();
    const note = dialog.locator('.piano-note');
    await expect(note).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Move selected note right' }).click();
    await expect(note).toHaveAttribute('aria-label', /step 2/u);
    await dialog.getByRole('button', { name: 'Lengthen selected note' }).click();
    await expect(note).toHaveAttribute('aria-label', /length 2/u);

    const viewport = dialog.locator('.piano-roll-viewport');
    expect(await viewport.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await viewport.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await dialog.evaluate((element) => Math.abs(element.getBoundingClientRect().width - innerWidth) < 1)).toBe(true);
    await expect(page.locator('.step-grid-scroll-hint').first()).toHaveText('Swipe');
    expect((await page.locator('.step-lane button').first().boundingBox())!.width).toBeGreaterThanOrEqual(40);

    await dialog.getByRole('button', { name: 'Close Piano roll editor' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('duplicates, deletes, persists, and restores a mobile-authored dense module', async ({ page }) => {
    await page.goto('/');
    await addModule(page, 'arp');
    const arp = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'arp module name' }) });
    await arp.getByLabel('Direction').selectOption({ label: 'Down' });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await arp.locator('.module-menu > summary').click();
    await arp.getByRole('button', { name: 'Move Arp earlier' }).click();
    await expect(page.getByText('Arp moved earlier')).toBeVisible();
    expect(await page.locator('.module-name').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(['Drums', 'Bass', 'Arp', 'Chords']);
    await arp.getByRole('button', { name: 'Duplicate Arp' }).click();

    await expect(page.getByRole('textbox', { name: 'arp module name' })).toHaveCount(2);
    const copy = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'arp module name' }) }).nth(1);
    await expect(copy.getByRole('textbox', { name: 'arp module name' })).toHaveValue('Arp copy');
    await copy.locator('.module-menu > summary').click();
    await copy.getByRole('button', { name: 'Delete Arp copy' }).click();
    await expect(page.getByRole('textbox', { name: 'arp module name' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Add Module', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Stop' }).click();

    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Project saved/)).toBeVisible();
    await page.reload();
    await expect(page.getByText('Local project restored')).toBeVisible();
    const restoredArp = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'arp module name' }) });
    await restoredArp.getByRole('button', { name: 'Expand Arp' }).click();
    await expect(restoredArp.getByLabel('Direction')).toHaveValue('1');
  });

  test('has no serious or critical mobile accessibility violations with the Piano dialog open', async ({ page }) => {
    await page.goto('/');
    await addModule(page, 'piano');
    await page.getByRole('button', { name: 'Open Piano roll editor' }).click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  });
});

test('uses the focused mobile shell without moving non-Piano editors into dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  const contextBar = page.getByRole('group', { name: 'Project and musical context' });
  const dock = page.getByRole('group', { name: 'Mobile transport controls' });
  await expect(contextBar).toBeVisible();
  await expect(contextBar).toContainText('New Project');
  await expect(dock).toBeVisible();
  await expect(dock).toHaveCSS('position', 'fixed');
  await expect(page.locator('.mobile-module-meta')).toHaveCount(3);
  await expect(page.locator('.mobile-module-meta').first()).toContainText('Slot 1');

  const workspaceTrigger = contextBar.getByRole('button', { name: 'Workspace', exact: true });
  await workspaceTrigger.click();
  const workspace = page.locator('#studio-workspace');
  const workspaceBox = await workspace.boundingBox();
  expect(workspaceBox!.width).toBeCloseTo(375, 0);
  expect(workspaceBox!.height).toBeCloseTo(812, 0);
  for (const section of ['Project', 'Scenes', 'Hardware', 'Export']) await expect(workspace.getByRole('link', { name: section, exact: true })).toBeVisible();
  await workspace.getByRole('button', { name: 'Close workspace' }).click();
  await expect(workspaceTrigger).toBeFocused();

  await addModule(page, 'arp');
  const arp = page.locator('article').filter({ has: page.getByRole('textbox', { name: 'arp module name' }) });
  await expect(arp.getByLabel('Direction')).toBeVisible();
  await expect(page.locator('dialog.mobile-module-editor-dialog')).toHaveCount(0);

  await page.setViewportSize({ width: 812, height: 375 });
  await expect(contextBar).toBeVisible();
  await expect(dock).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('round-trips shared Arp, Euclid, and Mod edits from desktop through mobile', async ({ browser }) => {
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const desktop = await desktopContext.newPage();
  await desktop.goto('/');
  for (const type of ['arp', 'euclid', 'mod'] as const) await addModule(desktop, type);

  const desktopArp = desktop.locator('article').filter({ has: desktop.getByRole('textbox', { name: 'arp module name' }) });
  const desktopEuclid = desktop.locator('article').filter({ has: desktop.getByRole('textbox', { name: 'euclid module name' }) });
  const desktopMod = desktop.locator('article').filter({ has: desktop.getByRole('textbox', { name: 'mod module name' }) });
  await desktopArp.getByLabel('Direction').selectOption({ label: 'Down' });
  await desktopEuclid.getByRole('button', { name: 'Decrease Ring 1 steps' }).click();
  await desktopMod.getByLabel('LFO 1 shape').selectOption({ label: 'Square' });
  await desktop.getByRole('button', { name: 'Share' }).click();
  await expect(desktop.getByText(/Patch link copied/)).toBeVisible();

  const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const mobile = await mobileContext.newPage();
  await mobile.goto(desktop.url());
  const mobileArp = mobile.locator('article').filter({ has: mobile.getByRole('textbox', { name: 'arp module name' }) });
  const mobileEuclid = mobile.locator('article').filter({ has: mobile.getByRole('textbox', { name: 'euclid module name' }) });
  const mobileMod = mobile.locator('article').filter({ has: mobile.getByRole('textbox', { name: 'mod module name' }) });
  await mobileArp.getByLabel('Direction').selectOption({ label: 'Random' });
  await mobileEuclid.getByRole('button', { name: 'Expand Euclid' }).click();
  await mobileEuclid.getByRole('button', { name: 'Decrease Ring 1 hits' }).click();
  await mobileMod.getByRole('button', { name: 'Expand Mod' }).click();
  await mobileMod.getByLabel('LFO 1 shape').selectOption({ label: 'Saw' });
  await mobile.getByRole('button', { name: 'Workspace', exact: true }).click();
  await mobile.getByRole('button', { name: 'Share' }).click();
  await expect(mobile.getByText(/Patch link copied/)).toBeVisible();
  const mobileHash = new URL(mobile.url()).hash;

  const restored = await desktopContext.newPage();
  await restored.goto(mobile.url());
  await expect(restored.locator('article').filter({ has: restored.getByRole('textbox', { name: 'arp module name' }) }).getByLabel('Direction')).toHaveValue('3');
  await expect(restored.locator('article').filter({ has: restored.getByRole('textbox', { name: 'euclid module name' }) }).getByRole('spinbutton', { name: 'Ring 1 hits', exact: true })).toHaveValue('4');
  await expect(restored.locator('article').filter({ has: restored.getByRole('textbox', { name: 'mod module name' }) }).getByLabel('LFO 1 shape')).toHaveValue('3');
  await restored.getByRole('button', { name: 'Share' }).click();
  await expect(restored.getByText(/Patch link copied/)).toBeVisible();
  expect(new URL(restored.url()).hash).toBe(mobileHash);

  await mobileContext.close();
  await desktopContext.close();
});

test('round-trips desktop-authored Piano and recorded CC project data through mobile', async ({ browser }) => {
  const authorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await authorContext.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  });
  const author = await authorContext.newPage();
  await author.goto('/');
  await addModule(author, 'piano');
  await addModule(author, 'cc');
  const authorPiano = author.locator('article').filter({ has: author.getByRole('textbox', { name: 'piano module name' }) });
  const authorCc = author.locator('article').filter({ has: author.getByRole('textbox', { name: 'cc module name' }) });
  await authorPiano.getByRole('button', { name: 'Add note' }).click();
  await authorCc.getByRole('button', { name: 'Record movement' }).click();
  await authorCc.getByLabel('Control 1 value').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '80';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await author.getByRole('button', { name: 'Workspace', exact: true }).click();
  const authorDownload = author.waitForEvent('download');
  await author.getByRole('button', { name: 'Export', exact: true }).click();
  const authorPath = await (await authorDownload).path();
  if (authorPath === null) throw new Error('Desktop project export did not produce a readable file.');

  const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const mobile = await mobileContext.newPage();
  await mobile.goto('/');
  await mobile.getByRole('button', { name: 'Workspace', exact: true }).click();
  await mobile.locator('#project-import').setInputFiles(authorPath);
  await expect(mobile.getByText('Project imported and saved locally')).toBeVisible();
  await mobile.getByRole('button', { name: 'Close workspace' }).click();
  const mobilePiano = mobile.locator('article').filter({ has: mobile.getByRole('textbox', { name: 'piano module name' }) });
  await mobilePiano.getByRole('button', { name: 'Open Piano roll editor' }).click();
  const dialog = mobile.getByRole('dialog', { name: 'Piano roll' });
  await expect(dialog.locator('.piano-note')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Add note' }).click();
  await expect(dialog.locator('.piano-note')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Close Piano roll editor' }).click();

  const mobileCc = mobile.locator('article').filter({ has: mobile.getByRole('textbox', { name: 'cc module name' }) });
  await mobileCc.getByRole('button', { name: 'Expand CC Control' }).click();
  await expect(mobileCc.getByText('1 recorded point')).toBeVisible();
  await mobileCc.getByRole('button', { name: 'Record movement' }).click();
  await mobileCc.getByLabel('Control 1 value').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '96';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(mobileCc.getByText('2 recorded points')).toBeVisible();
  await mobile.getByRole('button', { name: 'Workspace', exact: true }).click();
  const mobileDownload = mobile.waitForEvent('download');
  await mobile.getByRole('button', { name: 'Export', exact: true }).click();
  const mobilePath = await (await mobileDownload).path();
  if (mobilePath === null) throw new Error('Mobile project export did not produce a readable file.');

  const recipient = await authorContext.newPage();
  await recipient.goto('/');
  await recipient.getByRole('button', { name: 'Workspace', exact: true }).click();
  await recipient.locator('#project-import').setInputFiles(mobilePath);
  await expect(recipient.getByText('Project imported and saved locally')).toBeVisible();
  await recipient.getByRole('button', { name: 'Close workspace' }).click();
  const recipientPiano = recipient.locator('article').filter({ has: recipient.getByRole('textbox', { name: 'piano module name' }) });
  const recipientCc = recipient.locator('article').filter({ has: recipient.getByRole('textbox', { name: 'cc module name' }) });
  await recipientPiano.getByRole('button', { name: 'Expand Piano roll' }).click();
  await expect(recipientPiano.locator('.piano-note')).toHaveCount(2);
  await expect(recipientCc.getByText('2 recorded points')).toBeVisible();

  await mobileContext.close();
  await authorContext.close();
});
