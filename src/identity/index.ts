/**
 * 身份识别模块
 *
 * 提供基于平台指纹的用户身份识别和跨设备关联功能
 *
 * 子模块：
 * - fingerprint: 指纹采集和匹配
 * - identity: 身份管理
 * - collector: 动态指纹采集器
 * - auth: 身份验证（最高级别）
 */

export * from './fingerprint.js';
export * from './identity.js';
export * from './collector.js';
export * from './auth.js';
