// Plan morning-digest § 1. The contract every part of § 2 starts against: change it here first.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night. Times keep the log's offset (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as "—"
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null; // error of the last line, null when it had none
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse: counted, never thrown
};

// null when runs/<night>.jsonl doesn't exist (→ 404). An empty file gives rows: [].
export type ReadNight = (runsDir: string, night: string) => Night | null;
