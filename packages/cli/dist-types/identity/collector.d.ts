/**
 * 动态指纹采集系统
 *
 * 核心思想：
 * - 不硬编码平台列表
 * - 扫描用户系统，动态发现已安装的软件
 * - 根据发现的软件，加载对应的指纹采集器
 *
 * 隐私保护（重要）：
 * - 只采集配置的哈希指纹，不采集原始内容
 * - 使用 SHA256 单向哈希，不可逆
 * - 只取哈希的前 16 位，进一步降低信息量
 * - 指纹仅用于身份识别，无法还原出原始数据
 *
 * 具体措施：
 * - 不存储 token、密码、私钥等原始敏感信息
 * - 不采集聊天记录、文件内容等用户数据
 * - 哈希值只存储在用户本地设备
 * - 用户可随时查看和删除 identity.json
 *
 * 优势：
 * - 新平台只需添加采集器，无需修改核心代码
 * - 用户没有的软件不会尝试采集
 * - 可以自动发现新的指纹来源
 */
import type { Fingerprint } from './fingerprint.js';
/**
 * 指纹采集器接口
 *
 * 每个采集器负责：
 * 1. 检测对应软件是否已安装
 * 2. 从软件配置中提取用户标识
 * 3. 返回标准化指纹
 */
export interface FingerprintCollectorPlugin {
    /** 采集器唯一标识 */
    id: string;
    /** 平台名称 */
    platform: string;
    /** 检测软件是否已安装 */
    detect(): Promise<boolean>;
    /** 提取指纹 */
    collect(): Promise<Fingerprint | null>;
    /** 置信度 */
    confidence: 'high' | 'medium' | 'low';
}
/**
 * 软件配置位置定义
 */
interface SoftwareConfig {
    /** 软件名称 */
    name: string;
    /** 平台标识 */
    platform: string;
    /** 配置文件路径（支持通配符） */
    configPaths: string[];
    /**
     * 提取指纹的函数
     *
     * 隐私要求：
     * - 只返回用户 ID、用户名等非敏感标识
     * - 不要返回 token、密钥、密码等敏感信息
     * - 返回值会被哈希处理，只取前 16 位
     */
    extractor: (content: string, filePath: string) => string | null;
    /** 置信度 */
    confidence: 'high' | 'medium' | 'low';
    /** 提取方法描述 */
    method: string;
}
/**
 * 动态指纹采集器
 */
export declare class DynamicFingerprintCollector {
    /** 软件配置注册表 */
    private static softwareRegistry;
    /**
     * 注册软件配置
     *
     * 新平台只需调用此方法注册，无需修改核心代码
     */
    static registerSoftware(config: SoftwareConfig): void;
    /**
     * 批量注册软件配置
     */
    static registerSoftwareConfigs(configs: SoftwareConfig[]): void;
    /**
     * 自动发现并收集所有指纹
     *
     * 流程：
     * 1. 扫描已注册的软件配置
     * 2. 检测每个软件的配置文件是否存在
     * 3. 对存在的配置文件提取指纹
     * 4. 哈希处理（单向，不可逆）
     * 5. 返回收集到的所有指纹
     */
    static collectAll(): Promise<Fingerprint[]>;
    /**
     * 查找第一个存在的配置文件路径
     */
    private static findConfigPath;
    /**
     * 展开路径中的环境变量和 ~
     */
    private static expandPath;
    /**
     * 采集设备指纹
     */
    private static collectDeviceFingerprint;
    /**
     * 获取已注册的软件列表
     */
    static getRegisteredSoftware(): string[];
    /**
     * 获取已安装的软件列表
     */
    static getInstalledSoftware(): Promise<string[]>;
}
/**
 * 初始化默认软件配置
 *
 * 注册常见开发工具的指纹采集规则
 */
export declare function initializeDefaultSoftwareConfigs(): void;
/**
 * 创建便捷的导出别名
 */
export declare const DynamicCollector: typeof DynamicFingerprintCollector;
export {};
//# sourceMappingURL=collector.d.ts.map