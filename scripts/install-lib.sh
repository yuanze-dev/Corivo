#!/usr/bin/env bash

set -euo pipefail

INSTALL_LANG=""
REQUESTED_LANG=""
DETECTED_HOSTS=()
HOST_RESULTS=()
CURRENT_STAGE=""
STAGE_RESULTS=()
STAGE_SEQUENCE=(prepare connect start warmup)

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

normalize_lang() {
  case "${1:-}" in
    zh|zh-CN|zh_CN|zh-Hans|zh-Hans-CN) echo "zh" ;;
    en|en-US|en_US|en-GB|en_GB) echo "en" ;;
    *) echo "" ;;
  esac
}

detect_locale_lang() {
  local locale="${LC_ALL:-${LANG:-}}"
  case "$locale" in
    zh*|*zh_CN*|*zh-Hans*|*zh-Hant*) echo "zh" ;;
    en*|*en_US*|*en_GB*) echo "en" ;;
    *) echo "" ;;
  esac
}

confirm_install_language() {
  case "${INSTALL_LANG:-en}" in
    zh) printf '语言已确认：中文\n' ;;
    *) printf 'Language confirmed: English\n' ;;
  esac
}

prompt_install_language() {
  local default_lang="${1:-en}"
  local answer=""

  if [ "$default_lang" = "zh" ]; then
    printf '选择语言 / Choose your language:\n'
    printf '1) 中文 (默认)\n'
    printf '2) English\n'
  else
    printf 'Choose your language:\n'
    printf '1) English (default)\n'
    printf '2) 中文\n'
  fi
  printf '> '

  if [ -t 0 ]; then
    IFS= read -r answer || true
  fi
  answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"

  if [ "$default_lang" = "zh" ]; then
    case "$answer" in
      2|en|english) INSTALL_LANG="en" ;;
      1|zh|chinese|中文|"") INSTALL_LANG="$default_lang" ;;
      *) INSTALL_LANG="$default_lang" ;;
    esac
  else
    case "$answer" in
      2|zh|chinese|中文) INSTALL_LANG="zh" ;;
      1|en|english|"") INSTALL_LANG="$default_lang" ;;
      *) INSTALL_LANG="$default_lang" ;;
    esac
  fi

  confirm_install_language
}

resolve_install_lang() {
  local default_lang=""
  default_lang="$(resolve_default_lang)"

  if [ -t 0 ]; then
    prompt_install_language "$default_lang"
    INSTALL_LANG="${INSTALL_LANG:-$default_lang}"
  else
    INSTALL_LANG="$default_lang"
  fi
}

resolve_default_lang() {
  local default_lang=""

  if [ -n "${REQUESTED_LANG:-}" ]; then
    default_lang="$(normalize_lang "$REQUESTED_LANG")"
  fi

  if [ -z "$default_lang" ]; then
    default_lang="$(detect_locale_lang)"
  fi

  echo "${default_lang:-en}"
}

msg() {
  local key="$1"

  case "${INSTALL_LANG:-zh}:$key" in
    zh:banner_title) echo "Corivo 安装向导" ;;
    en:banner_title) echo "Corivo Installer" ;;
    zh:arrival_companion) echo "Corivo 记忆伙伴正在就绪。" ;;
    en:arrival_companion) echo "Your Corivo companion is on the way." ;;
    zh:arrival_welcome) echo "Corivo 正在准备这台设备。" ;;
    en:arrival_welcome) echo "Corivo is getting your machine ready." ;;
    zh:arrival_promise) echo "我会准备这台设备，连接你已在使用的 AI 工具，并通过本地预热启动 Corivo。" ;;
    en:arrival_promise) echo "I’ll prepare this machine, connect the AI tools you already use, and start Corivo with a local warm-up." ;;
    zh:stage_prepare) echo "准备这台设备" ;;
    en:stage_prepare) echo "Preparing your machine" ;;
    zh:stage_connect) echo "连接你的 AI 工具" ;;
    en:stage_connect) echo "Connecting your AI tools" ;;
    zh:stage_start) echo "启动 Corivo" ;;
    en:stage_start) echo "Starting Corivo" ;;
    zh:stage_warmup) echo "使用本地上下文预热" ;;
    en:stage_warmup) echo "Warming up with local context" ;;
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
    zh:status_in_progress) echo "进行中" ;;
    en:status_in_progress) echo "In progress" ;;
    zh:status_done) echo "完成" ;;
    en:status_done) echo "Done" ;;
    zh:status_attention) echo "需要关注" ;;
    en:status_attention) echo "Needs attention" ;;
    zh:status_pending) echo "待开始" ;;
    en:status_pending) echo "Pending" ;;
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
    zh:warmup_intro) echo "Corivo 可以通过最近的本地上下文更快进入状态。" ;;
    en:warmup_intro) echo "Corivo can get ready faster by learning from your recent local context." ;;
    zh:warmup_value) echo "这会帮助它从一开始就记住你的工作方式、近期决策和项目背景。" ;;
    en:warmup_value) echo "This helps it remember your working style, recent decisions, and project context from the start." ;;
    zh:warmup_safety) echo "这些内容只留在本机，用于在这台设备上设置 Corivo。" ;;
    en:warmup_safety) echo "This stays on your device and is used only to set up Corivo on this machine." ;;
    zh:warmup_continue) echo "继续" ;;
    en:warmup_continue) echo "Continue" ;;
    zh:warmup_skip) echo "暂时跳过" ;;
    en:warmup_skip) echo "Skip for now" ;;
    zh:warmup_skipped) echo "已跳过预热" ;;
    en:warmup_skipped) echo "Warm-up skipped" ;;
    zh:warmup_skip_hint) echo "你随时可以在以后进行预热。" ;;
    en:warmup_skip_hint) echo "You can always warm up later." ;;
    zh:corivo_ready) echo "Corivo 已准备好与你一起工作。" ;;
    en:corivo_ready) echo "Corivo is ready to work with you." ;;
    zh:install_claude_skills) echo "安装 Claude Code skills..." ;;
    en:install_claude_skills) echo "Installing Claude Code skills..." ;;
    zh:install_claude_hooks) echo "安装 Claude Code hook 脚本..." ;;
    en:install_claude_hooks) echo "Installing Claude Code hook scripts..." ;;
    zh:configure_claude_hooks) echo "配置 Claude Code hooks..." ;;
    en:configure_claude_hooks) echo "Configuring Claude Code hooks..." ;;
    zh:install_codex_host) echo "安装 Codex 主动记忆适配器..." ;;
    en:install_codex_host) echo "Installing the Codex active-memory adapter..." ;;
    zh:install_claude_host) echo "安装 Claude Code 主动记忆适配器..." ;;
    en:install_claude_host) echo "Installing the Claude Code active-memory adapter..." ;;
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

get_message() {
  local key="$1"
  local lang="${2:-${INSTALL_LANG:-}}"
  local previous_lang="${INSTALL_LANG:-}"
  if [ -n "$lang" ]; then
    INSTALL_LANG="$lang"
  fi
  msg "$key"
  INSTALL_LANG="$previous_lang"
}

set_stage_result() {
  local stage="$1"
  local status="$2"
  local updated=0
  local index=0

  for index in "${!STAGE_RESULTS[@]}"; do
    local entry="${STAGE_RESULTS[$index]}"
    local entry_stage="${entry%%|*}"
    if [ "$entry_stage" = "$stage" ]; then
      STAGE_RESULTS[$index]="${stage}|${status}"
      updated=1
      break
    fi
  done

  if [ "$updated" -eq 0 ]; then
    STAGE_RESULTS+=("${stage}|${status}")
  fi
}

get_stage_result() {
  local stage="$1"
  local entry=""
  for entry in "${STAGE_RESULTS[@]}"; do
    local entry_stage="${entry%%|*}"
    if [ "$entry_stage" = "$stage" ]; then
      echo "${entry#*|}"
      return
    fi
  done
  echo ""
}

stage_status_text() {
  local stage="$1"
  local status
  status="$(get_stage_result "$stage")"
  case "$status" in
    in_progress) msg status_in_progress ;;
    done) msg status_done ;;
    attention) msg status_attention ;;
    *) msg status_pending ;;
  esac
}

begin_stage() {
  local stage="$1"
  CURRENT_STAGE="$stage"
  set_stage_result "$stage" "in_progress"
  render_stage_board
}

finish_stage() {
  local stage="${1:-$CURRENT_STAGE}"
  if [ -z "$stage" ]; then
    return
  fi
  set_stage_result "$stage" "done"
  render_stage_board
}

mark_stage_attention() {
  local stage="${1:-$CURRENT_STAGE}"
  if [ -z "$stage" ]; then
    return
  fi
  set_stage_result "$stage" "attention"
  render_stage_board
}

render_stage_board() {
  echo ""
  local stage=""
  for stage in "${STAGE_SEQUENCE[@]}"; do
    local label
    label="$(msg "stage_${stage}")"
    printf -- '- %s: %s\n' "$label" "$(stage_status_text "$stage")"
  done
  echo ""
}

prompt_local_warmup_consent() {
  printf '%s\n' "$(msg warmup_intro)"
  printf '%s\n' "$(msg warmup_value)"
  printf '%s\n' "$(msg warmup_safety)"
  echo ""
  printf '1) %s\n' "$(msg warmup_continue)"
  printf '2) %s\n' "$(msg warmup_skip)"
  printf '> '

  if [ ! -t 0 ]; then
    return 1
  fi

  local answer=""
  IFS= read -r answer || true
  case "$answer" in
    1|"") return 0 ;;
    *) return 1 ;;
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
