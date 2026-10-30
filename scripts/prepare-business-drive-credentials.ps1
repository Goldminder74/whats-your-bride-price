# Reuse the existing CurrentUser-DPAPI client pair; collect only the new business refresh token.
# Never pass real credential values as arguments. Dot-sourcing defines the helper only.
function Save-BusinessDriveRefreshCredential {
    param([Parameter(Mandatory=$true)][string]$Source,
          [Parameter(Mandatory=$true)][string]$Destination,
          [Parameter(Mandatory=$true)][Security.SecureString]$RefreshToken)
    $taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $taskAllowed = [IO.Path]::GetFullPath((Join-Path $taskRoot 'outputs\retention-authority')) + [IO.Path]::DirectorySeparatorChar
    $taskSource = [IO.Path]::GetFullPath($Source)
    $taskTarget = [IO.Path]::GetFullPath($Destination)
    if (-not $taskSource.StartsWith($taskAllowed,[StringComparison]::OrdinalIgnoreCase) -or -not $taskTarget.StartsWith($taskAllowed,[StringComparison]::OrdinalIgnoreCase) -or $taskSource -eq $taskTarget) { throw 'Use separate source and destination within approved local custody.' }
    if (-not (Test-Path -LiteralPath $taskSource -PathType Leaf) -or (Test-Path -LiteralPath ($taskSource + '.writing'))) { throw 'Existing encrypted client source is missing or interrupted.' }
    if ((Test-Path -LiteralPath $taskTarget) -or (Test-Path -LiteralPath ($taskTarget + '.writing'))) { throw 'Business credential destination already exists or was interrupted; reconcile it before continuing.' }
    if ((Get-Item -LiteralPath $taskSource).Length -gt 65536) { throw 'Existing encrypted client source is invalid.' }
    $taskClients = @{}
    try {
        try {
            $taskSaved = [IO.File]::ReadAllText($taskSource) | ConvertFrom-Json -ErrorAction Stop
            $taskNames = @('WYBP_DRIVE_CLIENT_ID','WYBP_DRIVE_CLIENT_SECRET','WYBP_DRIVE_REFRESH_TOKEN')
            if ((($taskSaved.PSObject.Properties.Name | Sort-Object) -join ',') -ne (($taskNames | Sort-Object) -join ',')) { throw 'shape' }
            foreach ($taskName in @('WYBP_DRIVE_CLIENT_ID','WYBP_DRIVE_CLIENT_SECRET')) {
                $taskCipher = $taskSaved.$taskName
                if ($taskCipher -isnot [string] -or $taskCipher -notmatch '^01000000d08c9ddf0115d1118c7a00c04fc297eb[0-9a-fA-F]+$') { throw 'format' }
                $taskClients[$taskName] = ConvertTo-SecureString -String $taskCipher -ErrorAction Stop
                $taskPlain = [Net.NetworkCredential]::new('', $taskClients[$taskName]).Password
                try {
                    if ([string]::IsNullOrWhiteSpace($taskPlain) -or $taskPlain.Length -lt 12 -or $taskPlain -ne $taskPlain.Trim() -or $taskPlain.Contains("`r") -or $taskPlain.Contains("`n") -or $taskPlain.StartsWith('"') -or $taskPlain.EndsWith('"')) { throw 'value' }
                    if ($taskName -eq 'WYBP_DRIVE_CLIENT_ID' -and $taskPlain -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') { throw 'client' }
                } finally { $taskPlain = $null }
            }
        } catch { throw 'Existing client pair cannot be verified using this Windows user. No credentials were changed.' }
        $taskPlain = [Net.NetworkCredential]::new('', $RefreshToken).Password
        try {
            if ([string]::IsNullOrWhiteSpace($taskPlain) -or $taskPlain.Length -lt 20 -or $taskPlain.Length -gt 8192 -or $taskPlain -ne $taskPlain.Trim() -or $taskPlain -notmatch '^1//[A-Za-z0-9_-]+$') { throw 'Enter only the business-account Refresh token, beginning 1//, without quotes, labels or line breaks.' }
        } finally { $taskPlain = $null }
        $taskSealed = @{
            WYBP_DRIVE_CLIENT_ID = $taskSaved.WYBP_DRIVE_CLIENT_ID
            WYBP_DRIVE_CLIENT_SECRET = $taskSaved.WYBP_DRIVE_CLIENT_SECRET
            WYBP_DRIVE_REFRESH_TOKEN = ConvertFrom-SecureString -SecureString $RefreshToken
        }
        $taskParent = [IO.Path]::GetDirectoryName($taskTarget)
        [IO.Directory]::CreateDirectory($taskParent) | Out-Null
        $taskStage = $taskTarget + '.writing'
        # Exclusive creation plus non-overwriting rename retains crash evidence and refuses races.
        $taskStream = [IO.File]::Open($taskStage,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try {
            $taskBytes = [Text.UTF8Encoding]::new($false).GetBytes(($taskSealed | ConvertTo-Json -Compress))
            $taskStream.Write($taskBytes,0,$taskBytes.Length)
            $taskStream.Flush($true)
        } finally { $taskStream.Dispose() }
        [IO.File]::Move($taskStage,$taskTarget)
        Write-Host 'Saved encrypted business Drive credentials. Existing client pair and old source preserved. Identity and paid custody still need verification.'
    } finally {
        foreach ($taskValue in $taskClients.Values) { $taskValue.Dispose() }
        $taskClients.Clear()
        $taskSaved = $null
        $taskSealed = $null
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    $taskRefresh = $null
    try {
        Write-Host 'Use the NEW Refresh token authorised by backup-operator@classesforculture.com with the EXISTING WYBP Recovery Operator client.'
        Write-Host 'Only this new token is requested. Do not enter an access token, code, client secret, password or old personal-account refresh token.'
        $taskRefresh = Read-Host -Prompt 'Business-account Refresh token (masked)' -AsSecureString
        Save-BusinessDriveRefreshCredential -Source (Join-Path $PSScriptRoot '..\outputs\retention-authority\r002-renewal-20261023\drive-credentials.dpapi.json') -Destination (Join-Path $PSScriptRoot '..\outputs\retention-authority\business-workspace-20261030\drive-credentials.dpapi.json') -RefreshToken $taskRefresh
        Set-Clipboard -Value 'cleared'
    } finally { if ($null -ne $taskRefresh) { $taskRefresh.Dispose() } }
}
