import type { ServiceManager } from './types.js';
export * from './types.js';
export { MacOSServiceManager } from './macos.js';
export { LinuxServiceManager } from './linux.js';
export { UnsupportedServiceManager } from './unsupported.js';
export declare function getServiceManager(): ServiceManager;
/**
 * 探测当前环境的 corivo 二进制路径。
 * 注意：fallback 中 process.cwd() 取决于用户执行 corivo 时的目录，
 * 这是继承自旧 daemon.ts 的开发模式假设。
 */
export declare function resolveCorivoBin(): Promise<string>;
//# sourceMappingURL=index.d.ts.map