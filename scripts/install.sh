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

should_animate() {
  if [ "${CORIVO_INSTALL_NO_ANIMATION:-}" = "1" ]; then
    return 1
  fi

  if [ ! -t 1 ]; then
    return 1
  fi

  return 0
}

render_arrival_moment() {
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
  printf "${CYAN}     %s                      ${NC}\n" "$(msg banner_title)"
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
  echo ""
  printf '%s\n' "$(msg arrival_companion)"
  printf '%s\n' "$(msg arrival_welcome)"

  if should_animate; then
    printf '%s' '.'
    sleep 0.2
    printf '%s' '.'
    sleep 0.2
    printf '%s\n' '.'
  fi

  echo ""
}

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
    if $SUDO apt-get update -qq && $SUDO apt-get install -y -qq python3 make g++ > /dev/null; then
      true
    fi
  elif command -v yum &>/dev/null; then
    if $SUDO yum install -y -q python3 make gcc-c++ > /dev/null; then
      true
    fi
  elif command -v apk &>/dev/null; then
    if $SUDO apk add --quiet python3 make g++ > /dev/null; then
      true
    fi
  elif command -v brew &>/dev/null; then
    if ! command -v python3 &>/dev/null; then
      brew install python3 > /dev/null || true
    fi
  fi

  if command -v python3 &>/dev/null && command -v gcc &>/dev/null; then
    log_info "$(msg build_deps_ready)"
    return
  fi

  log_warn "$(msg build_deps_manual)"
  log_warn "Debian/Ubuntu: apt-get install python3 make g++"
  log_warn "Alpine:        apk add python3 make g++"
  log_warn "CentOS/RHEL:   yum install python3 make gcc-c++"
  record_failure_context \
    "prepare.build_deps" \
    "$(msg stage_prepare)" \
    "install build dependencies" \
    "$(msg build_deps_manual)" \
    "Install python3 and gcc manually, then rerun the installer."
  return 1
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

first_line_or_empty() {
  local value="${1:-}"
  if [ -z "$value" ]; then
    echo ""
    return
  fi
  printf '%s' "$value" | head -n 1
}

host_inject_failed_reason() {
  local host="$1"
  local command_desc="$2"
  local output="${3:-}"
  local host_label=""
  local output_line=""
  host_label="$(host_display_name "$host")"
  output_line="$(first_line_or_empty "$output")"

  if [ "${INSTALL_LANG:-en}" = "zh" ]; then
    if [ -n "$output_line" ]; then
      printf '安装 %s 失败（%s）：%s\n' "$host_label" "$command_desc" "$output_line"
    else
      printf '安装 %s 失败（%s）。\n' "$host_label" "$command_desc"
    fi
  else
    if [ -n "$output_line" ]; then
      printf 'Failed to install %s (%s): %s\n' "$host_label" "$command_desc" "$output_line"
    else
      printf 'Failed to install %s (%s).\n' "$host_label" "$command_desc"
    fi
  fi
}

install_detected_hosts() {
  local attention=0

  log_step "$(msg detect_hosts)"
  detect_hosts

  if printf '%s\n' "${DETECTED_HOSTS[@]}" | grep -qx 'claude-code'; then
    log_step "$(msg install_claude_host)"
    local claude_output=""
    if claude_output="$(corivo inject --global --claude-code 2>&1)"; then
      check_claude_process
      record_host_result "claude-code" "ready"
    else
      local claude_reason=""
      claude_reason="$(host_inject_failed_reason "claude-code" "corivo inject --global --claude-code" "$claude_output")"
      record_host_result "claude-code" "blocked" "$claude_reason"
      record_failure_context \
        "connect.claude-code.inject" \
        "$(msg stage_connect)" \
        "corivo inject --global --claude-code" \
        "$claude_output" \
        "$claude_reason"
      attention=1
    fi
  else
    record_host_result "claude-code" "skipped"
  fi

  if printf '%s\n' "${DETECTED_HOSTS[@]}" | grep -qx 'codex'; then
    log_step "$(msg install_codex_host)"
    local codex_output=""
    if codex_output="$(corivo inject --global --codex 2>&1)"; then
      check_codex_process
      record_host_result "codex" "ready" "$(msg codex_ready_hint)"
    else
      local codex_reason=""
      codex_reason="$(host_inject_failed_reason "codex" "corivo inject --global --codex" "$codex_output")"
      record_host_result "codex" "blocked" "$codex_reason"
      record_failure_context \
        "connect.codex.inject" \
        "$(msg stage_connect)" \
        "corivo inject --global --codex" \
        "$codex_output" \
        "$codex_reason"
      attention=1
    fi
  else
    record_host_result "codex" "skipped"
  fi

  if printf '%s\n' "${DETECTED_HOSTS[@]}" | grep -qx 'cursor'; then
    log_step "$(msg install_cursor_host)"
    local cursor_output=""
    if cursor_output="$(corivo inject --global --cursor 2>&1)"; then
      local cursor_status=""
      cursor_status="$(cursor agent status 2>/dev/null || true)"
      if printf '%s' "$cursor_status" | grep -q 'Not logged in'; then
        record_host_result "cursor" "blocked" "$(msg cursor_login_required)" "cursor agent login"
        record_failure_context \
          "connect.cursor.login" \
          "$(msg stage_connect)" \
          "cursor agent status" \
          "$(msg cursor_login_required)" \
          "Run cursor agent login, then rerun the installer."
        attention=1
      else
        record_host_result "cursor" "ready"
      fi
    else
      local cursor_reason=""
      cursor_reason="$(host_inject_failed_reason "cursor" "corivo inject --global --cursor" "$cursor_output")"
      record_host_result "cursor" "blocked" "$cursor_reason"
      record_failure_context \
        "connect.cursor.inject" \
        "$(msg stage_connect)" \
        "corivo inject --global --cursor" \
        "$cursor_output" \
        "$cursor_reason"
      attention=1
    fi
  else
    record_host_result "cursor" "skipped"
  fi

  if printf '%s\n' "${DETECTED_HOSTS[@]}" | grep -qx 'opencode'; then
    log_step "$(msg install_opencode_host)"
    local opencode_output=""
    if opencode_output="$(corivo inject --global --opencode 2>&1)"; then
      if opencode models >/dev/null 2>&1; then
        record_host_result "opencode" "ready"
      else
        record_host_result "opencode" "blocked" "$(msg opencode_provider_warning)"
        record_failure_context \
          "connect.opencode.provider" \
          "$(msg stage_connect)" \
          "opencode models" \
          "$(msg opencode_provider_warning)" \
          "Verify your OpenCode provider configuration, then rerun the installer."
        attention=1
      fi
    else
      local opencode_reason=""
      opencode_reason="$(host_inject_failed_reason "opencode" "corivo inject --global --opencode" "$opencode_output")"
      record_host_result "opencode" "blocked" "$opencode_reason"
      record_failure_context \
        "connect.opencode.inject" \
        "$(msg stage_connect)" \
        "corivo inject --global --opencode" \
        "$opencode_output" \
        "$opencode_reason"
      attention=1
    fi
  else
    record_host_result "opencode" "skipped"
  fi

  if [ "$attention" -eq 1 ]; then
    return 1
  fi
  return 0
}

run_local_warmup_flow() {
  if prompt_local_warmup_consent; then
    return 0
  fi

  printf '%s\n' "$(msg warmup_skipped)"
  printf '%s\n' "$(msg warmup_skip_hint)"
  return 0
}

# ── 主流程 ─────────────────────────────────────────────────────────────────
main() {
  parse_install_args "$@"
  init_diagnostics
  local default_lang=""
  default_lang="$(resolve_default_lang)"
  INSTALL_LANG="$default_lang"
  render_arrival_moment
  resolve_install_lang
  printf '%s\n\n' "$(msg arrival_promise)"

  local prepare_attention=0
  local connect_attention=0
  local start_attention=0

  begin_stage "prepare"
  check_node
  if ! install_build_deps; then
    prepare_attention=1
  fi
  install_corivo_cli
  if [ "$prepare_attention" -eq 1 ]; then
    mark_stage_attention "prepare"
  else
    finish_stage "prepare"
  fi

  begin_stage "connect"
  if ! install_detected_hosts; then
    connect_attention=1
  fi
  if [ "$connect_attention" -eq 1 ]; then
    mark_stage_attention "connect"
  else
    finish_stage "connect"
  fi

  begin_stage "start"
  if ! init_corivo; then
    start_attention=1
  fi
  if [ "$start_attention" -eq 1 ]; then
    mark_stage_attention "start"
  else
    finish_stage "start"
  fi

  begin_stage "warmup"
  run_local_warmup_flow
  finish_stage "warmup"

  write_diagnostic_summary
  render_host_summary
  render_recovery_message
  printf '\n%s\n' "$(msg corivo_ready)"
}

trap 'log_error "安装过程中出现错误"; exit 1' ERR

main "$@"
