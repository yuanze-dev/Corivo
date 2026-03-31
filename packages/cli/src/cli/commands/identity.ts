/**
 * CLI command-identity
 *
 * View and manage user identity information
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from '../../storage/database.js';
import { IdentityManager, FingerprintCollector } from '../../identity/index.js';

/**
 * Show identity information
 */
export async function identityCommand(options: {
  verbose?: boolean;
}): Promise<void> {
  const configDir = getConfigDir();
  const identityPath = path.join(configDir, 'identity.json');

  try {
    const content = await fs.readFile(identityPath, 'utf-8');
    const identity = JSON.parse(content);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('                 Corivo Identity Information');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Identity ID: ${identity.identity_id}`);
    console.log(`Created at: ${new Date(identity.created_at).toLocaleString('en-US')}`);
    console.log(`Updated at: ${new Date(identity.updated_at).toLocaleString('en-US')}`);

    if (identity.display_name) {
      console.log(`Display name: ${identity.display_name}`);
    }

    // Display platform fingerprint
    if (Object.keys(identity.fingerprints).length > 0) {
      console.log('\nLinked platforms:');
      const platformNames: Record<string, string> = {
        claude_code: 'Claude Code',
        feishu: 'Feishu',
        device: 'Device',
      };

      for (const [platform, data] of Object.entries(identity.fingerprints)) {
        const fp = data as { value: string; added_at: string };
        console.log(
          `  🟢 ${platformNames[platform] || platform}: ${fp.value.substring(0, 8)}...`
        );
        if (options.verbose) {
          console.log(`     Full value: ${fp.value}`);
          console.log(`     Added at: ${new Date(fp.added_at).toLocaleString('en-US')}`);
        }
      }
    }

    // Show device list
    if (Object.keys(identity.devices).length > 0) {
      console.log('\nAuthorized devices:');
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

        console.log(`  📱 ${device.name} (${deviceId.substring(0, 16)}...)`);
        console.log(`     Last seen: ${lastSeen.toLocaleString('en-US')} (${status})`);
      }
    }

    console.log('');

    // Check if the new fingerprint can be detected
    if (options.verbose) {
      console.log('Scanning for new platform fingerprints...\n');
      const fingerprints = await FingerprintCollector.collectAll();

      for (const fp of fingerprints) {
        const existing = identity.fingerprints[fp.platform];
        if (!existing || existing.value !== fp.value) {
          const platformNames: Record<string, string> = {
            claude_code: 'Claude Code',
            feishu: 'Feishu',
            device: 'Device',
          };
          console.log(`  ➕ Added: ${platformNames[fp.platform] || fp.platform} (${fp.value.substring(0, 8)}...)`);
        }
      }
      console.log('');
    }

  } catch {
    console.log('\n❌ Identity information not found');
    console.log('Please run: corivo init\n');
    process.exit(1);
  }
}
