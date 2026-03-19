# Corivo

你的赛博伙伴 —— 记忆存储与智能推送

## 安装

```bash
npm install -g .
# 或
npm install
npx corivo --help
```

## 初始化

```bash
corivo init
```

## 使用

```bash
# 保存信息
corivo save --content "选择使用 PostgreSQL" --annotation "决策 · project · corivo"

# 查询信息
corivo query "数据库"

# 查看状态
corivo status

# 启动心跳守护进程
corivo start

# 停止心跳
corivo stop

# 注入规则到项目的 CLAUDE.md（Claude Code 集成）
corivo inject
```

## Claude Code 集成

Corivo 支持 `--no-password` 选项用于非交互式环境（如 Claude Code）：

```bash
corivo save "内容" --annotation "决策 · project" --no-password
corivo query "关键词" --no-password
corivo status --no-password
```

## 开发

```bash
npm install
npm run build
npm test
```

## License

MIT
