$ErrorActionPreference = "Stop"
$pptx = (Resolve-Path "build\MEDIVOX_Deck.pptx").Path
$dir  = Join-Path (Split-Path $pptx) "deck\png"
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Open($pptx, $true, $false, $false)
$pres.SaveCopyAs($dir + "\slide.png", 18)   # 18 = ppSaveAsPNG
$pres.Close(); $app.Quit()
Get-ChildItem $dir -Recurse -Filter *.PNG | Select-Object -First 3 | ForEach-Object { $_.FullName }
