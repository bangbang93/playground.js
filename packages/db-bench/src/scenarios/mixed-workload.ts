import type { DatabaseDriver } from '../databases/interface.js';
import type { BenchmarkConfig, ScenarioResult } from '../config.js';
import { calculateStats } from '../stats.js';
import {
  generateKey,
  generateValue,
  generateRandomIndices,
} from '../utils/index.js';

export const MIXED_WORKLOAD_NAME = 'mixed-workload';
const READ_RATIO = 0.8;

export async function runMixedWorkload(
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
    if (Math.random() < READ_RATIO) {
      await db.get(generateKey(i, config.keySize));
    } else {
      db.put(generateKey(i, config.keySize), value);
    }
  }
  await db.flush();

  const latencies: bigint[] = [];
  let writesSinceFlush = 0;
  const totalStart = process.hrtime.bigint();

  for (let i = 0; i < config.iterations; i++) {
    const opStart = process.hrtime.bigint();
    if (Math.random() < READ_RATIO) {
      await db.get(generateKey(randomIndices[i], config.keySize));
    } else {
      db.put(generateKey(randomIndices[i], config.keySize), value);
      writesSinceFlush++;
      if (writesSinceFlush >= batchSize) {
        await db.flush();
        writesSinceFlush = 0;
      }
    }
    latencies.push(process.hrtime.bigint() - opStart);
  }
  await db.flush();
  const totalTime = process.hrtime.bigint() - totalStart;

  const stats = calculateStats(latencies);
  return {
    database: db.name,
    scenario: MIXED_WORKLOAD_NAME,
    opsPerSec: stats.opsPerSec,
    p50: stats.p50,
    p90: stats.p90,
    p99: stats.p99,
    avgLatency: stats.avgLatency,
    totalTimeMs: Number(totalTime / 1_000_000n),
    iterations: config.iterations,
  };
}
