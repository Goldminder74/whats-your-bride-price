# Existing Windows CurrentUser-DPAPI custody. Never pass real values as arguments.
# Dot-source only defines the helper for local synthetic checks.
function Save-BenchmarkDriveCredentials {
    param([Parameter(Mandatory=$true)][hashtable]$Entries,
          [Parameter(Mandatory=$true)][string]$Destination)
    $taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $taskAllowed = [IO.Path]::GetFullPath((Join-Path $taskRoot 'outputs\retention-authority')) + [IO.Path]::DirectorySeparatorChar
    $taskTarget = [IO.Path]::GetFullPath($Destination)
    if (-not $taskTarget.StartsWith($taskAllowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Credential destination outside approved local custody.' }
    if (Test-Path -LiteralPath $taskTarget) { throw 'Protected file already exists; reconcile it before replacing credentials.' }
    $taskNames = @('WYBP_DRIVE_CLIENT_ID','WYBP_DRIVE_CLIENT_SECRET','WYBP_DRIVE_REFRESH_TOKEN')
    if ((($Entries.Keys | Sort-Object) -join ',') -ne (($taskNames | Sort-Object) -join ',')) { throw 'Exactly the three existing Drive credentials are required.' }
    $taskSealed = @{}
    foreach ($taskName in $taskNames) {
        if ($Entries[$taskName] -isnot [Security.SecureString]) { throw 'Masked secure input required.' }
        $taskPlain = [Net.NetworkCredential]::new('', $Entries[$taskName]).Password
        try {
            if ([string]::IsNullOrWhiteSpace($taskPlain) -or $taskPlain.Length -lt 12 -or $taskPlain -ne $taskPlain.Trim() -or $taskPlain.Contains("`r") -or $taskPlain.Contains("`n") -or $taskPlain.StartsWith('"') -or $taskPlain.EndsWith('"')) { throw 'Copy the saved value only, without quotes, labels or line breaks.' }
            if ($taskName -eq 'WYBP_DRIVE_CLIENT_ID' -and $taskPlain -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') { throw 'The saved Client ID must be the existing Google OAuth client identifier.' }
            $taskSealed[$taskName] = ConvertFrom-SecureString -SecureString $Entries[$taskName]
        } finally { $taskPlain = $null }
    }
    $taskParent = [IO.Path]::GetDirectoryName($taskTarget)
    [IO.Directory]::CreateDirectory($taskParent) | Out-Null
    $taskStaged = $taskTarget + '.writing'
    if (Test-Path -LiteralPath $taskStaged) { throw 'Interrupted encrypted write requires reconciliation.' }
    [IO.File]::WriteAllText($taskStaged, ($taskSealed | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $taskStaged -Destination $taskTarget -ErrorAction Stop
    Write-Host 'Saved encrypted local benchmark credentials. No values were displayed.'
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    $taskInputs = @{}
    try {
        Write-Host 'Use the three existing WYBP Recovery Operator values from your password manager.'
        Write-Host 'Input is masked. Do not enter an access token or authorization code.'
        foreach ($taskName in @('WYBP_DRIVE_CLIENT_ID','WYBP_DRIVE_CLIENT_SECRET','WYBP_DRIVE_REFRESH_TOKEN')) {
            $taskInputs[$taskName] = Read-Host -Prompt $taskName -AsSecureString
        }
        Save-BenchmarkDriveCredentials -Entries $taskInputs -Destination (Join-Path $PSScriptRoot '..\outputs\retention-authority\r002-renewal-20261023\drive-credentials.dpapi.json')
        Set-Clipboard -Value 'cleared'
    } finally { foreach ($taskValue in $taskInputs.Values) { $taskValue.Dispose() }; $taskInputs.Clear() }
}
