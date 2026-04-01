export type ExtractionProvider = 'claude' | 'codex';

export type ExtractionPrompt = string | string[];

export type ExtractionStatus =
  | 'success'
  | 'error'
  | 'timeout';

export interface ExtractionInput {
  provider: ExtractionProvider;
  prompt: ExtractionPrompt;
  timeoutMs?: number;
}

export interface ExtractionResult {
  provider: ExtractionProvider;
  status: ExtractionStatus;
  result: string | null;
  error?: string;
}
