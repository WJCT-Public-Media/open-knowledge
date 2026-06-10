import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { setToleranceTelemetryHook, type ToleranceFireRecord } from '@inkeep/open-knowledge-core';

import { getLocalDir } from './config/paths.ts';

const TELEMETRY_FILENAME = 'tolerance-telemetry.jsonl';

export function isToleranceTelemetryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.OK_BRIDGE_TOLERANCE_TELEMETRY === '1';
}

export function initToleranceTelemetryWriter(projectDir: string): void {
  if (!isToleranceTelemetryEnabled()) return;

  const localDir = getLocalDir(projectDir);
  mkdirSync(localDir, { recursive: true });
  const logPath = resolve(localDir, TELEMETRY_FILENAME);

  setToleranceTelemetryHook((record: ToleranceFireRecord) => {
    const line = JSON.stringify({
      event: 'bridge-tolerance-fire',
      timestamp: record.timestamp,
      class: record.className,
      document: record.documentName ?? null,
      codeUnitPosition: record.codeUnitPosition,
      severity: record.severity,
    });
    try {
      appendFileSync(logPath, `${line}\n`);
    } catch {}
  });
}

export function teardownToleranceTelemetryWriter(): void {
  setToleranceTelemetryHook(null);
}
