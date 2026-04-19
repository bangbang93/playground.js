import type { DatabaseDriver } from '../databases/interface.js';
import type { BenchmarkConfig, ScenarioResult } from '../config.js';
import { calculateStats } from '../stats.js';
import {
  generateKey,
  generateValue,
  generateRandomIndices,
  cleanupDir,
} from '../utils/index.js';
import { execSync } from 'node:child_process';

export type KeyOrderMode = 'sequential' | 'reverse' | 'random';

export interface KeyOrderWriteResult {
  database: string;
  order: KeyOrderMode;
  entries: number;
  dataMB: number;
  diskMB: number;
  memoryMB: number;
  writeResult: ScenarioResult;
  readResult: ScenarioResult;
}

export function* keyIndexSequence(
  count: number,
  mode: KeyOrderMode,
): Generator<number> {
  switch (mode) {
    case 'sequential':
      for (let i = 0; i < count; i++) yield i;
      break;
    case 'reverse':
      for (let i = count - 1; i >= 0; i--) yield i;
      break;
    case 'random': {
      const lcg = createFullPeriodLcg(count);
      for (const idx of lcg) yield idx;
      break;
    }
  }
}

function* createFullPeriodLcg(n: number): Generator<number> {
  if (n <= 1) {
    yield 0;
    return;
  }
  const m = nextPowerOfTwo(n);
  const c = 1;
  const a = 5;
  let x = Math.floor(Math.random() * m);
  let yielded = 0;
  do {
    x = (a * x + c) % m;
    if (x < n) {
      yield x;
      yielded++;
    }
  } while (yielded < n);
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

const SAMPLE_INTERVAL = 1000;

export async function runKeyOrderWrite(
  db: DatabaseDriver,
  config: BenchmarkConfig,
  dbPath: string,
  dataRatio: number,
): Promise<KeyOrderWriteResult[]> {
  const value = generateValue(config.valueSize);
  const entrySize = config.keySize + config.valueSize;
  const memBytes = config.memoryLimitMB * 1024 * 1024;
  const entries = Math.floor((memBytes * dataRatio) / entrySize);
  const dataMB = Math.round((entries * entrySize) / (1024 * 1024));
  const modes: KeyOrderMode[] = ['sequential', 'reverse', 'random'];
  const results: KeyOrderWriteResult[] = [];

  for (const mode of modes) {
    console.log(
      `  ${mode} order — ${entries.toLocaleString()} entries, ~${dataMB} MB data / ${config.memoryLimitMB} MB memory (${dataRatio}x)`,
    );

    await db.close();
    await cleanupDir(dbPath);
    await db.open(dbPath, config.memoryLimitMB);

    const writeStart = process.hrtime.bigint();
    let writeCount = 0;
    for (const idx of keyIndexSequence(entries, mode)) {
      const key = generateKey(idx, config.keySize);
      db.put(key, value);
      writeCount++;
      if (writeCount % SAMPLE_INTERVAL === 0) {
        await db.flush();
      }
    }
    await db.flush();
    const writeTotalTime = process.hrtime.bigint() - writeStart;

    const writeTotalUs = Number(writeTotalTime / 1_000n);
    const writeOpsPerSec =
      writeTotalUs > 0 ? Math.round((entries / writeTotalUs) * 1_000_000) : 0;
    const writeAvgLatency = writeTotalUs / entries;

    const diskMB = getDirSizeMB(dbPath);
    console.log(
      `    write: ${writeOpsPerSec.toLocaleString()} ops/s  disk: ${diskMB} MB`,
    );

    const randomReadCount = Math.min(5000, entries);
    const randomIndices = generateRandomIndices(randomReadCount, entries);
    const readLatencies: bigint[] = [];
    const readStart = process.hrtime.bigint();
    for (let i = 0; i < randomIndices.length; i++) {
      const key = generateKey(randomIndices[i], config.keySize);
      const opStart = process.hrtime.bigint();
      await db.get(key);
      readLatencies.push(process.hrtime.bigint() - opStart);
    }
    const readTotalTime = process.hrtime.bigint() - readStart;

    const writeStats = {
      opsPerSec: writeOpsPerSec,
      avgLatency: writeAvgLatency,
      p50: writeAvgLatency,
      p90: writeAvgLatency,
      p99: writeAvgLatency,
    };
    const readStats = calculateStats(readLatencies);

    results.push({
      database: db.name,
      order: mode,
      entries,
      dataMB,
      diskMB,
      memoryMB: config.memoryLimitMB,
      writeResult: {
        database: db.name,
        scenario: `key-order-write/${mode}`,
        opsPerSec: writeStats.opsPerSec,
        p50: writeStats.p50,
        p90: writeStats.p90,
        p99: writeStats.p99,
        avgLatency: writeStats.avgLatency,
        totalTimeMs: Number(writeTotalTime / 1_000_000n),
        iterations: entries,
      },
      readResult: {
        database: db.name,
        scenario: `key-order-read/${mode}`,
        opsPerSec: readStats.opsPerSec,
        p50: readStats.p50,
        p90: readStats.p90,
        p99: readStats.p99,
        avgLatency: readStats.avgLatency,
        totalTimeMs: Number(readTotalTime / 1_000_000n),
        iterations: randomIndices.length,
      },
    });
  }

  return results;
}

function getDirSizeMB(dirPath: string): number {
  try {
    const output = execSync(`du -sm '${dirPath}'`, { encoding: 'utf-8' });
    return parseInt(output.split('\t')[0], 10);
  } catch {
    return 0;
  }
}
