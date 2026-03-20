/**
 * CLI 命令 - identity
 *
 * 查看和管理用户身份信息
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from '../../storage/database.js';
import { IdentityManager, FingerprintCollector } from '../../identity/index.js';

/**
 * 显示身份信息
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
    console.log('                    Corivo 身份信息');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`身份 ID: ${identity.identity_id}`);
    console.log(`创建时间: ${new Date(identity.created_at).toLocaleString('zh-CN')}`);
    console.log(`更新时间: ${new Date(identity.updated_at).toLocaleString('zh-CN')}`);

    if (identity.display_name) {
      console.log(`显示名称: ${identity.display_name}`);
    }

    // 显示平台指纹
    if (Object.keys(identity.fingerprints).length > 0) {
      console.log('\n关联的平台：');
      const platformNames: Record<string, string> = {
        claude_code: 'Claude Code',
        feishu: '飞书',
        device: '设备',
      };

      for (const [platform, data] of Object.entries(identity.fingerprints)) {
        const fp = data as { value: string; added_at: string };
        console.log(
          `  🟢 ${platformNames[platform] || platform}: ${fp.value.substring(0, 8)}...`
        );
        if (options.verbose) {
          console.log(`     完整值: ${fp.value}`);
          console.log(`     添加时间: ${new Date(fp.added_at).toLocaleString('zh-CN')}`);
        }
      }
    }

    // 显示设备列表
    if (Object.keys(identity.devices).length > 0) {
      console.log('\n已授权设备：');
      for (const [deviceId, data] of Object.entries(identity.devices)) {
        const device = data as { name: string; last_seen: string };
        const lastSeen = new Date(device.last_seen);
        const now = new Date();
        const diffMs = now.getTime() - lastSeen.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        let status = '离线';
        if (diffMins < 5) {
          status = '在线 🟢';
        } else if (diffMins < 60) {
          status = '最近活跃 🟡';
        }

        console.log(`  📱 ${device.name} (${deviceId.substring(0, 16)}...)`);
        console.log(`     最后活跃: ${lastSeen.toLocaleString('zh-CN')} (${status})`);
      }
    }

    console.log('');

    // 检查是否可以检测到新的指纹
    if (options.verbose) {
      console.log('正在扫描新的平台指纹...\n');
      const fingerprints = await FingerprintCollector.collectAll();

      for (const fp of fingerprints) {
        const existing = identity.fingerprints[fp.platform];
        if (!existing || existing.value !== fp.value) {
          const platformNames: Record<string, string> = {
            claude_code: 'Claude Code',
            feishu: '飞书',
            device: '设备',
          };
          console.log(`  ➕ 新增: ${platformNames[fp.platform] || fp.platform} (${fp.value.substring(0, 8)}...)`);
        }
      }
      console.log('');
    }

  } catch {
    console.log('\n❌ 未找到身份信息');
    console.log('请先运行: corivo init\n');
    process.exit(1);
  }
}
