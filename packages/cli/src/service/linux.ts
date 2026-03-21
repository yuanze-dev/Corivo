import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js'

const NOT_IMPLEMENTED_ERROR = 'Linux systemd --user 支持尚未实现，请关注后续更新'

export class LinuxServiceManager implements ServiceManager {
  /** 尚未实现，仅供外部查询；不影响路由行为 */
  isSupported(): boolean {
    return false
  }

  async install(_config: ServiceConfig): Promise<ServiceResult> {
    return { success: false, error: NOT_IMPLEMENTED_ERROR }
  }

  async uninstall(): Promise<ServiceResult> {
    return { success: false, error: NOT_IMPLEMENTED_ERROR }
  }

  async getStatus(): Promise<ServiceStatus> {
    return { loaded: false, running: false }
  }
}
