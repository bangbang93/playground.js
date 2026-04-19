import type {
  BenchmarkConfig,
  BenchmarkResult,
  ScenarioResult,
} from './config.js';
import { getSystemInfo } from './config.js';
import type { DatabaseDriver } from './databases/interface.js';
import { LmdbDriver } from './databases/lmdb-driver.js';
import { RocksdbDriver } from './databases/rocksdb-driver.js';
import { SCENARIOS, ALL_SCENARIO_NAMES } from './scenarios/index.js';
import {
  runMemoryPressure,
  type PressureTestResult,
} from './scenarios/memory-pressure.js';
import {
  runKeyOrderWrite,
  type KeyOrderWriteResult,
} from './scenarios/key-order-write.js';
import { cleanupDir, ensureDir } from './utils/index.js';
import path from 'node:path';

export async function runBenchmarks(
  config: BenchmarkConfig,
): Promise<BenchmarkResult> {
  const results: ScenarioResult[] = [];
  const systemInfo = getSystemInfo(config.memoryLimitMB);

  const scenariosToRun =
    config.scenarios.length > 0 ? config.scenarios : ALL_SCENARIO_NAMES;

  const drivers: DatabaseDriver[] = [new LmdbDriver(), new RocksdbDriver()];

  for (const driver of drivers) {
    const dbPath = path.join(config.dataDir, driver.name.toLowerCase());
    console.log(`\nBenchmarking ${driver.name}...`);

    try {
      await ensureDir(config.dataDir);
      await driver.open(dbPath, config.memoryLimitMB);

      for (const scenarioName of scenariosToRun) {
        const runner = SCENARIOS[scenarioName];
        if (!runner) {
          console.warn(`Unknown scenario: ${scenarioName}, skipping`);
          continue;
        }
        console.log(`  Running ${scenarioName}...`);
        const result = await runner(driver, config);
        results.push(result);
        console.log(`    ${result.opsPerSec.toLocaleString()} ops/sec`);
      }
    } finally {
      await driver.close();
      await cleanupDir(dbPath);
    }
  }

  return { config, results, systemInfo };
}

export async function runPressureTest(
  config: BenchmarkConfig,
): Promise<PressureTestResult[]> {
  const drivers: DatabaseDriver[] = [new LmdbDriver(), new RocksdbDriver()];
  const allResults: PressureTestResult[] = [];

  for (const driver of drivers) {
    const dbPath = path.join(config.dataDir, driver.name.toLowerCase());
    console.log(
      `\n${driver.name} - Memory Pressure Test (${config.memoryLimitMB} MB limit)`,
    );

    try {
      await ensureDir(config.dataDir);
      await driver.open(dbPath, config.memoryLimitMB);
      const results = await runMemoryPressure(driver, config, dbPath);
      allResults.push(...results);
    } finally {
      await driver.close();
      await cleanupDir(dbPath);
    }
  }

  return allResults;
}

export async function runKeyOrderTest(
  config: BenchmarkConfig,
  dataRatio: number,
): Promise<KeyOrderWriteResult[]> {
  const drivers: DatabaseDriver[] = [new LmdbDriver(), new RocksdbDriver()];
  const allResults: KeyOrderWriteResult[] = [];

  for (const driver of drivers) {
    const dbPath = path.join(config.dataDir, driver.name.toLowerCase());
    console.log(
      `\n${driver.name} - Key Order Test (${config.memoryLimitMB} MB limit, ${dataRatio}x data)`,
    );

    try {
      await ensureDir(config.dataDir);
      await driver.open(dbPath, config.memoryLimitMB);
      const results = await runKeyOrderWrite(driver, config, dbPath, dataRatio);
      allResults.push(...results);
    } finally {
      await driver.close();
      await cleanupDir(dbPath);
    }
  }

  return allResults;
}
