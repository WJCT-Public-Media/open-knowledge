export const MENU_LABELS = {
  newFile: 'New file',
  newFolder: 'New folder',
  newFromTemplate: 'New from template',
  duplicate: 'Duplicate',
  rename: 'Rename',
  revealInFinder: 'Reveal in Finder',
  openInTerminal: 'Open in Terminal',
  openWithAi: 'Open with AI',
  copyPath: 'Copy path',
  fullPath: 'Full path',
  relativePath: 'Relative path',
  showHiddenFiles: 'Show hidden files',
  showAllFiles: 'Show all files',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
} as const;

export type MenuLabelKey = keyof typeof MENU_LABELS;
