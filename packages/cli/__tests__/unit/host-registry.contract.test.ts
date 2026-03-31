import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getHostAdapter } from '../../src/hosts/registry.js';

describe('host registry contract (real helpers)', () => {
  it('project-claude adapter uses target and returns real helper shape', async () => {
    const adapter = getHostAdapter('project-claude');
    expect(adapter).not.toBeNull();

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-project-claude-'));
    const claudePath = path.join(tempDir, 'CLAUDE.md');

    try {
      const installResult = await adapter!.install({ target: tempDir });
      expect(installResult).toMatchObject({
        success: expect.any(Boolean),
        host: 'project-claude',
        path: claudePath,
        summary: expect.any(String),
      });

      const installedContent = await fs.readFile(claudePath, 'utf8');
      expect(installedContent).toContain('<!-- CORIVO START -->');
      expect(installedContent).toContain('<!-- CORIVO END -->');

      const doctorResult = await adapter!.doctor({ target: tempDir });
      expect(doctorResult).toMatchObject({
        ok: expect.any(Boolean),
        host: 'project-claude',
        checks: expect.any(Array),
      });
      expect(doctorResult.checks.length).toBeGreaterThan(0);
      expect(doctorResult.checks[0]?.detail).toBe(claudePath);

      const uninstallResult = await adapter!.uninstall!({ target: tempDir });
      expect(uninstallResult).toMatchObject({
        success: expect.any(Boolean),
        host: 'project-claude',
        path: claudePath,
        summary: expect.any(String),
      });

      const uninstalledContent = await fs.readFile(claudePath, 'utf8');
      expect(uninstalledContent.includes('<!-- CORIVO START -->')).toBe(false);
      expect(uninstalledContent.includes('<!-- CORIVO END -->')).toBe(false);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
