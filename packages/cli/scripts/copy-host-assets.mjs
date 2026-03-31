import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoHostsRoot = path.resolve(packageRoot, '../plugins/hosts');
const repoRuntimeRoot = path.resolve(packageRoot, '../plugins/runtime');
const repoOpencodeAssetPath = path.join(repoRuntimeRoot, 'opencode', 'assets', 'corivo.ts');
const bundledHostsRoot = path.resolve(packageRoot, 'dist/host-assets/hosts');
const bundledRuntimeRoot = path.resolve(packageRoot, 'dist/host-assets/runtime');
const bundledHosts = ['claude-code', 'codex', 'cursor'];

async function copyHostAssets() {
  await fs.rm(bundledHostsRoot, { recursive: true, force: true });
  await fs.rm(bundledRuntimeRoot, { recursive: true, force: true });
  await fs.mkdir(bundledHostsRoot, { recursive: true });
  await fs.mkdir(bundledRuntimeRoot, { recursive: true });
  const bundledOpencodeAssetPath = path.join(bundledRuntimeRoot, 'opencode', 'corivo.ts');
  await fs.mkdir(path.dirname(bundledOpencodeAssetPath), { recursive: true });

  await Promise.all([
    bundledHosts.map(async (host) => {
      const sourceDir = path.join(repoHostsRoot, host);
      const targetDir = path.join(bundledHostsRoot, host);
      await fs.cp(sourceDir, targetDir, { recursive: true });
    }),
    fs.copyFile(repoOpencodeAssetPath, bundledOpencodeAssetPath),
  ].flat());
}

copyHostAssets().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
