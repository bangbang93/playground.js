import { open, type Database } from 'lmdb';
import type {
  BatchOp,
  DatabaseDriver,
  IterationEntry,
  IteratorOptions,
} from './interface.js';

export class LmdbDriver implements DatabaseDriver {
  readonly name = 'LMDB';
  private db: Database<Buffer, string> | null = null;

  async open(path: string, memoryLimitMB: number): Promise<void> {
    this.db = open<Buffer, string>({
      path,
      mapSize: memoryLimitMB * 1024 * 1024,
      maxDbs: 1,
      commitDelay: 10,
    });
  }

  async close(): Promise<void> {
    await this.db?.close();
    this.db = null;
  }

  put(key: string, value: Buffer): Promise<void> {
    return this.db!.put(key, value).then(() => {});
  }

  async flush(): Promise<void> {
    await this.db!.flushed;
  }

  async get(key: string): Promise<Buffer | undefined> {
    return Promise.resolve(this.db!.get(key));
  }

  async del(key: string): Promise<void> {
    await this.db!.remove(key);
  }

  async batch(ops: BatchOp[]): Promise<void> {
    await this.db!.transaction(() => {
      for (const op of ops) {
        if (op.type === 'put') {
          this.db!.putSync(op.key, op.value!);
        } else {
          this.db!.removeSync(op.key);
        }
      }
    });
  }

  async *iterate(options?: IteratorOptions): AsyncIterable<IterationEntry> {
    const rangeOpts: Record<string, unknown> = {};
    if (options?.start) rangeOpts.start = options.start;
    if (options?.end) rangeOpts.end = options.end;
    if (options?.limit) rangeOpts.limit = options.limit;
    if (options?.reverse) rangeOpts.reverse = true;
    for (const { key, value } of this.db!.getRange(rangeOpts)) {
      yield { key: String(key), value: Buffer.from(value) };
    }
  }

  async count(options?: IteratorOptions): Promise<number> {
    const rangeOpts: Record<string, unknown> = {};
    if (options?.start) rangeOpts.start = options.start;
    if (options?.end) rangeOpts.end = options.end;
    return Promise.resolve(this.db!.getKeysCount(rangeOpts));
  }
}
