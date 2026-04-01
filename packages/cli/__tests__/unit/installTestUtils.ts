import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const installScriptPath = path.join(repoRoot, 'scripts', 'install.sh');

async function writeFileWithMode(filePath: string, content: string) {
  await fs.writeFile(filePath, content, 'utf8');
  await fs.chmod(filePath, 0o755);
}

async function linkSystemCommand(binDir: string, commandName: string) {
  for (const candidate of [`/bin/${commandName}`, `/usr/bin/${commandName}`]) {
    try {
      await fs.access(candidate);
      await fs.symlink(candidate, path.join(binDir, commandName));
      return;
    } catch {
      // Try the next candidate path.
    }
  }
}

export async function createInstallTestEnv() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-install-test-'));
  const tempHome = path.join(tempDir, 'home');
  const binDir = path.join(tempDir, 'bin');
  const corivoLogPath = path.join(tempDir, 'corivo.log');

  await fs.mkdir(tempHome, { recursive: true });
  await fs.mkdir(path.join(tempHome, '.corivo'), { recursive: true });
  await fs.writeFile(path.join(tempHome, '.corivo', 'corivo.db'), '', 'utf8');
  await fs.mkdir(binDir, { recursive: true });

  await writeFileWithMode(
    path.join(binDir, 'node'),
    '#!/usr/bin/env bash\necho "v22.0.0"\n',
  );
  await writeFileWithMode(
    path.join(binDir, 'npm'),
    [
      '#!/usr/bin/env bash',
      'set -e',
      'if [ "${1:-}" = "install" ] && [ "${2:-}" = "-g" ]; then',
      '  if [ "${CORIVO_TEST_NPM_INSTALL_FAIL:-}" = "1" ]; then',
      '    echo "npm install failed" >&2',
      '    exit 1',
      '  fi',
      '  exit 0',
      'fi',
      'if [ "${1:-}" = "root" ] && [ "${2:-}" = "-g" ]; then',
      '  printf "%s\\n" "$HOME/.npm-global/lib/node_modules"',
      '  exit 0',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
  );
  await writeFileWithMode(path.join(binDir, 'python3'), '#!/usr/bin/env bash\nexit 0\n');
  await writeFileWithMode(path.join(binDir, 'gcc'), '#!/usr/bin/env bash\nexit 0\n');
  await writeFileWithMode(path.join(binDir, 'pgrep'), '#!/usr/bin/env bash\nexit 1\n');
  await writeFileWithMode(path.join(binDir, 'codex'), '#!/usr/bin/env bash\nexit 0\n');
  await writeFileWithMode(
    path.join(binDir, 'cursor'),
    [
      '#!/usr/bin/env bash',
      'if [ "${1:-}" = "agent" ] && [ "${2:-}" = "status" ]; then',
      '  echo "Not logged in"',
      '  exit 0',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
  );
  await writeFileWithMode(
    path.join(binDir, 'opencode'),
    [
      '#!/usr/bin/env bash',
      'if [ "${1:-}" = "models" ]; then',
      '  exit 1',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
  );
  await writeFileWithMode(
    path.join(binDir, 'corivo'),
    [
      '#!/usr/bin/env bash',
      'set -e',
      'if [ -n "${CORIVO_LOG:-}" ]; then',
      '  printf "%s\\n" "$*" >> "$CORIVO_LOG"',
      'fi',
      'if [ "${1:-}" = "--version" ]; then',
      '  echo "0.0.0-test"',
      '  exit 0',
      'fi',
      'if [ "${1:-}" = "init" ] && [ "${CORIVO_TEST_CORIVO_INIT_FAIL:-}" = "1" ]; then',
      '  echo "corivo init failed" >&2',
      '  exit 1',
      'fi',
      'if [ "${1:-}" = "cold-scan" ] && [ "${CORIVO_TEST_CORIVO_COLD_SCAN_FAIL:-}" = "1" ]; then',
      '  echo "corivo cold-scan failed" >&2',
      '  exit 1',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
  );

  for (const commandName of [
    'bash',
    'chmod',
    'cut',
    'date',
    'dirname',
    'find',
    'grep',
    'head',
    'id',
    'mkdir',
    'sed',
    'tr',
  ]) {
    await linkSystemCommand(binDir, commandName);
  }

  return {
    tempDir,
    tempHome,
    binDir,
    corivoLogPath,
    cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
  };
}
