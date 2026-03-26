#!/usr/bin/env node

/**
 * generate-release-notes.mjs
 *
 * 读取 CHANGELOG.md，用 AI 将技术日志转写为面向用户的 Release Notes，
 * 然后通过 GitHub API 创建 Release。
 *
 * 环境变量：
 *   OPENROUTER_API_KEY  — OpenRouter API Key
 *   GITHUB_TOKEN        — GitHub PAT（需要 contents:write 权限）
 *   GITHUB_REPOSITORY   — owner/repo（例如 yuanze-dev/Corivo）
 *
 * 用法：
 *   node scripts/generate-release-notes.mjs                  # 处理最新版本
 *   node scripts/generate-release-notes.mjs --version 0.12.0 # 处理指定版本
 *   node scripts/generate-release-notes.mjs --all            # 处理所有版本（backfill）
 *   node scripts/generate-release-notes.mjs --dry-run        # 只生成不发布
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "yuanze-dev/Corivo";
const DRY_RUN = process.argv.includes("--dry-run");
const PROCESS_ALL = process.argv.includes("--all");
const VERSION_FLAG = process.argv.indexOf("--version");
const TARGET_VERSION =
  VERSION_FLAG !== -1 ? process.argv[VERSION_FLAG + 1] : null;

// ─── Parse CHANGELOG.md ──────────────────────────────────────────────────────

function parseChangelog(content) {
  const versions = [];
  // Match ## [version] - date patterns
  const versionRegex = /^## \[([^\]]+)\]\s*-\s*(.+)$/gm;
  let match;
  const matches = [];

  while ((match = versionRegex.exec(content)) !== null) {
    matches.push({
      version: match[1],
      date: match[2].trim(),
      startIndex: match.index,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].startIndex;
    const end = i + 1 < matches.length ? matches[i + 1].startIndex : content.length;
    const body = content
      .slice(start, end)
      .replace(/^## \[[^\]]+\].*$/m, "")
      .trim();

    versions.push({
      version: matches[i].version,
      date: matches[i].date,
      body,
    });
  }

  return versions;
}

// ─── AI Rewrite ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是 Corivo 项目的产品经理，负责将技术 CHANGELOG 转写为面向外部用户的 Release Notes。

Corivo 是一个 AI 记忆伙伴——它寄生在 Claude Code、Cursor 等工具中，自动从用户的 AI 对话中采集信息，持续整理，在合适时机主动提醒用户。

转写规则：
1. 标题格式：## vX.X.X — 一句话概括这个版本带来的核心能力变化（用中文，要有画面感）
2. 用用户能理解的语言，不要出现类名（如 ReminderManager）、函数名、接口名
3. 把"改了什么技术实现"翻译成"用户体验有什么变化"
4. 保留 CLI 命令示例（用户需要知道怎么用），但去掉内部实现细节
5. 如果是纯 bug fix 小版本，简短说明即可，不需要长篇大论
6. 语气：平实、直接，不要营销腔，像一个工程师朋友跟你说"我们更新了什么"
7. 用 Markdown 格式输出
8. 不要加任何前言或后记，直接输出 Release Note 正文`;

async function rewriteWithAI(version, date, technicalBody) {
  if (!OPENROUTER_API_KEY) {
    console.error("❌ OPENROUTER_API_KEY not set");
    process.exit(1);
  }

  const userPrompt = `请将以下 Corivo v${version}（${date}）的技术 CHANGELOG 转写为面向用户的 Release Note：

---
${technicalBody}
---`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4",
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ─── GitHub Release ───────────────────────────────────────────────────────────

async function getExistingReleases() {
  if (!GITHUB_TOKEN) return [];

  const [owner, repo] = GITHUB_REPOSITORY.split("/");
  const releases = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (!res.ok) break;
    const data = await res.json();
    if (data.length === 0) break;
    releases.push(...data);
    page++;
  }

  return releases;
}

async function getExistingTags() {
  if (!GITHUB_TOKEN) return [];

  const [owner, repo] = GITHUB_REPOSITORY.split("/");
  const tags = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/tags?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (!res.ok) break;
    const data = await res.json();
    if (data.length === 0) break;
    tags.push(...data);
    page++;
  }

  return tags;
}

function findTagForVersion(tags, version) {
  // Try common tag patterns: v0.12.0, 0.12.0, v0.12.0.0, etc.
  const candidates = [
    `v${version}`,
    version,
    `v${version}.0`,
    `${version}.0`,
  ];

  for (const candidate of candidates) {
    const found = tags.find((t) => t.name === candidate);
    if (found) return found.name;
  }

  // Fuzzy match: version starts with the target
  const fuzzy = tags.find(
    (t) => t.name.replace(/^v/, "") === version.replace(/\.0$/, "")
  );
  if (fuzzy) return fuzzy.name;

  return null;
}

async function createRelease(tagName, title, body) {
  if (!GITHUB_TOKEN) {
    console.error("❌ GITHUB_TOKEN not set");
    process.exit(1);
  }

  const [owner, repo] = GITHUB_REPOSITORY.split("/");

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tag_name: tagName,
        name: title,
        body: body,
        draft: false,
        prerelease: tagName.includes("beta") || tagName.includes("alpha"),
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${err}`);
  }

  return await res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Find CHANGELOG.md
  const changelogPath = resolve(__dirname, "..", "CHANGELOG.md");
  let content;
  try {
    content = readFileSync(changelogPath, "utf-8");
  } catch {
    console.error(`❌ Cannot read ${changelogPath}`);
    process.exit(1);
  }

  const versions = parseChangelog(content);
  console.log(`📋 Found ${versions.length} versions in CHANGELOG.md\n`);

  // Determine which versions to process
  let toProcess;
  if (PROCESS_ALL) {
    toProcess = versions;
  } else if (TARGET_VERSION) {
    toProcess = versions.filter((v) => v.version === TARGET_VERSION);
    if (toProcess.length === 0) {
      console.error(`❌ Version ${TARGET_VERSION} not found in CHANGELOG.md`);
      process.exit(1);
    }
  } else {
    // Default: latest version only
    toProcess = [versions[0]];
  }

  // Get existing releases and tags
  const existingReleases = DRY_RUN ? [] : await getExistingReleases();
  const existingTags = DRY_RUN ? [] : await getExistingTags();
  const existingTagNames = new Set(existingReleases.map((r) => r.tag_name));

  console.log(
    `🏷️  Found ${existingTags.length} tags, ${existingReleases.length} existing releases\n`
  );

  for (const entry of toProcess) {
    const { version, date, body } = entry;
    console.log(`━━━ Processing v${version} (${date}) ━━━`);

    // Find matching tag
    const tagName = DRY_RUN
      ? `v${version}`
      : findTagForVersion(existingTags, version);

    if (!tagName && !DRY_RUN) {
      console.log(`⚠️  No tag found for v${version}, skipping\n`);
      continue;
    }

    // Check if release already exists
    if (existingTagNames.has(tagName)) {
      console.log(`⏭️  Release for ${tagName} already exists, skipping\n`);
      continue;
    }

    // Rewrite with AI
    console.log(`🤖 Rewriting with AI...`);
    const releaseNotes = await rewriteWithAI(version, date, body);

    // Extract title from first line (## vX.X.X — title)
    const titleMatch = releaseNotes.match(/^##?\s*(.+)$/m);
    const title = titleMatch
      ? titleMatch[1].replace(/^#+\s*/, "")
      : `v${version}`;

    // Remove the title line from body for GitHub (GitHub shows title separately)
    const releaseBody = releaseNotes
      .replace(/^##?\s*.+$/m, "")
      .trim();

    if (DRY_RUN) {
      console.log(`\n📝 Title: ${title}`);
      console.log(`📝 Tag: ${tagName}`);
      console.log(`📝 Body:\n${releaseBody}\n`);
    } else {
      console.log(`📤 Creating GitHub Release for ${tagName}...`);
      const release = await createRelease(tagName, title, releaseBody);
      console.log(`✅ Created: ${release.html_url}\n`);
    }

    // Rate limit: small delay between API calls
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("🎉 Done!");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
