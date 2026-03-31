/**
 * CLI end-to-end tests
 *
 * Verifies the complete CLI workflow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '../../dist/cli/index.js');
const TEST_DIR = `/tmp/corivo-e2e-${Date.now()}`;

describe('E2E: CLI Basic Workflow', () => {
  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    // clean up
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it('should display help', () => {
    const result = execSync(`node ${CLI} --help`, { encoding: 'utf-8' });
    expect(result).toContain('Corivo');
    expect(result).toContain('init');
    expect(result).toContain('save');
    expect(result).toContain('query');
    expect(result).toContain('status');
  });

  it('should show version', () => {
    const result = execSync(`node ${CLI} --version`, { encoding: 'utf-8' });
    // Version is now read dynamically from package.json
    expect(result).toMatch(/\d+\.\d+\.\d+/);
  });

  it('should run doctor command (no config)', () => {
    const result = execSync(`node ${CLI} doctor`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, HOME: TEST_DIR }
    });
    expect(result).toContain('Config file not found');
  });

  it('should show error for missing init', () => {
    // CLI exits with code 1 when not initialized
    expect(() => {
      execSync(`node ${CLI} status`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, HOME: TEST_DIR }
      });
    }).toThrow();
  });
});
