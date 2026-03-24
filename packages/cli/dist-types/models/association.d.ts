/**
 * Association 数据模型
 *
 * Block 之间的关系 - 知识网络的基础
 */
/**
 * 关联类型
 */
export declare enum AssociationType {
    /** 内容相似（可能重复或描述同一件事） */
    SIMILAR = "similar",
    /** 主题相关（同一领域的不同方面） */
    RELATED = "related",
    /** 内容矛盾（决策冲突、说法不一致） */
    CONFLICTS = "conflicts",
    /** 细化/补充（更详细的版本） */
    REFINES = "refines",
    /** 替代/更新（新版本替代旧版本） */
    SUPERSEDES = "supersedes",
    /** 因果关系（A 导致 B） */
    CAUSES = "causes",
    /** 依赖关系（A 依赖 B） */
    DEPENDS_ON = "depends_on"
}
/**
 * 关联方向
 */
export declare enum AssociationDirection {
    /** 单向：from → to */
    ONE_WAY = "one_way",
    /** 双向：from ↔ to */
    BI_DIRECTIONAL = "bi_directional"
}
/**
 * 关联接口定义
 */
export interface Association {
    /** 唯一标识符，格式: asso_<hex> */
    id: string;
    /** 源 block ID */
    from_id: string;
    /** 目标 block ID */
    to_id: string;
    /** 关联类型 */
    type: AssociationType;
    /** 关联方向 */
    direction: AssociationDirection;
    /** 置信度 0-1 */
    confidence: number;
    /** 关联说明（可选，如 LLM 生成的解释） */
    reason?: string;
    /** 创建时间戳 */
    created_at: number;
    /** 关联的上下文标签（用于推理） */
    context_tags?: string[];
}
/**
 * 关联创建参数
 */
export type CreateAssociationInput = {
    from_id: string;
    to_id: string;
    type: AssociationType;
    direction?: AssociationDirection;
    confidence: number;
    reason?: string;
    context_tags?: string[];
};
/**
 * 关联查询过滤器
 */
export interface AssociationFilter {
    /** 按 from_id 筛选 */
    from_id?: string;
    /** 按 to_id 筛选 */
    to_id?: string;
    /** 按类型筛选 */
    type?: AssociationType;
    /** 最低置信度 */
    minConfidence?: number;
    /** 返回数量限制 */
    limit?: number;
}
/**
 * 关联统计
 */
export interface AssociationStats {
    /** 总关联数 */
    total: number;
    /** 按类型分组统计 */
    byType: Record<AssociationType, number>;
    /** 平均置信度 */
    avgConfidence: number;
    /** 最活跃的 block（关联最多） */
    mostConnected: Array<{
        block_id: string;
        count: number;
    }>;
}
/**
 * 生成关联 ID
 */
export declare function generateAssociationId(): string;
/**
 * 判断关联类型是否需要双向处理
 */
export declare function isBiDirectionalType(type: AssociationType): boolean;
/**
 * 获取关联类型的中文描述
 */
export declare function getAssociationTypeLabel(type: AssociationType): string;
//# sourceMappingURL=association.d.ts.map