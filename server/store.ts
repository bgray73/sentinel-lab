import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultTests } from './runner.js';
import type { Gate, Run, TestCase, TestResult } from './types.js';

type Row = Record<string, string | number | null>;

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS tests (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, critical INTEGER NOT NULL, timeout_ms INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, duration INTEGER NOT NULL, gate_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS results (run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, position INTEGER NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(run_id, position));
    `);
    const count = (this.db.prepare('SELECT COUNT(*) AS count FROM tests').get() as Row).count as number;
    if (count === 0) defaultTests.forEach(test => this.insertTest(test));
  }

  listTests(): TestCase[] {
    return (this.db.prepare('SELECT * FROM tests ORDER BY created_at, id').all() as Row[]).map(toTest);
  }

  insertTest(test: TestCase) {
    this.db.prepare('INSERT INTO tests (id,name,kind,target,critical,timeout_ms,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(test.id, test.name, test.kind, test.target, test.critical ? 1 : 0, test.timeoutMs, new Date().toISOString());
    return test;
  }

  saveRun(run: Run) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO runs (id,started_at,duration,gate_json) VALUES (?,?,?,?)').run(run.id, run.startedAt, run.duration, JSON.stringify(run.gate));
      const insert = this.db.prepare('INSERT INTO results (run_id,position,result_json) VALUES (?,?,?)');
      run.results.forEach((result, index) => insert.run(run.id, index, JSON.stringify(result)));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listRuns(limit = 20): Run[] {
    const runs = this.db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(limit) as Row[];
    const results = this.db.prepare('SELECT result_json FROM results WHERE run_id = ? ORDER BY position');
    return runs.map(row => ({
      id: row.id as string,
      startedAt: row.started_at as string,
      duration: row.duration as number,
      gate: JSON.parse(row.gate_json as string) as Gate,
      results: (results.all(row.id) as Row[]).map(result => JSON.parse(result.result_json as string) as TestResult)
    }));
  }

  close() { this.db.close(); }
}

function toTest(row: Row): TestCase {
  return { id: row.id as string, name: row.name as string, kind: row.kind as TestCase['kind'], target: row.target as string, critical: row.critical === 1, timeoutMs: row.timeout_ms as number };
}
