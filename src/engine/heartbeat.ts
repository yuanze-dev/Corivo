/**
 * 心跳守护进程
 *
 * 后台运行，自动处理 pending block 和执行衰减
 */

const HEARTBEAT_INTERVAL = 5000; // 5 秒

/**
 * 心跳引擎
 */
export class Heartbeat {
  private running = false;
  private timeoutRef: NodeJS.Timeout | null = null;

  /**
   * 启动心跳循环
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('心跳已在运行');
      return;
    }

    // 从环境变量获取密钥（由 CLI 进程传入）
    const encryptedDbKey = process.env.CORIVO_ENCRYPTED_KEY;
    const dbPath = process.env.CORIVO_DB_PATH;

    if (!encryptedDbKey || !dbPath) {
      throw new Error('缺少环境变量：CORIVO_ENCRYPTED_KEY 或 CORIVO_DB_PATH');
    }

    // 需要从配置文件获取主密钥，这里简化为直接传递
    // 实际应用中可以通过 IPC 从主进程获取
    console.log('心跳进程启动中...');

    this.running = true;
    this.run();
  }

  /**
   * 主循环
   */
  private async run(): Promise<void> {
    while (this.running) {
      const start = Date.now();

      try {
        // 处理待标注的 block
        await this.processPendingBlocks();

        // 处理衰减
        await this.processVitalityDecay();
      } catch (error) {
        console.error('心跳处理错误:', error);
      }

      // 等待下一个周期
      const elapsed = Date.now() - start;
      const wait = Math.max(0, HEARTBEAT_INTERVAL - elapsed);

      if (this.running) {
        await this.sleep(wait);
      }
    }

    console.log('心跳进程已停止');
  }

  /**
   * 停止心跳
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.timeoutRef) {
      clearTimeout(this.timeoutRef);
      this.timeoutRef = null;
    }
  }

  /**
   * 处理 pending block
   */
  private async processPendingBlocks(): Promise<void> {
    // TODO: 实现数据库连接和查询
    // 这里需要先实现从配置文件读取主密钥的逻辑
    // 为简化，暂时只打印日志

    console.log('[心跳] 处理 pending blocks...');
  }

  /**
   * 处理衰减
   */
  private async processVitalityDecay(): Promise<void> {
    console.log('[心跳] 处理 vitality 衰减...');
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 如果直接运行此文件（作为守护进程）
if (import.meta.url === `file://${process.argv[1]}`) {
  const heartbeat = new Heartbeat();

  heartbeat.start().catch((error) => {
    console.error('启动失败:', error);
    process.exit(1);
  });

  // 优雅退出
  process.on('SIGTERM', () => {
    console.log('\n收到 SIGTERM 信号，正在停止...');
    heartbeat.stop();
  });

  process.on('SIGINT', () => {
    console.log('\n收到 SIGINT 信号，正在停止...');
    heartbeat.stop();
  });
}
