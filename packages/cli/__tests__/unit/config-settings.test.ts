/**
 * CorivoSettings 配置类型测试
 */
import { describe, it, expect } from 'vitest';
import type { CorivoConfig, CorivoSettings } from '../../src/config';

describe('CorivoSettings', () => {
  it('accepts syncIntervalSeconds in config', () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'test-id',
      db_key: 'dGVzdA==',
      settings: { syncIntervalSeconds: 900 },
    };
    expect(config.settings?.syncIntervalSeconds).toBe(900);
  });

  it('treats missing settings as undefined (default 300s applied by consumer)', () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'test-id',
      db_key: 'dGVzdA==',
    };
    expect(config.settings).toBeUndefined();
  });

  it('accepts plugins array in config', () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'test-id',
      db_key: 'dGVzdA==',
      plugins: ['@corivo/openclaw'],
    };
    expect(config.plugins).toEqual(['@corivo/openclaw']);
  });

  it('treats missing plugins as undefined', () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'test-id',
      db_key: 'dGVzdA==',
    };
    expect(config.plugins).toBeUndefined();
  });
});
