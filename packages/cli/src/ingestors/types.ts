/**
 * Ingestor 插件接口契约
 *
 * 实现此接口的 npm 包可通过 config.json 的 ingestors 字段注册到 heartbeat。
 */
import type { CorivoDatabase } from '../storage/database.js';

/** 实时采集器接口 */
export interface RealtimeIngestor {
  startWatching(db: CorivoDatabase): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Ingestor 插件 manifest
 *
 * 每个 ingestor 包的 default export 必须符合此接口。
 * name 仅用于日志，不做版本兼容检查。
 */
export interface IngestorPlugin {
  name: string;
  create(): RealtimeIngestor;
}
