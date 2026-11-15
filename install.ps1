[CmdletBinding()]
param(
    [string]$DshCli,
    [ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$Profile = 'desktop',
    [string]$Package,
    [switch]$CoreOnly
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\common.ps1')
$dsh = Find-DshCli $DshCli
$version = (& $dsh --version | Select-Object -Last 1).Trim()
if ($LASTEXITCODE -or $version -ne '0.2.1-rc.3') {
    throw "This release was tested with DSH 0.2.1-rc.3. Detected: $version"
}
$profileDir = Join-Path (Get-DshHome) "profiles\$Profile"
if (!(Test-Path -LiteralPath (Join-Path $profileDir 'package.json'))) {
    throw "Open DSH once to initialize the '$Profile' profile, exit DSH, then run this installer."
}

$local = if ($Package) { (Get-Item -LiteralPath $Package).FullName } else { $PSScriptRoot }
$spec = 'file:' + $local.Replace('\', '/')
$lock = Join-Path $profileDir 'package.json'
$original = Get-Content -LiteralPath $lock -Raw | ConvertFrom-Json
$installed = @($original.dsh.profile.bundles)
if (!$CoreOnly) {
    $bundleList = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'profiles\desktop-bundles.json') -Raw | ConvertFrom-Json
    $beforeCodex = @($bundleList | Where-Object { $_.spec -and $_.name -ne '@deepseek-ai/dsh-subagent-codex' } | ForEach-Object spec)
    $arguments = $beforeCodex + @($spec, '@deepseek-ai/dsh-subagent-codex@0.2.1-rc.3')
} else {
    $arguments = @($spec)
}
& $dsh plugin --profile $Profile add @arguments --ignore-scripts
if ($LASTEXITCODE) { throw 'DSH plugin installation failed. Check the package download and try again.' }

if (!$CoreOnly) {
    $patch = Join-Path $profileDir 'cordis.patch.yml'
    $model = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'profiles\codex-model.patch.yml') -Raw
    Set-LocalPatch $patch 'dsh-companion-pack:codex-model' $model
}
Write-Host "Installed dsh-companion-coordinator to '$Profile'. Start DSH and open Settings > World Console (世界控制台)."

