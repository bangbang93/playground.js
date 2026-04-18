import {
  SEQUENTIAL_WRITE_NAME,
  runSequentialWrite,
} from './sequential-write.js';
import { RANDOM_READ_NAME, runRandomRead } from './random-read.js';
import { RANDOM_WRITE_NAME, runRandomWrite } from './random-write.js';
import { RANGE_SCAN_NAME, runRangeScan } from './range-scan.js';
import { MIXED_WORKLOAD_NAME, runMixedWorkload } from './mixed-workload.js';

import type { DatabaseDriver } from '../databases/interface.js';
import type { BenchmarkConfig, ScenarioResult } from '../config.js';

export type ScenarioRunner = (
  db: DatabaseDriver,
  config: BenchmarkConfig,
) => Promise<ScenarioResult>;

export const SCENARIOS: Record<string, ScenarioRunner> = {
  [SEQUENTIAL_WRITE_NAME]: runSequentialWrite,
  [RANDOM_READ_NAME]: runRandomRead,
  [RANDOM_WRITE_NAME]: runRandomWrite,
  [RANGE_SCAN_NAME]: runRangeScan,
  [MIXED_WORKLOAD_NAME]: runMixedWorkload,
};

export const ALL_SCENARIO_NAMES = Object.keys(SCENARIOS);
