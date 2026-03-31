#!/usr/bin/env bash
# Corivo 安装脚本
# 用法: curl -fsSL https://i.corivo.ai/install.sh | bash
#      curl -fsSL https://i.corivo.ai/install.sh | bash -s -- --lang en

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
CORIVO_INSTALL_CLI_SOURCE="${CORIVO_INSTALL_CLI_SOURCE:-corivo}"

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

# ── 4. 检查 Claude Code 进程 ───────────────────────────────────────────────
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

# ── 5. 检查 Codex 进程 ───────────────────────────────────────────────────
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
