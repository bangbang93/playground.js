export interface StatsResult {
  opsPerSec: number;
  p50: number;
  p90: number;
  p99: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  totalUs: number;
}

function percentile(sorted: bigint[], rank: number): number {
  const index = Math.floor((rank / 100) * sorted.length);
  const clamped = Math.min(index, sorted.length - 1);
  return Number(sorted[clamped] / 1000n);
}

export function calculateStats(latenciesNs: bigint[]): StatsResult {
  const sorted = [...latenciesNs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const totalNs = sorted.reduce((sum, v) => sum + v, 0n);
  const totalUs = Number(totalNs / 1000n);
  const count = sorted.length;

  const avgNs = totalNs / BigInt(count);
  const avgLatency = Number(avgNs / 1000n);

  const opsPerSec = totalUs > 0 ? (count / totalUs) * 1_000_000 : 0;

  return {
    opsPerSec,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p99: percentile(sorted, 99),
    avgLatency,
    minLatency: Number(sorted[0] / 1000n),
    maxLatency: Number(sorted[count - 1] / 1000n),
    totalUs,
  };
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatMicroseconds(us: number): string {
  if (us < 1) {
    return `${us.toFixed(2)} μs`;
  }
  if (us < 1000) {
    return `${us.toFixed(2)} μs`;
  }
  return `${(us / 1000).toFixed(2)} ms`;
}
