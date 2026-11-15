function Find-DshCli([string]$Hint) {
    if ($Hint) { return (Get-Item -LiteralPath $Hint -ErrorAction Stop).FullName }
    $cli = Get-Command dsh.cmd -CommandType Application -ErrorAction SilentlyContinue
    if ($cli) { return $cli.Source }
    foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles)) {
        if (!$base) { continue }
        $candidate = Join-Path $base 'DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw 'Specify -DshCli with the full path to resources\runtime\cli\bin\dsh.cmd in your DSH installation.'
}

function Get-DshHome {
    if ($env:DSH_HOME) { return [IO.Path]::GetFullPath($env:DSH_HOME) }
    return (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh')
}

function Set-LocalPatch([string]$File, [string]$Key, [string]$Contents) {
    $before = if (Test-Path -LiteralPath $File) { [IO.File]::ReadAllText($File) } else { '' }
    $tag = [regex]::Escape($Key)
    $before = [regex]::Replace($before, "(?ms)^# <$tag>\r?\n.*?^# </$tag>\r?\n?", '')
    if ($before -match '^(?s)(?:\s*#[^\r\n]*(?:\r?\n|$))*\s*\[\]\s*$') {
        $before = $before -replace '\[\]\s*$', ''
    }
    $next = $before.TrimEnd() + [Environment]::NewLine + "# <$Key>" +
        [Environment]::NewLine + $Contents.Trim() + [Environment]::NewLine +
        "# </$Key>" + [Environment]::NewLine
    [IO.File]::WriteAllText($File, $next, [Text.UTF8Encoding]::new($false))
}

