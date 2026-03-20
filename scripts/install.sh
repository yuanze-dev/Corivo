#!/bin/bash
# Corivo 一句话安装脚本
# 用法: curl -fsSL https://get.corivo.dev | sh

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

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
CORIVO_VERSION="0.10.5"
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
    log_step "初始化数据库..."

    if "$CORIVO_BIN/corivo" init &>/dev/null; then
        log_info "数据库已初始化"
    else
        log_warn "数据库初始化失败，可能已存在"
    fi
}

# 显示安装成功信息
show_success() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     Corivo 安装成功！                   ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "请运行以下命令使 PATH 生效："
    echo "  source ~/.zshrc   # 如果你使用 zsh"
    echo "  source ~/.bashrc  # 如果你使用 bash"
    echo ""
    echo "然后就可以使用了："
    echo "  corivo status"
    echo "  corivo --help"
    echo ""
    echo "卸载方式："
    echo "  curl -fsSL https://get.corivo.dev/uninstall | sh"
    echo ""
}

# 主流程
main() {
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════${NC}"
    echo -e "${BLUE}     Corivo 安装向导                    ${NC}"
    echo -e "${BLUE}══════════════════════════════════════════${NC}"
    echo ""

    detect_platform
    detect_runtime
    setup_directories
    download_corivo
    setup_path
    init_database

    show_success
}

# 错误处理
trap 'log_error "安装过程中出现错误"; exit 1' ERR

# 运行
main "$@"
