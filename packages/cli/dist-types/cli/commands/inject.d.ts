/**
 * CLI 命令 - inject
 *
 * 注入 Corivo 规则到项目配置文件
 */
export declare function injectCommand(options: {
    target?: string;
    eject?: boolean;
    global?: boolean;
    force?: boolean;
}): Promise<void>;
/**
 * 移除注入的规则
 */
declare function ejectRules(targetPath?: string): Promise<void>;
declare const _default: {
    injectCommand: typeof injectCommand;
    ejectRules: typeof ejectRules;
};
export default _default;
//# sourceMappingURL=inject.d.ts.map