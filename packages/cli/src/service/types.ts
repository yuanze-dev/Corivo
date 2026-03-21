export interface ServiceConfig {
  /** corivo 二进制路径或 "node /path/to/cli.js" 字符串，由 MacOSServiceManager 内部负责拆分 */
  corivoBin: string
  dbKey: string
  dbPath: string
}

export interface ServiceStatus {
  loaded: boolean
  running: boolean
  pid?: number
}

export interface ServiceResult {
  success: boolean
  error?: string
}

export interface ServiceManager {
  install(config: ServiceConfig): Promise<ServiceResult>
  uninstall(): Promise<ServiceResult>
  getStatus(): Promise<ServiceStatus>
  /** 仅供信息查询，不影响路由；start.ts 不检查此方法，直接调用 install() */
  isSupported(): boolean
}
