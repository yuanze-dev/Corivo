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
        if (content.includes('## Corivo 记忆层')) {
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
## Corivo 记忆层

你有一个外部记忆工具 **Corivo**，可以帮你记住重要信息、查询历史记录。所有命令会自动添加 \`--no-password\` 标志跳过密码输入。

### 📊 查询记忆

**何时查询：**
- 用户问"我之前说过..."、"记得吗..."、"我们之前决定..."
- 开始新任务时，先查询相关历史决策和偏好
- 用户涉及历史信息的问题

**查询命令：**
\`\`\`bash
corivo query "关键词" --limit 10
\`\`\`

**按类型过滤：**
\`\`\`bash
corivo query "" --annotation "决策 · project"  # 所有项目决策
corivo query "React" --annotation "知识 · knowledge"  # React 相关知识
\`\`\`

### 💾 保存记忆

**何时保存：**
- 对话中出现**技术决策、结论、方案确定**
- 用户表达**偏好、规则、习惯**
- 遇到**经验教训、重要知识点**
- 用户明确说"记住"、"保存"、"记录"

**保存命令：**
\`\`\`bash
corivo save "内容" --annotation "性质 · 领域 · 标签"
\`\`\`

**性质（nature）- 必选：**
- \`事实\` - 客观可验证：密码、配置、API 密钥、服务器地址
- \`知识\` - 学习内容：教程、总结、分析方法、API 用法
- \`决策\` - 技术选择：数据库选型、框架选择、架构决策
- \`指令\` - 用户偏好：代码风格、命名习惯、周报格式

**领域（domain）- 必选：**
- \`self\` - 用户本人：偏好、习惯、个人信息
- \`people\` - 具体的人：同事生日、沟通风格
- \`project\` - 项目相关：Corivo 开发、客户项目
- \`asset\` - 资产资源：服务器、域名、密钥
- \`knowledge\` - 知识领域：TypeScript、React、数据库

**示例：**
\`\`\`bash
# 技术选型
corivo save "选择 PostgreSQL 而非 MySQL，因为需要更好的 JSON 支持" --annotation "决策 · project · database"

# 用户偏好
corivo save "代码风格：使用 2 空格缩进，优先使用 const 而非 let" --annotation "指令 · self · 代码风格"

# API 密钥
corivo save "OpenAI API Key: sk-xxxx" --annotation "事实 · asset · OpenAI · 密钥"

# 知识点
corivo save "React useEffect 依赖数组为空时，effect 只在挂载后执行一次" --annotation "知识 · knowledge · React · hooks"
\`\`\`

### 🔄 更新记忆

**查询到的记忆与当前信息矛盾时，使用更新命令：**
\`\`\`bash
corivo update blk_xxx --content "新的内容"
\`\`\`

### 📌 标识来源

**每次保存/查询后，在回复中标注：**
> \`[corivo] 已记录：...\`
> \`[corivo] 找到 3 条相关记忆\`

这样用户知道信息来自 Corivo。
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
