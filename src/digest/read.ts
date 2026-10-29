// Plan morning-digest § 1: read runs/<night>.jsonl into one row per job.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

const isStatus = (value: unknown): value is RunStatus =>
  typeof value === 'string' && (STATUSES as readonly string[]).includes(value);

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

// Parse one log line at the edge. null means a bad line (counted, never thrown).
export const parseLine =(text: string): RunLine | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!nonEmpty(o.at) || !nonEmpty(o.job) || !isStatus(o.status)) return null;
  const line: RunLine = {
    at: o.at,
    job: o.job,
    status: o.status,
    owner: typeof o.owner === 'string' ? o.owner : null,
  };
  if (typeof o.error === 'string') line.error = o.error;
  return line;
};

const readFile = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
};

export const readNight: ReadNight = (runsDir, night) => {
  // The night names a file; anything but YYYY-MM-DD can't be one of ours.
  if (!NIGHT.test(night)) return null;
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;

  for (const rawLine of text.split('\n')) {
    if (rawLine.trim() === '') continue;
    const line = parseLine(rawLine);
    if (line === null) {
      badLines += 1;
      continue;
    }
    const retry = line.status === 'retry' ? 1 : 0;
    const row = rows.get(line.job);
    if (row === undefined) {
      rows.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: retry,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.runs += 1;
    row.retries += retry;
    row.lastStatus = line.status;
    row.lastError = line.error ?? null;
    row.lastAt = line.at;
    if (line.owner !== null) row.owner = line.owner;
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows: sorted, badLines };
};
