#!/bin/bash
# Render every showreel shot with Blender CLI (white studio).
# Frames go to build/reel2/shot-*/ (JPEG), plus jejak.json overlay data
# for the scenes with people and the exploded view.
BL="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
cd "$(dirname "$0")/.."
SAMPEL=${SAMPEL:-24}
python tools/layar-mockup.py
for pasang in "masuk 150 -" "orbit 150 -" "panel 120 -" "ledak 180 ledak" "tim 180 tim" "gestur 150 gestur" "suara 150 suara" "ekosistem 180 m" "laptop 150 m" "ponsel 150 m"; do
  set -- $pasang
  ekstra=""
  [ "$3" = "m" ] && ekstra="--layar-laptop build/reel2/layar-laptop.png --layar-ponsel build/reel2/layar-ponsel.png"
  [ "$3" != "m" ] && [ "$3" != "-" ] && ekstra="--adegan $3"
  mulai=$(date +%s)
  "$BL" -b -P tools/blender/bangun-produk.py -- --mode shot --shot $1 --frames $2 \
      --samples $SAMPEL --putih --studio $ekstra --out build/reel2 > build/reel2/log-$1.txt 2>&1
  echo "$1 done: $(ls build/reel2/shot-$1/*.jpg 2>/dev/null | wc -l) frames, $(( $(date +%s) - mulai )) s"
done
