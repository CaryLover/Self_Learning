$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $projectRoot 'web'
$assets = @(
    'public/physics-fonts/NewCM10-Regular.otf',
    'public/physics-fonts/NewCMMath-Regular.otf',
    'public/physics-packages/typed-physics-0.3.0.bin',
    'public/physics-packages/cetz-0.5.2.bin',
    'public/physics-packages/oxifmt-1.0.0.bin'
)
foreach ($asset in $assets) {
    $path = Join-Path $webRoot $asset
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing probe asset: $path" }
}
Push-Location $webRoot
try {
    Write-Host 'Probe: http://127.0.0.1:5197/typst-probe.html'
    npm run dev -- --host 127.0.0.1 --port 5197 --strictPort
} finally { Pop-Location }
