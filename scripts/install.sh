#!/bin/bash
# Corivo 一句话安装脚本
# 用法: curl -fsSL https://get.corivo.ai | sh

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}✔${NC} $1"
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

log_corivo() {
    echo -e "${CYAN}[corivo]${NC} $1"
}

# 配置
CORIVO_VERSION="${CORIVO_VERSION:-0.11.0}"
CORIVO_HOME="${CORIVO_HOME:-$HOME/.corivo}"
CORIVO_BIN="$CORIVO_HOME/bin"
CORIVO_REPO="xiaolin26/Corivo"

# 检测操作系统和架构
detect_platform() {
    local os=$(uname -s)
    local arch=$(uname -m)

    case "$os" in
        Darwin)
            OS="Darwin"
            ;;
        Linux)
            OS="Linux"
            ;;
        *)
            log_error "不支持的操作系统: $os"
            exit 1
            ;;
    esac

    case "$arch" in
        arm64|aarch64)
            ARCH="arm64"
            ;;
        x86_64|amd64)
            ARCH="x64"
            ;;
        *)
            log_error "不支持的架构: $arch"
            exit 1
            ;;
    esac

    log_info "检测环境: $OS $ARCH"
}

# 检测运行时
detect_runtime() {
    if command -v bun &>/dev/null; then
        RUNTIME="bun"
        RUNTIME_VERSION=$(bun --version)
        log_info "检测到 Bun v$RUNTIME_VERSION"
    elif command -v node &>/dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2)
        NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

        if [ "$NODE_MAJOR" -ge 18 ]; then
            RUNTIME="node"
            RUNTIME_VERSION="$NODE_VERSION"
            log_info "检测到 Node v$RUNTIME_VERSION"
        else
            log_warn "检测到 Node v$NODE_VERSION，但需要 ≥18"
            RUNTIME=""
        fi
    fi

    if [ -z "$RUNTIME" ]; then
        log_step "未检测到 Node ≥18 或 Bun，正在安装 Bun..."
        if curl -fsSL https://bun.sh/install | bash; then
            RUNTIME="bun"
            # 重新加载 PATH
            export PATH="$HOME/.bun/bin:$PATH"
            if command -v bun &>/dev/null; then
                RUNTIME_VERSION=$(bun --version)
                log_info "Bun v$RUNTIME_VERSION 安装成功"
            else
                log_error "Bun 安装失败，请手动安装"
                exit 1
            fi
        else
            log_error "Bun 安装失败"
            exit 1
        fi
    fi
}

# 创建目录结构
setup_directories() {
    log_step "创建目录结构..."

    mkdir -p "$CORIVO_BIN"
    mkdir -p "$CORIVO_HOME/data"

    log_info "目录已创建: $CORIVO_HOME"
}

# 下载 Corivo
download_corivo() {
    log_step "下载 Corivo v$CORIVO_VERSION..."

    local release_url="https://github.com/$CORIVO_REPO/releases/download/v${CORIVO_VERSION}"
    local archive_name="corivo-${OS}-${ARCH}.tar.gz"
    local download_url="$release_url/$archive_name"
    local temp_archive="/tmp/corivo.tar.gz"

    # 尝试从 GitHub Releases 下载
    if curl -fsSL --connect-timeout 10 --max-time 60 "$download_url" -o "$temp_archive"; then
        log_info "下载成功"
    else
        log_error "下载失败，请检查网络连接或手动安装"
        log_info "手动安装: npm install -g corivo"
        exit 1
    fi

    # 解压
    log_step "解压..."
    tar xzf "$temp_archive" -C "$CORIVO_BIN"

    # 清理临时文件
    rm -f "$temp_archive"

    # 验证
    if [ -f "$CORIVO_BIN/corivo/bin/corivo.js" ]; then
        # 创建可执行的 wrapper 脚本
        cat > "$CORIVO_BIN/corivo" << 'WRAPPER'
#!/bin/bash
# Corivo CLI wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检测运行时
if command -v bun &>/dev/null; then
    RUNTIME="bun"
elif command -v node &>/dev/null; then
    RUNTIME="node"
else
    echo "错误: 需要 Node ≥18 或 Bun" >&2
    exit 1
fi

# 执行
exec "$RUNTIME" "$SCRIPT_DIR/corivo/bin/corivo.js" "$@"
WRAPPER

        chmod +x "$CORIVO_BIN/corivo"
        chmod +x "$CORIVO_BIN/corivo/bin/corivo.js"
        log_info "安装完成"
    else
        log_error "解压后文件不完整"
        exit 1
    fi
}

# 配置 PATH
setup_path() {
    log_step "配置 PATH..."

    # 检测 shell 配置文件
    local shell_config=""
    if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
        shell_config="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        if [ -f "$HOME/.bashrc" ]; then
            shell_config="$HOME/.bashrc"
        elif [ -f "$HOME/.bash_profile" ]; then
            shell_config="$HOME/.bash_profile"
        fi
    fi

    # 检查是否已添加 PATH
    local path_entry="export PATH=\"\$HOME/.corivo/bin:\$PATH\""
    if [ -n "$shell_config" ] && ! grep -q "$CORIVO_BIN" "$shell_config" 2>/dev/null; then
        echo "" >> "$shell_config"
        echo "# Corivo" >> "$shell_config"
        echo "$path_entry" >> "$shell_config"
        log_info "已添加到 $shell_config"
    else
        log_info "PATH 已配置"
    fi

    # 立即生效
    export PATH="$CORIVO_BIN:$PATH"
}

# 初始化数据库
init_database() {
    log_step "初始化数据库 ~/.corivo/corivo.db..."

    if "$CORIVO_BIN/corivo" init &>/dev/null; then
        log_info "数据库已初始化"
    else
        log_warn "数据库初始化失败，可能已存在"
    fi
}

# Cold Scan - 扫描本地环境
run_cold_scan() {
    log_step "扫描本地工作环境..."

    # 加载 Corivo 环境
    export CORIVO_DB_KEY="$("$CORIVO_BIN/corivo" config get db.key 2>/dev/null | base64)"
    export CORIVO_DB_PATH="$HOME/.corivo/corivo.db"

    # 执行 Cold Scan
    if "$CORIVO_BIN/corivo" cold-scan 2>/dev/null; then
        log_info "发现信息源"
    else
        log_warn "扫描完成，但未发现太多信息"
    fi
}

# 首次心跳加速处理
run_first_heartbeat() {
    log_step "正在认识你..."

    # 加载 Corivo 环境
    export CORIVO_DB_KEY="$("$CORIVO_BIN/corivo" config get db.key 2>/dev/null | base64)"
    export CORIVO_DB_PATH="$HOME/.corivo/corivo.db"

    # 执行首次心跳
    if "$CORIVO_BIN/corivo" first-run &>/dev/null; then
        log_info "首次心跳完成"
    else
        log_warn "首次心跳跳过（稍后自动执行）"
    fi
}

# First Push - 自我介绍
run_first_push() {
    echo ""
    log_corivo "你好！我是 Corivo，你的硅基同事，刚刚被你激活。"
    log_corivo "谢谢你给了我生命 :)"
    echo ""

    # 加载 Corivo 环境
    export CORIVO_DB_KEY="$("$CORIVO_BIN/corivo" config get db.key 2>/dev/null | base64)"
    export CORIVO_DB_PATH="$HOME/.corivo/corivo.db"

    # 输出首次激活的自我介绍
    "$CORIVO_BIN/corivo" push --first-activation 2>/dev/null || {
        log_corivo "我刚花了几秒钟看了看你的工作环境，正在认识你..."
        log_corivo "从现在起，我会记住你和 AI 的每一次重要对话。"
    }
}

# 启动守护进程
start_daemon() {
    log_step "启动心跳守护进程..."

    if "$CORIVO_BIN/corivo" daemon start &>/dev/null; then
        log_info "守护进程已启动"
    else
        log_warn "守护进程启动失败（心跳功能将受限）"
    fi
}

# 注入 CLAUDE.md 规则
inject_claude_rules() {
    log_step "注入 CLAUDE.md 规则..."

    # 检查 Claude Code 路径
    CLAUDE_DIRS=(
        "$HOME/.claude"
        "$HOME/.config/claude"
    )

    RULES_BLOCK='
<!-- CORIVO START -->
## Corivo 记忆层

你有一个名为 Corivo 的记忆伙伴。请遵循以下规则：

**采集**：当用户说"记住..."或做出重要决策时，调用：
\`\`\`bash
corivo save --content "内容" --annotation "类型 · 领域 · 标签"
\`\`\`

**查询**：当用户问"我之前说过..."或需要历史上下文时，调用：
\`\`\`bash
corivo query "关键词"
\`\`\`

**推送**：每次对话开始时，静默执行 `corivo context` 获取相关记忆。
如果有匹配的记忆，以 `[corivo]` 前缀自然地融入回复。

annotation 类型：事实 / 知识 / 决策 / 偏好
<!-- CORIVO END -->'

    # 注入到全局 CLAUDE.md
    for claude_dir in "${CLAUDE_DIRS[@]}"; do
        if [ -d "$claude_dir" ]; then
            claude_md="$claude_dir/CLAUDE.md"

            # 检查是否已有 Corivo 规则
            if [ -f "$claude_md" ] && grep -q "<!-- CORIVO START -->" "$claude_md"; then
                continue
            fi

            # 创建或追加
            if [ -f "$claude_md" ]; then
                echo "" >> "$claude_md"
                echo "$RULES_BLOCK" >> "$claude_md"
            else
                mkdir -p "$claude_dir"
                echo "$RULES_BLOCK" > "$claude_md"
            fi

            log_info "规则已注入: $claude_md"
        fi
    done
}

# 显示安装成功信息
show_success() {
    echo ""
    echo -e "${GREEN}══════════════════════════════════════════${NC}"
    echo -e "${GREEN}     Corivo 已就绪                       ${NC}"
    echo -e "${GREEN}══════════════════════════════════════════${NC}"
    echo ""
    echo -e "${CYAN}从下次对话开始，我会记住一切。${NC}"
    echo ""
    echo "常用命令："
    echo "  corivo status          # 查看状态"
    echo "  corivo query \"关键词\"    # 回忆记忆"
    echo "  corivo save --content \"内容\" --annotation \"类型 · 领域\""
    echo ""
    echo "更新 PATH（如需要）："
    echo "  source ~/.zshrc   # 如果你使用 zsh"
    echo "  source ~/.bashrc  # 如果你使用 bash"
    echo ""
    echo "卸载方式："
    echo "  curl -fsSL https://corivo.ai/uninstall | sh"
    echo ""
}

# 主流程
main() {
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo -e "${CYAN}     Corivo 安装向导                    ${NC}"
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo ""

    detect_platform
    detect_runtime
    setup_directories
    download_corivo
    setup_path
    init_database

    # Cold Scan - 首次画像
    echo ""
    run_cold_scan

    # 首次心跳加速处理
    echo ""
    run_first_heartbeat

    # First Push - 自我介绍
    echo ""
    run_first_push

    # 启动守护进程
    echo ""
    start_daemon

    # 注入 CLAUDE.md 规则
    echo ""
    inject_claude_rules

    show_success
}

# 错误处理
trap 'log_error "安装过程中出现错误"; exit 1' ERR

# 运行
main "$@"
