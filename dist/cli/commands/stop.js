/**
 * CLI 命令 - stop
 *
 * 停止心跳守护进程
 */
import fs from 'node:fs/promises';
import { getPidFilePath } from '../../storage/database';
import { ProcessError } from '../../errors';
export async function stopCommand() {
    const pidPath = getPidFilePath();
    let pid;
    try {
        const pidStr = await fs.readFile(pidPath, 'utf-8');
        pid = parseInt(pidStr);
    }
    catch {
        throw new ProcessError('心跳进程未运行');
    }
    // 检查进程是否存在
    try {
        process.kill(pid, 0);
    }
    catch {
        await fs.unlink(pidPath);
        throw new ProcessError('心跳进程未运行');
    }
    // 发送 SIGTERM
    try {
        process.kill(pid, 'SIGTERM');
    }
    catch (error) {
        // 进程可能已经退出
    }
    // 删除 PID 文件
    await fs.unlink(pidPath);
    console.log('✅ 心跳守护进程已停止');
}
//# sourceMappingURL=stop.js.map