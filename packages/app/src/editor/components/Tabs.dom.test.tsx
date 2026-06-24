import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { readTabSlots } from './Tabs.tsx';

afterEach(cleanup);

function contentDom(childRenderers: string): string {
  return `<div class="component-children" data-node-view-content><div data-node-view-content-react>${childRenderers}</div></div>`;
}

function tabRenderer(label: string, id: string, nestedContentDom = ''): string {
  return `<div class="react-renderer node-jsxComponent"><div class="jsx-component-wrapper" data-component-type="tab"><section class="tab-panel" data-tab-label="${label}" data-tab-id="${id}">${nestedContentDom}</section></div></div>`;
}

function containerRenderer(type: string, childRenderers = ''): string {
  return `<div class="react-renderer node-jsxComponent"><div class="jsx-component-wrapper" data-component-type="${type}">${contentDom(childRenderers)}</div></div>`;
}

function nestedTabsRenderer(innerTabRenderers: string): string {
  return `<div class="react-renderer node-jsxComponent"><div class="jsx-component-wrapper" data-component-type="tabs"><div class="tabs"><div class="tabs-content" data-active-index="0">${contentDom(innerTabRenderers)}</div></div></div></div>`;
}

function mountOuterTabs(tabRenderers: string): HTMLElement {
  document.body.innerHTML = `<div class="react-renderer node-jsxComponent"><div class="jsx-component-wrapper" data-component-type="tabs"><div class="tabs"><div class="tabs-content" data-active-index="0">${contentDom(tabRenderers)}</div></div></div></div>`;
  const el = document.body.querySelector<HTMLElement>('.tabs-content');
  if (!el) throw new Error('test DOM build failed: no .tabs-content');
  return el;
}

describe('readTabSlots — counts only the Tabs own direct Tab children', () => {
  test('two plain Tabs yield exactly two slots with verbatim labels and ids', () => {
    const root = mountOuterTabs(tabRenderer('Alpha', 'alpha') + tabRenderer('Bravo', 'bravo'));

    const slots = readTabSlots(root);

    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.label)).toEqual(['Alpha', 'Bravo']);
    expect(slots.map((s) => s.panelId)).toEqual(['alpha', 'bravo']);
  });

  test('a single nested container inside a Tab does not add a phantom slot', () => {
    const tab1 = tabRenderer(
      'Alpha',
      'alpha',
      contentDom(containerRenderer('callout', '<p>prereq</p>')),
    );
    const root = mountOuterTabs(tab1 + tabRenderer('Bravo', 'bravo'));

    const slots = readTabSlots(root);

    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.label)).toEqual(['Alpha', 'Bravo']);
    expect(slots.map((s) => s.panelId)).toEqual(['alpha', 'bravo']);
  });

  test('the quickstart shape (Tab 1 = Callout + Steps with multiple Steps) yields two slots', () => {
    const steps = containerRenderer(
      'steps',
      containerRenderer('step', '<h3>Install</h3>') +
        containerRenderer('step', '<h3>Create</h3>') +
        containerRenderer('step', '<h3>Initialize</h3>') +
        containerRenderer('step', '<h3>Open</h3>'),
    );
    const tab1 = tabRenderer(
      'macOS app',
      'macos',
      contentDom(containerRenderer('callout', '<ul><li>prereq</li></ul>') + steps),
    );
    const root = mountOuterTabs(tab1 + tabRenderer('Web app', 'web'));

    const slots = readTabSlots(root);

    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.label)).toEqual(['macOS app', 'Web app']);
  });

  test('a nested Tabs inside a Tab contributes no slots to the outer strip', () => {
    const innerTabs = nestedTabsRenderer(
      tabRenderer('Inner one', 'inner-1') + tabRenderer('Inner two', 'inner-2'),
    );
    const tab1 = tabRenderer('Outer one', 'outer-1', contentDom(innerTabs));
    const root = mountOuterTabs(tab1 + tabRenderer('Outer two', 'outer-2'));

    const slots = readTabSlots(root);

    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.label)).toEqual(['Outer one', 'Outer two']);
    expect(slots.map((s) => s.panelId)).toEqual(['outer-1', 'outer-2']);
  });

  test('a non-Tab block at the top level falls back to a numbered label with null id', () => {
    const root = mountOuterTabs(
      tabRenderer('Real', 'real') + containerRenderer('callout', '<p>note</p>'),
    );

    const slots = readTabSlots(root);

    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({ label: 'Real', panelId: 'real' });
    expect(slots[1]).toMatchObject({ label: 'Tab 2', panelId: null });
  });

  test('an empty Tabs yields zero slots', () => {
    expect(readTabSlots(mountOuterTabs(''))).toHaveLength(0);
  });
});
