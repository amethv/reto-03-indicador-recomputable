param([switch]$Demo)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Host 'No se encontro node.exe en el PATH.' -ForegroundColor Red
  Write-Host 'Instala Node.js 22 o superior desde https://nodejs.org, abre una consola nueva y ejecuta npm.cmd ci en la carpeta del proyecto.'
  exit 1
}
$major = [int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0])
if ($major -lt 22) {
  Write-Host "Node.js $major es demasiado antiguo. Instala Node.js 22 o superior." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules/ethers'))) {
  Write-Host 'Faltan dependencias. Ejecuta npm.cmd ci --no-audit --no-fund en la carpeta del proyecto.' -ForegroundColor Red
  exit 1
}
Set-Location -LiteralPath $projectDir
$scriptName = if ($Demo) { 'demo.mjs' } else { 'start.mjs' }
Write-Host 'Abre http://127.0.0.1:8080 cuando aparezca Aplicacion. Ctrl+C detiene el servidor.'
& $nodeCommand.Source (Join-Path $PSScriptRoot $scriptName)
exit $LASTEXITCODE
