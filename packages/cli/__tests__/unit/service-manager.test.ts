import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('MacOSServiceManager', () => {
  const isMacOS = process.platform === 'darwin'

  it(
    'isSupported() returns true on darwin',
    { skip: !isMacOS },
    async () => {
      const { MacOSServiceManager } = await import('../../dist/service/index.js')
      const mgr = new MacOSServiceManager()
      assert.equal(mgr.isSupported(), true)
    }
  )

  it('isSupported() returns false on non-darwin', { skip: isMacOS }, async () => {
    const { MacOSServiceManager } = await import('../../dist/service/index.js')
    const mgr = new MacOSServiceManager()
    assert.equal(mgr.isSupported(), false)
  })
})

describe('UnsupportedServiceManager', () => {
  it('install() returns success:false with error message', async () => {
    const { UnsupportedServiceManager } = await import('../../dist/service/index.js')
    const mgr = new UnsupportedServiceManager()
    const result = await mgr.install({ corivoBin: 'x', dbKey: 'y', dbPath: 'z' })
    assert.equal(result.success, false)
    assert.ok(result.error && result.error.length > 0)
  })

  it('uninstall() returns success:false', async () => {
    const { UnsupportedServiceManager } = await import('../../dist/service/index.js')
    const mgr = new UnsupportedServiceManager()
    const result = await mgr.uninstall()
    assert.equal(result.success, false)
  })

  it('getStatus() returns loaded:false running:false', async () => {
    const { UnsupportedServiceManager } = await import('../../dist/service/index.js')
    const mgr = new UnsupportedServiceManager()
    const status = await mgr.getStatus()
    assert.equal(status.loaded, false)
    assert.equal(status.running, false)
  })

  it('isSupported() returns false', async () => {
    const { UnsupportedServiceManager } = await import('../../dist/service/index.js')
    const mgr = new UnsupportedServiceManager()
    assert.equal(mgr.isSupported(), false)
  })
})

describe('LinuxServiceManager', () => {
  it('install() returns success:false with not-implemented message', async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js')
    const mgr = new LinuxServiceManager()
    const result = await mgr.install({ corivoBin: 'x', dbKey: 'y', dbPath: 'z' })
    assert.equal(result.success, false)
    assert.ok(result.error?.includes('尚未实现'))
  })

  it('uninstall() returns success:false with not-implemented message', async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js')
    const mgr = new LinuxServiceManager()
    const result = await mgr.uninstall()
    assert.equal(result.success, false)
    assert.ok(result.error?.includes('尚未实现'))
  })

  it('getStatus() returns loaded:false running:false with not-implemented message', async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js')
    const mgr = new LinuxServiceManager()
    const result = await mgr.getStatus()
    assert.equal(result.running, false)
    assert.equal(result.loaded, false)
  })

  it('isSupported() returns true on linux', { skip: process.platform !== 'linux' }, async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js')
    const mgr = new LinuxServiceManager()
    assert.equal(mgr.isSupported(), true)
  })

  it('isSupported() returns false on non-linux', { skip: process.platform === 'linux' }, async () => {
    const { LinuxServiceManager } = await import('../../dist/service/index.js')
    const mgr = new LinuxServiceManager()
    assert.equal(mgr.isSupported(), false)
  })
})
