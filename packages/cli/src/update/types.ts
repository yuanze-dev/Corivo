/**
 * 自动更新系统类型定义
 */

/**
 * 平台标识
 */
export type Platform = 'Darwin-arm64' | 'Darwin-x64' | 'Linux-x64';

/**
 * 版本信息
 */
export interface VersionInfo {
  /** 版本号 */
  version: string;
  /** 发布时间 */
  released_at: string;
  /** 是否有破坏性变更 */
  breaking: boolean;
  /** 更新日志 */
  changelog: string;
  /** 各平台二进制包（旧二进制更新链路保留字段） */
  binaries?: Record<Platform, BinaryInfo>;
}

/**
 * 二进制包信息
 */
export interface BinaryInfo {
  /** 下载 URL */
  url: string;
  /** SHA256 校验和 */
  checksum: string;
  /** 文件大小（字节） */
  size?: number;
}

/**
 * 更新配置
 */
export interface UpdateConfig {
  /** 是否启用自动更新 */
  auto?: boolean;
  /** 版本固定（如 "0.10.x"） */
  pin?: string;
  /** 检查间隔（毫秒） */
  checkInterval?: number;
}

/**
 * 更新状态
 */
export interface UpdateStatus {
  /** 当前版本 */
  currentVersion: string;
  /** 最新版本 */
  latestVersion: string | null;
  /** 是否有可用更新 */
  hasUpdate: boolean;
  /** 是否为破坏性更新 */
  isBreaking: boolean;
  /** 上次检查时间 */
  lastCheck: number | null;
  /** 下次检查时间 */
  nextCheck: number | null;
}

/**
 * 更新结果
 */
export interface UpdateResult {
  /** 是否成功 */
  success: boolean;
  /** 从哪个版本更新 */
  from?: string;
  /** 更新到哪个版本 */
  to?: string;
  /** 更新时间 */
  at?: string;
  /** 更新日志 */
  changelog?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * version.json 结构
 */
export interface VersionJson {
  version: string;
  released_at: string;
  breaking: boolean;
  changelog: string;
  binaries?: Record<Platform, BinaryInfo>;
}
