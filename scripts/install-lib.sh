#!/usr/bin/env bash

set -euo pipefail

INSTALL_LANG=""
REQUESTED_LANG=""
DETECTED_HOSTS=()
HOST_RESULTS=()

parse_install_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --lang)
        REQUESTED_LANG="${2:-}"
        shift 2
        ;;
      --lang=*)
        REQUESTED_LANG="${1#*=}"
        shift
        ;;
      *)
        shift
        ;;
    esac
  done
}

prompt_install_language() {
  if [ ! -t 0 ]; then
    return
  fi

  printf 'Choose language / 选择语言:\n'
  printf '1) 中文\n'
  printf '2) English\n'
  printf '> '

  local answer=""
  IFS= read -r answer || true
  case "$answer" in
    2|en|EN|English|english)
      INSTALL_LANG="en"
      ;;
    *)
      INSTALL_LANG="zh"
      ;;
  esac
}

resolve_install_lang() {
  if [ -n "${REQUESTED_LANG:-}" ]; then
    case "$REQUESTED_LANG" in
      zh|zh-CN|zh_CN) INSTALL_LANG="zh" ;;
      en|en-US|en_US) INSTALL_LANG="en" ;;
    esac
  fi

  if [ -z "$INSTALL_LANG" ]; then
    local locale="${LC_ALL:-${LANG:-}}"
    case "$locale" in
      zh*|*zh_CN*|*zh-Hans*) INSTALL_LANG="zh" ;;
      en*|*en_US*|*en_GB*) INSTALL_LANG="en" ;;
    esac
  fi

  if [ -z "$INSTALL_LANG" ]; then
    prompt_install_language
  fi

  INSTALL_LANG="${INSTALL_LANG:-zh}"
}

msg() {
  local key="$1"

  case "${INSTALL_LANG:-zh}:$key" in
    zh:banner_title) echo "Corivo 安装向导" ;;
    en:banner_title) echo "Corivo Installer" ;;
    zh:install_node) echo "通过 nvm 安装 Node.js 22..." ;;
    en:install_node) echo "Installing Node.js 22 via nvm..." ;;
    zh:node_missing) echo "未检测到 Node.js，正在自动安装..." ;;
    en:node_missing) echo "Node.js was not found, installing it automatically..." ;;
    zh:node_old) echo "Node.js 版本过低，正在升级..." ;;
    en:node_old) echo "Node.js is too old, upgrading it..." ;;
    zh:node_ready) echo "Node.js 已就绪" ;;
    en:node_ready) echo "Node.js is ready" ;;
    zh:install_build_deps) echo "安装构建依赖（Python3 + gcc）..." ;;
    en:install_build_deps) echo "Installing build dependencies (Python3 + gcc)..." ;;
    zh:build_deps_ready) echo "构建依赖已就绪" ;;
    en:build_deps_ready) echo "Build dependencies are ready" ;;
    zh:build_deps_manual) echo "无法自动安装构建依赖，请手动安装 python3 和 gcc" ;;
    en:build_deps_manual) echo "Could not install build dependencies automatically. Please install python3 and gcc manually." ;;
    zh:install_cli) echo "安装 Corivo CLI..." ;;
    en:install_cli) echo "Installing the Corivo CLI..." ;;
    zh:cli_ready) echo "Corivo CLI 已安装" ;;
    en:cli_ready) echo "Corivo CLI installed" ;;
    zh:init_corivo) echo "初始化 Corivo..." ;;
    en:init_corivo) echo "Initializing Corivo..." ;;
    zh:corivo_inited) echo "Corivo 已初始化，跳过" ;;
    en:corivo_inited) echo "Corivo is already initialized, skipping" ;;
    zh:detect_hosts) echo "扫描本机 Agent..." ;;
    en:detect_hosts) echo "Detecting local agents..." ;;
    zh:found_hosts) echo "发现本机宿主" ;;
    en:found_hosts) echo "Detected local hosts" ;;
    zh:no_hosts) echo "未检测到支持的本地 Agent，后续安装后可重新运行脚本" ;;
    en:no_hosts) echo "No supported local coding agents were detected. Re-run this script after installing one." ;;
    zh:host_claude) echo "Claude Code" ;;
    en:host_claude) echo "Claude Code" ;;
    zh:host_codex) echo "Codex" ;;
    en:host_codex) echo "Codex" ;;
    zh:host_cursor) echo "Cursor" ;;
    en:host_cursor) echo "Cursor" ;;
    zh:host_opencode) echo "OpenCode" ;;
    en:host_opencode) echo "OpenCode" ;;
    zh:status_ready) echo "已就绪" ;;
    en:status_ready) echo "ready" ;;
    zh:status_blocked) echo "已安装，但仍需处理" ;;
    en:status_blocked) echo "installed, but attention is required" ;;
    zh:status_skipped) echo "已跳过" ;;
    en:status_skipped) echo "skipped" ;;
    zh:summary_title) echo "安装摘要" ;;
    en:summary_title) echo "Installation summary" ;;
    zh:summary_next) echo "下一步" ;;
    en:summary_next) echo "Next steps" ;;
    zh:cursor_login_required) echo "Cursor Agent 需要先登录" ;;
    en:cursor_login_required) echo "Cursor Agent requires login" ;;
    zh:opencode_provider_warning) echo "OpenCode 插件已安装，但建议检查默认 provider 配置" ;;
    en:opencode_provider_warning) echo "OpenCode plugin is installed, but you should verify the default provider configuration" ;;
    zh:codex_ready_hint) echo "Codex 现在会自动使用 Corivo 主动记忆流程" ;;
    en:codex_ready_hint) echo "Codex will now use Corivo active memory automatically" ;;
    zh:claude_not_found) echo "未找到 Claude Code 配置目录，跳过 Claude Code 安装" ;;
    en:claude_not_found) echo "Claude Code config directory was not found, skipping Claude Code installation" ;;
    zh:restart_claude) echo "检测到 Claude Code 正在运行，请重启后让新配置生效" ;;
    en:restart_claude) echo "Claude Code is running. Restart it so the new configuration can take effect" ;;
    zh:restart_codex) echo "检测到 Codex 正在运行，请重启后让新配置生效" ;;
    en:restart_codex) echo "Codex is running. Restart it so the new configuration can take effect" ;;
    zh:install_claude_skills) echo "安装 Claude Code skills..." ;;
    en:install_claude_skills) echo "Installing Claude Code skills..." ;;
    zh:install_claude_hooks) echo "安装 Claude Code hook 脚本..." ;;
    en:install_claude_hooks) echo "Installing Claude Code hook scripts..." ;;
    zh:configure_claude_hooks) echo "配置 Claude Code hooks..." ;;
    en:configure_claude_hooks) echo "Configuring Claude Code hooks..." ;;
    zh:install_codex_host) echo "安装 Codex 主动记忆适配器..." ;;
    en:install_codex_host) echo "Installing the Codex active-memory adapter..." ;;
    zh:install_cursor_host) echo "安装 Cursor 主动记忆适配器..." ;;
    en:install_cursor_host) echo "Installing the Cursor active-memory adapter..." ;;
    zh:install_opencode_host) echo "安装 OpenCode 主动记忆适配器..." ;;
    en:install_opencode_host) echo "Installing the OpenCode active-memory adapter..." ;;
    zh:host_install_failed) echo "安装失败，请稍后重试" ;;
    en:host_install_failed) echo "Installation failed. Please try again later." ;;
    *)
      echo "$key"
      ;;
  esac
}

detect_hosts() {
  DETECTED_HOSTS=()

  if find_claude_dir_silent; then
    DETECTED_HOSTS+=("claude-code")
  fi

  if command -v codex >/dev/null 2>&1 || [ -d "$HOME/.codex" ]; then
    DETECTED_HOSTS+=("codex")
  fi

  if command -v cursor >/dev/null 2>&1 || [ -d "$HOME/.cursor" ]; then
    DETECTED_HOSTS+=("cursor")
  fi

  if command -v opencode >/dev/null 2>&1 || [ -d "$HOME/.config/opencode" ]; then
    DETECTED_HOSTS+=("opencode")
  fi
}

find_claude_dir_silent() {
  local dir=""
  for dir in "$HOME/.claude" "$HOME/.config/claude" "$HOME/Library/Application Support/claude"; do
    if [ -d "$dir" ]; then
      CLAUDE_DIR="$dir"
      return 0
    fi
  done
  return 1
}

record_host_result() {
  local host="$1"
  local status="$2"
  local reason="${3:-}"
  local next_step="${4:-}"
  HOST_RESULTS+=("${host}|${status}|${reason}|${next_step}")
}

render_host_summary() {
  echo ""
  echo "[$(printf 'corivo')] $(msg summary_title)"
  echo ""

  if [ "${#HOST_RESULTS[@]}" -eq 0 ]; then
    echo "- $(msg no_hosts)"
    return
  fi

  local entry=""
  for entry in "${HOST_RESULTS[@]}"; do
    IFS='|' read -r host status reason next_step <<EOF
$entry
EOF
    echo "- $(host_display_name "$host"): $(host_status_text "$status")"
    if [ -n "$reason" ]; then
      echo "  $reason"
    fi
    if [ -n "$next_step" ]; then
      echo "  $(msg summary_next): $next_step"
    fi
  done
}

host_display_name() {
  case "$1" in
    claude-code) msg host_claude ;;
    codex) msg host_codex ;;
    cursor) msg host_cursor ;;
    opencode) msg host_opencode ;;
    *) echo "$1" ;;
  esac
}

host_status_text() {
  case "$1" in
    ready) msg status_ready ;;
    blocked) msg status_blocked ;;
    skipped) msg status_skipped ;;
    *) echo "$1" ;;
  esac
}
