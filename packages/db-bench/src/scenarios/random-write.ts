import type { DatabaseDriver } from '../databases/interface.js';
import type { BenchmarkConfig, ScenarioResult } from '../config.js';
import { calculateStats } from '../stats.js';
import {
  generateKey,
  generateValue,
  generateRandomIndices,
} from '../utils/index.js';

export const RANDOM_WRITE_NAME = 'random-write';

export async function runRandomWrite(
  db: DatabaseDriver,
  config: BenchmarkConfig,
): Promise<ScenarioResult> {
  const value = generateValue(config.valueSize);
  const totalKeys = config.iterations + config.warmupIterations;
  const randomIndices = generateRandomIndices(config.iterations, totalKeys);
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

  for (let i = 0; i < config.warmupIterations; i++) {
    const key = generateKey(randomIndices[i], config.keySize);
    await db.put(key, value);
  }

  const latencies: bigint[] = [];
  const start = process.hrtime.bigint();
  for (let i = 0; i < config.iterations; i++) {
    const key = generateKey(randomIndices[i], config.keySize);
    const opStart = process.hrtime.bigint();
    await db.put(key, value);
    latencies.push(process.hrtime.bigint() - opStart);
  }
  const totalTime = process.hrtime.bigint() - start;

  const stats = calculateStats(latencies);
  return {
    database: db.name,
    scenario: RANDOM_WRITE_NAME,
    opsPerSec: stats.opsPerSec,
    p50: stats.p50,
    p90: stats.p90,
    p99: stats.p99,
    avgLatency: stats.avgLatency,
    totalTimeMs: Number(totalTime / 1_000_000n),
    iterations: config.iterations,
  };
}
