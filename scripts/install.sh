#!/usr/bin/env bash
# Corivo 安装脚本
# 用法: curl -fsSL https://get.corivo.ai | sh

set -e

# ── 颜色 ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}✔${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✖${NC} $1"; }
log_step()  { echo -e "${BLUE}⏳${NC} $1"; }
log_corivo(){ echo -e "${CYAN}[corivo]${NC} $1"; }

# ── 配置 ───────────────────────────────────────────────────────────────────
CORIVO_CONFIG_DIR="$HOME/.corivo"
CORIVO_HOOKS_DIR="$CORIVO_CONFIG_DIR/hooks"
GITHUB_RAW="https://raw.githubusercontent.com/yuanze-dev/Corivo/main/packages/plugins/claude-code"

# ── 1. 安装 Node.js（如未安装）────────────────────────────────────────────
install_node_via_nvm() {
  log_step "通过 nvm 安装 Node.js 22..."
  # 下载并执行 nvm 安装脚本
  if ! curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash; then
    log_error "nvm 安装失败"
    exit 1
  fi
  # 加载 nvm 到当前 shell（不依赖新开终端）
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  if ! command -v nvm &>/dev/null; then
    log_error "nvm 加载失败，请重开终端后重试"
    exit 1
  fi
  nvm install 22
  nvm use 22
  nvm alias default 22
  log_info "Node.js $(node -v) 已安装"
}

check_node() {
  # 尝试加载 nvm（用户可能已装但未激活）
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  if ! command -v node &>/dev/null; then
    log_warn "未检测到 Node.js，正在自动安装..."
    install_node_via_nvm
    return
  fi

  local major
  major=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$major" -lt 18 ]; then
    log_warn "Node.js 版本过低 ($(node -v))，正在升级..."
    install_node_via_nvm
    return
  fi

  log_info "Node.js $(node -v)"
}

# ── 2. 安装构建依赖（better-sqlite3 需要 Python + gcc）──────────────────────
install_build_deps() {
  # 已有 python3 和 gcc 则跳过
  if command -v python3 &>/dev/null && command -v gcc &>/dev/null; then
    log_info "构建依赖已就绪"
    return
  fi

  log_step "安装构建依赖（Python3 + gcc）..."

  # 非 root 用户需要 sudo
  SUDO=""
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo &>/dev/null; then
      SUDO="sudo"
    else
      log_warn "需要 root 权限安装构建依赖，但未找到 sudo"
    fi
  fi

  if command -v apt-get &>/dev/null; then
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq python3 make g++ > /dev/null
  elif command -v yum &>/dev/null; then
    $SUDO yum install -y -q python3 make gcc-c++ > /dev/null
  elif command -v apk &>/dev/null; then
    $SUDO apk add --quiet python3 make g++ > /dev/null
  elif command -v brew &>/dev/null; then
    command -v python3 &>/dev/null || brew install python3 > /dev/null
  else
    log_warn "无法自动安装构建依赖，请手动安装 python3 和 gcc"
    log_warn "Debian/Ubuntu: apt-get install python3 make g++"
    log_warn "Alpine:        apk add python3 make g++"
    log_warn "CentOS/RHEL:   yum install python3 make gcc-c++"
  fi

  log_info "构建依赖已就绪"
}

# ── 3. 安装 Corivo CLI ────────────────────────────────────────────────────
install_corivo_cli() {
  log_step "安装 Corivo CLI..."
  npm install -g corivo
  # npm 有时不设置执行权限，手动补上
  CORIVO_BIN="$(npm root -g)/../bin/corivo"
  [ -f "$CORIVO_BIN" ] && chmod +x "$CORIVO_BIN" 2>/dev/null || true
  log_info "Corivo CLI 已安装 ($(corivo --version 2>/dev/null || echo 'latest'))"
}

# ── 3. 初始化数据库 + 启动守护进程 ─────────────────────────────────────────
init_corivo() {
  if [ -f "$CORIVO_CONFIG_DIR/corivo.db" ]; then
    log_info "Corivo 已初始化，跳过"
    return
  fi
  log_step "初始化 Corivo..."
  corivo init
  # corivo init 内部会自动调用 corivo start 启动心跳守护进程
}

# ── 4. 找到 Claude Code 配置目录 ───────────────────────────────────────────
find_claude_dir() {
  for dir in "$HOME/.claude" "$HOME/.config/claude" "$HOME/Library/Application Support/claude"; do
    if [ -d "$dir" ]; then
      CLAUDE_DIR="$dir"
      log_info "找到 Claude Code 配置目录: $CLAUDE_DIR"
      return 0
    fi
  done
  log_warn "未找到 Claude Code 配置目录，跳过 skill 和 hook 安装"
  log_warn "安装 Claude Code 后，重新运行此脚本即可"
  return 1
}

# ── 5. 安装 Skills ─────────────────────────────────────────────────────────
install_skills() {
  local skills_dir="$CLAUDE_DIR/skills"
  log_step "安装 Corivo skills..."

  for skill in corivo-save corivo-query; do
    mkdir -p "$skills_dir/$skill"
    local dest="$skills_dir/$skill/SKILL.md"
    local src_url="$GITHUB_RAW/skills/$skill/skill.md"

    if curl -fsSL --connect-timeout 10 "$src_url" -o "$dest"; then
      log_info "skill 已安装: $skill"
    else
      log_warn "skill 下载失败: $skill（网络问题？）"
    fi
  done
}

# ── 6. 安装 Hook 脚本 ──────────────────────────────────────────────────────
install_hook_scripts() {
  log_step "安装 hook 脚本到 $CORIVO_HOOKS_DIR..."
  mkdir -p "$CORIVO_HOOKS_DIR"

  for script in session-init.sh ingest-turn.sh session-carry-over.sh prompt-recall.sh stop-review.sh; do
    local dest="$CORIVO_HOOKS_DIR/$script"
    local src_url="$GITHUB_RAW/hooks/scripts/$script"

    if curl -fsSL --connect-timeout 10 "$src_url" -o "$dest"; then
      chmod +x "$dest"
      log_info "hook 脚本已安装: $script"
    else
      log_warn "hook 脚本下载失败: $script"
    fi
  done
}

# ── 7. 写入 Claude Code settings.json ─────────────────────────────────────
install_hooks_config() {
  local settings_file="$CLAUDE_DIR/settings.json"
  log_step "配置 Claude Code hooks..."

  # 确保 settings.json 存在
  if [ ! -f "$settings_file" ]; then
    echo '{}' > "$settings_file"
  fi

  local hooks_dir="$CORIVO_HOOKS_DIR"

  # 用 node 合并 hooks（避免覆盖用户已有配置）
  node - <<EOF
const fs = require('fs');
const path = '$settings_file';
const raw = fs.readFileSync(path, 'utf-8');
const settings = JSON.parse(raw);

if (!settings.hooks) settings.hooks = {};

// 检查是否已有 corivo hooks（防止重复写入）
const isCorivHook = (h) => h.hooks && h.hooks.some(x => x.command && x.command.includes('corivo'));

const merge = (event, newEntry) => {
  if (!settings.hooks[event]) settings.hooks[event] = [];
  const existing = settings.hooks[event];
  if (!existing.some(isCorivHook)) {
    existing.push(newEntry);
  }
};

  merge('SessionStart', {
  hooks: [
    { type: 'command', command: 'bash ${hooks_dir}/session-init.sh', timeout: 5 },
    { type: 'command', command: 'bash ${hooks_dir}/session-carry-over.sh', timeout: 5 }
  ]
  });

  merge('UserPromptSubmit', {
  hooks: [
    { type: 'command', command: 'bash ${hooks_dir}/ingest-turn.sh user', timeout: 10 },
    { type: 'command', command: 'bash ${hooks_dir}/prompt-recall.sh', timeout: 10 }
  ]
  });

  merge('Stop', {
  hooks: [
    { type: 'command', command: 'bash ${hooks_dir}/ingest-turn.sh assistant', timeout: 10 },
    { type: 'command', command: 'bash ${hooks_dir}/stop-review.sh', timeout: 5 }
  ]
  });

fs.writeFileSync(path, JSON.stringify(settings, null, 2));
console.log('hooks 已写入');
EOF

  log_info "hooks 已配置: $settings_file"
}

# ── 8. 检查 Claude Code 进程 ───────────────────────────────────────────────
check_claude_process() {
  if pgrep -f "claude" &>/dev/null; then
    echo ""
    echo -e "${YELLOW}══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  ⚠️  检测到 Claude Code 正在运行          ${NC}"
    echo -e "${YELLOW}══════════════════════════════════════════${NC}"
    echo ""
    echo "  Skills 和 Hooks 已安装，但需要重启 Claude Code 才能生效。"
    echo "  请关闭并重新打开 Claude Code。"
    echo ""
  fi
}

# ── 完成提示 ───────────────────────────────────────────────────────────────
show_success() {
  echo ""
  echo -e "${GREEN}══════════════════════════════════════════${NC}"
  echo -e "${GREEN}     Corivo 已就绪                        ${NC}"
  echo -e "${GREEN}══════════════════════════════════════════${NC}"
  echo ""
  echo -e "${CYAN}从下次对话开始，我会记住一切。${NC}"
  echo ""
  echo "常用命令："
  echo "  corivo status          # 查看状态"
  echo "  corivo query \"关键词\"  # 回忆记忆"
  echo "  corivo save --content \"内容\" --annotation \"类型 · 领域\""
  echo ""
}

# ── 主流程 ─────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
  echo -e "${CYAN}     Corivo 安装向导                      ${NC}"
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
  echo ""

  check_node
  install_build_deps
  install_corivo_cli
  init_corivo

  if find_claude_dir; then
    install_skills
    install_hook_scripts
    install_hooks_config
    check_claude_process
  fi

  show_success
}

trap 'log_error "安装过程中出现错误"; exit 1' ERR

main "$@"
