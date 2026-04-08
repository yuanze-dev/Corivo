/**
 * CLI command-identity
 *
 * View and manage user identity information
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from '@/infrastructure/storage/lifecycle/database-paths.js';
import { printBanner } from '@/cli/presenters/banner.js';
import { IdentityManager, FingerprintCollector } from '@/infrastructure/identity/index.js';
import { getCliOutput } from '@/cli/runtime';

/**
 * Show identity information
 */
export async function identityCommand(options: {
  verbose?: boolean;
}): Promise<void> {
  const output = getCliOutput();
  const configDir = getConfigDir();
  const identityPath = path.join(configDir, 'identity.json');

  try {
    const content = await fs.readFile(identityPath, 'utf-8');
    const identity = JSON.parse(content);

    printBanner('Corivo Identity Information', { width: 55 });

    output.info(`Identity ID: ${identity.identity_id}`);
    output.info(`Created at: ${new Date(identity.created_at).toLocaleString('en-US')}`);
    output.info(`Updated at: ${new Date(identity.updated_at).toLocaleString('en-US')}`);

    if (identity.display_name) {
      output.info(`Display name: ${identity.display_name}`);
    }

    // Display platform fingerprint
    if (Object.keys(identity.fingerprints).length > 0) {
      output.info('\nLinked platforms:');
      const platformNames: Record<string, string> = {
        claude_code: 'Claude Code',
        feishu: 'Feishu',
        device: 'Device',
      };

      for (const [platform, data] of Object.entries(identity.fingerprints)) {
        const fp = data as { value: string; added_at: string };
        output.info(
          `  🟢 ${platformNames[platform] || platform}: ${fp.value.substring(0, 8)}...`
        );
        if (options.verbose) {
          output.info(`     Full value: ${fp.value}`);
          output.info(`     Added at: ${new Date(fp.added_at).toLocaleString('en-US')}`);
        }
      }
    }

    // Show device list
    if (Object.keys(identity.devices).length > 0) {
      output.info('\nAuthorized devices:');
      for (const [deviceId, data] of Object.entries(identity.devices)) {
        const device = data as { name: string; last_seen: string };
        const lastSeen = new Date(device.last_seen);
        const now = new Date();
        const diffMs = now.getTime() - lastSeen.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        let status = 'Offline';
        if (diffMins < 5) {
          status = 'Online 🟢';
        } else if (diffMins < 60) {
          status = 'Recently active 🟡';
        }

        output.info(`  📱 ${device.name} (${deviceId.substring(0, 16)}...)`);
        output.info(`     Last seen: ${lastSeen.toLocaleString('en-US')} (${status})`);
      }
    }

    output.info('');

    // Check if the new fingerprint can be detected
    if (options.verbose) {
      output.info('Scanning for new platform fingerprints...\n');
      const fingerprints = await FingerprintCollector.collectAll();

      for (const fp of fingerprints) {
        const existing = identity.fingerprints[fp.platform];
        if (!existing || existing.value !== fp.value) {
          const platformNames: Record<string, string> = {
            claude_code: 'Claude Code',
            feishu: 'Feishu',
            device: 'Device',
          };
          output.info(`  ➕ Added: ${platformNames[fp.platform] || fp.platform} (${fp.value.substring(0, 8)}...)`);
        }
      }
      output.info('');
    }

  } catch {
    output.error('\n❌ Identity information not found');
    output.info('Please run: corivo init\n');
    process.exit(1);
  }
}
