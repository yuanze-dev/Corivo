export interface ServiceConfig {
  /** corivo binary path, or command string in the format "node /path/to/cli.js" */
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

/**
 * Background resident process manager. All methods do not throw exceptions, and failure is returned via ServiceResult.success=false.
 */
export interface ServiceManager {
  install(config: ServiceConfig): Promise<ServiceResult>
  uninstall(): Promise<ServiceResult>
  getStatus(): Promise<ServiceStatus>
  /** It is only for information query and does not affect routing; start.ts does not check this method and directly calls install() */
  isSupported(): boolean
}
