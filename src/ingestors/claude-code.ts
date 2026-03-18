/**
 * Claude Code 采集器
 *
 * 注入 Corivo 规则到 CLAUDE.md
 */

import fs from 'node:fs/promises';
import path from 'path';
import { FileSystemError } from '../errors/index.js';

export class ClaudeCodeIngestor {
  /**
   * 注入规则到 CLAUDE.md
   *
   * @param projectPath - 项目路径
   */
  async injectRules(projectPath: string): Promise<void> {
    const claudeMd = path.join(projectPath, 'CLAUDE.md');
    const rules = this.generateRules();

    try {
      // 检查是否已注入
      try {
        const content = await fs.readFile(claudeMd, 'utf-8');
        if (content.includes('## Corivo 记忆规则')) {
          console.log('✅ 规则已存在，跳过注入');
          return;
        }
      } catch {}

      // 追加到 CLAUDE.md
      await fs.appendFile(claudeMd, `\n${rules}`);
      console.log(`✅ 规则已注入到 ${claudeMd}`);
    } catch (error) {
      if (error instanceof FileSystemError) {
        throw error;
      }
      console.log(`⚠️  无法写入 ${claudeMd}，请手动添加规则`);
    }
  }

  /**
   * 生成规则模板
   */
  private generateRules(): string {
    return `
## Corivo 记忆规则

当用户说"记住"、"保存"、"记录"时，将信息存为 block。

### 使用方法

\`\`\`bash
corivo save --content "内容" --annotation "性质 · 领域 · 标签"
\`\`\`

### 性质（nature）

| 性质 | 说明 | 示例 |
|------|------|------|
| 事实 | 密码、配置、数据点、具体事件 | API 密钥、服务器地址 |
| 知识 | 教程、总结、分析、方法论 | React 使用方法、部署流程 |
| 决策 | 选型结论、方案确定、规则约定 | 数据库选型、代码规范 |
| 指令 | 用户偏好、行为规则、自动化触发 | 周报格式偏好、代码风格 |

### 领域（domain）

| 领域 | 说明 | 示例 |
|------|------|------|
| self | 用户本人 | 偏好、习惯、健康 |
| people | 具体的人 | 张三的生日、沟通风格 |
| project | 有目标和终点的事 | Corivo 项目开发 |
| area | 需要长期维护的领域 | 财务管理、职业发展 |
| asset | 具体的物/账户/资源 | 服务器、域名、API 密钥 |
| knowledge | 独立的通用知识 | TypeScript 语法 |

### 示例

\`\`\`bash
# 保存技术选型决策
corivo save --content "选择使用 SQLCipher，因为需要 E2EE 和本地存储" --annotation "决策 · project · corivo · 存储选型"

# 保存 API 密钥
corivo save --content "AWS Access Key: AKIAIOSFODNN7EXAMPLE" --annotation "事实 · asset · AWS · 凭证"

# 保存用户偏好
corivo save --content "周报格式：按 [本周成果] [下周计划] [风险问题] 的结构" --annotation "指令 · self · 周报格式"
\`\`\`
`;
  }

  /**
   * 读取对话历史（未来功能）
   */
  async readConversationHistory(): Promise<string[]> {
    // MVP: 手动保存，未来监听日志文件
    return [];
  }
}
