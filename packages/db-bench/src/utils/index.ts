import fs from 'node:fs/promises';

export function generateKey(index: number, keySize: number): string {
  return index.toString(16).padStart(keySize * 2, '0');
}

export function generateValue(valueSize: number): Buffer {
  return Buffer.alloc(valueSize, 0xab);
}

export function generateRandomIndices(count: number, max: number): number[] {
  const indices = Array.from({ length: max }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count);
}

export async function cleanupDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}
