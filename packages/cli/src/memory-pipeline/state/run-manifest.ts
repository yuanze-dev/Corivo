import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface RunManifest {
  runId: string;
  pipelineId: string;
  trigger: string;
  status: string;
  stages: unknown[];
}

export async function writeRunManifest(filePath: string, manifest: RunManifest): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf8');
}

export async function readRunManifest(filePath: string): Promise<RunManifest> {
  const payload = await readFile(filePath, 'utf8');
  return JSON.parse(payload) as RunManifest;
}
