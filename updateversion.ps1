param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = 'Stop'

$Version = $Version.TrimStart('v')
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version '$Version' does not match strict semver (MAJOR.MINOR.PATCH)."
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# 1. Update package.json
$packageJsonPath = Join-Path $PSScriptRoot "package.json"
if (-not (Test-Path -LiteralPath $packageJsonPath)) {
    throw "Unable to locate package.json at $packageJsonPath"
}
$pkg = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$pkg.version = $Version
$pkgJson = (($pkg | ConvertTo-Json -Depth 32) -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText($packageJsonPath, $pkgJson, $utf8NoBom)
Write-Host "Updated $packageJsonPath to v$Version"

# 2. Update src-tauri/tauri.conf.json
$tauriConfPath = Join-Path $PSScriptRoot "src-tauri/tauri.conf.json"
if (-not (Test-Path -LiteralPath $tauriConfPath)) {
    throw "Unable to locate tauri.conf.json at $tauriConfPath"
}
$tauriConf = Get-Content -LiteralPath $tauriConfPath -Raw | ConvertFrom-Json
$tauriConf.version = $Version
$tauriJson = (($tauriConf | ConvertTo-Json -Depth 32) -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText($tauriConfPath, $tauriJson, $utf8NoBom)
Write-Host "Updated $tauriConfPath to v$Version"

# 3. Update [package] version in src-tauri/Cargo.toml
$cargoTomlPath = Join-Path $PSScriptRoot "src-tauri/Cargo.toml"
if (-not (Test-Path -LiteralPath $cargoTomlPath)) {
    throw "Unable to locate Cargo.toml at $cargoTomlPath"
}
$cargoRaw = (Get-Content -LiteralPath $cargoTomlPath -Raw) -replace "`r`n", "`n"
$lines = $cargoRaw -split "`n"
$inPackage = $false
$updatedCargo = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
    $trimmed = $lines[$i].Trim()
    if ($trimmed -match '^\[(.+)\]$') {
        $inPackage = ($matches[1].Trim() -eq 'package')
    } elseif ($inPackage -and -not $updatedCargo -and $lines[$i] -match '^version\s*=\s*"[^"]*"') {
        $lines[$i] = "version = `"$Version`""
        $updatedCargo = $true
    }
}

if (-not $updatedCargo) {
    throw "Unable to find [package] version field in $cargoTomlPath"
}

$cargoContent = ($lines -join "`n").TrimEnd("`n") + "`n"
[System.IO.File]::WriteAllText($cargoTomlPath, $cargoContent, $utf8NoBom)
Write-Host "Updated $cargoTomlPath to v$Version"
