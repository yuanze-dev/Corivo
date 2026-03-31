/**
 * CLI command - init
 *
 * Initializes Corivo and creates an identity based on platform fingerprints.
 *
 * Changes in v0.10+:
 * - Platform-fingerprint-based user identity (no password required)
 * - Cross-device identity association
 * - Database key stored in plaintext, relying on filesystem permissions for protection
 * - Heartbeat daemon starts automatically after init
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '@/storage/database';
import { FileSystemError } from '../../errors/index.js';
import {
  initializeIdentity,
  initializeIdentityWithId,
  getIdentityId,
  type Fingerprint,
} from '../../identity/index.js';
import { saveConfig, saveSolverConfig, loadConfig, type CorivoConfig, type SolverConfig } from '../../config.js';
import os from 'node:os';
import { startCommand } from './start.js';
import { registerWithSolver, post } from './sync.js';
import { createCliContext } from '../context/create-context.js';
import { readConfirm } from '../utils/password.js';

/**
 * Exit the process with the given code.
 */
function exit(code = 0): never {
  process.exit(code);
}

/**
 * Main init command handler.
 */
export async function initCommand(options: { join?: string; server?: string } = {}): Promise<void> {
  const context = createCliContext();
  const logger = context.logger;

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('           Corivo - a digital companion that lives for you');
  console.log('═══════════════════════════════════════════════════════\n');

  // Skip existence check when --join is provided; the user will be prompted to confirm merging identities.
  const dbPath = getDefaultDatabasePath();
  if (!options.join) {
    try {
      if (fsSync.existsSync(dbPath)) {
        console.log(`⚠️  Existing Corivo database detected at: ${dbPath}`);
        console.log('If you need to re-initialize, delete the existing database first:');
        console.log(`  rm ${dbPath}`);
        exit(1);
      }
    } catch {}
  }

  // Ensure the config directory exists before writing any files.
  const configDir = getConfigDir();
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch (error) {
    throw new FileSystemError(`Failed to create config directory: ${configDir}`, { cause: error });
  }

  // ========== Identity resolution ==========
  let identityId: string;

  if (options.join) {
    // --join flow: join an existing identity using a pairing code
    const serverUrl = options.server || process.env.CORIVO_SOLVER_URL || 'http://localhost:3141';
    console.log('Joining identity with pairing code...\n');

    const deviceId = (await import('node:crypto')).randomBytes(8).toString('hex');
    const siteId = (await import('node:crypto')).randomBytes(16).toString('hex');

    let redeemResult: { identity_id: string; shared_secret: string };
    try {
      const platformNames: Record<string, string> = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };
      const deviceDisplayName = `${platformNames[process.platform] || process.platform} (${os.hostname()})`;
      redeemResult = await post(`${serverUrl}/auth/redeem-pair`, {
        pairing_code: options.join,
        device_id: deviceId,
        device_name: deviceDisplayName,
        platform: process.platform,
        arch: process.arch,
        site_id: siteId,
      }, logger) as { identity_id: string; shared_secret: string };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404')) {
        console.error('❌ The pairing code is invalid or expired. Please rerun corivo sync --pair on Device A');
      } else if (msg.includes('409')) {
        console.error('❌ This device is already registered');
      } else {
        console.error('❌ Pairing failed:', msg);
      }
      exit(1);
    }

    identityId = redeemResult.identity_id;
    console.log('✓ Pairing successful');
    console.log(`  Identity ID: ${identityId}`);

    // Detect whether a local identity already exists (conflict scenario).
    const existingConfig = await loadConfig(configDir);

    if (existingConfig && existingConfig.identity_id !== identityId) {
      console.log('\n⚠️  An existing Corivo identity was detected on this machine:');
      console.log(`   Current identity ID: ${existingConfig.identity_id}`);
      console.log(`   Will join identity ID: ${identityId}`);
      console.log('\n   Choose Yes: keep local data and switch to the new identity (local data will be pushed on the next sync)');
      console.log('   Choose No: cancel and keep the current setup\n');

      const confirmed = await readConfirm('Continue?');
      if (!confirmed) {
        console.log('Cancelled.');
        exit(0);
      }

    }

    // Create the local identity with the specified ID, overwriting any existing one.
    const identityPath = path.join(configDir, 'identity.json');
    try { await fs.unlink(identityPath); } catch { /* ignore if file does not exist */ }
    await initializeIdentityWithId(identityId, configDir);

    if (!existingConfig || existingConfig.identity_id !== identityId) {
      console.log('\nCreating encrypted database...');
      const db = CorivoDatabase.getInstance({ path: dbPath });
      const health = db.checkHealth();
      if (!health.ok) {
        console.log('❌ Failed to create database');
        exit(1);
      }
    }

    const config: CorivoConfig = {
      version: '0.11.0',
      created_at: existingConfig?.created_at ?? new Date().toISOString(),
      identity_id: identityId,
    };
    const saveResult = await saveConfig(config, configDir);
    if (!saveResult.success) {
      console.log('❌ Failed to save config: ' + saveResult.error);
      exit(1);
    }

    const solverConfig: SolverConfig = {
      server_url: serverUrl,
      shared_secret: redeemResult.shared_secret,
      site_id: siteId,
      last_push_version: 0,
      last_pull_version: 0,
    };
    await saveSolverConfig(solverConfig, configDir);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('                  ✅ Joined successfully!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🎯 Corivo is ready');
    console.log('   Identity ID: ' + identityId);
    console.log('   Database:    ' + dbPath);
    console.log('   Sync server: ' + serverUrl + '\n');

    // Auto-start the heartbeat after joining.
    console.log('🫀 Starting heartbeat...');
    try {
      await startCommand();
      console.log('\n✨ Corivo is awake. Heartbeat will sync data automatically.');
    } catch {
      console.log('\n⚠️  Failed to start heartbeat, please run: corivo start');
    }

    console.log('\nNext steps:');
    console.log('  corivo sync       # Pull existing data now');
    console.log('  corivo query "..."');
    console.log('  corivo status\n');

    exit(0);
  }

  // Normal (non-join) initialization flow.
  console.log('Identifying you...\n');

  const identityResult = await initializeIdentity(configDir);
  identityId = identityResult.identity.identity_id;

  if (identityResult.isNew) {
    console.log('✓ Created a new identity');
    console.log(`  Identity ID: ${identityId}`);
  } else {
    console.log('✓ Found an existing identity');
    console.log(`  Identity ID: ${identityId}`);
  }

  // Display the platform fingerprints that were detected.
  if (identityResult.fingerprints.length > 0) {
    console.log('\nDetected platforms:');
    for (const fp of identityResult.fingerprints) {
      const platformNames: Record<string, string> = {
        claude_code: 'Claude Code',
        feishu: 'Feishu',
        device: 'Device',
      };
      const confidenceIcons: Record<string, string> = {
        high: '🟢',
        medium: '🟡',
        low: '⚪',
      };
      console.log(
        `  ${confidenceIcons[fp.confidence]} ${platformNames[fp.platform] || fp.platform}: ${fp.value.substring(0, 8)}...`
      );
    }
  }

  console.log('');
  // ========== End identity resolution ==========

  console.log('Creating local database...');

  const db = CorivoDatabase.getInstance({ path: dbPath });

  // Verify that the database was created and is healthy.
  const health = db.checkHealth();
  if (!health.ok) {
    console.log('❌ Failed to create database');
    exit(1);
  }

  // Persist the config to disk.
  const config: CorivoConfig = {
    version: '0.11.0',
    created_at: new Date().toISOString(),
    identity_id: identityId,
  };

  const saveResult = await saveConfig(config, configDir);
  if (!saveResult.success) {
    console.log('❌ Failed to save config: ' + saveResult.error);
    exit(1);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('                  ✅ Initialization complete!');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('🎯 Corivo is ready');
  console.log('   Identity ID: ' + identityId);
  console.log('   Database:    ' + dbPath);
  console.log('');

  // ========== Auto-register with solver ==========
  const defaultSolverUrl = process.env.CORIVO_SOLVER_URL || 'http://localhost:3141';
  try {
    const solverConfig = await registerWithSolver(defaultSolverUrl, identityId, logger);
    if (solverConfig) {
      await saveSolverConfig(solverConfig, configDir);
      console.log('🔗 Connected to sync server\n');
    }
  } catch {
    // Server unreachable — skip silently; the daemon will retry later.
  }
  // ========== End auto-register with solver ==========

  // ========== Auto-start heartbeat ==========
  console.log('🫀 Starting heartbeat...');

  try {
    // Start the heartbeat without requiring user interaction.
    await startCommand();
    console.log('\n✨ Corivo is awake. Heartbeat will keep running and organize your memory automatically.');
  } catch (error) {
    console.log('\n⚠️  Failed to start heartbeat. You can start it manually later:');
    console.log('  corivo start\n');
  }

  // Next-step hints for the user.
  console.log('Next steps:');
  console.log('  corivo save --content "..." --annotation "type · domain · tag"');
  console.log('  corivo query "..."');
  console.log('  corivo status');
  console.log('  corivo stop    # Stop heartbeat if needed\n');

  exit(0);
}
