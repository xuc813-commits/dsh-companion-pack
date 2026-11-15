param(
    [Parameter(Mandatory)][string]$RoleId,
    [string]$Python = 'pythonw.exe',
    [string]$Avatar
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\scripts\common.ps1')
$id = [guid]::Parse($RoleId).ToString()
$world = Join-Path (Get-DshHome) "worlds\$id"
if (!(Test-Path -LiteralPath (Join-Path $world 'world.json'))) {
    throw 'Create a role in World Console first and pass its ID.'
}
$dir = Join-Path $world ('room\' + [string][char]0x5de5 + [string][char]0x5177)
New-Item -ItemType Directory -Force -Path $dir | Out-Null
if ($Avatar) {
    if ([IO.Path]::GetExtension($Avatar) -ne '.png') { throw 'Choose a PNG avatar.' }
    Copy-Item -LiteralPath $Avatar -Destination (Join-Path $dir 'avatar.png')
}
$file = Join-Path $dir 'chatbox.py'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'chatbox.py') -Destination $file
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'danmaku_send.py') -Destination (Join-Path $dir 'danmaku_send.py')
Start-Process -FilePath $Python -ArgumentList ('"' + $file + '"') -WorkingDirectory $dir

