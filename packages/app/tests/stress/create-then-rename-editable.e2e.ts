/**
 * RED test: WYSIWYG editor must be interactive after the
 * create → inline-rename → click → type sequence.
 *
 * Bug: clicking the FileTree `+` button opens an inline rename input against
 * the default placeholder name (`Untitled.md`). Typing a new name into that
 * input and pressing Enter commits a rename of the newly-created file before
 * `/api/pages` has refetched, before the editor pool has registered the new
 * docName, and across the warm-skeleton Suspense fallback path. The combined
 * effect is that the user lands on a visually-blank, non-interactive editor
 * surface — keystrokes are silently dropped — until they perform a workaround
 * (click another doc and back). The footer's `useDocumentStats` counter
 * confirms zero bytes reached `Y.Text('source')`.
 *
 * Multi-assertion structure localizes which proximate cause fires:
 *   (a) `.ProseMirror` contains the typed sentinel — keystrokes reached
 *       the editor view (rules out warm-fallback `pointer-events-none`
 *       intercepting clicks/keys).
 *   (b) `window.__activeProvider.document.getText('source')` contains the
 *       sentinel — the WYSIWYG → Y.Text bridge fired. Mirrors the footer's
 *       useDocumentStats counter — zero bytes here means the bridge never
 *       fired.
 *   (c) `window.__activeEditor.isEditable === true` — distinguishes
 *       "view destroyed" from "view exists but not editable".
 *   (d) No `.tiptap-editor[aria-hidden="true"]` element survives —
 *       distinguishes a warm fallback masking the real editor from a
 *       Suspense fallback that never unsuspends.
 *
 * Test tier: Playwright E2E (NOT integration). The bug lives in the React +
 * Suspense + ProseMirror + Hocuspocus lifecycle interaction; the integration
 * harness at `packages/app/tests/integration/test-harness.ts` exercises only
 * the server + provider-pool + observers, and would silently pass.
 */
import { expect, test } from './_helpers';

const SENTINEL = 'HelloWorldUniqueSentinel987';

test.describe('create → inline-rename → click → type', () => {
  test('newly-created file is editable on first click after inline rename', async ({
    page,
    workerServer,
  }) => {
    const uniqueName = `dhx-${Math.random().toString(36).slice(2, 10)}`;

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const sidebar = page.locator('[data-slot="sidebar-container"]');
    await expect(sidebar.getByRole('treeitem').first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'New file', exact: true }).click();
    const renameInput = page.getByRole('textbox', { name: /rename Untitled/i });
    await expect(renameInput).toBeVisible({ timeout: 10_000 });

    await renameInput.fill(uniqueName);
    await renameInput.press('Enter');

    await expect(
      sidebar.getByRole('treeitem', { name: `${uniqueName}.md`, exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .locator('[data-active-tab="true"]')
        .getByRole('button', { name: `${uniqueName}.md`, exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    const proseMirror = page.locator('.ProseMirror').first();
    await expect(proseMirror).toBeVisible({ timeout: 10_000 });
    await proseMirror.click();

    await page.keyboard.insertText(SENTINEL);

    await expect(proseMirror).toContainText(SENTINEL, { timeout: 5_000 });

    await page.waitForFunction(
      (s) => window.__activeProvider?.document?.getText('source')?.toString()?.includes(s) ?? false,
      SENTINEL,
      { timeout: 5_000 },
    );

    const isEditable = await page.evaluate(() => window.__activeEditor?.isEditable);
    expect(isEditable).toBe(true);

    const stuckWarmFallbackCount = await page.locator('.tiptap-editor[aria-hidden="true"]').count();
    expect(stuckWarmFallbackCount).toBe(0);

    expect(workerServer.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
