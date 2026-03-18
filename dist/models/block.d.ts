/**
 * Block 数据模型
 *
 * Corivo 的最小存储单元 —— 一段语义自包含的自然语言文本
 */
import type { Pattern } from './pattern';
/**
 * Block 状态
 */
export type BlockStatus = 'active' | 'cooling' | 'cold' | 'archived';
/**
 * Block 接口定义
 */
export interface Block {
    /** 唯一标识符，格式: blk_<hex> */
    id: string;
    /** 自然语言正文 */
    content: string;
    /** 双维度标注：性质 · 领域 · 标签 */
    annotation: string;
    /** 引用的其他 block ID 列表 */
    refs: string[];
    /** 采集来源标识 */
    source: string;
    /** 生命力分值 0-100 */
    vitality: number;
    /** 当前状态 */
    status: BlockStatus;
    /** 累计被查询或引用的次数 */
    access_count: number;
    /** 最近一次被触达的时间戳 */
    last_accessed: number | null;
    /** 决策模式（仅决策类 block） */
    pattern?: Pattern;
    /** 创建时间戳 */
    created_at: number;
    /** 最近更新时间戳 */
    updated_at: number;
}
/**
 * Block 创建参数（不需要 id 和时间戳）
 */
export type CreateBlockInput = {
    content: string;
    annotation?: string;
    refs?: string[];
    source?: string;
    vitality?: number;
    status?: BlockStatus;
    access_count?: number;
    last_accessed?: number | null;
    pattern?: Pattern;
};
/**
 * Block 更新参数（部分字段可更新）
 *
 * 注意: updated_at 仅用于测试，生产环境总是自动设置为当前时间
 */
export type UpdateBlockInput = Partial<Pick<Block, 'content' | 'annotation' | 'vitality' | 'status' | 'access_count' | 'last_accessed' | 'pattern' | 'updated_at' | 'created_at'>>;
/**
 * Block 查询过滤器
 */
export interface BlockFilter {
    /** 按标注筛选 */
    annotation?: string;
    /** 按状态筛选 */
    status?: BlockStatus;
    /** 最低生命力 */
    minVitality?: number;
    /** 返回数量限制 */
    limit?: number;
}
/**
 * Annotation 性质（第一维度）
 */
export declare const NATURE_TYPES: {
    readonly FACT: "事实";
    readonly KNOWLEDGE: "知识";
    readonly DECISION: "决策";
    readonly INSTRUCTION: "指令";
};
export type NatureType = (typeof NATURE_TYPES)[keyof typeof NATURE_TYPES];
/**
 * Annotation 领域（第二维度）
 */
export declare const DOMAIN_TYPES: {
    readonly SELF: "self";
    readonly PEOPLE: "people";
    readonly PROJECT: "project";
    readonly AREA: "area";
    readonly ASSET: "asset";
    readonly KNOWLEDGE: "knowledge";
    readonly TEAM: "team";
};
export type DomainType = (typeof DOMAIN_TYPES)[keyof typeof DOMAIN_TYPES];
/**
 * 验证 annotation 格式
 *
 * @param annotation - 待验证的标注字符串
 * @returns 是否有效
 */
export declare function validateAnnotation(annotation: string): boolean;
/**
 * 生成 Block ID
 *
 * @returns 新的 block ID
 */
export declare function generateBlockId(): string;
/**
 * 判断 block 是否处于完成状态（非 pending）
 *
 * @param block - Block 对象
 * @returns 是否完成
 */
export declare function isBlockComplete(block: Block): boolean;
/**
 * 计算两个时间戳之间的天数差
 *
 * @param earlier - 较早的时间戳
 * @param later - 较晚的时间戳
 * @returns 天数差
 */
export declare function daysBetween(earlier: number, later: number): number;
/**
 * 根据 annotation 推断衰减率
 *
 * @param annotation - Block 标注
 * @returns 每天衰减的点数
 */
export declare function inferDecayRate(annotation: string): number;
/**
 * 根据生命力计算状态
 *
 * @param vitality - 生命力值
 * @returns 对应的状态
 */
export declare function vitalityToStatus(vitality: number): BlockStatus;
//# sourceMappingURL=block.d.ts.map