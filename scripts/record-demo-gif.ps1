<#
.SYNOPSIS
    Records a fresh animated demo GIF of WinFinder inside a clean Windows Sandbox
    using `wsb start`, `wsb share`, `wsb connect`, `wsb exec`, and `ffmpeg`, then
    encodes an optimized GIF to `docs/demo.gif` and extracts verification keyframes.

.PARAMETER Build
    Rebuild the standalone WinFinder release binary (`npx tauri build --no-bundle`)
    before launching Windows Sandbox.

.PARAMETER KeepOpen
    Keep the Windows Sandbox instance running after recording completes (for debugging).

.PARAMETER Fps
    Target GIF frame rate (default: 10).

.PARAMETER Width
    Target GIF width in pixels (default: 900; height scales proportionally).

.EXAMPLE
    .\scripts\record-demo-gif.ps1
#>
[CmdletBinding()]
param(
    [switch]$Build,
    [switch]$KeepOpen,
    [int]$Fps = 10,
    [int]$Width = 900
)

$ErrorActionPreference = "Stop"

function Resolve-WsbPath {
    $cmd = Get-Command wsb -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $appAlias = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\wsb.exe"
    if (Test-Path $appAlias) { return $appAlias }
    throw "Windows Sandbox CLI ('wsb') was not found."
}

function Resolve-FfmpegExe {
    $scoopReal = Join-Path $env:USERPROFILE "scoop\apps\ffmpeg\current\bin\ffmpeg.exe"
    if (Test-Path $scoopReal) { return $scoopReal }
    $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($cmd) {
        $src = $cmd.Source
        # If it's a Scoop shim, try to resolve real binary
        if ($src -like "*\scoop\shims\*") {
            $shimFile = [System.IO.Path]::ChangeExtension($src, ".shim")
            if (Test-Path $shimFile) {
                $line = Get-Content $shimFile | Where-Object { $_ -match '^path\s*=\s*(.+)$' } | Select-Object -First 1
                if ($line -and $Matches[1]) {
                    $resolved = $Matches[1].Trim().Trim('"')
                    if (Test-Path $resolved) { return $resolved }
                }
            }
        }
        return $src
    }
    throw "ffmpeg.exe was not found. Install via 'scoop install ffmpeg'."
}

$wsb = Resolve-WsbPath
$ffmpegExe = Resolve-FfmpegExe
$ffmpegDir = Split-Path -Parent $ffmpegExe
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releaseDir = Join-Path $repoRoot "src-tauri\target\release"
$winfinderExe = Join-Path $releaseDir "winfinder.exe"
$webviewDll = Join-Path $releaseDir "WebView2Loader.dll"
$guestScript = Join-Path $PSScriptRoot "sandbox-demo-guest.ps1"
$workDir = Join-Path $repoRoot "test-results\demo-sandbox"
$outputGif = Join-Path $repoRoot "docs\demo.gif"

if ($Build -or -not (Test-Path $winfinderExe)) {
    Write-Host "Building standalone WinFinder release binary..." -ForegroundColor Cyan
    Push-Location $repoRoot
    try {
        npx tauri build --no-bundle
        if ($LASTEXITCODE -ne 0) { throw "npx tauri build --no-bundle failed." }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $winfinderExe)) { throw "winfinder.exe not found at $winfinderExe" }
if (-not (Test-Path $webviewDll)) { throw "WebView2Loader.dll not found at $webviewDll" }
if (-not (Test-Path $guestScript)) { throw "Guest script not found at $guestScript" }

# Prepare staging directory
if (Test-Path $workDir) {
    Remove-Item -Path $workDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
Copy-Item -Path $winfinderExe -Destination (Join-Path $workDir "winfinder.exe") -Force
Copy-Item -Path $webviewDll -Destination (Join-Path $workDir "WebView2Loader.dll") -Force
Copy-Item -Path $guestScript -Destination (Join-Path $workDir "sandbox-demo-guest.ps1") -Force

# Check for already-running Windows Sandbox instances
$existingRaw = & $wsb list --raw 2>$null
if ($existingRaw) {
    $existingIds = @()
    try {
        $parsed = $existingRaw | ConvertFrom-Json
        if ($parsed -is [System.Array]) {
            $existingIds = $parsed | ForEach-Object { if ($_.Id) { $_.Id } else { $_ } }
        } elseif ($parsed.Id) {
            $existingIds = @($parsed.Id)
        }
    } catch {
        $existingIds = ($existingRaw -split "`r?`n") | Where-Object { $_.Trim() -ne "" }
    }
    if ($existingIds.Count -gt 0) {
        throw "A Windows Sandbox instance is already running ($($existingIds -join ', ')). Stop it with 'wsb stop --id <id>' first."
    }
}

$sandboxId = $null
try {
    Write-Host "Starting Windows Sandbox via 'wsb start --raw'..." -ForegroundColor Cyan
    $startRaw = & $wsb start --raw
    if ($LASTEXITCODE -ne 0) {
        throw "wsb start failed (exit code $LASTEXITCODE): $startRaw"
    }
    $startObj = $startRaw | ConvertFrom-Json
    $sandboxId = $startObj.Id
    if (-not $sandboxId) {
        throw "Could not parse sandbox Id from 'wsb start --raw': $startRaw"
    }
    Write-Host "Started Windows Sandbox: $sandboxId" -ForegroundColor Green

    Write-Host "Sharing work directory and ffmpeg into sandbox..." -ForegroundColor Cyan
    & $wsb share --id $sandboxId --host-path $workDir --sandbox-path "C:\demo-work" --allow-write
    if ($LASTEXITCODE -ne 0) { throw "Failed to share work directory." }

    & $wsb share --id $sandboxId --host-path $ffmpegDir --sandbox-path "C:\ffmpeg"
    if ($LASTEXITCODE -ne 0) { throw "Failed to share ffmpeg directory." }

    # Connect to create active WDAGUtilityAccount desktop session for GUI rendering & gdigrab
    Write-Host "Connecting to Windows Sandbox desktop session..." -ForegroundColor Cyan
    Start-Process -FilePath $wsb -ArgumentList "connect", "--id", $sandboxId | Out-Null

    $sessionReady = $false
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        for ($attempt = 1; $attempt -le 30; $attempt++) {
            & $wsb exec --id $sandboxId --run-as ExistingLogin -c "cmd /c echo ready" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $sessionReady = $true
                break
            }
            Start-Sleep -Seconds 2
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
    if (-not $sessionReady) {
        throw "Timed out waiting for Windows Sandbox ExistingLogin desktop session."
    }

    # Give desktop shell a moment to finish initializing
    Start-Sleep -Seconds 3

    Write-Host "Running demo recording inside Windows Sandbox..." -ForegroundColor Cyan
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $wsb exec --id $sandboxId --run-as ExistingLogin -d "C:\demo-work" -c "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\demo-work\sandbox-demo-guest.ps1 -WorkDir C:\demo-work -FfmpegPath C:\ffmpeg\ffmpeg.exe"
        $execExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }

    $guestLog = Join-Path $workDir "guest.log"
    if (Test-Path $guestLog) {
        Write-Host "`n--- Guest Recording Log ---" -ForegroundColor Yellow
        Get-Content $guestLog | Write-Host
        Write-Host "---------------------------`n" -ForegroundColor Yellow
    }

    $statusFile = Join-Path $workDir "guest-exitcode.txt"
    $guestExit = $execExit
    if (Test-Path $statusFile) {
        $raw = (Get-Content $statusFile -Raw).Trim()
        if ($raw -match '^\d+$') { $guestExit = [int]$raw }
    }
    if ($guestExit -ne 0) {
        throw "Guest demo recording failed (exit code $guestExit)."
    }

    $mp4Path = Join-Path $workDir "demo.mp4"
    if (-not (Test-Path $mp4Path)) {
        throw "Expected recorded video not found at $mp4Path"
    }

    # Encode optimized GIF using two-pass palettegen/paletteuse
    $palettePath = Join-Path $workDir "palette.png"
    Write-Host "Encoding optimized GIF ($Width px wide, $Fps fps) -> $outputGif ..." -ForegroundColor Cyan
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $ffmpegExe -y -loglevel error -i $mp4Path -vf "fps=$Fps,scale=${Width}:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" $palettePath
        if ($LASTEXITCODE -ne 0) { throw "ffmpeg palettegen failed." }

        & $ffmpegExe -y -loglevel error -i $mp4Path -i $palettePath -lavfi "fps=$Fps,scale=${Width}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" $outputGif
        if ($LASTEXITCODE -ne 0) { throw "ffmpeg paletteuse failed." }

        # Extract keyframes for visual verification
        $framesDir = Join-Path $workDir "frames"
        New-Item -ItemType Directory -Force -Path $framesDir | Out-Null
        & $ffmpegExe -y -loglevel error -i $outputGif -vf "fps=0.4" (Join-Path $framesDir "frame_%02d.png")
    } finally {
        $ErrorActionPreference = $prevEap
    }

    $gifInfo = Get-Item $outputGif
    $sizeKb = [Math]::Round($gifInfo.Length / 1024.0, 1)
    Write-Host "Generated $outputGif ($sizeKb KB)" -ForegroundColor Green
    Write-Host "Verification keyframes saved in: $framesDir" -ForegroundColor Green
} finally {
    if ($sandboxId -and -not $KeepOpen) {
        Write-Host "Stopping Windows Sandbox ($sandboxId)..." -ForegroundColor Cyan
        & $wsb stop --id $sandboxId *> $null
    }
}
