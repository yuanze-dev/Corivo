/**
 * Pattern 数据模型
 *
 * 表示从决策类 block 中提取的结构化决策模式
 */
/**
 * 验证 Pattern 对象
 */
export function validatePattern(pattern) {
    if (typeof pattern !== 'object' || pattern === null) {
        return false;
    }
    const p = pattern;
    return (typeof p.type === 'string' &&
        typeof p.decision === 'string' &&
        Array.isArray(p.dimensions) &&
        typeof p.confidence === 'number' &&
        p.confidence >= 0 &&
        p.confidence <= 1);
}
/**
 * 决策类型枚举
 */
export const DECISION_TYPES = {
    TECH_CHOICE: '技术选型',
    COMMUNICATION: '沟通策略',
    TIME_BASED: '时间相关',
    ARCHITECTURE: '架构决策',
    PRODUCT: '产品方向',
};
//# sourceMappingURL=pattern.js.map