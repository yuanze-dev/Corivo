# Corivo v0.11 测试清单

> 用于验证完整安装流程和核心功能

## 环境准备

- [ ] 干净的 macOS arm64 环境（或虚拟机）
- [ ] Node.js ≥18 或 Bun
- [ ] Claude Code 已安装

## Phase 1: 安装测试

### npm 安装方式（向后兼容）
```bash
npm install -g corivo
corivo init
```
- [ ] 安装成功
- [ ] `~/.corivo/` 目录已创建
- [ ] `corivo.db` 数据库已创建
- [ ] `config.json` 配置文件已创建
- [ ] `corivo --version` 显示正确版本

### curl | sh 安装方式（推荐）
```bash
curl -fsSL https://get.corivo.dev | sh
```
- [ ] 脚本下载成功
- [ ] 自动检测运行时（Bun/Node）
- [ ] 自动下载预编译包
- [ ] PATH 配置成功
- [ ] `corivo --version` 可直接运行
- [ ] `corivo init` 初始化成功

## Phase 2: Cold Scan 测试

```bash
corivo cold-scan
```
- [ ] 显示扫描进度
- [ ] 发现信息源数量 ≥ 5
- [ ] 扫描完成，无错误

验证扫描结果：
- [ ] `corivo query "git"` - 能查到用户名/邮箱
- [ ] `corivo query "TypeScript"` - 能查到技术栈
- [ ] `corivo query "缩进"` - 能查到代码风格

## Phase 3: First Push 测试

```bash
corivo push --first-activation
```
- [ ] 输出自我介绍
- [ ] 包含用户姓名
- [ ] 包含技术栈信息
- [ ] 包含代码风格
- [ ] 显示来源标注

## Phase 4: 守护进程测试

```bash
corivo daemon start
corivo daemon status
```
- [ ] 守护进程启动成功
- [ ] `launchctl list | grep corivo` 显示服务已加载
- [ ] `corivo daemon status` 显示运行中

```bash
corivo daemon stop
```
- [ ] 守护进程停止成功
- [ ] `launchctl list | grep corivo` 服务已卸载

## Phase 5: 注入规则测试

```bash
cd /tmp/test-project
corivo inject
```
- [ ] 项目 `CLAUDE.md` 已创建
- [ ] 包含 `<!-- CORIVO START -->` 标记
- [ ] 包含采集/查询/推送指令

```bash
corivo inject --global
```
- [ ] `~/.claude/CLAUDE.md` 已创建
- [ ] 规则已注入

```bash
corivo inject --eject
```
- [ ] 规则已移除

## Phase 6: 自动更新测试

```bash
corivo update check
```
- [ ] 显示当前版本
- [ ] 显示最新版本（如果有网络）

```bash
corivo update status
```
- [ ] 显示更新记录（如果有）

## Phase 7: 卸载测试

```bash
curl -fsSL https://get.corivo.dev/uninstall | sh
```
- [ ] 停止守护进程
- [ ] 移除 launchd 配置
- [ ] 删除 `~/.corivo/` 目录
- [ ] CLAUDE.md 规则已清理
- [ ] PATH 条目已移除

---

## 已知问题（不阻塞发布）

- [ ] Linux 守护进程未实现
- [ ] Windows 完全不支持
- [ ] 自动更新需要手动触发
- [ ] 无 LLM 时降级功能未充分测试

---

*测试人员：*
*测试日期：*
*Corivo 版本：*
