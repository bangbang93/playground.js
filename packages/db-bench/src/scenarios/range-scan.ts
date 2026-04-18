import type { DatabaseDriver } from '../databases/interface.js';
import type { BenchmarkConfig, ScenarioResult } from '../config.js';
import { calculateStats } from '../stats.js';
import { generateKey, generateValue } from '../utils/index.js';

export const RANGE_SCAN_NAME = 'range-scan';

export async function runRangeScan(
  db: DatabaseDriver,
  config: BenchmarkConfig,
): Promise<ScenarioResult> {
  const value = generateValue(config.valueSize);
  const totalKeys = config.iterations;

  const batchSize = config.batchSize;
  for (let i = 0; i < totalKeys; i += batchSize) {
    const ops = [];
    for (let j = i; j < Math.min(i + batchSize, totalKeys); j++) {
      ops.push({
        type: 'put' as const,
        key: generateKey(j, config.keySize),
        value,
      });
    }
    await db.batch(ops);
  }

  let warmupCount = 0;
  for await (const _ of db.iterate({ limit: config.warmupIterations })) {
    warmupCount++;
  }

  const latencies: bigint[] = [];
  let scannedCount = 0;
  const start = process.hrtime.bigint();
  for await (const _ of db.iterate()) {
    scannedCount++;
  }
  const totalTime = process.hrtime.bigint() - start;

  const totalUs = Number(totalTime / 1_000n);
  const opsPerSec = Math.round(scannedCount / (totalUs / 1_000_000));

  return {
    database: db.name,
    scenario: RANGE_SCAN_NAME,
    opsPerSec,
    p50: totalUs / scannedCount,
    p90: totalUs / scannedCount,
    p99: totalUs / scannedCount,
    avgLatency: totalUs / scannedCount,
    totalTimeMs: Number(totalTime / 1_000_000n),
    iterations: scannedCount,
  };
}
