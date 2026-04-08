import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js'

export class UnsupportedServiceManager implements ServiceManager {
  isSupported(): boolean {
    return false
  }

  async install(_config: ServiceConfig): Promise<ServiceResult> {
    return {
      success: false,
      error: `此平台不支持 service manager（当前：${process.platform}）\n请手动运行: node ./dist/runtime/daemon/heartbeat.js`,
    }
  }

  async uninstall(): Promise<ServiceResult> {
    return {
      success: false,
      error: `此平台不支持 service manager（当前：${process.platform}）`,
    }
  }

  async getStatus(): Promise<ServiceStatus> {
    return { loaded: false, running: false }
  }
}
