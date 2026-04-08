/**
 * Unit tests for cold scan extractors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';

// Mock fs
vi.mock('node:fs/promises');

// Import after mocking
import { source as gitConfigSource } from '../../src/infrastructure/cold-scan/extractors/git-config.js';
import { source as packageJsonSource } from '../../src/infrastructure/cold-scan/extractors/package-json.js';

describe('Cold Scan Extractors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('git-config extractor', () => {
    it('should extract user name and email from git config', async () => {
      const mockGitConfig = `
[user]
  name = Test User
  email = test@example.com

[github]
  user = testuser
`;

      const result = await gitConfigSource.extractor(mockGitConfig, '.gitconfig');

      expect(result.length).toBeGreaterThan(0);

      const nameBlock = result.find((b: any) => b.annotation.includes('姓名'));
      expect(nameBlock).toBeDefined();
      expect(nameBlock?.content).toContain('Test User');

      const emailBlock = result.find((b: any) => b.annotation.includes('邮箱'));
      expect(emailBlock).toBeDefined();
      expect(emailBlock?.content).toContain('test@example.com');
    });

    it('should return empty array for empty git config', async () => {
      const result = await gitConfigSource.extractor('', '.gitconfig');

      expect(result).toHaveLength(0);
    });

    it('should handle malformed git config gracefully', async () => {
      const result = await gitConfigSource.extractor('invalid {{{', '.gitconfig');

      // Should not throw
      expect(Array.isArray(result)).toBe(true);
    });

    it('should extract git aliases', async () => {
      const mockGitConfig = `
[alias]
  co = checkout
  br = branch
  ci = commit
  st = status
`;

      const result = await gitConfigSource.extractor(mockGitConfig, '.gitconfig');

      const aliasBlock = result.find((b: any) => b.annotation.includes('Git 别名'));
      expect(aliasBlock).toBeDefined();
      expect(aliasBlock?.content).toContain('co');
    });

    it('should extract default branch', async () => {
      const mockGitConfig = `
init.defaultBranch = main
`;

      const result = await gitConfigSource.extractor(mockGitConfig, '.gitconfig');

      const branchBlock = result.find((b: any) => b.annotation.includes('默认分支'));
      expect(branchBlock).toBeDefined();
      expect(branchBlock?.content).toContain('main');
    });
  });

  describe('package.json extractor', () => {
    it('should extract language from dependencies', async () => {
      const mockPackageJson = {
        name: 'test-project',
        dependencies: {
          'typescript': '^5.0.0'
        },
        devDependencies: {
          '@types/node': '^20.0.0'
        }
      };

      const result = await packageJsonSource.extractor(
        JSON.stringify(mockPackageJson),
        'package.json'
      );

      expect(result.length).toBeGreaterThan(0);

      const langBlock = result.find((b: any) => b.annotation.includes('语言'));
      expect(langBlock).toBeDefined();
      expect(langBlock?.content).toContain('TypeScript');
    });

    it('should infer JavaScript when no TypeScript', async () => {
      const mockPackageJson = {
        name: 'js-project',
        dependencies: {
          'react': '^18.0.0'
        }
      };

      const result = await packageJsonSource.extractor(
        JSON.stringify(mockPackageJson),
        'package.json'
      );

      const langBlock = result.find((b: any) => b.annotation.includes('语言'));
      expect(langBlock).toBeDefined();
      expect(langBlock?.content).toContain('JavaScript');
    });

    it('should extract frontend frameworks', async () => {
      const mockPackageJson = {
        name: 'react-app',
        dependencies: {
          'react': '^18.0.0',
          'next': '^14.0.0'
        }
      };

      const result = await packageJsonSource.extractor(
        JSON.stringify(mockPackageJson),
        'package.json'
      );

      const frameworkBlock = result.find((b: any) => b.annotation.includes('前端框架'));
      expect(frameworkBlock).toBeDefined();
      expect(frameworkBlock?.content).toContain('react');
      expect(frameworkBlock?.content).toContain('next');
    });

    it('should extract test frameworks', async () => {
      const mockPackageJson = {
        name: 'test-project',
        devDependencies: {
          'vitest': '^1.0.0',
          '@testing-library/react': '^14.0.0'
        }
      };

      const result = await packageJsonSource.extractor(
        JSON.stringify(mockPackageJson),
        'package.json'
      );

      const testBlock = result.find((b: any) => b.annotation.includes('测试框架'));
      expect(testBlock).toBeDefined();
      expect(testBlock?.content).toContain('vitest');
    });

    it('should extract project name', async () => {
      const mockPackageJson = {
        name: 'my-awesome-project'
      };

      const result = await packageJsonSource.extractor(
        JSON.stringify(mockPackageJson),
        'package.json'
      );

      const nameBlock = result.find((b: any) => b.annotation.includes('名称'));
      expect(nameBlock).toBeDefined();
      expect(nameBlock?.content).toContain('my-awesome-project');
    });

    it('should extract npm scripts', async () => {
      const mockPackageJson = {
        name: 'script-project',
        scripts: {
          dev: 'vite',
          build: 'tsc && vite build',
          test: 'vitest',
          lint: 'eslint src'
        }
      };

      const result = await packageJsonSource.extractor(
        JSON.stringify(mockPackageJson),
        'package.json'
      );

      const scriptBlock = result.find((b: any) => b.annotation.includes('NPM 脚本'));
      expect(scriptBlock).toBeDefined();
      expect(scriptBlock?.content).toContain('dev');
      expect(scriptBlock?.content).toContain('build');
      expect(scriptBlock?.content).toContain('test');
    });

    it('should handle malformed JSON gracefully', async () => {
      const result = await packageJsonSource.extractor(
        '{"invalid": json}',
        'package.json'
      );

      // Should not throw
      expect(Array.isArray(result)).toBe(true);
    });

    it('should extract build tools', async () => {
      const mockPackageJson = {
        name: 'build-project',
        devDependencies: {
          'vite': '^5.0.0',
          'webpack': '^5.0.0'
        }
      };

      const result = await packageJsonSource.extractor(
        JSON.stringify(mockPackageJson),
        'package.json'
      );

      const toolBlock = result.find((b: any) => b.annotation.includes('构建工具'));
      expect(toolBlock).toBeDefined();
      expect(toolBlock?.content).toContain('vite');
    });
  });

  describe('security boundaries', () => {
    it('should never extract private fields from package.json', async () => {
      const mockPackageJson = {
        name: 'project-with-secrets',
        dependencies: {
          'some-package': '^1.0.0'
        },
        _somePrivateField: 'sk-1234567890'
      };

      const result = await packageJsonSource.extractor(
        JSON.stringify(mockPackageJson),
        'package.json'
      );

      // Should not extract private fields
      const blocksWithSecrets = result.filter((b: any) =>
        b.content.includes('sk-') || b.content.includes('SECRET')
      );

      expect(blocksWithSecrets).toHaveLength(0);
    });

    it('should handle very large JSON', async () => {
      // Create a large package.json with many dependencies
      const deps: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        deps[`package-${i}`] = '^1.0.0';
      }

      const mockPackageJson = {
        name: 'large-project',
        dependencies: deps
      };

      const result = await packageJsonSource.extractor(
        JSON.stringify(mockPackageJson),
        'package.json'
      );

      // Should handle gracefully
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
