/**
 * Current Project Extractor
 * Extract current project information
 */

import { readFileSafe, createBlock } from '../utils.js';
import type { ScanSource } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function extractCurrentProject(_content: string, filePath: string) {
  const blocks = [];
  const cwd = process.cwd();

  try {
    // Read README
    const readmes = [
      'README.md',
      'README.txt',
      'readme.md',
      'Readme.md',
    ];

    let readmeContent: string | null = null;
    let readmePath: string | null = null;

    for (const readme of readmes) {
      const p = path.join(cwd, readme);
      try {
        const content = await fs.readFile(p, 'utf-8');
        readmeContent = content;
        readmePath = p;
        break;
      } catch {
        continue;
      }
    }

    // Extract project name
    const projectName = path.basename(cwd);
    blocks.push(
      createBlock({
        content: `当前项目: ${projectName}`,
        annotation: '事实 · 项目 · 当前',
        source: 'current-project',
        filePath: cwd,
        metadata: { projectName, projectPath: cwd },
      })
    );

    // Extract project description
    if (readmeContent) {
      // Try to extract title and first paragraph
      const titleMatch = readmeContent.match(/^#\s+(.+)$/m);
      const descriptionMatch = readmeContent.match(
        /^#\s+.+\n+([^#\n].{10,200})$/m
      );

      if (titleMatch) {
        const title = titleMatch[1].trim();
        blocks.push(
          createBlock({
            content: `项目标题: ${title}`,
            annotation: '事实 · 项目 · 描述',
            source: 'current-project',
            filePath: readmePath || cwd,
            metadata: { title },
          })
        );
      }

      if (descriptionMatch) {
        const description = descriptionMatch[1].trim().substring(0, 200);
        blocks.push(
          createBlock({
            content: `项目简介: ${description}`,
            annotation: '事实 · 项目 · 描述',
            source: 'current-project',
            filePath: readmePath || cwd,
            metadata: { description },
          })
        );
      }
    }

    // Read package.json for more information
    const pkgPath = path.join(cwd, 'package.json');
    try {
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      if (pkg.description) {
        blocks.push(
          createBlock({
            content: `项目描述: ${pkg.description}`,
            annotation: '事实 · 项目 · 描述',
            source: 'current-project',
            filePath: pkgPath,
            metadata: { description: pkg.description },
          })
        );
      }

      if (pkg.keywords && Array.isArray(pkg.keywords) && pkg.keywords.length > 0) {
        blocks.push(
          createBlock({
            content: `项目关键词: ${pkg.keywords.join(', ')}`,
            annotation: '知识 · 项目 · 标签',
            source: 'current-project',
            filePath: pkgPath,
            metadata: { keywords: pkg.keywords },
          })
        );
      }
    } catch {
      // No package.json, ignored
    }
  } catch {
    // An error occurred, at least record the project name
    const projectName = path.basename(cwd);
    blocks.push(
      createBlock({
        content: `当前项目: ${projectName}`,
        annotation: '事实 · 项目 · 当前',
        source: 'current-project',
        filePath: cwd,
        metadata: { projectName, projectPath: cwd },
      })
    );
  }

  return blocks;
}

export const source: ScanSource = {
  name: 'current-project',
  path: () => [process.cwd()],
  priority: 95,
  timeout: 2000,
  extractor: extractCurrentProject,
};

export default { source, extractCurrentProject };
