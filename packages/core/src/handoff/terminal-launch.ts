import type { HandoffTarget } from './types.ts';

export function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export type TerminalCli = 'claude' | 'codex' | 'cursor';

export interface TerminalCliInfo {
  /** PATH binary launched in the PTY. The ONLY value interpolated into the
   *  fixed `<bin> '<prompt>'` shape — a fixed registry value, never user input. */
  readonly bin: string;
  readonly displayName: string;
  readonly docsUrl: string;
  /** The handoff target this CLI maps to for prompt composition (shared with
   *  the deep-link path) and brand-icon rendering. Single source of truth so
   *  the renderer doesn't re-declare a parallel `cli → HandoffTarget` map. */
  readonly handoffTarget: HandoffTarget;
}

export const TERMINAL_CLIS = {
  claude: {
    bin: 'claude',
    displayName: 'Claude',
    docsUrl: 'https://docs.claude.com/en/docs/claude-code',
    handoffTarget: 'claude-code',
  },
  codex: {
    bin: 'codex',
    displayName: 'Codex',
    docsUrl: 'https://developers.openai.com/codex/cli',
    handoffTarget: 'codex',
  },
  cursor: {
    bin: 'cursor-agent',
    displayName: 'Cursor',
    docsUrl: 'https://cursor.com/docs/cli/overview',
    handoffTarget: 'cursor',
  },
} as const satisfies Record<TerminalCli, TerminalCliInfo>;

export const TERMINAL_CLI_IDS = [
  'claude',
  'codex',
  'cursor',
] as const satisfies readonly TerminalCli[];

export function buildCliLaunchCommand(cli: TerminalCli, prompt: string): string {
  return `${TERMINAL_CLIS[cli].bin} ${shellSingleQuote(prompt)}\r`;
}

export function buildClaudeLaunchCommand(prompt: string): string {
  return buildCliLaunchCommand('claude', prompt);
}
