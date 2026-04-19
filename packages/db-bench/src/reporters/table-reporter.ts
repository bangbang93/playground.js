import type { BenchmarkResult } from '../config.js';
import type { PressureTestResult } from '../scenarios/memory-pressure.js';
import type { KeyOrderWriteResult } from '../scenarios/key-order-write.js';
import { formatNumber, formatMicroseconds } from '../stats.js';

export function printTableReport(result: BenchmarkResult): void {
  const { config, results, systemInfo } = result;

  console.log('\n' + '='.repeat(80));
  console.log('LMDB vs RocksDB Benchmark Results');
  console.log('='.repeat(80));
  console.log(`Platform: ${systemInfo.platform}/${systemInfo.arch}`);
  console.log(`Node.js:  ${systemInfo.nodeVersion}`);
  console.log(`CPU:      ${systemInfo.cpuModel}`);
  console.log(
    `Memory:   ${systemInfo.totalMemoryMB} MB total, ${systemInfo.memoryLimitMB} MB limit`,
  );
  console.log(
    `Config:   ${formatNumber(config.iterations)} iterations, ${config.keySize}B keys, ${config.valueSize}B values`,
  );
  console.log('='.repeat(80));

  const scenarioNames = [...new Set(results.map((r) => r.scenario))];

  for (const scenario of scenarioNames) {
    const scenarioResults = results.filter((r) => r.scenario === scenario);
    console.log(`\n${scenario.toUpperCase()}`);
    console.log('-'.repeat(76));
    console.log(
      padRight('Database', 12) +
        padRight('Ops/sec', 14) +
        padRight('Avg (μs)', 12) +
        padRight('p50 (μs)', 12) +
        padRight('p90 (μs)', 12) +
        padRight('p99 (μs)', 12) +
        padRight('Total (ms)', 12),
    );
    console.log('-'.repeat(76));

    for (const r of scenarioResults) {
      console.log(
        padRight(r.database, 12) +
          padRight(formatNumber(r.opsPerSec), 14) +
          padRight(formatMicroseconds(r.avgLatency), 12) +
          padRight(formatMicroseconds(r.p50), 12) +
          padRight(formatMicroseconds(r.p90), 12) +
          padRight(formatMicroseconds(r.p99), 12) +
          padRight(formatNumber(r.totalTimeMs), 12),
      );
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

export function printPressureReport(results: PressureTestResult[]): void {
  const levels = ['sufficient', 'close', 'insufficient', 'severe'];
  const databases = [...new Set(results.map((r) => r.database))];

  console.log('\n' + '='.repeat(90));
  console.log('Memory Pressure Test Results');
  console.log('='.repeat(90));

  for (const level of levels) {
    const levelResults = results.filter((r) => r.level === level);
    if (levelResults.length === 0) continue;

    const dataMB = levelResults[0].dataMB;
    const diskMB = levelResults[0].diskMB;
    const memoryMB = levelResults[0].memoryMB;
    const ratio = (dataMB / memoryMB).toFixed(1);

    console.log(
      `\n${level.toUpperCase()} — expected ${dataMB} MB, actual ${diskMB} MB on disk / ${memoryMB} MB memory (ratio: ${ratio}x)`,
    );
    console.log('-'.repeat(86));

    for (const opType of ['randomRead', 'randomWrite', 'rangeScan'] as const) {
      const label =
        opType === 'randomRead'
          ? 'Random Read'
          : opType === 'randomWrite'
            ? 'Random Write'
            : 'Range Scan';
      console.log(`  ${label}:`);
      console.log(
        padRight('    Database', 14) +
          padRight('Ops/sec', 14) +
          padRight('Avg (μs)', 12) +
          padRight('p50 (μs)', 12) +
          padRight('p90 (μs)', 12) +
          padRight('p99 (μs)', 12),
      );

      for (const r of levelResults) {
        const op = r[opType];
        console.log(
          padRight(`    ${r.database}`, 14) +
            padRight(formatNumber(op.opsPerSec), 14) +
            padRight(formatMicroseconds(op.avgLatency), 12) +
            padRight(formatMicroseconds(op.p50), 12) +
            padRight(formatMicroseconds(op.p90), 12) +
            padRight(formatMicroseconds(op.p99), 12),
        );
      }
    }
  }

  console.log('\n' + '='.repeat(90) + '\n');
}

export function printKeyOrderReport(
  results: KeyOrderWriteResult[],
  dataRatio: number,
): void {
  const modes = ['sequential', 'reverse', 'random'] as const;
  const databases = [...new Set(results.map((r) => r.database))];

  console.log('\n' + '='.repeat(90));
  console.log('Key Order Write Test Results');
  console.log('='.repeat(90));
  console.log(`Data/Memory ratio: ${dataRatio}x`);
  console.log(`Memory limit: ${results[0]?.memoryMB ?? '?'} MB`);

  for (const mode of modes) {
    const modeResults = results.filter((r) => r.order === mode);
    if (modeResults.length === 0) continue;

    const entries = modeResults[0].entries.toLocaleString();
    const dataMB = modeResults[0].dataMB;

    console.log(
      `\n${mode.toUpperCase()} ORDER — ${entries} entries, ~${dataMB} MB data`,
    );
    console.log('-'.repeat(86));

    console.log('  WRITE:');
    console.log(
      padRight('    Database', 14) +
        padRight('Ops/sec', 14) +
        padRight('Avg (μs)', 12) +
        padRight('p50 (μs)', 12) +
        padRight('p90 (μs)', 12) +
        padRight('p99 (μs)', 12) +
        padRight('Disk (MB)', 12),
    );

    for (const r of modeResults) {
      const w = r.writeResult;
      console.log(
        padRight(`    ${r.database}`, 14) +
          padRight(formatNumber(w.opsPerSec), 14) +
          padRight(formatMicroseconds(w.avgLatency), 12) +
          padRight(formatMicroseconds(w.p50), 12) +
          padRight(formatMicroseconds(w.p90), 12) +
          padRight(formatMicroseconds(w.p99), 12) +
          padRight(String(r.diskMB), 12),
      );
    }

    console.log('  READ:');
    console.log(
      padRight('    Database', 14) +
        padRight('Ops/sec', 14) +
        padRight('Avg (μs)', 12) +
        padRight('p50 (μs)', 12) +
        padRight('p90 (μs)', 12) +
        padRight('p99 (μs)', 12),
    );

    for (const r of modeResults) {
      const rd = r.readResult;
      console.log(
        padRight(`    ${r.database}`, 14) +
          padRight(formatNumber(rd.opsPerSec), 14) +
          padRight(formatMicroseconds(rd.avgLatency), 12) +
          padRight(formatMicroseconds(rd.p50), 12) +
          padRight(formatMicroseconds(rd.p90), 12) +
          padRight(formatMicroseconds(rd.p99), 12),
      );
    }
  }

  console.log('\n' + '='.repeat(90) + '\n');
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}
