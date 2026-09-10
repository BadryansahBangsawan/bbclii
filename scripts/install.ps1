# BBCLI installer
# Usage: irm https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.ps1 | iex
#
# Or with options:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.ps1))) -Source
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.ps1))) -Binary
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.ps1))) -Source -Ref v3.20.1
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.ps1))) -Source -Ref main
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.ps1))) -Binary -Ref v3.20.1

param(
    [switch]$Source,
    [switch]$Binary,
    [string]$Ref
)

$ErrorActionPreference = "Stop"

$Repo = "BadryansahBangsawan/bbclii"
$Package = "@bbcli/pi-coding-agent"
$InstallDir = if ($env:BBCLI_INSTALL_DIR) { $env:BBCLI_INSTALL_DIR } elseif ($env:PI_INSTALL_DIR) { $env:PI_INSTALL_DIR } else { "$env:LOCALAPPDATA\bbcli" }
$NativeArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($NativeArchitecture -notin @("x64", "arm64")) {
    throw "Unsupported Windows architecture: $NativeArchitecture"
}
$BinaryName = "bbcli-windows-$NativeArchitecture.exe"
$MinimumBunVersion = "1.3.14"

function Test-BunInstalled {
    try {
        $null = Get-Command bun -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Get-BunVersion {
    try {
        $versionText = (bun --version 2>$null)
        if (-not $versionText) {
            return $null
        }

        $clean = $versionText.Trim().Split("-")[0]
        return [version]$clean
    } catch {
        return $null
    }
}

function Test-BunVersion {
    param([string]$MinimumVersion)

    $currentVersion = Get-BunVersion
    if (-not $currentVersion) {
        return $false
    }

    return $currentVersion -ge [version]$MinimumVersion
}

function Assert-BunVersion {
    param([string]$MinimumVersion)

    if (-not (Test-BunVersion $MinimumVersion)) {
        $current = Get-BunVersion
        $currentText = if ($current) { $current.ToString() } else { "unknown" }
        throw "Bun $MinimumVersion or newer is required. Current version: $currentText. Upgrade Bun at https://bun.sh/docs/installation"
    }
}

function Test-GitInstalled {
    try {
        $null = Get-Command git -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Test-GitLfsInstalled {
    try {
        $null = Get-Command git-lfs -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Find-BashShell {
    # Check Git Bash first (most common on Windows)
    $gitBash = "C:\Program Files\Git\bin\bash.exe"
    if (Test-Path $gitBash) {
        return $gitBash
    }

    # Check bash.exe on PATH (Cygwin, MSYS2, WSL)
    try {
        $bashCmd = Get-Command bash.exe -ErrorAction Stop
        return $bashCmd.Source
    } catch {
        return $null
    }
}

function Configure-BashShell {
    try {
        $settingsDir = Join-Path $env:USERPROFILE ".bbcli\agent"
        $settingsFile = Join-Path $settingsDir "settings.json"

        # Check if settings.json already has a shellPath configured
        if (Test-Path $settingsFile) {
            try {
                $existingSettings = Get-Content $settingsFile -Raw | ConvertFrom-Json
                if ($existingSettings.shellPath) {
                    Write-Host "Bash shell already configured: $($existingSettings.shellPath)" -ForegroundColor Cyan
                    return
                }
            } catch {
                # Invalid JSON, we'll overwrite it
            }
        }

        $bashPath = Find-BashShell

        if ($bashPath) {
            Write-Host "Found bash shell: $bashPath" -ForegroundColor Cyan

            # Create settings directory if needed
            if (-not (Test-Path $settingsDir)) {
                New-Item -ItemType Directory -Force -Path $settingsDir | Out-Null
            }

            # Read existing settings or create new. ConvertFrom-Json -AsHashtable
            # requires PowerShell 6+; build the hashtable manually so Windows
            # PowerShell 5.1 merges instead of clobbering existing settings.
            $settings = @{}
            if (Test-Path $settingsFile) {
                try {
                    $parsed = Get-Content $settingsFile -Raw | ConvertFrom-Json
                    foreach ($prop in $parsed.PSObject.Properties) {
                        $settings[$prop.Name] = $prop.Value
                    }
                } catch {
                    $settings = @{}
                }
            }

            # Set shellPath
            $settings["shellPath"] = $bashPath

            # Write settings
            $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsFile -Encoding UTF8
            Write-Host "[OK] Configured shell path in $settingsFile" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "No bash shell found - bbcli will use its built-in shell." -ForegroundColor Cyan
            Write-Host "  For shell snapshots and interactive terminals, install Git for Windows:" -ForegroundColor Cyan
            Write-Host "    https://git-scm.com/download/win" -ForegroundColor Cyan
            Write-Host "  Or set a custom path in:" -ForegroundColor Cyan
            Write-Host "    $settingsFile" -ForegroundColor Cyan
            Write-Host '    { "shellPath": "C:\\path\\to\\bash.exe" }' -ForegroundColor Cyan
        }
    } catch {
        Write-Host "[WARN] Could not configure bash shell: $_" -ForegroundColor Yellow
    }
}

function Install-Bun {
    Write-Host "Installing bun..."
    irm bun.sh/install.ps1 | iex
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    Assert-BunVersion $MinimumBunVersion
}

function Install-HostNatives {
    param([string]$srcDir)
    try {
        $tag = "win32-$NativeArchitecture"
        $nativeDir = Join-Path $srcDir "packages\natives\native"
        if (-not (Test-Path $nativeDir)) {
            New-Item -ItemType Directory -Force -Path $nativeDir | Out-Null
        }
        if (Get-ChildItem -Path $nativeDir -Filter "pi_natives.$tag*" -ErrorAction SilentlyContinue) {
            return
        }
        $nativesPkg = Join-Path $srcDir "packages\natives\package.json"
        if (-not (Test-Path $nativesPkg)) {
            Write-Host "warning: could not read natives package version"
            return
        }
        $version = (Get-Content $nativesPkg -Raw | ConvertFrom-Json).version
        if (-not $version) {
            Write-Host "warning: could not read natives package version"
            return
        }
        $urls = @(
            "https://registry.npmjs.org/@bbcli/pi-natives-$tag/-/pi-natives-$tag-$version.tgz",
            "https://registry.npmjs.org/@oh-my-pi/pi-natives-$tag/-/pi-natives-$tag-$version.tgz"
        )
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        try {
            $tgz = Join-Path $tmp "natives.tgz"
            $downloaded = $false
            Write-Host "Fetching native addon ${tag}@${version}..."
            foreach ($url in $urls) {
                try {
                    Invoke-WebRequest -Uri $url -OutFile $tgz -TimeoutSec 120
                    $downloaded = $true
                    break
                } catch {
                    continue
                }
            }
            if (-not $downloaded) {
                Write-Host "warning: could not download natives for $tag@$version"
                return
            }
            tar -xzf $tgz -C $tmp
            if ($LASTEXITCODE -ne 0) {
                Write-Host "warning: failed to extract native addon tarball"
                return
            }
            $pkgDir = Join-Path $tmp "package"
            if (Test-Path $pkgDir) {
                Get-ChildItem -Path $pkgDir -Filter "*.node" | ForEach-Object {
                    Copy-Item $_.FullName -Destination $nativeDir
                }
            }
        } finally {
            Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Host "warning: could not install host natives"
    }
}

function Install-ViaBun {
    Write-Host "Installing via bun..."
    if (-not (Test-GitInstalled)) {
        throw "git is required to install bbcli from source"
    }

    $srcDir = if ($env:BBCLI_SRC_DIR) { $env:BBCLI_SRC_DIR } else { Join-Path $env:USERPROFILE ".bbcli\src" }
    if (Test-Path $srcDir) {
        Remove-Item -Recurse -Force $srcDir
    }
    New-Item -ItemType Directory -Force -Path $srcDir | Out-Null

    $repoUrl = "https://github.com/$Repo.git"
    if ($Ref) {
        $cloneOk = $false
        try {
            git clone --depth 1 --branch $Ref $repoUrl $srcDir | Out-Null
            $cloneOk = $true
        } catch {
            $cloneOk = $false
        }

        if (-not $cloneOk) {
            git clone $repoUrl $srcDir | Out-Null
            Push-Location $srcDir
            try {
                git checkout $Ref | Out-Null
            } finally {
                Pop-Location
            }
        }
    } else {
        git clone --depth 1 $repoUrl $srcDir | Out-Null
    }

    if (Test-GitLfsInstalled) {
        Push-Location $srcDir
        try {
            git lfs pull | Out-Null
        } finally {
            Pop-Location
        }
    }

    $packagePath = Join-Path $srcDir "packages\coding-agent"
    if (-not (Test-Path $packagePath)) {
        throw "Expected package at $packagePath"
    }

    Push-Location $srcDir
    try {
        bun install
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install from $srcDir via bun"
        }
        Install-HostNatives $srcDir
    } finally {
        Pop-Location
    }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $launcher = Join-Path $InstallDir "bbcli.cmd"
    $cli = Join-Path $packagePath "src\cli.ts"
    Set-Content -Path $launcher -Encoding ASCII -Value @"
@echo off
set "BUN_INSTALL=%USERPROFILE%\.bun"
set "PATH=%BUN_INSTALL%\bin;%PATH%"
bun "$cli" %*
"@

    Write-Host ""
    Write-Host "[OK] Installed bbcli via bun" -ForegroundColor Green

    # Add to PATH if not already there
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $needsRestart = $UserPath -notlike "*$InstallDir*"
    if ($needsRestart) {
        Write-Host "Adding $InstallDir to PATH..."
        [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    }

    Configure-BashShell

    if ($needsRestart) {
        Write-Host "Restart your terminal, then run 'bbcli' to get started!"
    } else {
        Write-Host "Run 'bbcli' to get started!"
    }
}

function Install-Binary {
    if ($Ref) {
        Write-Host "Fetching release $Ref..."
        try {
            $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$Ref" -TimeoutSec 60
        } catch {
            throw "Release tag not found: $Ref`nFor branch/commit installs, use -Source with -Ref."
        }
    } else {
        Write-Host "Fetching latest release..."
        $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -TimeoutSec 60
    }

    $Latest = $Release.tag_name
    if (-not $Latest) {
        throw "Failed to fetch release tag"
    }
    Write-Host "Using version: $Latest"

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    # Download binary
    $BinaryUrl = "https://github.com/$Repo/releases/download/$Latest/$BinaryName"
    Write-Host "Downloading $BinaryName..."
    $OutPath = Join-Path $InstallDir "bbcli.exe"
    Invoke-WebRequest -Uri $BinaryUrl -OutFile $OutPath -TimeoutSec 900

    Write-Host ""
    Write-Host "[OK] Installed bbcli to $OutPath" -ForegroundColor Green

    # Add to PATH if not already there
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $needsRestart = $UserPath -notlike "*$InstallDir*"
    if ($needsRestart) {
        Write-Host "Adding $InstallDir to PATH..."
        [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    }

    Configure-BashShell

    if ($needsRestart) {
        Write-Host "Restart your terminal, then run 'bbcli' to get started!"
    } else {
        Write-Host "Run 'bbcli' to get started!"
    }
}

# Main logic
if ($Ref -and -not $Source -and -not $Binary) {
    $Source = $true
}

if ($Source) {
    if (-not (Test-BunInstalled)) {
        Install-Bun
    }
    Assert-BunVersion $MinimumBunVersion
    Install-ViaBun
} elseif ($Binary) {
    Install-Binary
} else {
    # Default: use bun if available, otherwise binary, then source if no release asset.
    if (Test-BunInstalled) {
        Assert-BunVersion $MinimumBunVersion
        Install-ViaBun
    } else {
        try {
            Install-Binary
        } catch {
            Write-Host "No GitHub release asset; installing from source."
            if (-not (Test-BunInstalled)) {
                Install-Bun
            }
            Assert-BunVersion $MinimumBunVersion
            Install-ViaBun
        }
    }
}
