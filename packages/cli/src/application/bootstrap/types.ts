import type { Command } from 'commander';
import type { HostAdapter, HostDoctorResult, HostId, HostInstallResult } from '@/infrastructure/hosts';
import type { HostDoctorRequest } from '@/application/hosts/doctor-host';
import type { HostInstallRequest } from '@/application/hosts/install-host';
import type { HostUninstallRequest } from '@/application/hosts/uninstall-host';
import type { QueryOptions, PromptQueryCommandOptions, SearchQueryCommandInput } from '@/application/bootstrap/query-execution';
import type { MemoryPipelineMode } from '@/application/memory/run-memory-pipeline';
import type { ExtractionProvider } from '@/infrastructure/llm/types';
import type { MemoryPipelineRunResult } from '@/memory-pipeline';
import type { Logger } from '@/utils/logging';

export interface CliAppCommands {
  memory: Command;
  host: Command;
  daemon: Command;
  query: Command;
  save: Command;
  supermemory: Command;
}

export interface CliAppCapabilities {
  logger: Logger;
}

export interface CliApp {
  commands: CliAppCommands;
  capabilities: CliAppCapabilities;
}

export interface MemoryCommandCapabilities {
  executor: (
    mode: MemoryPipelineMode,
    provider: ExtractionProvider,
  ) => Promise<MemoryPipelineRunResult>;
  printer: (result: MemoryPipelineRunResult) => void;
  logger: Pick<Logger, 'debug'>;
}

export interface HostCommandCapabilities {
  listHosts: () => readonly HostAdapter[];
  installHost: (input: HostInstallRequest) => Promise<HostInstallResult>;
  doctorHost: (input: HostDoctorRequest) => Promise<HostDoctorResult>;
  uninstallHost: (input: HostUninstallRequest) => Promise<HostInstallResult>;
  writeInfo: (text: string) => void;
  writeError: (text: string) => void;
  writeSuccess: (text: string) => void;
  logger: Pick<Logger, 'debug'>;
  hostImportCommand: Command;
}

export interface DaemonCommandCapabilities {
  runDaemon: () => Promise<void>;
  logger: Pick<Logger, 'log' | 'error'>;
}

export interface QueryCommandCapabilities {
  runPromptQuery: (options: PromptQueryCommandOptions) => Promise<string>;
  runSearchQuery: (input: SearchQueryCommandInput) => Promise<void>;
  writeOutput: (text: string) => void;
  logger: Pick<Logger, 'debug'>;
}

export interface HostCommandInput {
  host: HostId;
  target?: string;
}

export interface QueryCommandInput {
  query: string | undefined;
  options: QueryOptions;
}
