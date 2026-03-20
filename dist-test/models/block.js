"use strict";
/**
 * Block 数据模型
 *
 * Corivo 的最小存储单元 —— 一段语义自包含的自然语言文本
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOMAIN_TYPES = exports.NATURE_TYPES = void 0;
exports.validateAnnotation = validateAnnotation;
exports.generateBlockId = generateBlockId;
exports.isBlockComplete = isBlockComplete;
exports.daysBetween = daysBetween;
exports.inferDecayRate = inferDecayRate;
exports.vitalityToStatus = vitalityToStatus;
/**
 * Annotation 性质（第一维度）
 */
exports.NATURE_TYPES = {
    FACT: '事实', // 密码、配置、数据点、具体事件
    KNOWLEDGE: '知识', // 教程、总结、分析、方法论
    DECISION: '决策', // 选型结论、方案确定、规则约定
    INSTRUCTION: '指令', // 用户偏好、行为规则、自动化触发
};
/**
 * Annotation 领域（第二维度）
 */
exports.DOMAIN_TYPES = {
    SELF: 'self', // 用户本人
    PEOPLE: 'people', // 具体的人
    PROJECT: 'project', // 有目标和终点的事
    AREA: 'area', // 需要长期维护的领域
    ASSET: 'asset', // 具体的物/账户/资源
    KNOWLEDGE: 'knowledge', // 独立于场景的通用知识
    TEAM: 'team', // v0.10 新增：团队共享信息
};
/**
 * 验证 annotation 格式
 *
 * @param annotation - 待验证的标注字符串
 * @returns 是否有效
 */
function validateAnnotation(annotation) {
    var parts = annotation.split(' · ');
    // 必须有三个部分
    if (parts.length !== 3) {
        return false;
    }
    // 第一部分必须是有效的性质
    var validNatures = new Set(Object.values(exports.NATURE_TYPES));
    if (!validNatures.has(parts[0])) {
        return false;
    }
    // 第二部分必须是有效的领域
    var validDomains = new Set(Object.values(exports.DOMAIN_TYPES));
    if (!validDomains.has(parts[1])) {
        return false;
    }
    // 第三部分可以是任意标签
    return parts[2].length > 0;
}
/**
 * 生成 Block ID
 *
 * @returns 新的 block ID
 */
function generateBlockId() {
    var timestamp = Date.now().toString(36);
    var random = Math.random().toString(36).substring(2, 10);
    return "blk_".concat(timestamp).concat(random);
}
/**
 * 判断 block 是否处于完成状态（非 pending）
 *
 * @param block - Block 对象
 * @returns 是否完成
 */
function isBlockComplete(block) {
    return block.annotation !== 'pending';
}
/**
 * 计算两个时间戳之间的天数差
 *
 * @param earlier - 较早的时间戳
 * @param later - 较晚的时间戳
 * @returns 天数差
 */
function daysBetween(earlier, later) {
    return (later - earlier) / 86400000;
}
/**
 * 根据 annotation 推断衰减率
 *
 * @param annotation - Block 标注
 * @returns 每天衰减的点数
 */
function inferDecayRate(annotation) {
    var lower = annotation.toLowerCase();
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
function vitalityToStatus(vitality) {
    if (vitality === 0)
        return 'archived';
    if (vitality < 30)
        return 'cold';
    if (vitality < 60)
        return 'cooling';
    return 'active';
}
