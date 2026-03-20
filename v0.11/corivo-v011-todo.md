# Corivo v0.11 实施 TODO

> 目标：一句话安装 + Cold Scan 首次画像 + 心跳常驻 + 自动更新
> 设计方案：corivo-one-command-install.md
> 预估总工期：~8 天

---

## Phase 0：开源与许可证（Day 0，先做）

### 0.1 License 声明
- [ ] README.md 底部加 License 段落：
  ```
  ## License
  Corivo Core 使用 MIT 协议开源。
  团队版与企业版功能（计划中）将以商业许可发布，详见 [corivo.dev/pricing]。
  ```
- [ ] 确认根目录 LICENSE 文件为 MIT 全文，无需修改

### 0.2 企业代码隔离原则
- [ ] 团队协作、权限管理、审计日志、管理后台等企业功能代码，从现在起**不得提交到本仓库**
- [ ] 后续企业功能在独立私有仓库 `corivo-enterprise` 中开发，以商业许可发布
- [ ] 在 CONTRIBUTING.md（如果有）中说明：本仓库只接受 MIT 协议下的贡献

---

## Phase 1：预编译 CI（Day 1-2）

### 1.1 GitHub Actions Release 流水线
- [ ] 创建 `.github/workflows/release.yml`
- [ ] 配置矩阵构建：macOS arm64（优先）、macOS x64、Linux x64
- [ ] 集成 `prebuildify` 打 better-sqlite3 native addon
- [ ] 构建产物：`corivo-Darwin-arm64.tar.gz` 等（包含 dist/ + node_modules/better-sqlite3 prebuilt）
- [ ] Tag 推送触发自动发布到 GitHub Releases
- [ ] 验证：下载解压后 `./corivo --version` 可直接运行，无需 node-gyp

### 1.2 清理仓库
- [ ] 把 `dist/` 加入 .gitignore，从 Git 历史中移除
- [ ] 确认 `npm run build` 产物正确打入 Release 包

---

## Phase 2：安装脚本（Day 2-3）

### 2.1 编写 `scripts/install.sh`
- [ ] `detect_runtime()`：检测 Bun → Node ≥18 → 自动安装 Bun
- [ ] `download_corivo()`：根据 OS/ARCH 从 GitHub Releases 下载预编译包到 `~/.corivo/bin/`
- [ ] 写入 PATH（追加到 ~/.zshrc 和 ~/.bashrc，避免重复追加）
- [ ] `corivo init`：创建 `~/.corivo/corivo.db` + `config.json` + `identity.json`
- [ ] 错误处理：网络失败、权限不足、磁盘空间不足等场景
- [ ] 幂等性：重复执行不会破坏已有数据

### 2.2 卸载脚本
- [ ] 编写 `scripts/uninstall.sh`
- [ ] 停止守护进程 + 移除 launchd/systemd 配置
- [ ] 清理 `~/.corivo/`
- [ ] 从 CLAUDE.md 中移除 `<!-- CORIVO START -->...<!-- CORIVO END -->` 块
- [ ] 清理 PATH 条目

### 2.3 脚本托管
- [ ] 部署 `https://get.corivo.dev` → install.sh（Cloudflare Workers 或 GitHub Pages）
- [ ] 部署 `https://get.corivo.dev/uninstall` → uninstall.sh

---

## Phase 3：Cold Scan 首次画像（Day 3-4）

### 3.1 扫描框架
- [ ] 实现 `src/cold-scan/index.ts` 扫描调度器
- [ ] 按 priority 降序扫描，总超时 15 秒
- [ ] 单源超时控制（500ms-3000ms）
- [ ] 扫描结果写入 pending blocks

### 3.2 基础信息源 Extractor（P0，首批必须有）
- [ ] `git-config`：提取 user.name、user.email → 身份信息
- [ ] `package-json`：扫描最近 10 个项目，提取主要依赖 → 技术栈
- [ ] `prettier-config` / `editorconfig`：缩进、引号、分号 → 代码风格
- [ ] `docker-compose`：提取 services → 基础设施偏好
- [ ] `current-project`：当前目录 README + package.json → 当前项目

### 3.3 AI 工具配置 Extractor（P0，核心差异化）

**Claude Code：**
- [ ] 全局 CLAUDE.md（`~/.claude/CLAUDE.md` + `~/.config/claude/CLAUDE.md`）→ AI 使用哲学
- [ ] settings.json / settings.local.json → allowedTools 权限偏好
- [ ] `~/.claude.json` → MCP Server 列表
- [ ] `~/.claude/commands/*.md` → 自定义命令（高频工作流）
- [ ] `~/.claude/plugins/*/manifest.json` → 已安装插件
- [ ] 项目级 CLAUDE.md（最近 10 个项目）→ 项目规范

**OpenAI Codex：**
- [ ] `~/.codex/config.toml` → model / approval_policy / sandbox_mode / personality
- [ ] `~/.codex/AGENTS.md` + `AGENTS.override.md` → 全局指令
- [ ] `~/.codex/config.toml` 中 `[mcp_servers.*]` → MCP 配置
- [ ] `~/.codex/rules/*.md` → 自定义规则

**Cursor / Windsurf：**
- [ ] `.cursorrules` + `.cursor/rules/*.mdc` → Cursor 规则
- [ ] `.windsurfrules` + `.windsurf/rules/*.md` → Windsurf 规则

**跨工具：**
- [ ] 项目级 `.mcp.json`（最近 10 个项目）→ 项目 MCP 配置

### 3.4 补充信息源 Extractor（P1，有则更好）
- [ ] `git-remotes`：最近 10 个项目 → GitHub/GitLab org
- [ ] `ssh-config`：常用服务器（不提取密钥）
- [ ] `shell-history`：高频命令模式（不记录具体命令）
- [ ] `pyproject-toml` / `cargo-toml`：Python / Rust 项目

### 3.5 安全边界
- [ ] 实现 NEVER_SCAN 列表硬编码
- [ ] 包含：`~/.ssh/id_*`、`~/.aws/credentials`、`~/.env`、`**/secret*`、`**/password*`、`**/token*`
- [ ] 包含 AI 工具凭证：`~/.claude/.credentials.json`、`~/.codex/auth.json`
- [ ] 包含 AI 对话历史：`~/.claude/projects/**`、`~/.codex/sessions/**`
- [ ] 所有 extractor 只提取结构信息（键名、工具名、依赖名），不提取值和内容
- [ ] CLAUDE.md / AGENTS.md 内容可提取（用户主动写的指令，非机密）

### 3.6 CLI 入口
- [ ] 实现 `corivo cold-scan` 命令
- [ ] 输出进度：`⏳ 正在扫描你的工作环境... 发现 N 个信息源`

---

## Phase 4：首次心跳 + First Push（Day 4-5）

### 4.1 首次心跳加速模式
- [ ] 在 heartbeat loop 中增加 `--first-run` 模式
- [ ] 首次模式参数：maxPendingBlocks=50（常规 10），timeLimit=8s（常规 5s）
- [ ] 跳过衰减和冷区整合（首次无历史数据）
- [ ] 首次完成后写入标记文件，后续启动不再触发

### 4.2 Identity Profile 生成
- [ ] 实现 `src/cold-scan/profile.ts`
- [ ] 从处理完的 blocks 中聚合结构化用户画像：name、role、techStack、codeStyle、team、currentProject
- [ ] 有 LLM 时：LLM 做整合性总结
- [ ] 无 LLM 时：规则引擎做结构化提取
- [ ] 保存为特殊 block（annotation: "事实 · 身份 · 画像"）

### 4.3 First Push 拟人化输出
- [ ] 实现 `src/push/first-push.ts`
- [ ] 拼装自我介绍文案：问候 + 感谢激活 + 逐条画像 + 来源标注 + 纠正引导
- [ ] 最低阈值：≥3 条有效信息才输出完整画像，不够则输出简短版
- [ ] 实现 `corivo push --first-activation` CLI 命令
- [ ] 安装脚本最后调用此命令，直接输出到终端

### 4.4 守护进程集成
- [ ] macOS：生成 `~/Library/LaunchAgents/com.corivo.daemon.plist`，`launchctl load`
- [ ] Linux：生成 `~/.config/systemd/user/corivo.service`，`systemctl --user enable --now`
- [ ] KeepAlive / Restart=always 保证进程常驻
- [ ] fallback：launchd 失败时降级为寄生模式（CLI 调用时顺带心跳）
- [ ] 实现 `corivo daemon start / stop / status` 命令

---

## Phase 5：自动更新（Day 5-6）

### 5.1 version.json 端点
- [ ] 定义 version.json 结构：version、released_at、breaking、changelog、binaries（per platform）
- [ ] CI 发布新版本时自动生成并部署 version.json 到 `https://get.corivo.dev/version.json`
- [ ] 每个 binary 包含 url + sha256 checksum

### 5.2 心跳版本检查（第七个任务）
- [ ] 实现 `src/heartbeat/update-checker.ts`
- [ ] 每 6 小时检查一次（`CHECK_INTERVAL = 6h`）
- [ ] 请求 version.json，5 秒超时，失败静默跳过
- [ ] 请求头带 `User-Agent: corivo/{version} {OS}-{ARCH}`（顺带解决 DAU 遥测）
- [ ] semver 比较：新版本 → 触发更新流程

### 5.3 静默更新逻辑
- [ ] 下载新二进制到 `~/.corivo/bin/corivo.new`
- [ ] SHA-256 checksum 校验
- [ ] 原子替换：`mv corivo corivo.old && mv corivo.new corivo`
- [ ] 守护进程被系统自动重启（加载新二进制）
- [ ] 写入 `~/.corivo/last-update.json`（from、to、at、changelog）
- [ ] 下次 CLI 调用时提示：`[corivo] 已自动更新到 vX.Y.Z`

### 5.4 回滚机制
- [ ] 新版本启动失败 → 自动回滚 `mv corivo.old corivo`
- [ ] 连续崩溃 3 次检测 → 触发回滚
- [ ] 回滚后写入错误日志，下次 CLI 调用时提示

### 5.5 破坏性更新处理
- [ ] `breaking: true` 时不自动更新
- [ ] 下次 CLI 调用时提示：`[corivo] 新版本 vX.Y.Z 可用，包含重要变更，请运行 corivo update`
- [ ] 实现 `corivo update` 手动更新命令

### 5.6 CLAUDE.md 规则同步
- [ ] 版本更新时检查规则是否有变更
- [ ] 自动替换 `<!-- CORIVO START -->...<!-- CORIVO END -->` 之间的内容
- [ ] 扫描全局和项目级 CLAUDE.md

### 5.7 用户控制
- [ ] `corivo config set update.auto false` 关闭自动更新
- [ ] `corivo config set update.pin "0.10.x"` 固定版本范围
- [ ] `corivo update check` 手动检查
- [ ] `corivo version` 显示当前版本 + 更新状态

---

## Phase 6：CLAUDE.md 规则注入（Day 6-7）

### 6.1 规则模板
- [ ] 编写标准规则模板（采集 / 查询 / 推送三段指令）
- [ ] `<!-- CORIVO START -->` / `<!-- CORIVO END -->` 标记包裹
- [ ] annotation 类型说明：事实 / 知识 / 决策 / 偏好
- [ ] 包含 `corivo context` 主动推送指令

### 6.2 注入逻辑
- [ ] 注入到全局 CLAUDE.md（`~/.claude/CLAUDE.md`）
- [ ] 注入到当前项目 CLAUDE.md（追加，不覆盖已有内容）
- [ ] 幂等：已存在 CORIVO 标记时替换而非重复追加

---

## Phase 7：端到端测试 + 内测（Day 7-8）

### 7.1 全流程测试
- [ ] 干净 macOS arm64 环境：`curl | sh` → Cold Scan → First Push → 守护进程运行
- [ ] 验证心跳循环正常（`corivo daemon status`）
- [ ] 验证采集→心跳→推送完整链路
- [ ] 验证 LLM 未配置时的降级行为
- [ ] 验证自动更新流程（发布 patch 版本，观察自动更新）
- [ ] 验证卸载脚本完整清理

### 7.2 内测准备
- [ ] 更新 README.md 安装方式为 `curl | sh`
- [ ] 准备内测邀请文案（微信/飞书）
- [ ] 准备反馈收集渠道（GitHub Issues 模板 / 飞书群）

---

## 注意事项

**内测先只支持 macOS arm64**，覆盖 90%+ 目标用户，减少 CI 和测试负担。

**LLM 配置**：安装脚本最后提示配置 LLM。自动检测本地 Ollama，有就直接配上。没有则提示手动配置 API Key。无 LLM 时规则引擎仍工作。

**向后兼容**：`npm install -g corivo` + `npx corivo` 继续可用，不受影响。

**设计方案参考**：全部技术细节（代码示例、数据结构、伪代码）见 `corivo-one-command-install.md`。

---

*最后更新：2026-03-20*
