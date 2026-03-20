#!/bin/bash
# Corivo 卸载脚本
# 用法: curl -fsSL https://get.corivo.dev/uninstall | sh

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 日志函数
log_info() {
    echo -e "${BLUE}✔${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✖${NC} $1"
}

log_step() {
    echo -e "${BLUE}⏳${NC} $1"
}

# 配置
CORIVO_HOME="${CORIVO_HOME:-$HOME/.corivo}"

# 确认卸载
confirm_uninstall() {
    echo ""
    echo -e "${YELLOW}⚠ 警告: 即将卸载 Corivo${NC}"
    echo ""
    echo "以下操作将会："
    echo "  1. 停止 Corivo 守护进程"
    echo "  2. 移除守护进程配置"
    echo "  3. 删除所有数据 ($CORIVO_HOME)"
    echo "  4. 清理配置文件中的 Corivo 规则"
    echo ""
    read -p "确定要继续吗？(yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo "卸载已取消"
        exit 0
    fi
}

# 停止守护进程
stop_daemon() {
    log_step "停止守护进程..."

    # macOS: launchd
    if [ "$(uname -s)" = "Darwin" ]; then
        local plist="$HOME/Library/LaunchAgents/com.corivo.daemon.plist"

        if [ -f "$plist" ]; then
            if launchctl list | grep -q "com.corivo.daemon"; then
                launchctl unload "$plist" 2>/dev/null || true
                log_info "已停止 launchd 服务"
            fi
            rm -f "$plist"
            log_info "已移除 launchd 配置"
        fi
    fi

    # Linux: systemd
    if command -v systemctl &>/dev/null; then
        if systemctl --user is-active corivo.service &>/dev/null; then
            systemctl --user stop corivo.service 2>/dev/null || true
            systemctl --user disable corivo.service 2>/dev/null || true
            log_info "已停止 systemd 服务"
        fi
        rm -f "$HOME/.config/systemd/user/corivo.service"
    fi

    # 尝试直接停止进程
    if pgrep -f "corivo daemon" >/dev/null 2>&1; then
        pkill -f "corivo daemon" 2>/dev/null || true
        log_info "已停止 corivo 进程"
    fi
}

# 清理 CLAUDE.md 规则
cleanup_claude_md() {
    log_step "清理 CLAUDE.md 规则..."

    # 规则标记
    local start_marker="<!-- CORIVO START -->"
    local end_marker="<!-- CORIVO END -->"

    # 要检查的文件列表
    local files=(
        "$HOME/.claude/CLAUDE.md"
        "$HOME/.config/claude/CLAUDE.md"
        "./CLAUDE.md"
    )

    local cleaned_count=0

    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            # 检查是否包含标记
            if grep -q "$start_marker" "$file" 2>/dev/null; then
                # 使用 perl 删除标记之间的内容（包括标记）
                # perl 在 macOS 和 Linux 上都可用
                perl -i -ne "print unless /$start_marker/../$end_marker/" "$file" 2>/dev/null

                # 检查是否成功（标记是否还存在）
                if ! grep -q "$start_marker" "$file" 2>/dev/null; then
                    log_info "已清理: $file"
                    ((cleaned_count++))
                fi
            fi
        fi
    done

    if [ "$cleaned_count" -eq 0 ]; then
        log_info "未找到需要清理的规则"
    fi
}

# 清理 PATH
cleanup_path() {
    log_step "清理 PATH 配置..."

    local config_files=()
    local backup_files=()

    # 检测配置文件
    [ -f "$HOME/.zshrc" ] && config_files+=("$HOME/.zshrc")
    [ -f "$HOME/.bashrc" ] && config_files+=("$HOME/.bashrc")
    [ -f "$HOME/.bash_profile" ] && config_files+=("$HOME/.bash_profile")

    local cleaned_count=0

    for file in "${config_files[@]}"; do
        if grep -q "\.corivo/bin" "$file" 2>/dev/null; then
            # 备份
            cp "$file" "${file}.corivo.bak"
            backup_files+=("${file}.corivo.bak")

            # 删除包含 .corivo/bin 的行
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' '/\.corivo\/bin/d' "$file" 2>/dev/null || true
            else
                sed -i '/\.corivo\/bin/d' "$file" 2>/dev/null || true
            fi

            log_info "已清理 PATH: $file"
            ((cleaned_count++))
        fi
    done

    if [ "$cleaned_count" -gt 0 ]; then
        log_info "配置文件已备份（.corivo.bak 后缀）"
    fi
}

# 删除数据目录
remove_data() {
    log_step "删除数据目录..."

    if [ -d "$CORIVO_HOME" ]; then
        rm -rf "$CORIVO_HOME"
        log_info "已删除: $CORIVO_HOME"
    else
        log_info "数据目录不存在"
    fi
}

# 显示完成信息
show_complete() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     Corivo 已卸载                       ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "注意："
    echo "  · 配置文件的更改已备份（.corivo.bak 后缀）"
    echo "  · 请重启终端使 PATH 生效"
    echo "  · 如需重新安装，运行: curl -fsSL https://get.corivo.dev | sh"
    echo ""
}

# 主流程
main() {
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════${NC}"
    echo -e "${BLUE}     Corivo 卸载向导                    ${NC}"
    echo -e "${BLUE}══════════════════════════════════════════${NC}"

    confirm_uninstall
    stop_daemon
    cleanup_claude_md
    cleanup_path
    remove_data

    show_complete
}

# 运行
main "$@"
