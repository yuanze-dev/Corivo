/**
 * 心跳守护进程
 *
 * 后台运行，自动处理 pending block 和执行衰减
 */
/**
 * 心跳引擎
 */
export declare class Heartbeat {
    private running;
    private timeoutRef;
    /**
     * 启动心跳循环
     */
    start(): Promise<void>;
    /**
     * 主循环
     */
    private run;
    /**
     * 停止心跳
     */
    stop(): Promise<void>;
    /**
     * 处理 pending block
     */
    private processPendingBlocks;
    /**
     * 处理衰减
     */
    private processVitalityDecay;
    /**
     * 延迟函数
     */
    private sleep;
}
//# sourceMappingURL=heartbeat.d.ts.map