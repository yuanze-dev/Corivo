/**
 * Cold Scan 类型定义
 * 用于首次安装时扫描用户本地环境，构建初始画像
 */

/**
 * 扫描源定义
 */
export interface ScanSource {
  /** 来源名称 */
  name: string;
  /** 文件路径（支持 ~ 展开）或路径生成函数 */
  path: string | (() => string[]) | (() => Promise<string[]>);
  /** 提取器：从内容中提取 blocks */
  extractor: (content: string, filePath: string) => Record<string, unknown>[] | Promise<Record<string, unknown>[]>;
  /** 优先级（越高越先扫描） */
  priority: number;
  /** 单源超时（毫秒） */
  timeout: number;
}

/**
 * 扫描结果
 */
export interface ScanResult {
  /** 来源名称 */
  source: string;
  /** 扫描的文件路径 */
  path: string;
  /** 提取到的 blocks 数量 */
  count: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 扫描配置
 */
export interface ScanConfig {
  /** 总超时时间（毫秒） */
  totalTimeout: number;
  /** 是否显示详细输出 */
  verbose: boolean;
  /** 跳过的扫描源名称列表 */
  skipSources: string[];
}

/**
 * 默认配置
 */
export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  totalTimeout: 15_000, // 15 秒
  verbose: false,
  skipSources: [],
};
