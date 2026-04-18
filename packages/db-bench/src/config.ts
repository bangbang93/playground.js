import os from 'node:os';

export interface BenchmarkConfig {
  iterations: number;
  warmupIterations: number;
  keySize: number;
  valueSize: number;
  batchSize: number;
  scenarios: string[];
  dataDir: string;
  memoryLimitMB: number;
}

export interface ScenarioResult {
  database: string;
  scenario: string;
  opsPerSec: number;
  p50: number;
  p90: number;
  p99: number;
  avgLatency: number;
  totalTimeMs: number;
  iterations: number;
}

export interface BenchmarkResult {
  config: BenchmarkConfig;
  results: ScenarioResult[];
  systemInfo: SystemInfo;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  cpuModel: string;
  totalMemoryMB: number;
  memoryLimitMB: number;
}

export const DEFAULT_CONFIG: BenchmarkConfig = {
  iterations: 100_000,
  warmupIterations: 10_000,
  keySize: 16,
  valueSize: 256,
  batchSize: 1_000,
  scenarios: [],
  dataDir: './.bench-data',
  memoryLimitMB: 256,
};

export function getSystemInfo(memoryLimitMB: number): SystemInfo {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    memoryLimitMB,
  };
}
