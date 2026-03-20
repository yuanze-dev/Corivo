/**
 * 技术选型规则
 *
 * 从自然语言中提取技术选型决策
 */

import type { Pattern } from '../../models/pattern.js';
import type { Rule } from './index.js';

/**
 * 技术选型决策维度
 */
interface Dimension {
  name: string;
  weight: number;
  reason: string;
}

/**
 * 技术选型规则
 *
 * 识别技术选型决策并提取结构化信息
 */
export class TechChoiceRule implements Rule {
  name = 'tech_choice';

  /** 决策关键词匹配模式 */
  patterns = [
    /选择(?:了)?(?:使用)?\s+([A-Z][a-zA-Z0-9.]+)/,
    /决定(?:了)?(?:使用)?\s+([A-Z][a-zA-Z0-9.]+)/,
    /选型\s+[:：]\s*([A-Z][a-zA-Z0-9.]+)/,
    /采用\s+([A-Z][a-zA-Z0-9.]+)/,
    /使用\s+([A-Z][a-zA-Z0-9.]+)\s+(?:作为|来|用于)/,
  ];

  /**
   * 从内容中提取技术选型模式
   */
  extract(content: string): Pattern | null {
    // 尝试匹配决策
    let decision: string | null = null;
    for (const pattern of this.patterns) {
      const match = content.match(pattern);
      if (match) {
        decision = match[1];
        break;
      }
    }

    if (!decision) return null;

    // 提取理由和维度
    const reason = this.extractReason(content);
    const dimensions = this.inferDimensions(content);

    // 提取被拒绝的选项
    const rejected = this.extractRejected(content);

    // 提取上下文标签
    const contextTags = this.extractTags(content);

    // 计算置信度
    const confidence = this.calculateConfidence(content, reason, dimensions);

    return {
      type: '技术选型',
      decision,
      dimensions,
      alternatives_rejected: rejected,
      context_tags: contextTags,
      reason,
      confidence,
    };
  }

  /**
   * 提取决策理由
   */
  private extractReason(content: string): string | undefined {
    const patterns = [
      /因为\s*(.+?)(?:[。.]|$)/,
      /[。.]\s*因为\s*(.+?)(?:[。.]|$)/,
      /原因\s+[:：]\s*(.+?)(?:[。.]|$)/,
      /考虑\s+[:：]\s*(.+?)(?:[。.]|$)/,
      /由于\s+(.+?)(?:[。.]|$)/,
      /优势\s+[:：]\s*(.+?)(?:[。.]|$)/,
      /[。.]\s*需要\s*(.+?)(?:[。.]|$)/,
      /需要\s*(.+?)(?:[。.]|$)/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return match[1].trim();
    }

    return undefined;
  }

  /**
   * 推断决策维度
   */
  private inferDimensions(content: string): Dimension[] {
    const dimensions: Dimension[] = [];
    const lower = content.toLowerCase();

    // 安全性
    if (/安全|加密|隐私|权限|认证|e2ee|端到端/.test(lower)) {
      dimensions.push({ name: '安全性', weight: 0.9, reason: '规则推断' });
    }

    // 本地优先
    if (/本地|离线|无需网络|边缘|on-premise/.test(lower)) {
      dimensions.push({ name: '本地优先', weight: 0.8, reason: '规则推断' });
    }

    // 成本
    if (/成本|便宜|免费|预算|开源|商业许可/.test(lower)) {
      dimensions.push({ name: '成本', weight: 0.5, reason: '规则推断' });
    }

    // 性能
    if (/性能|速度|快速|延迟|吞吐|低延迟/.test(lower)) {
      dimensions.push({ name: '性能', weight: 0.7, reason: '规则推断' });
    }

    // 开发效率
    if (/开发效率|开发速度|快速开发|生产力|开发体验/.test(lower)) {
      dimensions.push({ name: '开发效率', weight: 0.6, reason: '规则推断' });
    }

    // 可维护性
    if (/维护|可维护|文档|社区|生态/.test(lower)) {
      dimensions.push({ name: '可维护性', weight: 0.6, reason: '规则推断' });
    }

    // 兼容性
    if (/兼容|跨平台|浏览器|支持/.test(lower)) {
      dimensions.push({ name: '兼容性', weight: 0.5, reason: '规则推断' });
    }

    return dimensions;
  }

  /**
   * 提取被拒绝的选项
   */
  private extractRejected(content: string): string[] {
    const rejected: string[] = [];

    // 匹配 "在 A 和 B 之间选择 C" 格式
    // 注意：如果选择的是 A 或 B 其中之一，另一个就是被拒绝的
    const betweenMatch = content.match(
      /在\s+([A-Z][a-zA-Z0-9.]+)\s+和\s+([A-Z][a-zA-Z0-9.]+)\s+(?:之间)?(?:选择|决定使用|采用)\s+([A-Z][a-zA-Z0-9.]+)/
    );
    if (betweenMatch) {
      const option1 = betweenMatch[1];
      const option2 = betweenMatch[2];
      const chosen = betweenMatch[3];

      // 如果选择的是第一个选项，第二个被拒绝；反之亦然
      if (chosen === option1 && option2 !== chosen) {
        rejected.push(option2);
      } else if (chosen === option2 && option1 !== chosen) {
        rejected.push(option1);
      } else if (chosen !== option1 && chosen !== option2) {
        // 选择的是第三个选项，两个都被拒绝
        rejected.push(option1, option2);
      }
    }

    // 匹配 "放弃 A，选择 B"
    const abandonMatch = content.match(/放弃\s+([A-Z][a-zA-Z0-9.]+)/g);
    if (abandonMatch) {
      for (const m of abandonMatch) {
        const name = m.replace('放弃', '');
        if (name && !rejected.includes(name)) {
          rejected.push(name);
        }
      }
    }

    return rejected;
  }

  /**
   * 提取上下文标签
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];

    // 检测技术栈关键词
    if (/前端|web|ui|ux|css|html|react|vue|angular/i.test(content)) tags.push('前端');
    if (/后端|backend|api|服务端|server/i.test(content)) tags.push('后端');
    if (/数据库|存储|db|database|sql|nosql/i.test(content)) tags.push('数据库');
    if (/部署|运维|devops|ci|cd|docker/i.test(content)) tags.push('运维');
    if (/移动端|ios|android|app|移动/i.test(content)) tags.push('移动端');
    if (/测试|test|单元测试|集成测试/i.test(content)) tags.push('测试');

    return tags;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    content: string,
    reason: string | undefined,
    dimensions: Dimension[]
  ): number {
    let confidence = 0.5; // 基础置信度

    // 有理由说明
    if (reason) confidence += 0.2;

    // 有明确的决策维度
    if (dimensions.length > 0) confidence += 0.1 * Math.min(dimensions.length, 3);

    // 内容长度适中（太短或太长都不可靠）
    const length = content.length;
    if (length > 20 && length < 500) confidence += 0.1;

    return Math.min(confidence, 0.95);
  }
}
