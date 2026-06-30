import { spawn as nodeSpawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MANAGED_ARTIFACT_SCOPES, type SkillScope } from '@inkeep/open-knowledge-core';
import {
  encodeDocName,
  encodeFolderRoute,
  encodeSkillRoute,
  resolveLockDir,
  resolveUiInfo,
} from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { createRealDetectDeps, type DetectResult, detectDesktop } from './desktop-dispatch.ts';

export interface OpenOptions {
  skill?: boolean;
  scope?: string;
  project?: string;
}

export interface OpenDeps {
  detectBundlePath: () => string | null;
  resolveBaseUrl: (projectDir: string) => string | null;
  classifyName: (projectDir: string, name: string) => 'doc' | 'folder';
  openTarget: (target: string) => void;
  log: (message: string) => void;
  error: (message: string) => void;
}

export function scrubElectronRunAsNode(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  delete next.ELECTRON_RUN_AS_NODE;
  return next;
}

export function createRealOpenDeps(
  detect: () => DetectResult = () => detectDesktop(createRealDetectDeps()),
): OpenDeps {
  return {
    detectBundlePath: () => detect().bundlePath ?? null,
    resolveBaseUrl: (projectDir) => resolveUiInfo({ lockDir: resolveLockDir(projectDir) }).baseUrl,
    classifyName: (projectDir, name) => {
      const abs = join(projectDir, name);
      try {
        return statSync(abs).isDirectory() ? 'folder' : 'doc';
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          process.stderr.write(
            `[ok open] statSync failed for ${abs} (${code ?? 'unknown'}); treating as a doc\n`,
          );
        }
        return 'doc';
      }
    },
    openTarget: (target) => {
      const child = nodeSpawn('open', [target], {
        detached: true,
        stdio: 'ignore',
        env: scrubElectronRunAsNode(process.env),
      });
      child.unref();
    },
    log: (message) => process.stdout.write(`${message}\n`),
    error: (message) => process.stderr.write(`${message}\n`),
  };
}

function isUnsafeName(name: string): boolean {
  return name.startsWith('/') || name.includes('\\') || name.split('/').includes('..');
}

function noTargetError(deps: OpenDeps): number {
  deps.error(
    'No OpenKnowledge desktop app found and no UI is running. ' +
      'Install OK Desktop, or start a UI with `ok ui`, then retry.',
  );
  return 1;
}

function openDesktopDeepLink(
  projectDir: string,
  param: 'doc' | 'folder',
  target: string,
  deps: OpenDeps,
): void {
  const deepLink = `openknowledge://open?project=${encodeURIComponent(
    projectDir,
  )}&${param}=${encodeURIComponent(target)}`;
  deps.openTarget(deepLink);
}

export function runOpen(name: string, options: OpenOptions, deps: OpenDeps): number {
  const projectDir = resolve(options.project ?? process.cwd());
  const cleanName = name.replace(/\/+$/, '');

  if (!cleanName) {
    deps.error(
      'Nothing to open: pass a doc, folder, or skill name (e.g. `ok open specs/foo/SPEC`).',
    );
    return 1;
  }

  if (isUnsafeName(cleanName)) {
    deps.error(
      `Invalid name "${cleanName}": must be a relative path with no '..' segments, leading '/', or backslashes.`,
    );
    return 1;
  }

  if (options.skill === true) {
    const scope = (options.scope ?? 'project') as SkillScope;
    if (!(MANAGED_ARTIFACT_SCOPES as readonly string[]).includes(scope)) {
      deps.error(
        `Invalid --scope "${options.scope}": expected one of ${MANAGED_ARTIFACT_SCOPES.join(', ')}.`,
      );
      return 1;
    }
    const bundlePath = deps.detectBundlePath();
    if (bundlePath) {
      openDesktopDeepLink(projectDir, 'doc', `__skill__/${scope}/${cleanName}`, deps);
      deps.log(`Opening skill ${cleanName} (${scope}) in the OpenKnowledge desktop app.`);
      return 0;
    }
    const baseUrl = deps.resolveBaseUrl(projectDir);
    if (baseUrl) {
      const url = `${baseUrl}/#/${encodeSkillRoute(scope, cleanName)}`;
      deps.openTarget(url);
      deps.log(`Opening skill ${cleanName} (${scope}) in your browser: ${url}`);
      return 0;
    }
    return noTargetError(deps);
  }

  const isFolder = /\/+$/.test(name) || deps.classifyName(projectDir, cleanName) === 'folder';

  const bundlePath = deps.detectBundlePath();
  if (isFolder) {
    if (bundlePath) {
      openDesktopDeepLink(projectDir, 'folder', cleanName, deps);
      deps.log(`Opening folder ${cleanName} in the OpenKnowledge desktop app.`);
      return 0;
    }
    const baseUrl = deps.resolveBaseUrl(projectDir);
    if (baseUrl) {
      const url = `${baseUrl}/#/${encodeFolderRoute(cleanName)}`;
      deps.openTarget(url);
      deps.log(`Opening folder ${cleanName} in your browser: ${url}`);
      return 0;
    }
    return noTargetError(deps);
  }

  if (bundlePath) {
    openDesktopDeepLink(projectDir, 'doc', cleanName, deps);
    deps.log(`Opening ${cleanName} in the OpenKnowledge desktop app.`);
    return 0;
  }
  const baseUrl = deps.resolveBaseUrl(projectDir);
  if (baseUrl) {
    const url = `${baseUrl}/#/${encodeDocName(cleanName)}`;
    deps.openTarget(url);
    deps.log(`Opening ${cleanName} in your browser: ${url}`);
    return 0;
  }
  return noTargetError(deps);
}

export function openCommand(): Command {
  return new Command('open')
    .description(
      'Open a doc, folder, or skill in the OK Desktop app (falls back to the browser UI). ' +
        'Docs and folders are auto-detected — no flag needed.',
    )
    .argument(
      '<name>',
      'Doc path (specs/foo/SPEC), folder path (specs/foo or specs/foo/), or a skill name with --skill',
    )
    .option('--skill', 'Open <name> as a skill in the skill editor')
    .option(
      '--scope <scope>',
      `Skill scope when --skill is set: ${MANAGED_ARTIFACT_SCOPES.join(' | ')}`,
      'project',
    )
    .option('--project <dir>', 'Project root (defaults to the current directory)')
    .action((name: string, options: OpenOptions) => {
      process.exitCode = runOpen(name, options, createRealOpenDeps());
    });
}
