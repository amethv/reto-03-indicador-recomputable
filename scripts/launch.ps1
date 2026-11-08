param([switch]$Demo)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Instala Node.js 22 o superior y ejecuta npm.cmd ci en la carpeta del proyecto.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules/ethers'))) { throw 'Faltan dependencias. Ejecuta npm.cmd ci --no-audit --no-fund en la carpeta del proyecto.' }
Set-Location -LiteralPath $projectDir
$scriptName = if ($Demo) { 'demo.mjs' } else { 'start.mjs' }
Write-Host 'Abre http://127.0.0.1:8080 cuando aparezca Aplicacion. Ctrl+C detiene el servidor.'
& $nodePath (Join-Path $PSScriptRoot $scriptName)
exit $LASTEXITCODE
