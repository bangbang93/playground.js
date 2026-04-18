import type { DatabaseDriver } from '../databases/interface.js';
import type { BenchmarkConfig, ScenarioResult } from '../config.js';
import { calculateStats } from '../stats.js';
import {
  generateKey,
  generateValue,
  generateRandomIndices,
} from '../utils/index.js';
import { execSync } from 'node:child_process';

export const MEMORY_PRESSURE_NAME = 'memory-pressure';

export interface PressureLevel {
  label: string;
  dataRatio: number;
  entries: number;
}

export interface PressureTestResult {
  database: string;
  level: string;
  dataMB: number;
  diskMB: number;
  memoryMB: number;
  randomRead: ScenarioResult;
  randomWrite: ScenarioResult;
  rangeScan: ScenarioResult;
}

const OPS_PER_LEVEL = 5000;
const WARMUP_PER_LEVEL = 500;

export function calculatePressureLevels(
  memoryLimitMB: number,
  entrySizeBytes: number,
): PressureLevel[] {
  const memBytes = memoryLimitMB * 1024 * 1024;
  const sufficient = Math.floor((memBytes * 0.4) / entrySizeBytes);
  const close = Math.floor((memBytes * 0.9) / entrySizeBytes);
  const insufficient = Math.floor((memBytes * 2) / entrySizeBytes);
  const severe = Math.floor((memBytes * 4) / entrySizeBytes);

  return [
    { label: 'sufficient', dataRatio: 0.4, entries: sufficient },
    { label: 'close', dataRatio: 0.9, entries: close },
    { label: 'insufficient', dataRatio: 2.0, entries: insufficient },
    { label: 'severe', dataRatio: 4.0, entries: severe },
  ];
}

export async function runMemoryPressure(
  db: DatabaseDriver,
  config: BenchmarkConfig,
  dbPath: string,
): Promise<PressureTestResult[]> {
  const value = generateValue(config.valueSize);
  const entrySize = config.keySize + config.valueSize;
  const levels = calculatePressureLevels(config.memoryLimitMB, entrySize);
  const results: PressureTestResult[] = [];

  for (const level of levels) {
    const dataMB = Math.round((level.entries * entrySize) / (1024 * 1024));
    console.log(
      `  Level: ${level.label} (expected ${dataMB} MB / ${config.memoryLimitMB} MB memory, ${level.entries.toLocaleString()} entries)`,
    );

    const batchSize = config.batchSize;
    for (let i = 0; i < level.entries; i += batchSize) {
      const ops = [];
      for (let j = i; j < Math.min(i + batchSize, level.entries); j++) {
        ops.push({
          type: 'put' as const,
          key: generateKey(j, config.keySize),
          value,
        });
      }
      await db.batch(ops);
    }

    const diskMB = getDirSizeMB(dbPath);
    console.log(
      `    actual disk: ${diskMB} MB (expected ${dataMB} MB, ${config.memoryLimitMB} MB memory)`,
    );

    const randomIndices = generateRandomIndices(OPS_PER_LEVEL, level.entries);

    const readResult = await measureRandomRead(db, config, randomIndices);
    const writeResult = await measureRandomWrite(
      db,
      config,
      randomIndices,
      value,
    );
    const scanResult = await measureRangeScan(db, config);

    results.push({
      database: db.name,
      level: level.label,
      dataMB,
      diskMB,
      memoryMB: config.memoryLimitMB,
      randomRead: readResult,
      randomWrite: writeResult,
      rangeScan: scanResult,
    });

    console.log(
      `    read: ${readResult.opsPerSec.toLocaleString()} ops/s  write: ${writeResult.opsPerSec.toLocaleString()} ops/s  scan: ${scanResult.opsPerSec.toLocaleString()} ops/s`,
    );
  }

  return results;
}

async function measureRandomRead(
  db: DatabaseDriver,
  config: BenchmarkConfig,
  indices: number[],
): Promise<ScenarioResult> {
  const latencies: bigint[] = [];

  for (let i = 0; i < WARMUP_PER_LEVEL; i++) {
    await db.get(generateKey(indices[i % indices.length], config.keySize));
  }

  const start = process.hrtime.bigint();
  for (let i = 0; i < OPS_PER_LEVEL; i++) {
    const opStart = process.hrtime.bigint();
    await db.get(generateKey(indices[i], config.keySize));
    latencies.push(process.hrtime.bigint() - opStart);
  }
  const totalTime = process.hrtime.bigint() - start;

  const stats = calculateStats(latencies);
  return {
    database: db.name,
    scenario: 'random-read',
    opsPerSec: stats.opsPerSec,
    p50: stats.p50,
    p90: stats.p90,
    p99: stats.p99,
    avgLatency: stats.avgLatency,
    totalTimeMs: Number(totalTime / 1_000_000n),
    iterations: OPS_PER_LEVEL,
  };
}

async function measureRandomWrite(
  db: DatabaseDriver,
  config: BenchmarkConfig,
  indices: number[],
  value: Buffer,
): Promise<ScenarioResult> {
  for (let i = 0; i < WARMUP_PER_LEVEL; i++) {
    db.put(generateKey(indices[i % indices.length], config.keySize), value);
  }
  await db.flush();

  const start = process.hrtime.bigint();
  for (let i = 0; i < OPS_PER_LEVEL; i++) {
    db.put(generateKey(indices[i], config.keySize), value);
  }
  await db.flush();
  const totalTimeNs = process.hrtime.bigint() - start;

  const totalUs = Number(totalTimeNs / 1_000n);
  const opsPerSec =
    totalUs > 0 ? Math.round((OPS_PER_LEVEL / totalUs) * 1_000_000) : 0;
  const avgLatency = totalUs / OPS_PER_LEVEL;

  return {
    database: db.name,
    scenario: 'random-write',
    opsPerSec,
    p50: avgLatency,
    p90: avgLatency,
    p99: avgLatency,
    avgLatency,
    totalTimeMs: Number(totalTimeNs / 1_000_000n),
    iterations: OPS_PER_LEVEL,
  };
}

async function measureRangeScan(
  db: DatabaseDriver,
  config: BenchmarkConfig,
): Promise<ScenarioResult> {
  let warmupCount = 0;
  for await (const _ of db.iterate({ limit: WARMUP_PER_LEVEL })) {
    warmupCount++;
  }

  const start = process.hrtime.bigint();
  let scannedCount = 0;
  for await (const _ of db.iterate()) {
    scannedCount++;
  }
  const totalTimeNs = process.hrtime.bigint() - start;

  const totalUs = Number(totalTimeNs / 1_000n);
  const opsPerSec =
    totalUs > 0 ? Math.round((scannedCount / totalUs) * 1_000_000) : 0;
  const avgLatency = scannedCount > 0 ? totalUs / scannedCount : 0;

  return {
    database: db.name,
    scenario: 'range-scan',
    opsPerSec,
    p50: avgLatency,
    p90: avgLatency,
    p99: avgLatency,
    avgLatency,
    totalTimeMs: Number(totalTimeNs / 1_000_000n),
    iterations: scannedCount,
  };
}

function getDirSizeMB(dirPath: string): number {
  try {
    const output = execSync(`du -sm '${dirPath}'`, { encoding: 'utf-8' });
    return parseInt(output.split('\t')[0], 10);
  } catch {
    return 0;
  }
}
