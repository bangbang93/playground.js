import { RocksDatabase } from '@harperfast/rocksdb-js';
import type {
  BatchOp,
  DatabaseDriver,
  IterationEntry,
  IteratorOptions,
} from './interface.js';

export class RocksdbDriver implements DatabaseDriver {
  readonly name = 'RocksDB';
  private db: RocksDatabase | null = null;

  async open(path: string, memoryLimitMB: number): Promise<void> {
    RocksDatabase.config({ blockCacheSize: memoryLimitMB * 1024 * 1024 });
    this.db = RocksDatabase.open(path, {
      noBlockCache: false,
      parallelismThreads: 1,
    });
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  async put(key: string, value: Buffer): Promise<void> {
    await this.db!.put(key, value);
  }

  async flush(): Promise<void> {}

  async get(key: string): Promise<Buffer | undefined> {
    const result = this.db!.get(key);
    return result instanceof Promise ? await result : result;
  }

  async del(key: string): Promise<void> {
    await this.db!.remove(key);
  }

  async batch(ops: BatchOp[]): Promise<void> {
    await this.db!.transaction(async (txn) => {
      for (const op of ops) {
        if (op.type === 'put') {
          await txn.put(op.key, op.value!);
        } else {
          await txn.remove(op.key);
        }
      }
    });
  }

  async *iterate(options?: IteratorOptions): AsyncIterable<IterationEntry> {
    const rangeOpts: Record<string, unknown> = {};
    if (options?.start) rangeOpts.start = options.start;
    if (options?.end) rangeOpts.end = options.end;
    if (options?.reverse) rangeOpts.reverse = true;
    let yielded = 0;
    for (const { key, value } of this.db!.getRange(rangeOpts)) {
      if (options?.limit !== undefined && yielded >= options.limit) {
        return;
      }
      yield { key: String(key), value: Buffer.from(value) };
      yielded++;
    }
  }

  async count(options?: IteratorOptions): Promise<number> {
    const rangeOpts: Record<string, unknown> = {};
    if (options?.start) rangeOpts.start = options.start;
    if (options?.end) rangeOpts.end = options.end;
    return Promise.resolve(this.db!.getKeysCount(rangeOpts));
  }
}
