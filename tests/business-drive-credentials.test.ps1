# Synthetic values only. Never reads the real saved client source or makes network calls.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\prepare-business-drive-credentials.ps1')
$testRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\outputs\retention-authority'))
$testFolder = Join-Path $testRoot ('synthetic-business-credentials-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testFolder) | Out-Null
$testChecks = 0
function Assert-Condition($Value,$Message) { if (-not $Value) { throw $Message }; $script:testChecks++ }
function Assert-Rejected($Action) { $testRejected=$false; try { & $Action } catch { $testRejected=$true }; Assert-Condition $testRejected 'Expected safe refusal.' }
function New-SyntheticSecure([string]$Value) { ConvertTo-SecureString -String $Value -AsPlainText -Force }
$testSecrets = @()
try {
    $testSource = Join-Path $testFolder 'original.dpapi.json'
    $testTarget = Join-Path $testFolder 'business.dpapi.json'
    $testID = New-SyntheticSecure 'synthetic-client.apps.googleusercontent.com'
    $testClient = New-SyntheticSecure 'synthetic-client-secret-only'
    $testOld = New-SyntheticSecure '1//synthetic-personal-old-token'
    $testNew = New-SyntheticSecure '1//synthetic-business-new-token'
    $testSecrets = @($testID,$testClient,$testOld,$testNew)
    $testSealed = @{WYBP_DRIVE_CLIENT_ID=(ConvertFrom-SecureString $testID);WYBP_DRIVE_CLIENT_SECRET=(ConvertFrom-SecureString $testClient);WYBP_DRIVE_REFRESH_TOKEN=(ConvertFrom-SecureString $testOld)}
    [IO.File]::WriteAllText($testSource,($testSealed | ConvertTo-Json -Compress))
    $testOriginal = [IO.File]::ReadAllText($testSource)
    $testOutput = (& { Save-BusinessDriveRefreshCredential -Source $testSource -Destination $testTarget -RefreshToken $testNew } 6>&1 | Out-String)
    Assert-Condition ($testOutput -notmatch '1//|synthetic-client') 'Output must never contain synthetic credential values.'
    Assert-Condition ([IO.File]::ReadAllText($testSource) -ceq $testOriginal) 'Original sealed file must be unchanged.'
    Assert-Condition (-not (Test-Path -LiteralPath ($testTarget + '.writing'))) 'Successful write must finish staging.'
    $testSaved = [IO.File]::ReadAllText($testTarget) | ConvertFrom-Json
    Assert-Condition ($testSaved.WYBP_DRIVE_CLIENT_ID -ceq $testSealed.WYBP_DRIVE_CLIENT_ID) 'Client identifier must be reused unchanged.'
    Assert-Condition ($testSaved.WYBP_DRIVE_CLIENT_SECRET -ceq $testSealed.WYBP_DRIVE_CLIENT_SECRET) 'Client secret must be reused unchanged.'
    $testRecovered = ConvertTo-SecureString $testSaved.WYBP_DRIVE_REFRESH_TOKEN
    try { Assert-Condition (([Net.NetworkCredential]::new('',$testRecovered).Password) -ceq '1//synthetic-business-new-token') 'New token must round-trip with CurrentUser DPAPI.' } finally { $testRecovered.Dispose() }
    Assert-Condition ([IO.File]::ReadAllText($testTarget) -notmatch 'synthetic|1//') 'Stored JSON must contain only encrypted values.'
    $testFinal = [IO.File]::ReadAllText($testTarget)
    Assert-Rejected { Save-BusinessDriveRefreshCredential -Source $testSource -Destination $testTarget -RefreshToken $testOld }
    Assert-Condition ([IO.File]::ReadAllText($testTarget) -ceq $testFinal) 'Retry must not overwrite saved business credentials.'
    $testInterrupted = Join-Path $testFolder 'interrupted.dpapi.json'
    [IO.File]::WriteAllText(($testInterrupted + '.writing'),'synthetic interruption')
    Assert-Rejected { Save-BusinessDriveRefreshCredential -Source $testSource -Destination $testInterrupted -RefreshToken $testNew }
    Assert-Condition (-not (Test-Path -LiteralPath $testInterrupted)) 'Interrupted destination must remain unreconciled.'
    Assert-Rejected { Save-BusinessDriveRefreshCredential -Source $testSource -Destination $testSource -RefreshToken $testNew }
    Assert-Rejected { Save-BusinessDriveRefreshCredential -Source $testSource -Destination (Join-Path $testFolder '..\..\outside.dpapi.json') -RefreshToken $testNew }
    Assert-Rejected { Save-BusinessDriveRefreshCredential -Source (Join-Path $testFolder 'missing.dpapi.json') -Destination (Join-Path $testFolder 'missing-out.dpapi.json') -RefreshToken $testNew }
    foreach ($testBad in @('ya29.synthetic-access-token','4/synthetic-code','"1//synthetic-quoted-token"',"1//synthetic-token`n")) {
        $testBadSecure = New-SyntheticSecure $testBad
        try { Assert-Rejected { Save-BusinessDriveRefreshCredential -Source $testSource -Destination (Join-Path $testFolder 'bad.dpapi.json') -RefreshToken $testBadSecure } } finally { $testBadSecure.Dispose() }
    }
    $testMalformed = Join-Path $testFolder 'malformed.dpapi.json'
    [IO.File]::WriteAllText($testMalformed,'{"WYBP_DRIVE_CLIENT_ID":"plain-synthetic-value"}')
    Assert-Rejected { Save-BusinessDriveRefreshCredential -Source $testMalformed -Destination (Join-Path $testFolder 'malformed-out.dpapi.json') -RefreshToken $testNew }
    [IO.File]::WriteAllText(($testSource + '.writing'),'synthetic interruption')
    Assert-Rejected { Save-BusinessDriveRefreshCredential -Source $testSource -Destination (Join-Path $testFolder 'source-interrupted-out.dpapi.json') -RefreshToken $testNew }
    Write-Host ('PASS ' + $testChecks + ' synthetic secure-collector checks. No real credential files or network accessed.')
} finally {
    foreach ($testSecret in $testSecrets) { $testSecret.Dispose() }
    # Check the exact synthetic target before recursive cleanup; no computed out-of-workspace deletion.
    $testResolved = [IO.Path]::GetFullPath($testFolder)
    if ($testResolved.StartsWith(($testRoot + [IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($testResolved) -match '^synthetic-business-credentials-[a-f0-9]{32}$') { Remove-Item -LiteralPath $testResolved -Recurse -Force }
}
