#!/usr/bin/env node
import parser from 'yargs-parser';
import { DEFAULT_CONFIG, type BenchmarkConfig } from './config.js';
import {
  runBenchmarks,
  runPressureTest,
  runKeyOrderTest,
} from './benchmark.js';
import {
  printTableReport,
  printPressureReport,
  printKeyOrderReport,
} from './reporters/index.js';

const args = parser(process.argv.slice(2));

if (args.help || args.h) {
  console.log(`
db-bench - LMDB vs RocksDB benchmark under memory-constrained conditions

Usage:
  db-bench                        Run all standard benchmarks
  db-bench --pressure-test        Run memory pressure test

Options:
  --iterations <n>      Number of operations per scenario (default: ${DEFAULT_CONFIG.iterations})
  --warmup <n>          Warmup iterations (default: ${DEFAULT_CONFIG.warmupIterations})
  --key-size <n>        Key size in bytes (default: ${DEFAULT_CONFIG.keySize})
  --value-size <n>      Value size in bytes (default: ${DEFAULT_CONFIG.valueSize})
  --batch-size <n>      Batch size for bulk operations (default: ${DEFAULT_CONFIG.batchSize})
  --scenarios <list>    Comma-separated scenario names (default: all)
  --data-dir <path>     Directory for database files (default: ${DEFAULT_CONFIG.dataDir})
  --memory <n>          Memory limit in MB (default: ${DEFAULT_CONFIG.memoryLimitMB})
  --pressure-test       Run memory pressure test with increasing data sizes
  --key-order-test      Run key order write test (sequential/reverse/random)
  --data-ratio <n>      Data/memory ratio for key-order-test (default: 4.0)
  --help, -h            Show this help message

Available scenarios:
  sequential-write, random-read, random-write, range-scan, mixed-workload
`);
  process.exit(0);
}

const config: BenchmarkConfig = {
  iterations: args.iterations ?? DEFAULT_CONFIG.iterations,
  warmupIterations: args.warmup ?? DEFAULT_CONFIG.warmupIterations,
  keySize: args['key-size'] ?? DEFAULT_CONFIG.keySize,
  valueSize: args['value-size'] ?? DEFAULT_CONFIG.valueSize,
  batchSize: args['batch-size'] ?? DEFAULT_CONFIG.batchSize,
  scenarios: args.scenarios
    ? String(args.scenarios).split(',')
    : DEFAULT_CONFIG.scenarios,
  dataDir: args['data-dir'] ?? DEFAULT_CONFIG.dataDir,
  memoryLimitMB: args.memory ?? DEFAULT_CONFIG.memoryLimitMB,
};

if (args['pressure-test']) {
  console.log('Starting memory pressure test with config:');
  console.log(JSON.stringify(config, null, 2));
  const results = await runPressureTest(config);
  printPressureReport(results);
} else if (args['key-order-test']) {
  const dataRatio = args['data-ratio'] ? parseFloat(args['data-ratio']) : 4.0;
  console.log('Starting key order test with config:');
  console.log(JSON.stringify({ ...config, dataRatio }, null, 2));
  const results = await runKeyOrderTest(config, dataRatio);
  printKeyOrderReport(results, dataRatio);
} else {
  console.log('Starting benchmark with config:');
  console.log(JSON.stringify(config, null, 2));
  const result = await runBenchmarks(config);
  printTableReport(result);
}
