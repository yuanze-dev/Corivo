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
export type UpdateBlockInput = Partial<
  Pick<Block, 'content' | 'annotation' | 'refs' | 'vitality' | 'status' | 'access_count' | 'last_accessed' | 'pattern' | 'updated_at' | 'created_at'>
>;

/**
 * Block 查询过滤器
 */
export interface BlockFilter {
  /** 按标注筛选（精确匹配） */
  annotation?: string;
  /** 按标注前缀筛选，如 "决策" 匹配所有 "决策 · ..." 标注（annotation 精确匹配优先） */
  annotationPrefix?: string;
  /** 按状态筛选 */
  status?: BlockStatus;
  /** 最低生命力 */
  minVitality?: number;
  /** 返回数量限制 */
  limit?: number;
  /** 按来源筛选 */
  source?: string;
  /** 排序字段（默认 updated_at） */
  sortBy?: 'updated_at' | 'vitality';
  /** 排序方向（默认 DESC） */
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Annotation 性质（第一维度）
 */
export const NATURE_TYPES = {
  FACT: '事实',       // 密码、配置、数据点、具体事件
  KNOWLEDGE: '知识',  // 教程、总结、分析、方法论
  DECISION: '决策',   // 选型结论、方案确定、规则约定
  INSTRUCTION: '指令', // 用户偏好、行为规则、自动化触发
} as const;

export type NatureType = (typeof NATURE_TYPES)[keyof typeof NATURE_TYPES];

/**
 * Annotation 领域（第二维度）
 */
export const DOMAIN_TYPES = {
  SELF: 'self',         // 用户本人
  PEOPLE: 'people',     // 具体的人
  PROJECT: 'project',   // 有目标和终点的事
  AREA: 'area',         // 需要长期维护的领域
  ASSET: 'asset',       // 具体的物/账户/资源
  KNOWLEDGE: 'knowledge', // 独立于场景的通用知识
  TEAM: 'team',         // v0.10 新增：团队共享信息
} as const;

export type DomainType = (typeof DOMAIN_TYPES)[keyof typeof DOMAIN_TYPES];

/**
 * 验证 annotation 格式
 *
 * @param annotation - 待验证的标注字符串
 * @returns 是否有效
 */
export function validateAnnotation(annotation: string): boolean {
  const parts = annotation.split(' · ');

  // 必须有三个部分
  if (parts.length !== 3) {
    return false;
  }

  // 第一部分：如果是已知的性质则验证，否则允许（灵活性）
  const validNatures = new Set<string>(Object.values(NATURE_TYPES));
  const nature = parts[0];
  // 允许任何非空的第一部分（扩展性）
  if (nature.length === 0) {
    return false;
  }

  // 第二部分：如果是已知的领域则验证，否则允许（灵活性）
  const validDomains = new Set<string>(Object.values(DOMAIN_TYPES));
  const domain = parts[1];
  // 允许任何非空的第二部分（扩展性）
  if (domain.length === 0) {
    return false;
  }

  // 第三部分可以是任意非空标签
  return parts[2].length > 0;
}

/**
 * 生成 Block ID
 *
 * @returns 新的 block ID
 */
export function generateBlockId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `blk_${timestamp}${random}`;
}

/**
 * 判断 block 是否处于完成状态（非 pending）
 *
 * @param block - Block 对象
 * @returns 是否完成
 */
export function isBlockComplete(block: Block): boolean {
  return block.annotation !== 'pending';
}

/**
 * 计算两个时间戳之间的天数差
 *
 * @param earlier - 较早的时间戳
 * @param later - 较晚的时间戳
 * @returns 天数差
 */
export function daysBetween(earlier: number, later: number): number {
  return (later - earlier) / 86400000;
}

/**
 * 根据 annotation 推断衰减率
 *
 * @param annotation - Block 标注
 * @returns 每天衰减的点数
 */
export function inferDecayRate(annotation: string): number {
  const lower = annotation.toLowerCase();

  // 事实类衰减最慢
  if (lower.startsWith('事实') || lower.includes('asset') || lower.includes('密码')) {
    return 0.5;
  }

  // 知识类衰减较快
  if (lower.startsWith('知识')) {
    return 2;
  }

  // 默认衰减率
  return 1;
}

/**
 * 根据生命力计算状态
 *
 * @param vitality - 生命力值
 * @returns 对应的状态
 */
export function vitalityToStatus(vitality: number): BlockStatus {
  if (vitality === 0) return 'archived';
  if (vitality < 30) return 'cold';
  if (vitality < 60) return 'cooling';
  return 'active';
}
