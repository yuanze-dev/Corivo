/**
 * Rule engine tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine } from '../../src/domain/memory/rules.js';
import { TechChoiceRule } from '../../src/domain/memory/rules/tech-choice.js';

describe('RuleEngine', () => {
  describe('TechChoiceRule', () => {
    const rule = new TechChoiceRule();

    it('should extract tech choice from simple decision', () => {
      const content = '选择使用 PostgreSQL 作为数据库';
      const pattern = rule.extract(content);

      expect(pattern).not.toBeNull();
      expect(pattern?.decision).toBe('PostgreSQL');
      expect(pattern?.type).toBe('技术选型');
    });

    it('should extract security dimension', () => {
      const content = '选择使用 SQLCipher。因为需要端到端加密保护用户隐私';
      const pattern = rule.extract(content);

      expect(pattern).not.toBeNull();
      expect(pattern?.dimensions).toContainEqual({
        name: '安全性',
        weight: 0.9,
        reason: '规则推断',
      });
      expect(pattern?.reason).toContain('端到端加密保护用户隐私');
    });

    it('should extract local-first dimension', () => {
      const content = '采用 SQLite。实现本地优先和离线支持';
      const pattern = rule.extract(content);

      expect(pattern).not.toBeNull();
      expect(pattern?.decision).toBe('SQLite');
      expect(pattern?.dimensions).toContainEqual({
        name: '本地优先',
        weight: 0.8,
        reason: '规则推断',
      });
    });

    it('should extract rejected alternatives', () => {
      const content = '在 MongoDB 和 Redis 之间选择 PostgreSQL';
      const pattern = rule.extract(content);

      expect(pattern).not.toBeNull();
      expect(pattern?.alternatives_rejected).toEqual(expect.arrayContaining(['MongoDB', 'Redis']));
    });

    it('should extract context tags for frontend', () => {
      const content = '前端选择使用 Vue.js';
      const pattern = rule.extract(content);

      expect(pattern).not.toBeNull();
      expect(pattern?.context_tags).toContain('前端');
    });

    it('should return null for non-decision content', () => {
      const content = '今天天气不错';
      const pattern = rule.extract(content);

      expect(pattern).toBeNull();
    });

    it('should calculate confidence correctly', () => {
      const content = '选择使用 TypeScript。因为需要类型安全和更好的开发体验';
      const pattern = rule.extract(content);

      expect(pattern).not.toBeNull();
      expect(pattern?.confidence).toBeGreaterThan(0.5);
      expect(pattern?.reason).toContain('类型安全和更好的开发体验');
    });

    it('should extract tech choice with dot in name', () => {
      const content = '决定使用 Node.js 作为后端运行时';
      const pattern = rule.extract(content);

      expect(pattern).not.toBeNull();
      expect(pattern?.decision).toBe('Node.js');
    });
  });

  describe('RuleEngine Integration', () => {
    let engine: RuleEngine;

    beforeEach(() => {
      engine = new RuleEngine();
      engine.register(new TechChoiceRule());
    });

    it('should extract pattern using registered rules', () => {
      const content = '决定使用 Node.js 作为后端运行时';
      const pattern = engine.extract(content);

      expect(pattern).not.toBeNull();
      expect(pattern?.decision).toBe('Node.js');
      expect(pattern?._source).toBe('rule');
    });

    it('should return null when no rules match', () => {
      const content = '这是一段普通的内容，不包含任何技术选型决策';
      const pattern = engine.extract(content);

      expect(pattern).toBeNull();
    });

    it('should extract from multiple contents', () => {
      const contents = [
        '选择使用 React',
        '决定采用 PostgreSQL',
        '今天天气不错，适合出去玩',
        '使用 TypeScript 来实现类型安全',
      ];

      const results = engine.extractAll(contents);

      expect(results).toHaveLength(4);
      expect(results[0]).not.toBeNull();
      expect(results[1]).not.toBeNull();
      expect(results[2]).toBeNull();
      expect(results[3]).not.toBeNull();
    });

    it('should track rule count', () => {
      expect(engine.ruleCount).toBe(1);

      engine.register({ name: 'test', patterns: [], extract: () => null } as any);
      expect(engine.ruleCount).toBe(2);
    });
  });
});
