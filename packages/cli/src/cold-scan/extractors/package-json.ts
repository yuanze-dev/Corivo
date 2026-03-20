/**
 * package.json 提取器
 * 扫描最近项目，提取技术栈信息
 */

import { readJsonSafe, getRecentGitProjects, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';

async function extractPackageJson(content: string, filePath: string) {
  const blocks: ReturnType<typeof createBlock>[] = [];

  if (!content) return blocks;

  try {
    const pkg = JSON.parse(content);

    // 提取主要依赖
    const allDeps = {
      ...((pkg.dependencies as Record<string, string>) || {}),
      ...((pkg.devDependencies as Record<string, string>) || {}),
    };

    if (Object.keys(allDeps).length > 0) {
      // 分类常见依赖
      const frameworks: string[] = [];
      const languages: string[] = [];
      const tools: string[] = [];

      for (const dep of Object.keys(allDeps)) {
        if (
          /^(react|vue|angular|svelte|next|nuxt|solid|preact)/i.test(dep)
        ) {
          frameworks.push(dep);
        } else if (
          /^(typescript|@types)/.test(dep) ||
          /ts-node/.test(dep)
        ) {
          languages.push('TypeScript');
        } else if (/^(@babel|webpack|vite|rollup|esbuild|parcel)/i.test(dep)) {
          tools.push(dep);
        }
      }

      // 推断主要语言
      if (languages.includes('TypeScript')) {
        blocks.push(
          createBlock({
            content: '项目使用 TypeScript',
            annotation: '知识 · 技术栈 · 语言',
            source: 'package-json',
            filePath,
            metadata: { language: 'TypeScript' },
          })
        );
      } else {
        blocks.push(
          createBlock({
            content: '项目使用 JavaScript',
            annotation: '知识 · 技术栈 · 语言',
            source: 'package-json',
            filePath,
            metadata: { language: 'JavaScript' },
          })
        );
      }

      // 前端框架
      if (frameworks.length > 0) {
        blocks.push(
          createBlock({
            content: `使用前端框架: ${frameworks.join(', ')}`,
            annotation: '知识 · 技术栈 · 前端框架',
            source: 'package-json',
            filePath,
            metadata: { frameworks },
          })
        );
      }

      // 构建工具
      if (tools.length > 0) {
        blocks.push(
          createBlock({
            content: `使用构建工具: ${tools.join(', ')}`,
            annotation: '知识 · 技术栈 · 构建工具',
            source: 'package-json',
            filePath,
            metadata: { tools },
          })
        );
      }

      // 测试框架
      const testDeps = Object.keys(allDeps).filter(
        d =>
          /^(vitest|jest|mocha|jasmine|cypress|playwright|@testing-library)/i.test(
            d
          )
      );
      if (testDeps.length > 0) {
        blocks.push(
          createBlock({
            content: `使用测试框架: ${testDeps.join(', ')}`,
            annotation: '知识 · 技术栈 · 测试框架',
            source: 'package-json',
            filePath,
            metadata: { testFrameworks: testDeps },
          })
        );
      }
    }

    // 提取项目名称
    if (pkg.name) {
      blocks.push(
        createBlock({
          content: `项目名称: ${pkg.name}`,
          annotation: '事实 · 项目 · 名称',
          source: 'package-json',
          filePath,
          metadata: { projectName: pkg.name },
        })
      );
    }

    // 提取脚本习惯
    if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
      const scriptTypes = Object.keys(pkg.scripts).filter(s =>
        /^(dev|build|test|lint|format|start)/.test(s)
      );

      if (scriptTypes.length > 0) {
        blocks.push(
          createBlock({
            content: `npm scripts: ${scriptTypes.join(', ')}`,
            annotation: '知识 · 工作流 · NPM 脚本',
            source: 'package-json',
            filePath,
            metadata: { scripts: scriptTypes },
          })
        );
      }
    }
  } catch {
    // JSON 解析失败，跳过
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'package-json',
  path: async () => {
    // 获取最近的 Git 项目，查找其中的 package.json
    const projects = await getRecentGitProjects(10);
    const results: string[] = [];

    for (const projectDir of projects) {
      const pkgPath = `${projectDir}/package.json`;
      try {
        const pkg = await readJsonSafe(pkgPath);
        if (pkg) {
          results.push(pkgPath);
        }
      } catch {
        continue;
      }

      if (results.length >= 5) break; // 最多扫描 5 个项目
    }

    return results;
  },
  priority: 90,
  timeout: 2000,
  extractor: extractPackageJson,
};

export default { source, extractPackageJson };
