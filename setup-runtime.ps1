[CmdletBinding()]
param(
    [string]$Python,
    [string]$FfmpegDirectory,
    [string]$QqExecutable,
    [string]$SnowLumaDirectory,
    [string]$SnowLumaNode,
    [string]$WechatExecutable,
    [switch]$BuildWindowsWechat
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\common.ps1')
$data = Join-Path (Get-DshHome) 'companion'
$tmp = Join-Path $data 'tmp'
New-Item -ItemType Directory -Force -Path $data,$tmp | Out-Null
$oldTemp, $oldTmp = $env:TEMP, $env:TMP
$env:TEMP = $env:TMP = $tmp
try {
    $settings = Join-Path $data 'runtime.json'
    $config = @{}
    if (Test-Path -LiteralPath $settings) {
        (Get-Content -LiteralPath $settings -Raw | ConvertFrom-Json).PSObject.Properties |
            ForEach-Object { $config[$_.Name] = $_.Value }
    }

    if ($Python) { $config.python = (Get-Item -LiteralPath $Python).FullName }
    $embedded = Join-Path $data 'runtime\python'
    if (!$config.python -and !(Test-Path -LiteralPath (Join-Path $embedded 'python.exe'))) {
        $zip = Join-Path $tmp 'python-3.12.10-embed-amd64.zip'
        Invoke-WebRequest -UseBasicParsing -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' -OutFile $zip
        if ((Get-FileHash -LiteralPath $zip).Hash -ne '4ACBED6DD1C744B0376E3B1CF57CE906F9DC9E95E68824584C8099A63025A3C3') {
            throw 'Python archive checksum mismatch.'
        }
        Expand-Archive -LiteralPath $zip -DestinationPath $embedded -Force
    }

    if ($FfmpegDirectory) {
        $config.ffmpeg = (Get-Item -LiteralPath (Join-Path $FfmpegDirectory 'ffmpeg.exe')).FullName
        $config.ffprobe = (Get-Item -LiteralPath (Join-Path $FfmpegDirectory 'ffprobe.exe')).FullName
    }
    if ($QqExecutable) { $config.qq = (Get-Item -LiteralPath $QqExecutable).FullName }
    if ($WechatExecutable) { $config.wechat = (Get-Item -LiteralPath $WechatExecutable).FullName }
    if ($SnowLumaDirectory) {
        $config.snowluma = (Get-Item -LiteralPath $SnowLumaDirectory).FullName
        $config.snowlumaNode = (Get-Item -LiteralPath $SnowLumaNode).FullName
        $eula = Join-Path $config.snowluma 'EULA.md'
        $privacy = Join-Path $config.snowluma 'PRIVACY.md'
        $receipt = @{
            eula=(Get-FileHash -LiteralPath $eula).Hash.ToLowerInvariant()
            privacy=(Get-FileHash -LiteralPath $privacy).Hash.ToLowerInvariant()
        }
        Write-Host "Read these files before consenting:" $eula $privacy
        if ((Read-Host 'Type ACCEPT if you have read and accept both documents') -cne 'ACCEPT') {
            throw 'SnowLuma setup requires operator consent.'
        }
        $qqData = Join-Path $data 'platforms\qq-data'
        New-Item -ItemType Directory -Force -Path $qqData | Out-Null
        [IO.File]::WriteAllText((Join-Path $qqData 'consent.json'), ($receipt | ConvertTo-Json))
    }

    if ($BuildWindowsWechat) {
        if (!$config.python) { throw 'Pass -Python pointing to a full Python 3.12 installation with pip.' }
        $windows = Join-Path $PSScriptRoot 'vendor\dsh-world\src\ecosystem\wechat\windows'
        & $config.python -m pip install -r (Join-Path $windows 'requirements.txt')
        if ($LASTEXITCODE) { throw 'Could not install Windows WeChat Python dependencies.' }
        & (Join-Path $windows 'engine\build.ps1') -OutputDirectory (Join-Path $data 'platforms\wechat\engine')
    }

    [IO.File]::WriteAllText($settings, ($config | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    Write-Host "Runtime settings saved in $settings. Restart DSH to load them."
} finally {
    $env:TEMP, $env:TMP = $oldTemp, $oldTmp
}

