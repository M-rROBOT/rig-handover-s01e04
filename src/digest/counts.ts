// Plan morning-digest § 2c: ok / retry / fail line counts for one night.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';

export type Counts = { ok: number; retry: number; fail: number };

// null when runs/<night>.jsonl can't be read. Bad lines are not counted.
export function countNight(runsDir: string, night: string): Counts | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: Counts = { ok: 0, retry: 0, fail: 0 };
  for (const rawLine of text.split('\n')) {
    if (rawLine.trim() === '') continue;
    const line = parseLine(rawLine);
    if (line !== null) counts[line.status] += 1;
  }
  return counts;
}
