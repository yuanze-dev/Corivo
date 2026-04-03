export type HostId =
  | 'claude-code'
  | 'codex'
  | 'cursor'
  | 'opencode';

export type HostCapability =
  | 'global-install'
  | 'project-install'
  | 'rules'
  | 'hooks'
  | 'notify'
  | 'plugin-file'
  | 'doctor'
  | 'uninstall'
  | 'history-import';

export type HostBridgeEvent =
  | 'session-start'
  | 'prompt-submit'
  | 'response-done'
  | 'realtime-ingest';

export type HostBridgeCommandName =
  | 'carry-over'
  | 'recall'
  | 'review'
  | 'ingest-message';

export interface HostBridgeCommand {
  host: HostId;
  event: HostBridgeEvent;
  command: HostBridgeCommandName;
  format: 'text' | 'hook-text' | 'json';
}

export interface HostInstallOptions {
  target?: string;
  force?: boolean;
  global?: boolean;
}

export interface HostInstallResult {
  success: boolean;
  host: HostId;
  path?: string;
  summary: string;
  error?: string;
}

export interface HostDoctorResult {
  ok: boolean;
  host: HostId;
  checks: Array<{ label: string; ok: boolean; detail: string }>;
}

export interface HostImportOptions {
  all?: boolean;
  since?: string;
  limit?: number;
  dryRun?: boolean;
  target?: string;
}

export interface HostImportResult {
  success: boolean;
  host: HostId;
  mode: 'full' | 'incremental';
  importedSessionCount: number;
  importedMessageCount: number;
  nextCursor?: string;
  summary: string;
  unavailableReason?: string;
  error?: string;
}

export interface HostAdapter {
  id: HostId;
  displayName: string;
  capabilities: HostCapability[];
  install(options: HostInstallOptions): Promise<HostInstallResult>;
  doctor(options: HostInstallOptions): Promise<HostDoctorResult>;
  uninstall?(options: HostInstallOptions): Promise<HostInstallResult>;
  importHistory?(options: HostImportOptions): Promise<HostImportResult>;
}
