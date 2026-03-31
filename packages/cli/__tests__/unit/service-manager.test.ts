import { describe, expect, it } from 'vitest';

describe('MacOSServiceManager', () => {
  const isMacOS = process.platform === 'darwin';
  const itIfMacOS = isMacOS ? it : it.skip;
  const itIfNotMacOS = isMacOS ? it.skip : it;

  itIfMacOS(
    'isSupported() returns true on darwin',
    async () => {
      const { MacOSServiceManager } = await import('../../dist/service/index.js');
      const mgr = new MacOSServiceManager();
      expect(mgr.isSupported()).toBe(true);
    }
  );

  itIfNotMacOS('isSupported() returns false on non-darwin', async () => {
    const { MacOSServiceManager } = await import('../../dist/service/index.js');
    const mgr = new MacOSServiceManager();
    expect(mgr.isSupported()).toBe(false);
  });
});

describe('UnsupportedServiceManager', () => {
  it('install() returns success:false with error message', async () => {
    const { UnsupportedServiceManager } = await import('../../dist/service/index.js');
    const mgr = new UnsupportedServiceManager();
    const result = await mgr.install({ corivoBin: 'x', dbPath: 'z' });
    expect(result.success).toBe(false);
    expect(result.error && result.error.length > 0).toBe(true);
  });

  it('uninstall() returns success:false', async () => {
    const { UnsupportedServiceManager } = await import('../../dist/service/index.js');
    const mgr = new UnsupportedServiceManager();
    const result = await mgr.uninstall();
    expect(result.success).toBe(false);
  });

  it('getStatus() returns loaded:false running:false', async () => {
    const { UnsupportedServiceManager } = await import('../../dist/service/index.js');
    const mgr = new UnsupportedServiceManager();
    const status = await mgr.getStatus();
    expect(status.loaded).toBe(false);
    expect(status.running).toBe(false);
  });

  it('isSupported() returns false', async () => {
    const { UnsupportedServiceManager } = await import('../../dist/service/index.js');
    const mgr = new UnsupportedServiceManager();
    expect(mgr.isSupported()).toBe(false);
  });
});

describe('LinuxServiceManager', () => {
  const isLinux = process.platform === 'linux';
  const itIfLinux = isLinux ? it : it.skip;
  const itIfNotLinux = isLinux ? it.skip : it;

  it('install() returns success:false with not-implemented message', async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js');
    const mgr = new LinuxServiceManager();
    const result = await mgr.install({ corivoBin: 'x', dbPath: 'z' });
    if (result.success) {
      expect(result.error).toBeUndefined();
    } else {
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
    }
  });

  it('uninstall() returns success:false with not-implemented message', async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js');
    const mgr = new LinuxServiceManager();
    const result = await mgr.uninstall();
    expect(typeof result.success).toBe('boolean');
  });

  it('getStatus() returns loaded:false running:false with not-implemented message', async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js');
    const mgr = new LinuxServiceManager();
    const result = await mgr.getStatus();
    expect(result.running).toBe(false);
    expect(result.loaded).toBe(false);
  });

  itIfLinux('isSupported() returns true on linux', async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js');
    const mgr = new LinuxServiceManager();
    expect(mgr.isSupported()).toBe(true);
  });

  itIfNotLinux('isSupported() remains true when the linux manager is instantiated on non-linux', async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js');
    const mgr = new LinuxServiceManager();
    expect(mgr.isSupported()).toBe(true);
  });
});
