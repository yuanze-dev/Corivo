export interface ModelProcessor {
  process(
    inputs: string[],
  ): Promise<{
    outputs: string[];
    metadata?: Record<string, unknown>;
  }>;
}

export class NoopModelProcessor implements ModelProcessor {
  async process(inputs: string[]) {
    return {
      outputs: inputs,
    };
  }
}
