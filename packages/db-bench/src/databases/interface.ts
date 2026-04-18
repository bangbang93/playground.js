export interface BatchOp {
  type: 'put' | 'del';
  key: string;
  value?: Buffer;
}

export interface IteratorOptions {
  start?: string;
  end?: string;
  limit?: number;
  reverse?: boolean;
}

export interface IterationEntry {
  key: string;
  value: Buffer;
}

export interface DatabaseDriver {
  readonly name: string;
  open(path: string, memoryLimitMB: number): Promise<void>;
  close(): Promise<void>;
  put(key: string, value: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | undefined>;
  del(key: string): Promise<void>;
  batch(ops: BatchOp[]): Promise<void>;
  flush(): Promise<void>;
  iterate(options?: IteratorOptions): AsyncIterable<IterationEntry>;
  count(options?: IteratorOptions): Promise<number>;
}
