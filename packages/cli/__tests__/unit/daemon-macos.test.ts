/**
 * macOS Daemon Manager 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';

// Mock external dependencies before importing
vi.mock('node:child_process');
vi.mock('node:fs/promises');

import * as macos from '../../src/daemon/macos.js';

describe('macOS Daemon Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isSupported', () => {
    it('should return true on macOS', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(macos.isSupported()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return false on Linux', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(macos.isSupported()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return false on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(macos.isSupported()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('install', () => {
    it('should create LaunchAgents directory and write plist', async () => {
      vi.mocked(execSync).mockReturnValue('');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await macos.install({
        corivoBin: '/Users/test/.corivo/bin/corivo',
        dbKey: 'base64key',
        dbPath: '/Users/test/.corivo/corivo.db'
      });

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('LaunchAgents'),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should call launchctl load and start', async () => {
      vi.mocked(execSync).mockReturnValue('');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await macos.install({
        corivoBin: '/Users/test/.corivo/bin/corivo',
        dbKey: 'base64key',
        dbPath: '/Users/test/.corivo/corivo.db'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('launchctl load'),
        expect.any(Object)
      );
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('launchctl start'),
        expect.any(Object)
      );
    });

    it('should return error on failure', async () => {
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

      const result = await macos.install({
        corivoBin: '/Users/test/.corivo/bin/corivo',
        dbKey: 'base64key',
        dbPath: '/Users/test/.corivo/corivo.db'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('uninstall', () => {
    it('should call launchctl stop and unload', async () => {
      vi.mocked(execSync).mockReturnValue('');
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await macos.uninstall();

      expect(execSync).toHaveBeenCalledWith(
        'launchctl stop com.corivo.daemon',
        expect.any(Object)
      );
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('launchctl unload'),
        expect.any(Object)
      );
    });

    it('should handle stop failure gracefully', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('stop')) {
          throw new Error('Service not running');
        }
        return '';
      });
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await macos.uninstall();

      expect(result.success).toBe(true);
    });

    it('should remove plist file', async () => {
      vi.mocked(execSync).mockReturnValue('');
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await macos.uninstall();

      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return running status when daemon is active', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(execSync).mockReturnValue('com.corivo.daemon\t12345\t0\n');

      const status = await macos.getStatus();

      expect(status.loaded).toBe(true);
      expect(status.running).toBe(true);
      expect(status.pid).toBe(12345);
    });

    it('should return not loaded when plist does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      const status = await macos.getStatus();

      expect(status.loaded).toBe(false);
      expect(status.running).toBe(false);
    });

    it('should return not running when PID is not found', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(execSync).mockReturnValue('com.corivo.daemon\t-\t0\n');

      const status = await macos.getStatus();

      expect(status.loaded).toBe(true);
      expect(status.running).toBe(false);
    });
  });
});
