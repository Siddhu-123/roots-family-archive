import { expect, test, type Locator, type Page } from '@playwright/test';

const views = ['Family tree', 'Members', 'Memories', 'Conversations', 'Timeline', 'Backups', 'Settings'];
const screenshots = process.env.ROOTS_UI_ARTIFACTS || '/tmp/roots-browser-final';

async function settleTree(page: Page) {
  let previous = '', stable = 0;
  await expect.poll(async () => {
    const transform = await page.locator('.react-flow__viewport').getAttribute('style') || '';
    stable = transform === previous ? stable + 1 : 0;
    previous = transform;
    return stable;
  }, { intervals: [100], timeout: 5_000 }).toBeGreaterThanOrEqual(4);
}

async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Rao family' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add member', exact: true })).toBeVisible();
}

function nav(page: Page, name: string): Locator {
  const buttonName = name === 'Members' ? /^Members(?: \d+)?$/ : name;
  return page.getByRole('navigation', { name: 'Archive navigation' }).getByRole('button', { name: buttonName, exact: typeof buttonName === 'string' });
}

function dialog(page: Page): Locator {
  return page.getByRole('dialog');
}

function givenName(scope: Page | Locator): Locator {
  return scope.getByLabel(/Given name \/ name/);
}

function surname(scope: Page | Locator): Locator {
  return scope.getByLabel(/Surname \/ family name/);
}

async function addMember(page: Page, name: string, familyName = '') {
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  const form = dialog(page);
  await givenName(form).fill(name);
  if (familyName) await surname(form).fill(familyName);
  await form.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(page.getByRole('button', { name: `View ${[name, familyName].filter(Boolean).join(' ')}`, exact: true })).toBeVisible();
}

async function openConnect(page: Page, from: string, to: string, type = 'parent') {
  await page.getByRole('button', { name: 'Connect members', exact: true }).click();
  const form = dialog(page);
  await form.getByLabel('First member').selectOption({ label: from });
  await form.getByRole('combobox', { name: 'Relationship', exact: true }).selectOption(type);
  await form.getByLabel('Second member').selectOption({ label: to });
  return form;
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
}

test('all seven views load without browser console or page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await start(page);

  for (const view of views) {
    const control = nav(page, view);
    await expect(control).toBeVisible();
    await control.click();
    await expect(page.getByRole('heading', { name: view === 'Family tree' ? 'The Rao family' : view, exact: true })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Roots needs to reload this view');
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('creates and reloads a member with only a name', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  const form = dialog(page);
  await givenName(form).fill('Nila Minimal');
  await form.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nila Minimal' })).toBeVisible();
  await page.reload();
  await nav(page, 'Members').click();
  await page.getByRole('button', { name: 'View Nila Minimal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nila Minimal' })).toBeVisible();
});

test('edits and reloads a member, rejects a stale tab edit, and preserves its draft', async ({ page, context }) => {
  await start(page);
  const savedGivenName = 'శ్రీదేవి';
  const savedSurname = 'రావు';
  const savedDisplayName = [savedGivenName, savedSurname].join(' ');
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  let form = dialog(page);
  await givenName(form).fill(savedGivenName);
  await surname(form).fill(savedSurname);
  await form.getByLabel('Name in native script').fill('श्रीदेवी राव');
  await form.getByRole('tab', { name: 'Heritage', exact: true }).click();
  await form.getByLabel('Gothram / gotra').fill('వశిష్ఠ');
  await form.getByRole('tab', { name: 'Essentials', exact: true }).click();
  await form.getByLabel('Birth precision').selectOption('year');
  await form.getByLabel('Birth', { exact: true }).fill('1902');
  await form.getByLabel('Approximate / as remembered').check();
  await form.getByRole('tab', { name: 'Life & sources', exact: true }).click();
  await form.getByLabel('Information shared by / source').fill('Family archive');
  await form.getByRole('button', { name: 'Save member', exact: true }).click();

  await expect(form).toHaveCount(0);
  await expect(form.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: savedDisplayName, exact: true })).toBeVisible();
  await page.reload();
  await nav(page, 'Members').click();
  await page.getByRole('button', { name: `View ${savedDisplayName}`, exact: true }).click();
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  form = dialog(page);
  await expect(givenName(form)).toHaveValue(savedGivenName);
  await expect(surname(form)).toHaveValue(savedSurname);
  await expect(form.getByLabel('Name in native script')).toHaveValue('श्रीदेवी राव');
  await expect(form.getByLabel('Birth precision')).toHaveValue('year');
  await expect(form.getByLabel('Birth', { exact: true })).toHaveValue('1902');
  await expect(form.getByLabel('Approximate / as remembered')).toBeChecked();
  await form.getByRole('tab', { name: 'Heritage', exact: true }).click();
  await expect(form.getByLabel('Gothram / gotra')).toHaveValue('వశిష్ఠ');
  await form.getByRole('tab', { name: 'Life & sources', exact: true }).click();
  await expect(form.getByLabel('Information shared by / source')).toHaveValue('Family archive');

  const staleTab = await context.newPage();
  await start(staleTab);
  await nav(staleTab, 'Members').click();
  await staleTab.getByRole('button', { name: `View ${savedDisplayName}`, exact: true }).click();
  await staleTab.getByRole('button', { name: 'Edit details', exact: true }).click();
  const staleForm = dialog(staleTab);
  await givenName(staleForm).fill('Saved from the second tab');
  await staleForm.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(staleForm).toHaveCount(0);
  await expect(staleForm.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Saved from the second tab' })).toHaveCount(1);

  await form.getByRole('tab', { name: 'Essentials', exact: true }).click();
  await givenName(form).fill('Local draft must survive');
  await form.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('This person changed in another tab.');
  await expect(givenName(form)).toHaveValue('Local draft must survive');
});

test('rejects an invalid year and a missing name without closing the editor', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  const form = dialog(page);
  await givenName(form).fill('Date Check');
  await form.getByLabel('Birth precision').selectOption('year');
  await form.getByLabel('Birth', { exact: true }).fill('0');
  await form.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(form.getByText('Enter a year from 1 to 9999.')).toBeVisible();
  await expect(form).toBeVisible();

  await form.getByLabel('Birth precision', { exact: true }).selectOption('unknown');
  await givenName(form).fill('');
  await form.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(form.getByText('Enter a name.')).toBeVisible();
});

test('rejects self and cyclic parent links in the connect dialog', async ({ page }) => {
  await start(page);
  await nav(page, 'Members').click();
  await addMember(page, 'Asha Cycle');
  await nav(page, 'Members').click();
  await addMember(page, 'Bala Cycle');

  let form = await openConnect(page, 'Asha Cycle', 'Bala Cycle');
  await form.getByLabel('First member').selectOption({ label: 'Bala Cycle' });
  await form.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('A person cannot be related to themselves.');
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();

  form = await openConnect(page, 'Asha Cycle', 'Bala Cycle');
  await form.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);

  form = await openConnect(page, 'Bala Cycle', 'Asha Cycle');
  await form.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('loop in the ancestry');
});

test('saves and edits a memory shared by two family members', async ({ page }) => {
  await start(page);
  await nav(page, 'Memories').click();
  await page.getByRole('button', { name: 'Add memory', exact: true }).click();
  let form = dialog(page);
  await form.getByLabel('Title').fill('Summer gathering');
  await form.getByLabel('The story').fill('Everyone gathered by the old mango tree.');
  await form.getByRole('checkbox', { name: 'Savitri Rao' }).check();
  await form.getByRole('checkbox', { name: 'Krishna Rao' }).check();
  await form.getByRole('button', { name: 'Save memory', exact: true }).click();

  await page.getByRole('button', { name: /Summer gathering/ }).click();
  await expect(dialog(page)).toContainText('Everyone gathered by the old mango tree.');
  await dialog(page).getByRole('button', { name: 'Edit memory', exact: true }).click();
  form = dialog(page);
  await expect(form.getByRole('checkbox', { name: 'Savitri Rao' })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: 'Krishna Rao' })).toBeChecked();
  await form.getByLabel('The story').fill('Everyone gathered under the old mango tree.');
  await form.getByRole('button', { name: 'Save memory', exact: true }).click();
  await expect(page.getByRole('button', { name: /Summer gathering/ })).toContainText('Everyone gathered under the old mango tree.');
});

test('captures an actual conversation and preserves it in memories', async ({ page }) => {
  await start(page);
  await nav(page, 'Conversations').click();
  await page.getByLabel('Speaking with').fill('Savitri Rao');
  const answer = page.getByLabel('Notes from the conversation');
  await answer.fill('She remembered making dosas with her sisters on festival mornings.');
  await page.getByRole('button', { name: 'Surnames through the years', exact: true }).click();
  await answer.fill('The women used their birth surnames before marriage.');
  await page.getByRole('button', { name: 'The names we remember', exact: true }).click();
  await expect(answer).toHaveValue('She remembered making dosas with her sisters on festival mornings.');
  await page.getByRole('button', { name: 'Surnames through the years', exact: true }).click();
  await expect(answer).toHaveValue('The women used their birth surnames before marriage.');
  await page.getByRole('button', { name: 'The names we remember', exact: true }).click();
  await expect(answer).toHaveValue('She remembered making dosas with her sisters on festival mornings.');
  await page.getByRole('button', { name: 'Save conversation', exact: true }).click();
  await expect(page.getByText('Preserved in family memories')).toBeVisible();
  const savedRow = page.locator('.saved-conversations .conversation-row').filter({ hasText: 'The names we remember' });
  await expect(savedRow).toBeVisible();
  await nav(page, 'Memories').click();
  const memoryCard = page.locator('.memory-card').filter({ hasText: 'The names we remember' });
  await expect(memoryCard).toContainText('She remembered making dosas with her sisters');
});

test('exports a ZIP and restores it through the real import preview', async ({ page }) => {
  await start(page);
  await nav(page, 'Backups').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export complete ZIP', exact: true }).click();
  const download = await downloadPromise;
  const archivePath = `${test.info().outputDir}/family-export.zip`;
  await download.saveAs(archivePath);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  let bytes = 0;
  for await (const chunk of stream!) bytes += chunk.length;
  expect(bytes).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Import records or backup', exact: true }).click();
  await page.getByLabel('Choose ZIP, JSON, or GEDCOM').setInputFiles(archivePath);
  const preview = page.locator('.backup-preview');
  await expect(preview).toContainText('ZIP backup import preview');
  await expect(preview).toContainText('The Rao family');
  await expect(preview).toContainText('12 members');
  await preview.getByRole('button', { name: 'Review replacement', exact: true }).click();
  const confirmation = dialog(page);
  await expect(confirmation).toContainText('recovery snapshot first');
  await confirmation.getByRole('button', { name: 'Replace archive', exact: true }).click();
  await expect(page.locator('.backup-preview')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Backups', exact: true })).toBeVisible();
  const imported = page.locator('.snapshot-row').filter({ hasText: 'Imported The Rao family' });
  await expect(imported).toContainText('12 members');
  await expect(imported).toContainText('3 memories');
  await nav(page, 'Family tree').click();
  await expect(page.getByRole('heading', { name: 'The Rao family', exact: true })).toBeVisible();
});

test('larger text persists after reload', async ({ page }) => {
  await start(page);
  await nav(page, 'Settings').click();
  await page.getByLabel('Text size').selectOption('large');
  await expect(page.locator('.app-shell')).toHaveClass(/text-large/);
  await page.reload();
  await nav(page, 'Settings').click();
  await expect(page.getByLabel('Text size')).toHaveValue('large');
  await expect(page.locator('.app-shell')).toHaveClass(/text-large/);
});

test('starting a family snapshots the sample archive before replacing it', async ({ page }) => {
  await start(page);
  await expect(page.locator('.stat-band')).toContainText('12');
  await expect(page.locator('.stat-band')).toContainText('3');
  await page.getByRole('button', { name: 'Start my family', exact: true }).click();
  const form = dialog(page);
  await expect(form).toContainText('replaces the sample records');
  await form.getByLabel('Family archive title').fill('Asha’s Archive');
  await form.getByRole('button', { name: 'Start my family', exact: true }).click();
  const firstPerson = dialog(page);
  await expect(firstPerson.getByRole('heading', { name: 'Add family member', exact: true })).toBeVisible();
  await firstPerson.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Asha’s Archive' })).toBeVisible();
  await nav(page, 'Backups').click();
  const snapshot = page.locator('.snapshot-row').filter({ hasText: 'Started Asha’s Archive' });
  await expect(snapshot).toContainText('12 members');
  await expect(snapshot).toContainText('3 memories');
});

test('mobile navigation, profile, editor, and dialog fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await noHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await dialog(page).getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'View Savitri Rao', exact: true }).click();
  const profile = dialog(page);
  await expect(profile).toHaveAttribute('aria-labelledby', /radix/);
  await expect(profile).toContainText('Savitri Rao');
  await noHorizontalOverflow(page);
  const profileBox = await profile.boundingBox();
  expect(profileBox).not.toBeNull();
  expect(profileBox!.x + profileBox!.width).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: 'Add relative', exact: true }).click();
  const editor = dialog(page);
  await givenName(editor).fill('Mobile Draft');
  await noHorizontalOverflow(page);
  const editorBox = await editor.boundingBox();
  expect(editorBox).not.toBeNull();
  expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(390);
});

test('desktop tree renders member nodes, relationships, and responsive zoom', async ({ page }) => {
  await start(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(12);
  await expect(page.locator('.react-flow__edge')).toHaveCount(18);
  await expect(page.locator('.react-flow__minimap svg rect.react-flow__minimap-node').first()).toBeVisible();
  const member = page.getByRole('button', { name: 'View Savitri Rao', exact: true });
  const profile = page.getByRole('complementary', { name: 'Savitri Rao profile' });
  await member.click();
  await expect(profile).toBeVisible();
  await profile.getByRole('button', { name: 'Close member details' }).click();
  await expect(profile).toHaveCount(0);
  await member.focus();
  await member.press('Enter');
  await expect(profile).toBeVisible();
  const zoom = page.locator('.canvas-controls > span').first();
  const initialZoom = await zoom.textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoom).not.toHaveText(initialZoom || '');
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeEnabled();
});

test('captures full desktop archive, profile, and populated editor screenshots', async ({ page }) => {
  await start(page);
  await settleTree(page);
  await page.screenshot({ path: `${screenshots}/desktop-archive.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'View Savitri Rao', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Savitri Rao profile' })).toBeVisible();
  await settleTree(page);
  await page.screenshot({ path: `${screenshots}/desktop-profile.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  const editor = dialog(page);
  await givenName(editor).fill('Savitri');
  await surname(editor).fill('Rao');
  await editor.getByRole('tab', { name: 'Heritage', exact: true }).click();
  await editor.getByLabel('Gothram / gotra').fill('Kashyapa');
  await page.screenshot({ path: `${screenshots}/desktop-populated-editor.png`, fullPage: true, animations: 'disabled' });
});

test('captures full mobile archive, profile, and populated editor screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await settleTree(page);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `${screenshots}/mobile-archive.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'View Savitri Rao', exact: true }).click();
  await expect(dialog(page).getByRole('heading', { name: 'Member profile' })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/mobile-profile.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  const editor = dialog(page);
  await givenName(editor).fill('Savitri');
  await surname(editor).fill('Rao');
  await editor.getByRole('tab', { name: 'Heritage', exact: true }).click();
  await editor.getByLabel('Gothram / gotra').fill('Kashyapa');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `${screenshots}/mobile-populated-editor.png`, fullPage: true, animations: 'disabled' });
});
