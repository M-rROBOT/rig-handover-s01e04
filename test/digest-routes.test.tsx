import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

// Plan morning-digest § 2d. Routes through app.request(); fixtures live in a temp dir,
// never in runs/ (real nights, read-only).

const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD = '2026-10-26';
const MISSING = '2026-01-01';

const normalLog = [
  '{"at":"2026-10-28T01:00:00+01:00","job":"zeta/backup","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T01:05:00+01:00","job":"alpha/sync","status":"retry","owner":"rook","error":"timeout"}',
  '{"at":"2026-10-28T01:10:00+01:00","job":"alpha/sync","status":"retry","owner":"rook","error":"timeout"}',
  '{"at":"2026-10-28T01:15:00+01:00","job":"alpha/sync","status":"retry","owner":"rook","error":"timeout"}',
  '{"at":"2026-10-28T01:20:00+01:00","job":"alpha/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T02:00:00+01:00","job":"mid/render","status":"fail","owner":null,"error":"quota exceeded"}',
  '',
].join('\n');

const badLog = [
  '{"at":"2026-10-26T01:00:00+01:00","job":"zeta/backup","status":"ok","owner":"rook"}',
  '{"at":"2026-10-26T01:05:00+01:00","job":"alpha/sy',
  '{"at":"2026-10-26T01:10:00+01:00","job":"mid/render","status":"ok","owner":null}',
  '',
].join('\n');

let runsDir: string;
let config: RigConfig;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normalLog);
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), badLog);
  config = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const jobsInJson = (rows: { job: string }[]) => rows.map((r) => r.job);

describe('GET /digest/:night (page)', () => {
  it('renders 200 with the jobs of a normal night', async () => {
    const res = await createApp(config).request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/sync');
    expect(html).toContain('mid/render');
    expect(html).toContain('zeta/backup');
    expect(html).toContain('quota exceeded');
  });

  it('renders 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for that night');
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('stays 200 for a night with a bad line and still renders the good jobs', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('zeta/backup');
    expect(html).toContain('mid/render');
    expect(html).toContain('1 line(s) didn&#39;t parse');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('returns 200 with the rows of a normal night, sorted by job', async () => {
    const res = await createApp(config).request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe(NORMAL);
    expect(jobsInJson(body.rows)).toEqual(['alpha/sync', 'mid/render', 'zeta/backup']);
    expect(body.badLines).toBe(0);
  });

  it('counts the three retries of the flaky job', async () => {
    const body = (await (await createApp(config).request(`/api/digest/${NORMAL}`)).json()) as {
      rows: { job: string; retries: number; runs: number }[];
    };
    const alpha = body.rows.find((r) => r.job === 'alpha/sync');
    expect(alpha?.retries).toBe(3);
    expect(alpha?.runs).toBe(4);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for this night', night: MISSING });
  });

  it('returns 200 with no rows and badLines 0 for an empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('returns 200 with badLines 1 and the good rows for a night with a bad line', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(jobsInJson(body.rows)).toEqual(['mid/render', 'zeta/backup']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for the normal night', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const body = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as {
      rows: { job: string }[];
    };
    const positions = jobsInJson(body.rows).map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
