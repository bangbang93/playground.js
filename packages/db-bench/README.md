# @playground/db-bench

LMDB vs RocksDB 性能基准测试，专注于**内存受限**场景下的对比。

## 快速开始

```bash
# 构建
npm run build --workspace=@playground/db-bench

# 运行标准基准测试
npm run bench --workspace=@playground/db-bench

# 运行内存压力测试
node packages/db-bench/dist/cli.js --pressure-test --memory 128

# 运行 key 顺序写入测试
node packages/db-bench/dist/cli.js --key-order-test --memory 128 --data-ratio 2.0
```

## Docker 运行（真实内存限制）

本地运行时数据库可利用全部物理内存，无法反映真实受限场景。通过 Docker `--memory` 限制 cgroup 内存配额，获得可靠的受限环境数据。

```bash
# 构建镜像
docker build -t db-bench -f packages/db-bench/Dockerfile .

# 128MB 内存限制运行标准测试
docker run --rm --memory=128m db-bench --memory 128

# 128MB 内存限制运行压力测试
docker run --rm --memory=256m db-bench --pressure-test --memory 128

# 128MB 内存限制运行 key 顺序测试
docker run --rm --memory=256m db-bench --key-order-test --memory 128 --data-ratio 2.0

# 使用 docker-compose（预设 256MB / 512MB / 1GB 档位）
cd packages/db-bench
docker compose run --rm bench-256m --iterations 10000 --warmup 500
```

## CLI 参数

```
db-bench [options]

Options:
  --iterations <n>      每个场景的操作次数 (default: 100000)
  --warmup <n>          预热迭代次数 (default: 10000)
  --key-size <n>        Key 大小，字节 (default: 16)
  --value-size <n>      Value 大小，字节 (default: 256)
  --batch-size <n>      批量操作大小 (default: 1000)
  --scenarios <list>    逗号分隔的场景名 (default: 全部)
  --data-dir <path>     数据库文件目录 (default: ./.bench-data)
  --memory <n>          内存限制 MB (default: 256)
  --pressure-test       运行内存压力测试
  --key-order-test      运行 key 顺序写入测试
  --data-ratio <n>      key-order-test 的数据/内存比 (default: 4.0)
  --help, -h            帮助

标准场景: sequential-write, random-read, random-write, range-scan, mixed-workload
```

## 测试场景

### 标准基准测试

| 场景             | 描述                 | 测量方式                        |
| ---------------- | -------------------- | ------------------------------- |
| sequential-write | 顺序写入（批量加载） | 吞吐量：全量 put + flush 总时间 |
| random-read      | 随机读取             | 逐条 get 延迟分布               |
| random-write     | 随机更新             | 吞吐量：全量 put + flush 总时间 |
| range-scan       | 范围扫描             | 全量迭代吞吐量                  |
| mixed-workload   | 混合读写 (80/20)     | 逐条操作延迟分布                |

### 内存压力测试 (`--pressure-test`)

固定内存限制，逐步增大数据量，测量 4 个压力级别：

| 级别         | 数据/内存比 | 含义                           |
| ------------ | ----------- | ------------------------------ |
| sufficient   | 0.4x        | 内存充裕，数据库可全部缓存     |
| close        | 0.9x        | 接近上限，缓存紧张             |
| insufficient | 2.0x        | 内存不足，大量数据无法缓存     |
| severe       | 4.0x        | 严重不足，绝大部分数据在磁盘上 |

每个级别写入全量数据后，测量随机读、随机写、范围扫描性能，并输出实际磁盘占用。

### Key 顺序写入测试 (`--key-order-test`)

固定内存限制，以不同 key 写入顺序插入数据，对比 B+ 树 (LMDB) 与 LSM-Tree (RocksDB) 的写入性能差异。

| 顺序       | 描述                                     |
| ---------- | ---------------------------------------- |
| sequential | 升序写入 key (0, 1, 2, ...)              |
| reverse    | 降序写入 key (N-1, N-2, ...)             |
| random     | 随机顺序写入 key（LCG 全周期伪随机置换） |

写入阶段测量吞吐量（fire-and-forget put + 定期 flush），写入完成后随机读取 5000 条测量延迟分布。

## 项目结构

```
src/
├── cli.ts                    # CLI 入口
├── config.ts                 # 配置类型 & 系统信息
├── benchmark.ts              # 基准测试编排器
├── stats.ts                  # 统计计算 (ops/sec, p50/p90/p99)
├── index.ts                  # 包导出
├── databases/
│   ├── interface.ts          # DatabaseDriver 抽象接口
│   ├── lmdb-driver.ts        # LMDB 驱动 (lmdb-js)
│   ├── rocksdb-driver.ts     # RocksDB 驱动 (@harperfast/rocksdb-js)
│   └── index.ts
├── scenarios/
│   ├── sequential-write.ts
│   ├── random-read.ts
│   ├── random-write.ts
│   ├── range-scan.ts
│   ├── mixed-workload.ts
│   ├── memory-pressure.ts    # 压力测试
│   ├── key-order-write.ts    # key 顺序测试
│   └── index.ts
├── reporters/
│   ├── table-reporter.ts
│   └── index.ts
└── utils/
    └── index.ts              # key/value 生成, 目录清理
```

## 数据库驱动配置

### LMDB (`lmdb` by kriszyp)

```typescript
open({
  path,
  mapSize: memoryLimitMB * 1024 * 1024, // 虚拟内存映射上限
  maxDbs: 1,
  commitDelay: 10, // 异步批处理延迟 10ms
});
```

- `get()` 同步（mmap 零拷贝）
- `put()` 异步，配合 `commitDelay` 自动批处理，通过 `db.flushed` 等待持久化
- `getRange()` 同步迭代器

### RocksDB (`@harperfast/rocksdb-js` by HarperDB)

```typescript
RocksDatabase.config({ blockCacheSize: memoryLimitMB * 1024 * 1024 });
RocksDatabase.open(path, { noBlockCache: false, parallelismThreads: 1 });
```

- `get()` 混合同步/异步（命中缓存同步返回，否则异步）
- `put()` 异步，提交即持久化
- `getRange()` 同步迭代器
- `transaction()` 支持乐观/悲观事务

---

## 基准测试结果

### 测试环境

- CPU: AMD Ryzen 9 9950X3D
- Node.js: v22.22.2 (Docker) / v25.8.1 (本地)
- OS: Linux x64
- 数据: 16B key + 256B value

### 标准基准测试 (Docker 256MB 内存限制)

| 场景     | LMDB (ops/sec) | RocksDB (ops/sec) | LMDB 优势 |
| -------- | -------------- | ----------------- | --------- |
| 顺序写入 | 272,963        | 274,333           | ~持平     |
| 随机读取 | 549,451        | 431,593           | 1.27x     |
| 随机写入 | 403,323        | 205,656           | 1.96x     |
| 范围扫描 | 654,695        | 288,699           | 2.27x     |
| 混合读写 | 383,686        | 324,433           | 1.18x     |

### 不同内存限制对比 (Docker)

| 场景     | 内存 | LMDB (ops/sec) | RocksDB (ops/sec) | LMDB 优势 |
| -------- | ---- | -------------- | ----------------- | --------- |
| 随机读取 | 128M | 548,908        | 205,969           | **2.67x** |
| 随机读取 | 256M | 549,451        | 431,593           | 1.27x     |
| 随机读取 | 1G   | 560,695        | 435,844           | 1.29x     |
| 随机写入 | 128M | 365,323        | 111,630           | **3.27x** |
| 随机写入 | 256M | 403,323        | 205,656           | 1.96x     |
| 随机写入 | 1G   | 412,048        | 220,872           | 1.87x     |
| 范围扫描 | 128M | 648,989        | 262,671           | **2.47x** |
| 范围扫描 | 256M | 654,695        | 288,699           | 2.27x     |
| 范围扫描 | 1G   | 617,865        | 298,253           | 2.07x     |

内存越少，LMDB 优势越大。

### 内存压力测试 (128MB 内存限制, Docker 256MB 物理内存)

#### 磁盘实际占用

| 级别                | 期望数据 | LMDB 实际磁盘  | RocksDB 实际磁盘 |
| ------------------- | -------- | -------------- | ---------------- |
| sufficient (0.4x)   | 51 MB    | 65 MB (1.27x)  | 89 MB (1.74x)    |
| close (0.9x)        | 115 MB   | 147 MB (1.28x) | 274 MB (2.38x)   |
| insufficient (2.0x) | 256 MB   | 325 MB (1.27x) | 494 MB (1.93x)   |
| severe (4.0x)       | 512 MB   | 650 MB (1.27x) | 767 MB (1.50x)   |

LMDB 磁盘膨胀稳定在 **1.27x**（B+ 树页对齐），RocksDB **1.5-2.4x**（SST + WAL + compaction 临时空间）。

#### 性能数据

| 级别             | 操作     | LMDB    | RocksDB | 优势方           |
| ---------------- | -------- | ------- | ------- | ---------------- |
| **sufficient**   | 随机读   | 312,754 | 11,196  | LMDB **28x**     |
|                  | 随机写   | 95,120  | 247,684 | RocksDB **2.6x** |
|                  | 范围扫描 | 910,916 | 367,661 | LMDB **2.5x**    |
| **close**        | 随机读   | 424,520 | 3,386   | LMDB **125x**    |
|                  | 随机写   | 88,518  | 131,058 | RocksDB **1.5x** |
|                  | 范围扫描 | 917,333 | 282,853 | LMDB **3.2x**    |
| **insufficient** | 随机读   | 7,745   | 3,139   | LMDB **2.5x**    |
|                  | 随机写   | 7,161   | 163,747 | RocksDB **23x**  |
|                  | 范围扫描 | 485,812 | 152,516 | LMDB **3.2x**    |
| **severe**       | 随机读   | 3,637   | 2,936   | LMDB **1.2x**    |
|                  | 随机写   | 3,626   | 137,927 | RocksDB **38x**  |
|                  | 范围扫描 | 392,139 | 49,779  | LMDB **7.9x**    |

### Key 顺序写入测试 (128MB 内存限制, Docker 256MB 物理内存)

#### 1x 数据量 (数据 ≈ 内存)

| 顺序 | LMDB 写入 (ops/s) | RocksDB 写入 (ops/s) | LMDB 磁盘  | RocksDB 磁盘 |
| ---- | ----------------- | -------------------- | ---------- | ------------ |
| 升序 | 23,205            | 226,003              | 163 MB     | 166 MB       |
| 降序 | 20,221            | 225,525              | **329 MB** | 166 MB       |
| 随机 | 15,030            | 217,038              | 236 MB     | 235 MB       |

| 顺序 | LMDB 读取 (ops/s) | RocksDB 读取 (ops/s) |
| ---- | ----------------- | -------------------- |
| 升序 | 264,662           | 2,213                |
| 降序 | 3,485             | 2,079                |
| 随机 | 14,193            | 1,059                |

#### 2x 数据量 (数据 = 2× 内存)

| 顺序 | LMDB 写入 (ops/s) | RocksDB 写入 (ops/s) | LMDB 磁盘  | RocksDB 磁盘 |
| ---- | ----------------- | -------------------- | ---------- | ------------ |
| 升序 | 40,223            | 279,962              | 325 MB     | 309 MB       |
| 降序 | 37,464            | 293,174              | **656 MB** | 309 MB       |
| 随机 | 5,815             | 246,280              | 461 MB     | 380 MB       |

| 顺序 | LMDB 读取 (ops/s) | RocksDB 读取 (ops/s) |
| ---- | ----------------- | -------------------- |
| 升序 | 5,421             | 2,384                |
| 降序 | 1,713             | 2,185                |
| 随机 | 2,063             | 533                  |

---

## 关键发现

### 1. 内存充足时 LMDB 读取碾压

sufficient 级别随机读 LMDB 快 28x，close 级别快 125x。mmap 零拷贝 + 操作系统页缓存在此场景完美发挥。LMDB 的 `get()` 是同步调用，直接从 mmap 内存返回指针，无需反序列化；RocksDB 需要经过块缓存查找 → SST 读取 → 反序列化的异步路径。

### 2. 数据超过内存后 LMDB 读取断崖式下跌

LMDB 随机读从 424K ops/sec (close) 暴跌到 7.7K (insufficient)，跌幅 **98%**。原因：mmap 页缓存失效，每次读取触发 page fault，内核需要从磁盘换入页面。RocksDB 下跌更平缓（11K → 3.4K → 3.1K），因为 LSM-Tree 的块缓存层本身就是为磁盘访问设计的。

### 3. 内存不足时 LMDB 写入严重退化

insufficient 级别 LMDB 写入仅 7.1K ops/sec，RocksDB 仍保持 164K。LMDB 的 B+ 树写入需要修改 mmap 页面，内存不足时 page fault 开销巨大。RocksDB 的 LSM-Tree 写入只追加 memtable（内存中的有序表），写满后异步刷盘，对内存需求小得多。

### 4. 极端不足时 RocksDB 范围扫描崩溃

severe 级别 RocksDB 范围扫描仅 49K ops/sec，LMDB 392K（7.9x 差距）。RocksDB 块缓存无法容纳数据，每次迭代需要读磁盘 + 解压 SST 文件。LMDB 的 mmap 迭代器直接顺序读文件，操作系统预读（readahead）更高效。

### 5. 磁盘放大差异显著

LMDB 磁盘占用始终稳定在数据的 1.27x，RocksDB 最高达 2.4x。原因：

- LMDB：单一 `data.mdb` 文件，B+ 树页对齐开销固定
- RocksDB：SST 文件 + WAL 日志 + compaction 临时空间 + MANIFEST 等元数据

在内存受限场景下，RocksDB 更大的磁盘占用意味着更多 I/O，进一步拖慢性能。

### 6. Key 写入顺序对 LMDB 影响巨大，RocksDB 几乎无感

**LMDB 降序写入导致磁盘膨胀 2x：** 1x 数据量下，升序写入 LMDB 占 163 MB，降序写入暴涨到 329 MB（2x 膨胀）。2x 数据量下降序更达 656 MB（升序 325 MB）。原因：B+ 树降序插入触发最坏情况的页分裂——每插入一个 key 都落到当前页最左位置，导致页 50% 空间浪费。RocksDB 降序写入磁盘与升序完全一致（166 MB / 309 MB），LSM-Tree 的 memtable 排序后刷盘，写入顺序无影响。

**LMDB 随机写入性能随无序度剧降：** 1x 数据量下，升序 23K ops/s → 降序 20K → 随机 15K；2x 数据量下升序 40K → 随机暴跌至 5.8K（7x 差距）。RocksDB 三种顺序均在 217-293K ops/s 范围内，差异不到 20%。B+ 树的随机写入引发大量非连续页分裂和 page fault，LSM-Tree 无论写入顺序都只追加 memtable。

**LMDB 降序写入后读取性能也受损：** 1x 数据量下，升序写入后随机读 264K ops/s，降序仅 3.5K（75x 差距）。降序写入导致的页分裂使 B+ 树空间局部性极差，mmap 页缓存命中率暴跌。

## 选型建议

| 场景                      | 推荐        | 原因                      |
| ------------------------- | ----------- | ------------------------- |
| 读多写少 + 低延迟         | **LMDB**    | mmap 零拷贝读取无可匹敌   |
| 内存充足 + 混合负载       | **LMDB**    | 全场景综合更优            |
| 写多读少 + 内存紧张       | **RocksDB** | LSM-Tree 写入对内存更友好 |
| 数据远大于内存 + 读写混合 | **RocksDB** | 写入性能退化更平缓        |
| Key 顺序不可控 + 内存受限 | **RocksDB** | B+ 树对写入顺序极敏感     |
| 嵌入式/边缘设备（小内存） | **看场景**  | 只读 LMDB，写密集 RocksDB |
| 需要悲观事务              | **RocksDB** | LMDB 仅支持乐观锁         |
