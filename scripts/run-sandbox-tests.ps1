<#
.SYNOPSIS
    Starts a disposable Windows Sandbox via `wsb start`, shares the WinFinder
    workspace, Node.js runtime, and Playwright browser cache into it, executes
    the Playwright E2E test suite inside the sandbox, collects the results, and
    stops the sandbox cleanly.

.PARAMETER KeepOpen
    Keep the Windows Sandbox instance running after tests finish (for debugging).

.PARAMETER ReuseExisting
    If a Windows Sandbox instance is already running, reuse it instead of
    starting a new one (and do not stop it on exit).

.EXAMPLE
    .\scripts\run-sandbox-tests.ps1
#>
[CmdletBinding()]
param(
    [switch]$KeepOpen,
    [switch]$ReuseExisting,
    [ValidateSet("System", "ExistingLogin")]
    [string]$RunAs = "System"
)

$ErrorActionPreference = "Stop"

function Resolve-WsbPath {
    $cmd = Get-Command wsb -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $appAlias = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\wsb.exe"
    if (Test-Path $appAlias) { return $appAlias }
    throw "Windows Sandbox CLI ('wsb') was not found. See specs/archive/017-windows-sandbox-e2e-tests.md for installation instructions."
}

function Resolve-NodeDir {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        throw "Node.js ('node') was not found on PATH."
    }
    return Split-Path -Parent $nodeCmd.Source
}

$wsb = Resolve-WsbPath
$nodeDir = Resolve-NodeDir
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$playwrightCache = Join-Path $env:LOCALAPPDATA "ms-playwright"
$hostOutputDir = Join-Path $repoRoot "test-results\sandbox"

if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
    throw "node_modules not found in $repoRoot. Run 'npm install' first."
}
if (-not (Test-Path $playwrightCache)) {
    throw "Playwright browser cache not found at $playwrightCache. Run 'npx playwright install chromium' first."
}
if (-not (Test-Path (Join-Path $repoRoot "dist\index.html"))) {
    Write-Host "Building frontend bundle (dist/) before starting Windows Sandbox..." -ForegroundColor Cyan
    Push-Location $repoRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }
    } finally {
        Pop-Location
    }
}

New-Item -ItemType Directory -Force -Path $hostOutputDir | Out-Null

# Check for any already-running sandbox instances
$existingRaw = & $wsb list --raw 2>$null
$existingIds = @()
if ($existingRaw) {
    try {
        $parsed = $existingRaw | ConvertFrom-Json
        if ($parsed -is [System.Array]) {
            $existingIds = $parsed | ForEach-Object { if ($_.Id) { $_.Id } else { $_ } }
        } elseif ($parsed.Id) {
            $existingIds = @($parsed.Id)
        }
    } catch {
        # Fallback: parse non-empty lines
        $existingIds = ($existingRaw -split "`r?`n") | Where-Object { $_.Trim() -ne "" }
    }
}

$sandboxId = $null
$startedByScript = $false

try {
    if ($existingIds.Count -gt 0) {
        if ($ReuseExisting) {
            $sandboxId = $existingIds[0]
            Write-Host "Reusing running Windows Sandbox: $sandboxId" -ForegroundColor Cyan
        } else {
            throw "A Windows Sandbox instance is already running ($($existingIds -join ', ')). Stop it with 'wsb stop --id <id>' or pass -ReuseExisting."
        }
    } else {
        Write-Host "Starting Windows Sandbox via 'wsb start --raw'..." -ForegroundColor Cyan
        $startRaw = & $wsb start --raw
        if ($LASTEXITCODE -ne 0) {
            throw "wsb start failed with exit code $LASTEXITCODE. Output: $startRaw"
        }
        $startObj = $startRaw | ConvertFrom-Json
        $sandboxId = $startObj.Id
        if (-not $sandboxId) {
            throw "Could not parse sandbox Id from 'wsb start --raw' output: $startRaw"
        }
        $startedByScript = $true
        Write-Host "Started Windows Sandbox: $sandboxId" -ForegroundColor Green
    }

    # Share workspace, Node.js runtime, Playwright browsers (read-only) and output dir (read-write)
    Write-Host "Sharing host folders into sandbox..." -ForegroundColor Cyan
    & $wsb share --id $sandboxId --host-path $repoRoot --sandbox-path "C:\WinFinder"
    if ($LASTEXITCODE -ne 0) { throw "Failed to share repository folder." }

    & $wsb share --id $sandboxId --host-path $nodeDir --sandbox-path "C:\nodejs"
    if ($LASTEXITCODE -ne 0) { throw "Failed to share Node.js folder." }

    & $wsb share --id $sandboxId --host-path $playwrightCache --sandbox-path "C:\ms-playwright"
    if ($LASTEXITCODE -ne 0) { throw "Failed to share Playwright browsers cache." }

    & $wsb share --id $sandboxId --host-path $hostOutputDir --sandbox-path "C:\test-results" --allow-write
    if ($LASTEXITCODE -ne 0) { throw "Failed to share output directory." }

    # Wait briefly for sandbox command execution to become ready
    $sessionReady = $false
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        for ($attempt = 1; $attempt -le 20; $attempt++) {
            & $wsb exec --id $sandboxId --run-as $RunAs -c "cmd /c echo ready" 2>&1 | Out-Null
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
        throw "Timed out waiting for Windows Sandbox ($RunAs) to become ready."
    }

    Write-Host "Running Playwright E2E tests inside Windows Sandbox (RunAs=$RunAs)..." -ForegroundColor Cyan
    $exitCodeFile = Join-Path $hostOutputDir "exitcode.txt"
    if (Test-Path $exitCodeFile) { Remove-Item $exitCodeFile -Force }

    $runnerBatchPath = Join-Path $hostOutputDir "run-in-sandbox.cmd"
    $runnerBatch = @"
@echo off
set PATH=C:\nodejs;%PATH%
set PLAYWRIGHT_BROWSERS_PATH=C:\ms-playwright
set PLAYWRIGHT_OUTPUT_DIR=C:\test-results
set PLAYWRIGHT_WORKERS=2
set WINFINDER_SERVE_DIST=1
cd /d C:\WinFinder
C:\nodejs\node.exe C:\WinFinder\node_modules\@playwright\test\cli.js test > C:\test-results\console.log 2>&1
set PW_EXIT=%ERRORLEVEL%
(echo %PW_EXIT%) > C:\test-results\exitcode.txt
exit /b %PW_EXIT%
"@
    Set-Content -Path $runnerBatchPath -Value $runnerBatch -Encoding ASCII

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $wsb exec --id $sandboxId --run-as $RunAs -d "C:\WinFinder" -c "cmd.exe /c C:\test-results\run-in-sandbox.cmd"
        $wsbExecExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }

    $testExitCode = $wsbExecExitCode
    if (Test-Path $exitCodeFile) {
        $rawExit = Get-Content $exitCodeFile -Raw
        if ($null -ne $rawExit -and $rawExit.Trim() -match '^\d+$') {
            $testExitCode = [int]$rawExit.Trim()
        } else {
            $testExitCode = 1
        }
    } else {
        $testExitCode = 1
    }

    $consoleLog = Join-Path $hostOutputDir "console.log"
    if (Test-Path $consoleLog) {
        Write-Host "`n--- Windows Sandbox Playwright Output ---" -ForegroundColor Yellow
        Get-Content $consoleLog | Write-Host
        Write-Host "-----------------------------------------`n" -ForegroundColor Yellow
    }

    $resultsJson = Join-Path $hostOutputDir "results.json"
    if (Test-Path $resultsJson) {
        Write-Host "JSON test report saved to: $resultsJson" -ForegroundColor Green
    }

    if ($testExitCode -ne 0) {
        throw "Playwright E2E tests failed inside Windows Sandbox (exit code $testExitCode)."
    }

    Write-Host "All Playwright E2E tests passed inside Windows Sandbox!" -ForegroundColor Green
} finally {
    if ($startedByScript -and $sandboxId -and -not $KeepOpen) {
        Write-Host "Stopping Windows Sandbox ($sandboxId)..." -ForegroundColor Cyan
        & $wsb stop --id $sandboxId *> $null
    }
}
