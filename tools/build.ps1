$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workspace = (Resolve-Path (Join-Path $project '..')).Path
$output = Join-Path $workspace 'outputs'
$info = Get-Content -LiteralPath (Join-Path $project 'info.json') -Raw | ConvertFrom-Json
$files = @('index.js', 'info.json', 'gameart.png', 'README.md', 'CHANGELOG.md', 'LICENSE.txt')
if ($info.name -ne 'Dead Space 3' -or $info.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid extension metadata.' }
if (($info.gameId -isnot [int] -and $info.gameId -isnot [long]) -or $info.gameId -ne 2728) { throw 'Expected numeric Nexus game ID 2728.' }
foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $project $file) -PathType Leaf)) { throw "Missing package file: $file" }
}
& node --check (Join-Path $project 'index.js')
if ($LASTEXITCODE -ne 0) { throw 'JavaScript syntax check failed.' }
Add-Type -AssemblyName System.Drawing
$art = [System.Drawing.Image]::FromFile((Join-Path $project 'gameart.png'))
try {
  if ($art.Width -ne 640 -or $art.Height -ne 360) { throw 'The game tile must be 640 by 360.' }
} finally { $art.Dispose() }
if ((Get-Item -LiteralPath (Join-Path $project 'gameart.png')).Length -gt 1MB) { throw 'The game tile exceeds 1 MB.' }
New-Item -ItemType Directory -Force -Path $output | Out-Null
$zip = Join-Path $output "dead-space-3-vortex-extension-$($info.version).zip"
if (Test-Path -LiteralPath $zip) { throw "Refusing to overwrite an existing release: $zip" }
$stage = Join-Path $project ('test-artifacts\stage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($file in $files) {
  $source = if ($file -eq 'README.md') { Join-Path $project 'docs\INSTALLATION.md' } else { Join-Path $project $file }
  Copy-Item -LiteralPath $source -Destination (Join-Path $stage $file)
}
Compress-Archive -LiteralPath ($files | ForEach-Object { Join-Path $stage $_ }) -DestinationPath $zip -CompressionLevel Optimal
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
  $actual = @($archive.Entries | ForEach-Object { $_.FullName } | Sort-Object)
  if (Compare-Object $actual @($files | Sort-Object)) { throw 'ZIP contents differ from the release file list.' }
} finally { $archive.Dispose() }
$verification = Join-Path $project ('test-artifacts\zip-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $zip -DestinationPath $verification
foreach ($file in $files) {
  $source = if ($file -eq 'README.md') { Join-Path $project 'docs\INSTALLATION.md' } else { Join-Path $project $file }
  if ((Get-FileHash -LiteralPath (Join-Path $verification $file)).Hash -ne (Get-FileHash -LiteralPath $source).Hash) {
    throw "ZIP verification failed: $file"
  }
}
$previousSource = $env:DS3_EXTENSION_SOURCE
try {
  $env:DS3_EXTENSION_SOURCE = Join-Path $verification 'index.js'
  $testOutput = & node --test (Join-Path $project 'tests\extension.test.cjs') 2>&1
  $testResult = $LASTEXITCODE
  $testOutput | Set-Content -LiteralPath (Join-Path $output "dead-space-3-vortex-extension-$($info.version)-tests.txt") -Encoding utf8
  if ($testResult -ne 0) { throw 'Packaged-source tests failed.' }
} finally { $env:DS3_EXTENSION_SOURCE = $previousSource }
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $([System.IO.Path]::GetFileName($zip))" | Set-Content -LiteralPath ($zip + '.sha256') -Encoding ascii
Copy-Item -LiteralPath (Join-Path $project 'gameart.png') -Destination (Join-Path $output 'dead-space-3-vortex-extension-gameart.png')
[pscustomobject]@{ ZIP = $zip; Bytes = (Get-Item -LiteralPath $zip).Length; SHA256 = $hash; Entries = $files; VerifiedSource = $verification } | ConvertTo-Json
