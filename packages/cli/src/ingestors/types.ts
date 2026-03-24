/**
 * Corivo 插件接口契约
 *
 * 实现此接口的 npm 包可通过 config.json 的 plugins 字段注册到 heartbeat。
 * 采集（RealtimeCollector）是插件能力之一，未来可扩展更多 capability。
 */
import type { CorivoDatabase } from '../storage/database.js';

/** 实时采集能力接口 */
export interface RealtimeCollector {
  startWatching(db: CorivoDatabase): Promise<void>;
  /**
   * 停止监听，释放资源。
   * 幂等：允许在 startWatching 未调用时调用，不应抛出异常。
   */
  stop(): Promise<void>;
}

/**
 * Corivo 插件 manifest
 *
 * 每个插件包的 default export 必须符合此接口。
 * name 仅用于日志，不做版本兼容检查。
 */
export interface CorivoPlugin {
  name: string;
  create(): RealtimeCollector;
}
