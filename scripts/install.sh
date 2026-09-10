#!/bin/sh
set -e

# BBCLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.sh | sh
#
# Options:
#   --source       Install via bun (installs bun if needed)
#   --binary       Always install prebuilt binary
#   --ref <ref>    Install specific tag/commit/branch
#   -r <ref>       Shorthand for --ref

REPO="BadryansahBangsawan/bbclii"
PACKAGE="@bbcli/pi-coding-agent"
INSTALL_DIR="${BBCLI_INSTALL_DIR:-${PI_INSTALL_DIR:-$HOME/.local/bin}}"
MIN_BUN_VERSION="1.3.14"

# Parse arguments
MODE=""
REF=""
while [ $# -gt 0 ]; do
    case "$1" in
        --source)
            MODE="source"
            shift
            ;;
        --binary)
            MODE="binary"
            shift
            ;;
        --ref)
            shift
            if [ -z "$1" ]; then
                echo "Missing value for --ref"
                exit 1
            fi
            REF="$1"
            shift
            ;;
        --ref=*)
            REF="${1#*=}"
            if [ -z "$REF" ]; then
                echo "Missing value for --ref"
                exit 1
            fi
            shift
            ;;
        -r)
            shift
            if [ -z "$1" ]; then
                echo "Missing value for -r"
                exit 1
            fi
            REF="$1"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# If a ref is provided, default to source install
if [ -n "$REF" ] && [ -z "$MODE" ]; then
    MODE="source"
fi

# Check if bun is available
has_bun() {
    command -v bun >/dev/null 2>&1
}

# Normalized host architecture (x64|arm64). On macOS this uses
# `sysctl hw.optional.arm64` so it stays correct inside a Rosetta session,
# where `uname -m` reports the translated x86_64.
host_arch() {
    if [ "$(uname -s)" = "Darwin" ]; then
        if [ "$(sysctl -in hw.optional.arm64 2>/dev/null || /usr/sbin/sysctl -in hw.optional.arm64 2>/dev/null)" = "1" ]; then
            echo "arm64"
        else
            echo "x64"
        fi
        return
    fi
    case "$(uname -m)" in
        x86_64|amd64)  echo "x64" ;;
        arm64|aarch64) echo "arm64" ;;
        *)             uname -m ;;
    esac
}

# Bun's own architecture (x64|arm64), or empty when it can't be determined.
bun_arch() {
    bun -e 'process.stdout.write(process.arch)' 2>/dev/null
}

# True when Bun's architecture matches the host. If Bun's arch can't be read,
# assume a match rather than block the install.
bun_arch_matches_host() {
    ba="$(bun_arch)"
    [ -z "$ba" ] && return 0
    [ "$ba" = "$(host_arch)" ]
}

version_ge() {
    current="$1"
    minimum="$2"

    current_major="${current%%.*}"
    current_rest="${current#*.}"
    current_minor="${current_rest%%.*}"
    current_patch="${current_rest#*.}"
    current_patch="${current_patch%%.*}"

    minimum_major="${minimum%%.*}"
    minimum_rest="${minimum#*.}"
    minimum_minor="${minimum_rest%%.*}"
    minimum_patch="${minimum_rest#*.}"
    minimum_patch="${minimum_patch%%.*}"

    if [ "$current_major" -ne "$minimum_major" ]; then
        [ "$current_major" -gt "$minimum_major" ]
        return $?
    fi

    if [ "$current_minor" -ne "$minimum_minor" ]; then
        [ "$current_minor" -gt "$minimum_minor" ]
        return $?
    fi

    [ "$current_patch" -ge "$minimum_patch" ]
}

require_bun_version() {
    version_raw=$(bun --version 2>/dev/null || true)
    if [ -z "$version_raw" ]; then
        echo "Failed to read bun version"
        exit 1
    fi

    version_clean=${version_raw%%-*}
    if ! version_ge "$version_clean" "$MIN_BUN_VERSION"; then
        echo "Bun ${MIN_BUN_VERSION} or newer is required. Current version: ${version_clean}"
        echo "Upgrade Bun at https://bun.sh/docs/installation"
        exit 1
    fi
}

# Check if git is available
has_git() {
    command -v git >/dev/null 2>&1
}

# Install bun
install_bun() {
    echo "Installing bun..."
    if command -v bash >/dev/null 2>&1; then
        curl -fsSL https://bun.sh/install | bash
    else
        echo "bash not found; attempting install with sh..."
        curl -fsSL https://bun.sh/install | sh
    fi
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    require_bun_version
}

# Check if git-lfs is available
has_git_lfs() {
    command -v git-lfs >/dev/null 2>&1
}

# Workspace checkouts do not ship prebuilt .node addons. Pull the published
# same-version leaf from npm (@bbcli first, then @oh-my-pi).
install_host_natives() {
    src="$1"
    case "$(uname -s)" in
        Linux)  tag="linux-$(host_arch)" ;;
        Darwin) tag="darwin-$(host_arch)" ;;
        MINGW*|MSYS*|CYGWIN*|Windows_NT) tag="win32-$(host_arch)" ;;
        *)      return 0 ;;
    esac
    native_dir="$src/packages/natives/native"
    mkdir -p "$native_dir"
    if ls "$native_dir"/pi_natives."$tag"* >/dev/null 2>&1; then
        return 0
    fi
    version=$(cd "$src" && bun -e 'import p from "./packages/natives/package.json" with { type: "json" }; process.stdout.write(p.version)')
    if [ -z "$version" ]; then
        echo "warning: could not read natives package version"
        return 0
    fi
    tmp=$(mktemp -d)
    echo "Fetching native addon ${tag}@${version}..."
    downloaded=0
    for url in \
        "https://registry.npmjs.org/@bbcli/pi-natives-${tag}/-/pi-natives-${tag}-${version}.tgz" \
        "https://registry.npmjs.org/@oh-my-pi/pi-natives-${tag}/-/pi-natives-${tag}-${version}.tgz"
    do
        if curl -fsSL "$url" -o "$tmp/natives.tgz"; then
            downloaded=1
            break
        fi
    done
    if [ "$downloaded" -eq 0 ]; then
        echo "warning: could not download natives for ${tag}@${version}"
        rm -rf "$tmp"
        return 0
    fi
    tar -xzf "$tmp/natives.tgz" -C "$tmp"
    cp "$tmp"/package/pi_natives.*.node "$native_dir/" 2>/dev/null || true
    rm -rf "$tmp"
}


# Append the bbcli PATH block to $1 if the file exists and is not already marked.
append_bbcli_path_rc() {
    _rc="$1"
    _line="$2"
    [ -f "$_rc" ] || return 0
    if grep -q '# bbcli' "$_rc" 2>/dev/null; then
        return 0
    fi
    if grep 'PATH=.*\.local/bin' "$_rc" >/dev/null 2>&1; then
        return 0
    fi
    printf '\n%s\n%s\n' "# bbcli" "$_line" >> "$_rc"
}

# After a successful install, put INSTALL_DIR on PATH for this process and
# persist it in the user's shell rc so a new login finds `bbcli`.
ensure_install_dir_on_path() {
    export PATH="$INSTALL_DIR:$PATH"

    if [ "$INSTALL_DIR" = "$HOME/.local/bin" ]; then
        path_line='export PATH="$HOME/.local/bin:$PATH"'
    else
        path_line="export PATH=\"${INSTALL_DIR}:\$PATH\""
    fi

    bashrc="$HOME/.bashrc"
    zshrc="$HOME/.zshrc"
    profile="$HOME/.profile"

    if [ ! -f "$bashrc" ] && [ ! -f "$zshrc" ] && [ ! -f "$profile" ]; then
        printf '%s\n%s\n' "# bbcli" "$path_line" > "$profile"
        return 0
    fi

    append_bbcli_path_rc "$bashrc" "$path_line"
    append_bbcli_path_rc "$zshrc" "$path_line"
    append_bbcli_path_rc "$profile" "$path_line"
}


# origin = official OMP (bbcli update), bbclii = this fork (local features).
configure_source_remotes() {
    src="$1"
    omp="https://github.com/can1357/oh-my-pi.git"
    fork="https://github.com/${REPO}.git"
    origin_url="$(git -C "$src" remote get-url origin 2>/dev/null || true)"
    bbclii_url="$(git -C "$src" remote get-url bbclii 2>/dev/null || true)"
    if echo "$origin_url" | grep -q "BadryansahBangsawan/bbclii" && [ -z "$bbclii_url" ]; then
        git -C "$src" remote rename origin bbclii
        origin_url=""
    fi
    if [ -z "$(git -C "$src" remote get-url origin 2>/dev/null || true)" ]; then
        git -C "$src" remote add origin "$omp"
    elif ! echo "$(git -C "$src" remote get-url origin)" | grep -q "can1357/oh-my-pi"; then
        git -C "$src" remote set-url origin "$omp"
    fi
    if [ -z "$(git -C "$src" remote get-url bbclii 2>/dev/null || true)" ]; then
        git -C "$src" remote add bbclii "$fork"
    fi
    git -C "$src" fetch origin main >/dev/null 2>&1 || true
}

# Install via bun: clone the workspace (catalog: deps cannot resolve from a
# lone package), bun install at the repo root, then write a launcher.
install_via_bun() {
    echo "Installing via bun..."
    if ! has_git; then
        echo "git is required to install bbcli from source"
        exit 1
    fi

    SRC_DIR="${BBCLI_SRC_DIR:-$HOME/.bbcli/src}"
    mkdir -p "$(dirname "$SRC_DIR")"

    if [ -d "$SRC_DIR/packages/coding-agent" ]; then
        echo "Using existing source checkout $SRC_DIR"
    else
        rm -rf "$SRC_DIR"
        if [ -n "$REF" ]; then
            if git clone --branch "$REF" "https://github.com/${REPO}.git" "$SRC_DIR" >/dev/null 2>&1; then
                :
            else
                git clone "https://github.com/${REPO}.git" "$SRC_DIR"
                (cd "$SRC_DIR" && git checkout "$REF")
            fi
        else
            git clone "https://github.com/${REPO}.git" "$SRC_DIR"
        fi

        # Pull LFS files
        if has_git_lfs; then
            (cd "$SRC_DIR" && git lfs pull)
        fi
    fi

    if [ ! -d "$SRC_DIR/packages/coding-agent" ]; then
        echo "Expected package at ${SRC_DIR}/packages/coding-agent"
        exit 1
    fi

    configure_source_remotes "$SRC_DIR"

    (cd "$SRC_DIR" && bun install) || {
        echo "Failed to install from source"
        exit 1
    }
    install_host_natives "$SRC_DIR"


    mkdir -p "$INSTALL_DIR"
    rm -f "${INSTALL_DIR}/bbcli"
    cat > "${INSTALL_DIR}/bbcli" <<EOF
#!/bin/sh
export BUN_INSTALL="\${BUN_INSTALL:-\$HOME/.bun}"
export PATH="\$BUN_INSTALL/bin:\$PATH"
exec "$SRC_DIR/packages/coding-agent/scripts/bbcli" "\$@"
EOF
    chmod +x "${INSTALL_DIR}/bbcli"

    echo ""
    echo "✓ Installed bbcli via bun"
    echo "  origin = official OMP; local features kept; bbcli update merges origin/main"
    ensure_install_dir_on_path
    echo "Run 'bbcli' to get started!"
}

# Install from a git checkout via bun.
install_from_source() {
    if ! has_bun; then
        install_bun
    fi
    require_bun_version
    if ! bun_arch_matches_host; then
        echo "Error: bun reports architecture '$(bun_arch)' but this host is '$(host_arch)'."
        echo "Installing from source with this bun would produce a mismatched binary"
        echo "(e.g. x86_64 under Rosetta on Apple Silicon), causing slow startup and AVX warnings."
        echo "Install a native bun for your architecture, or re-run without --source to fetch the prebuilt $(host_arch) binary."
        exit 1
    fi
    install_via_bun
}

# Install binary from GitHub releases
install_binary() {
    # Detect platform
    OS="$(uname -s)"
    ARCH="$(host_arch)"

    case "$OS" in
        Linux)  PLATFORM="linux" ;;
        Darwin) PLATFORM="darwin" ;;
        *)      echo "Unsupported OS: $OS"; exit 1 ;;
    esac

    case "$ARCH" in
        x64|arm64) ;;
        *)         echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac

    if [ "$PLATFORM" = "linux" ]; then
        if [ -f /etc/alpine-release ] || { command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; }; then
            PLATFORM="linux-musl"
        fi
    fi

    BINARY="bbcli-${PLATFORM}-${ARCH}"
    # Get release tag
    if [ -n "$REF" ]; then
        echo "Fetching release $REF..."
        if RELEASE_JSON=$(curl -fsSL --connect-timeout 10 --max-time 60 "https://api.github.com/repos/${REPO}/releases/tags/${REF}"); then
            LATEST=$(echo "$RELEASE_JSON" | grep '"tag_name"' | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
        else
            echo "Release tag not found: $REF"
            echo "For branch/commit installs, use --source with --ref."
            exit 1
        fi
    else
        echo "Fetching latest release..."
        if RELEASE_JSON=$(curl -fsSL --connect-timeout 10 --max-time 60 "https://api.github.com/repos/${REPO}/releases/latest"); then
            LATEST=$(echo "$RELEASE_JSON" | grep '"tag_name"' | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
        else
            LATEST=""
        fi
    fi

    if [ -z "$LATEST" ]; then
        if [ "$MODE" = "binary" ]; then
            echo "Failed to fetch release tag"
            exit 1
        fi
        echo "No GitHub release asset; installing from source."
        return 1
    fi
    echo "Using version: $LATEST"

    mkdir -p "$INSTALL_DIR"
    # Download binary
    BINARY_URL="https://github.com/${REPO}/releases/download/${LATEST}/${BINARY}"
    echo "Downloading ${BINARY}..."
    if ! curl -fsSL --connect-timeout 10 --speed-limit 1024 --speed-time 30 "$BINARY_URL" -o "${INSTALL_DIR}/bbcli"; then
        rm -f "${INSTALL_DIR}/bbcli"
        if [ "$MODE" = "binary" ]; then
            echo "Failed to download ${BINARY}"
            exit 1
        fi
        echo "No GitHub release asset; installing from source."
        return 1
    fi
    chmod +x "${INSTALL_DIR}/bbcli"

    # Verify the freshly installed binary can actually start before reporting
    # success. Bun's musl-target binaries link libstdc++/libgcc dynamically,
    # which stock Alpine/musl systems do not ship, so the download succeeds while
    # the binary exits 127 with relocation errors. Never claim success for a
    # binary that cannot run.
    if ! SMOKE_OUTPUT="$("${INSTALL_DIR}/bbcli" --version 2>&1)"; then
        echo ""
        echo "✗ bbcli was downloaded to ${INSTALL_DIR}/bbcli but cannot start:"
        echo "$SMOKE_OUTPUT" | sed 's/^/    /'
        if [ "$PLATFORM" = "linux-musl" ]; then
            echo ""
            echo "The musl build links libstdc++/libgcc dynamically. Install them, then re-run 'bbcli':"
            if command -v apk >/dev/null 2>&1; then
                echo "    apk add libstdc++ libgcc"
            else
                echo "    (install the libstdc++ and libgcc runtime packages for your distro)"
            fi
        fi
        exit 1
    fi

    echo ""
    echo "✓ Installed bbcli to ${INSTALL_DIR}/bbcli"
    ensure_install_dir_on_path
    echo "Run 'bbcli' to get started!"
}

# Main logic
case "$MODE" in
    source)
        install_from_source
        ;;
    binary)
        install_binary
        ;;
    *)
        # Default: use bun only when it matches the host architecture, otherwise
        # try the prebuilt binary so Rosetta bun can't force an x86_64 build.
        # Missing GitHub assets fall back to source.
        if has_bun && bun_arch_matches_host; then
            require_bun_version
            install_via_bun
        else
            if has_bun; then
                echo "Detected bun with architecture '$(bun_arch)' on a '$(host_arch)' host; using the prebuilt binary instead."
            fi
            if ! install_binary; then
                install_from_source
            fi
        fi
        ;;
esac
