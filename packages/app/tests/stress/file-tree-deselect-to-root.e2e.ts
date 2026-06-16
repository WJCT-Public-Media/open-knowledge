/**
 * Clicking the file tree's empty space "deselects" the active item *for
 * creation purposes*: New File / New Folder then land at the project root,
 * while the editor keeps showing whatever was open (the main view is
 * untouched). Selecting a row — or navigating elsewhere — re-couples creation
 * to the active item.
 *
 * Drives the real browser path: open a nested doc (so the create target is its
 * folder), click the empty tree area, and assert (a) the row deselects, (b) the
 * editor tab is unchanged, (c) a freshly created file lands at the root. A
 * contrast case pins the default — without the empty-space click, creation
 * still lands inside the active folder.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './_helpers';

const SIDEBAR = '[data-slot="sidebar-container"]';

async function clickEmptyTreeArea(page: Page): Promise<void> {
  const scroll = page.locator('[data-file-tree-virtualized-scroll]');
  await expect(scroll).toBeVisible();
  const box = await scroll.boundingBox();
  if (!box) throw new Error('tree scroll container has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);
}

async function createFileAndGetDocName(
  page: Page,
  baseURL: string,
  name: string,
): Promise<string[]> {
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  const input = page.getByRole('textbox', { name: /rename Untitled\.md/i });
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(name);
  await input.press('Enter');

  let names: string[] = [];
  await expect(async () => {
    const docs = await page.evaluate(async (url) => {
      const r = await fetch(`${url}/api/documents`);
      return r.ok ? await r.json() : null;
    }, baseURL);
    names = (docs?.documents ?? [])
      .map((d: { docName?: string; path?: string }) => d.docName ?? d.path ?? '')
      .filter(Boolean);
    expect(names.some((n) => n.endsWith(`/${name}`) || n === name)).toBe(true);
  }).toPass({ timeout: 15_000 });
  return names;
}

test.describe('file-tree deselect-to-root', () => {
  test('empty-space click deselects the row for creation but leaves the editor view', async ({
    page,
    api,
    baseURL,
  }) => {
    await api.seedDocs([
      { name: 'folder/note', markdown: '# Note\n' },
      { name: 'top', markdown: '# Top\n' },
    ]);

    await page.goto('/#/folder/note');
    const sidebar = page.locator(SIDEBAR);
    const selectedNote = sidebar.getByRole('treeitem', {
      name: 'note.md',
      exact: true,
      selected: true,
    });
    await expect(selectedNote).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/folder\/note$/, { timeout: 10_000 });

    await selectedNote.click();
    const focusedRow = page.locator('[data-item-path="folder/note.md"][data-item-focused="true"]');
    await expect(focusedRow).toHaveCount(1, { timeout: 10_000 });
    const ringColorBefore = await focusedRow.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--trees-focus-ring-color').trim(),
    );
    expect(ringColorBefore).not.toBe('transparent');
    expect(ringColorBefore.length).toBeGreaterThan(0);

    await clickEmptyTreeArea(page);

    await expect(
      sidebar.getByRole('treeitem', { name: 'note.md', exact: true, selected: true }),
    ).toHaveCount(0, { timeout: 10_000 });
    await expect(async () => {
      const ringColorAfter = await page
        .locator('[data-item-path="folder/note.md"][data-item-focused="true"]')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--trees-focus-ring-color').trim());
      expect(ringColorAfter).toBe('transparent');
    }).toPass({ timeout: 10_000 });
    await expect(sidebar.getByRole('treeitem', { name: 'note.md', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/folder\/note$/);

    const names = await createFileAndGetDocName(page, baseURL, 'created-at-root');
    expect(names).toContain('created-at-root');
    expect(names).not.toContain('folder/created-at-root');
  });

  test('without the empty-space click, New File still lands in the active folder', async ({
    page,
    api,
    baseURL,
  }) => {
    await api.seedDocs([
      { name: 'folder/note', markdown: '# Note\n' },
      { name: 'top', markdown: '# Top\n' },
    ]);

    await page.goto('/#/folder/note');
    const sidebar = page.locator(SIDEBAR);
    await expect(
      sidebar.getByRole('treeitem', { name: 'note.md', exact: true, selected: true }),
    ).toBeVisible({ timeout: 20_000 });

    const names = await createFileAndGetDocName(page, baseURL, 'created-in-folder');
    expect(names).toContain('folder/created-in-folder');
    expect(names).not.toContain('created-in-folder');
  });
});
