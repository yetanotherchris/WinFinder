param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$ArtifactsDir = (Join-Path $PSScriptRoot "artifacts")
)

$ErrorActionPreference = 'Stop'

$Version = $Version.TrimStart('v')
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version '$Version' does not match strict semver (MAJOR.MINOR.PATCH)."
}

# The Windows portable zip published by the release workflow. Scoop installs
# this archive via bin/shortcuts; the manifest hash MUST match this exact file.
$fileName = "winfinder-$Version-windows-x64.zip"
$zipPath = Join-Path $ArtifactsDir $fileName

if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "Unable to locate $fileName at $zipPath"
}

$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $stream = [System.IO.File]::OpenRead($zipPath)
    try {
        $hashBytes = $sha256.ComputeHash($stream)
    } finally {
        $stream.Dispose()
    }
} finally {
    $sha256.Dispose()
}
$hash = ([System.BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
Write-Host "SHA256 of ${fileName}: $hash"

# The release download URL is deterministic: v<version>/<artifact name>.
$url = "https://github.com/yetanotherchris/WinFinder/releases/download/v$Version/winfinder-$Version-windows-x64.zip"
$manifestPath = Join-Path $PSScriptRoot "winfinder.json"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Unable to locate Scoop manifest at $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

# Guard: never silently drop the Start Menu shortcut declaration.
if (-not $manifest.shortcuts) {
    throw "Scoop manifest has no 'shortcuts' declaration; refusing to write a definition that lost the Start Menu shortcut."
}

# Guard: never silently drop the Scoop post_uninstall config cleanup hook.
if (-not $manifest.post_uninstall) {
    throw "Scoop manifest has no 'post_uninstall' declaration; refusing to write a definition that lost config cleanup on uninstall."
}

$manifest.version = $Version
$manifest.architecture."64bit".url = $url
$manifest.architecture."64bit".hash = $hash

$json = $manifest | ConvertTo-Json -Depth 10
# Normalize to LF and keep a trailing newline so release commits never produce
# cosmetic line-ending diffs.
$content = ($json -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText($manifestPath, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Updated $manifestPath to v$Version"
