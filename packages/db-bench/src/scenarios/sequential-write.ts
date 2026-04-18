import type { DatabaseDriver } from '../databases/interface.js';
import type { BenchmarkConfig, ScenarioResult } from '../config.js';
import { generateKey, generateValue } from '../utils/index.js';

export const SEQUENTIAL_WRITE_NAME = 'sequential-write';

export async function runSequentialWrite(
  db: DatabaseDriver,
  config: BenchmarkConfig,
): Promise<ScenarioResult> {
  const value = generateValue(config.valueSize);

  for (let i = 0; i < config.warmupIterations; i++) {
    db.put(generateKey(i, config.keySize), value);
  }
  await db.flush();

  const start = process.hrtime.bigint();
  for (let i = 0; i < config.iterations; i++) {
    db.put(generateKey(i, config.keySize), value);
  }
  await db.flush();
  const totalTimeNs = process.hrtime.bigint() - start;

  const totalUs = Number(totalTimeNs / 1_000n);
  const opsPerSec =
    totalUs > 0 ? Math.round((config.iterations / totalUs) * 1_000_000) : 0;
  const avgLatency = totalUs / config.iterations;

  return {
    database: db.name,
    scenario: SEQUENTIAL_WRITE_NAME,
    opsPerSec,
    p50: avgLatency,
    p90: avgLatency,
    p99: avgLatency,
    avgLatency,
    totalTimeMs: Number(totalTimeNs / 1_000_000n),
    iterations: config.iterations,
  };
}
