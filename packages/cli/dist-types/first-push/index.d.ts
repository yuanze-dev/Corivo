/**
 * First Push - 首次激活时输出自我介绍
 *
 * 这是 Corivo 的第一个 Aha Moment：
 * 用户安装完成后，Corivo 主动展示「我已经认识你了」
 */
import { type IdentityProfile } from './profile.js';
export interface FirstPushOptions {
    /** 最少信息条数，低于此数量输出简短版 */
    minBlocks?: number;
    /** 是否输出完整信息 */
    verbose?: boolean;
}
/**
 * 生成首次激活的推送消息
 */
export declare function generateFirstPush(blocks: Array<{
    content: string;
    annotation: string;
    metadata?: Record<string, unknown>;
}>, options?: FirstPushOptions): {
    message: string;
    profile: IdentityProfile;
    isFull: boolean;
};
/**
 * 获取欢迎消息（不包含画像信息）
 */
export declare function getWelcomeMessage(): string;
declare const _default: {
    generateFirstPush: typeof generateFirstPush;
    getWelcomeMessage: typeof getWelcomeMessage;
};
export default _default;
//# sourceMappingURL=index.d.ts.map