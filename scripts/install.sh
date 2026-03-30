#!/usr/bin/env bash
# Corivo 安装脚本
# 用法: curl -fsSL https://i.corivo.ai/install.sh | sh
#      curl -fsSL https://i.corivo.ai/install.sh | sh -s -- --lang en

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GITHUB_RAW_ROOT="https://raw.githubusercontent.com/Principle-Labs/Corivo/main"
INSTALL_LIB_URL="$GITHUB_RAW_ROOT/scripts/install-lib.sh"

load_install_lib() {
  if [ -f "$SCRIPT_DIR/install-lib.sh" ]; then
    # shellcheck source=scripts/install-lib.sh
    . "$SCRIPT_DIR/install-lib.sh"
    return
  fi

  local tmp_lib=""
  tmp_lib="$(mktemp)"
  curl -fsSL "$INSTALL_LIB_URL" -o "$tmp_lib"
  # shellcheck source=/dev/null
  . "$tmp_lib"
  rm -f "$tmp_lib"
}

load_install_lib

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
CORIVO_INSTALL_CLI_SOURCE="${CORIVO_INSTALL_CLI_SOURCE:-corivo}"
GITHUB_RAW_CLAUDE="$GITHUB_RAW_ROOT/packages/plugins/claude-code"
GITHUB_RAW_CODEX="$GITHUB_RAW_ROOT/packages/plugins/codex"
CODEX_CONFIG_DIR="$HOME/.codex"
CODEX_PLUGINS_DIR="$HOME/plugins"
CODEX_MARKETPLACE_DIR="$HOME/.agents/plugins"
CODEX_PLUGIN_DIR="$CODEX_PLUGINS_DIR/corivo"
CODEX_HOOKS_FILE="$CODEX_CONFIG_DIR/hooks.json"

# ── 1. 安装 Node.js（如未安装）────────────────────────────────────────────
install_node_via_nvm() {
  log_step "$(msg install_node)"
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
    log_warn "$(msg node_missing)"
    install_node_via_nvm
    return
  fi

  local major
  major=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$major" -lt 18 ]; then
    log_warn "$(msg node_old) ($(node -v))"
    install_node_via_nvm
    return
  fi

  log_info "$(msg node_ready) ($(node -v))"
}

# ── 2. 安装构建依赖（better-sqlite3 需要 Python + gcc）──────────────────────
install_build_deps() {
  # 已有 python3 和 gcc 则跳过
  if command -v python3 &>/dev/null && command -v gcc &>/dev/null; then
    log_info "$(msg build_deps_ready)"
    return
  fi

  log_step "$(msg install_build_deps)"

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
    log_warn "$(msg build_deps_manual)"
    log_warn "Debian/Ubuntu: apt-get install python3 make g++"
    log_warn "Alpine:        apk add python3 make g++"
    log_warn "CentOS/RHEL:   yum install python3 make gcc-c++"
  fi

  log_info "$(msg build_deps_ready)"
}

# ── 3. 安装 Corivo CLI ────────────────────────────────────────────────────
install_corivo_cli() {
  log_step "$(msg install_cli)"
  npm install -g "$CORIVO_INSTALL_CLI_SOURCE"
  # npm 有时不设置执行权限，手动补上
  CORIVO_BIN="$(npm root -g)/../bin/corivo"
  [ -f "$CORIVO_BIN" ] && chmod +x "$CORIVO_BIN" 2>/dev/null || true
  log_info "$(msg cli_ready) ($(corivo --version 2>/dev/null || echo 'latest'))"
}

# ── 3. 初始化数据库 + 启动守护进程 ─────────────────────────────────────────
init_corivo() {
  if [ -f "$CORIVO_CONFIG_DIR/corivo.db" ]; then
    log_info "$(msg corivo_inited)"
    return
  fi
  log_step "$(msg init_corivo)"
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
  log_warn "$(msg claude_not_found)"
  return 1
}

# ── 5. 安装 Skills ─────────────────────────────────────────────────────────
install_skills() {
  local skills_dir="$CLAUDE_DIR/skills"
  log_step "$(msg install_claude_skills)"

  for skill in corivo-save corivo-query; do
    mkdir -p "$skills_dir/$skill"
    local dest="$skills_dir/$skill/SKILL.md"
    local src_url="$GITHUB_RAW_CLAUDE/skills/$skill/skill.md"

    if curl -fsSL --connect-timeout 10 "$src_url" -o "$dest"; then
      log_info "skill 已安装: $skill"
    else
      log_warn "skill 下载失败: $skill（网络问题？）"
    fi
  done
}

# ── 6. 安装 Hook 脚本 ──────────────────────────────────────────────────────
install_hook_scripts() {
  log_step "$(msg install_claude_hooks)"
  mkdir -p "$CORIVO_HOOKS_DIR"

  for script in session-init.sh ingest-turn.sh session-carry-over.sh prompt-recall.sh stop-review.sh; do
    local dest="$CORIVO_HOOKS_DIR/$script"
    local src_url="$GITHUB_RAW_CLAUDE/hooks/scripts/$script"

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
  log_step "$(msg configure_claude_hooks)"

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

# ── 8. 安装 Codex 插件文件 ─────────────────────────────────────────────────
install_codex_plugin_files() {
  log_step "安装 Codex 插件文件..."

  mkdir -p "$CODEX_PLUGIN_DIR/.codex-plugin"
  mkdir -p "$CODEX_PLUGIN_DIR/skills/corivo"
  mkdir -p "$CODEX_PLUGIN_DIR/skills/corivo-save"
  mkdir -p "$CODEX_PLUGIN_DIR/skills/corivo-query"
  mkdir -p "$CODEX_PLUGIN_DIR/assets"
  mkdir -p "$CODEX_PLUGIN_DIR/hooks/scripts"

  local files="
.codex-plugin/plugin.json
skills/corivo/SKILL.md
skills/corivo-save/SKILL.md
skills/corivo-query/SKILL.md
assets/corivo-icon.svg
assets/corivo-logo.svg
hooks/hooks.json
hooks/scripts/ingest-turn.sh
hooks/scripts/session-init.sh
hooks/scripts/user-prompt-submit.sh
hooks/scripts/stop.sh
README.md
"

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    local dest="$CODEX_PLUGIN_DIR/$file"
    local src_url="$GITHUB_RAW_CODEX/$file"
    mkdir -p "$(dirname "$dest")"

    if curl -fsSL --connect-timeout 10 "$src_url" -o "$dest"; then
      case "$file" in
        hooks/scripts/*.sh)
          chmod +x "$dest"
          ;;
      esac
      log_info "Codex 文件已安装: $file"
    else
      log_warn "Codex 文件下载失败: $file"
    fi
  done <<EOF
$files
EOF
}

install_codex_marketplace() {
  log_step "配置 Codex 本地 marketplace..."
  mkdir -p "$CODEX_MARKETPLACE_DIR" "$CODEX_PLUGINS_DIR"

  local marketplace_file="$CODEX_MARKETPLACE_DIR/marketplace.json"

  if [ ! -f "$marketplace_file" ]; then
    cat > "$marketplace_file" <<'EOF'
{
  "name": "local-plugins",
  "interface": {
    "displayName": "Local Plugins"
  },
  "plugins": []
}
EOF
  fi

  node - <<EOF
const fs = require('fs');
const path = '$marketplace_file';
const raw = fs.readFileSync(path, 'utf-8');
const data = JSON.parse(raw);

if (!Array.isArray(data.plugins)) data.plugins = [];
if (!data.interface || typeof data.interface !== 'object') data.interface = {};
if (!data.interface.displayName) data.interface.displayName = 'Local Plugins';
if (!data.name) data.name = 'local-plugins';

const entry = {
  name: 'corivo',
  source: {
    source: 'local',
    path: './plugins/corivo'
  },
  policy: {
    installation: 'AVAILABLE',
    authentication: 'ON_INSTALL'
  },
  category: 'Productivity'
};

const existingIndex = data.plugins.findIndex((plugin) => plugin && plugin.name === 'corivo');
if (existingIndex >= 0) {
  data.plugins[existingIndex] = { ...data.plugins[existingIndex], ...entry };
} else {
  data.plugins.push(entry);
}

fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log('codex marketplace 已写入');
EOF

  log_info "Codex marketplace 已配置: $marketplace_file"
}

enable_codex_plugins_feature() {
  local config_file="$CODEX_CONFIG_DIR/config.toml"
  mkdir -p "$CODEX_CONFIG_DIR"

  if [ ! -f "$config_file" ]; then
    cat > "$config_file" <<'EOF'
[features]
plugins = true
codex_hooks = true
EOF
    log_info "已创建 Codex 配置并启用 plugins/codex_hooks"
    return
  fi

  node - <<EOF
const fs = require('fs');
const path = '$config_file';
const lines = fs.readFileSync(path, 'utf-8').split(/\r?\n/);
const out = [];
let inFeatures = false;
let sawFeatures = false;
let sawPlugins = false;
let sawHooks = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  if (/^\[.*\]$/.test(trimmed)) {
    if (inFeatures) {
      if (!sawPlugins) out.push('plugins = true');
      if (!sawHooks) out.push('codex_hooks = true');
    }
    inFeatures = trimmed === '[features]';
    if (inFeatures) {
      sawFeatures = true;
    }
    out.push(line);
    continue;
  }

  if (inFeatures && /^\s*plugins\s*=/.test(line)) {
    out.push('plugins = true');
    sawPlugins = true;
    continue;
  }

  if (inFeatures && /^\s*codex_hooks\s*=/.test(line)) {
    out.push('codex_hooks = true');
    sawHooks = true;
    continue;
  }

  out.push(line);
}

if (inFeatures) {
  if (!sawPlugins) out.push('plugins = true');
  if (!sawHooks) out.push('codex_hooks = true');
}

if (!sawFeatures) {
  if (out.length > 0 && out[out.length - 1] !== '') out.push('');
  out.push('[features]');
  out.push('plugins = true');
  out.push('codex_hooks = true');
}

fs.writeFileSync(path, out.join('\n'));
EOF

  log_info "已启用 Codex plugins/codex_hooks"
}

install_codex_hooks_config() {
  log_step "配置全局 Codex hooks..."
  mkdir -p "$CODEX_CONFIG_DIR"

  if [ ! -f "$CODEX_HOOKS_FILE" ]; then
    cat > "$CODEX_HOOKS_FILE" <<'EOF'
{
  "hooks": {}
}
EOF
  fi

  local hooks_dir="$CODEX_PLUGIN_DIR/hooks/scripts"

  node - <<EOF
const fs = require('fs');
const path = '$CODEX_HOOKS_FILE';
const raw = fs.readFileSync(path, 'utf-8');
const config = JSON.parse(raw);
const hooksDir = '$hooks_dir';

if (!config.hooks || typeof config.hooks !== 'object') config.hooks = {};

const containsCorivoHook = (entry) => {
  return Array.isArray(entry?.hooks) && entry.hooks.some((hook) =>
    typeof hook?.command === 'string' && hook.command.includes('/plugins/corivo/hooks/scripts/')
  );
};

const ensureEvent = (eventName, newEntry) => {
  if (!Array.isArray(config.hooks[eventName])) config.hooks[eventName] = [];
  const existing = config.hooks[eventName];
  if (!existing.some(containsCorivoHook)) {
    existing.push(newEntry);
  }
};

ensureEvent('SessionStart', {
  matcher: 'startup|resume',
  hooks: [
    {
      type: 'command',
      command: `bash "${hooksDir}/session-init.sh"`,
      statusMessage: 'Loading Corivo memory',
      timeout: 5
    }
  ]
});

ensureEvent('UserPromptSubmit', {
  hooks: [
    {
      type: 'command',
      command: `bash "${hooksDir}/ingest-turn.sh" user`,
      statusMessage: 'Saving Corivo memory',
      timeout: 10
    },
    {
      type: 'command',
      command: `bash "${hooksDir}/user-prompt-submit.sh"`,
      statusMessage: 'Checking Corivo recall',
      timeout: 10
    }
  ]
});

ensureEvent('Stop', {
  hooks: [
    {
      type: 'command',
      command: `bash "${hooksDir}/ingest-turn.sh" assistant`,
      statusMessage: 'Saving Corivo response',
      timeout: 10
    },
    {
      type: 'command',
      command: `bash "${hooksDir}/stop.sh"`,
      statusMessage: 'Reviewing Corivo follow-up',
      timeout: 10
    }
  ]
});

fs.writeFileSync(path, JSON.stringify(config, null, 2));
console.log('codex hooks 已写入');
EOF

  log_info "Codex hooks 已配置: $CODEX_HOOKS_FILE"
}

install_codex_plugin() {
  install_codex_plugin_files
  install_codex_marketplace
  enable_codex_plugins_feature
  install_codex_hooks_config
}

# ── 9. 检查 Claude Code 进程 ───────────────────────────────────────────────
check_claude_process() {
  if pgrep -f "claude" &>/dev/null; then
    echo ""
    echo -e "${YELLOW}══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  ⚠️  检测到 Claude Code 正在运行          ${NC}"
    echo -e "${YELLOW}══════════════════════════════════════════${NC}"
    echo ""
    echo "  $(msg restart_claude)"
    echo ""
  fi
}

# ── 10. 检查 Codex 进程 ───────────────────────────────────────────────────
check_codex_process() {
  if pgrep -f "codex" &>/dev/null; then
    echo ""
    echo -e "${YELLOW}══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  ⚠️  检测到 Codex 正在运行                ${NC}"
    echo -e "${YELLOW}══════════════════════════════════════════${NC}"
    echo ""
    echo "  $(msg restart_codex)"
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
  echo "  Codex 重启后可在 Local Plugins 中看到 Corivo"
  echo ""
}

# ── 主流程 ─────────────────────────────────────────────────────────────────
main() {
  parse_install_args "$@"
  resolve_install_lang

  echo ""
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
  printf "${CYAN}     %s                      ${NC}\n" "$(msg banner_title)"
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
  echo ""

  check_node
  install_build_deps
  install_corivo_cli
  init_corivo

  log_step "$(msg detect_hosts)"
  detect_hosts

  if printf '%s\n' "${DETECTED_HOSTS[@]}" | grep -qx 'claude-code'; then
    log_step "$(msg install_claude_host)"
    if corivo inject --global --claude-code >/dev/null 2>&1; then
      check_claude_process
      record_host_result "claude-code" "ready"
    else
      record_host_result "claude-code" "blocked" "$(msg host_install_failed)"
    fi
  else
    record_host_result "claude-code" "skipped"
  fi

  if printf '%s\n' "${DETECTED_HOSTS[@]}" | grep -qx 'codex'; then
    log_step "$(msg install_codex_host)"
    if corivo inject --global --codex >/dev/null 2>&1; then
      check_codex_process
      record_host_result "codex" "ready" "$(msg codex_ready_hint)"
    else
      record_host_result "codex" "blocked" "$(msg host_install_failed)"
    fi
  else
    record_host_result "codex" "skipped"
  fi

  if printf '%s\n' "${DETECTED_HOSTS[@]}" | grep -qx 'cursor'; then
    log_step "$(msg install_cursor_host)"
    if corivo inject --global --cursor >/dev/null 2>&1; then
      local cursor_status=""
      cursor_status="$(cursor agent status 2>/dev/null || true)"
      if printf '%s' "$cursor_status" | grep -q 'Not logged in'; then
        record_host_result "cursor" "blocked" "$(msg cursor_login_required)" "cursor agent login"
      else
        record_host_result "cursor" "ready"
      fi
    else
      record_host_result "cursor" "blocked" "$(msg host_install_failed)"
    fi
  else
    record_host_result "cursor" "skipped"
  fi

  if printf '%s\n' "${DETECTED_HOSTS[@]}" | grep -qx 'opencode'; then
    log_step "$(msg install_opencode_host)"
    if corivo inject --global --opencode >/dev/null 2>&1; then
      if opencode models >/dev/null 2>&1; then
        record_host_result "opencode" "ready"
      else
        record_host_result "opencode" "blocked" "$(msg opencode_provider_warning)"
      fi
    else
      record_host_result "opencode" "blocked" "$(msg host_install_failed)"
    fi
  else
    record_host_result "opencode" "skipped"
  fi

  render_host_summary
}

trap 'log_error "安装过程中出现错误"; exit 1' ERR

main "$@"
