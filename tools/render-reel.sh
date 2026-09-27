#!/bin/bash
# Render seluruh shot showreel putih (perangkat keras + aplikasi) dengan Blender CLI.
# Frame JPEG ke build/reel2/shot-*/; lalu jalankan tools/bangun-showreel.py.
BL="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
cd "$(dirname "$0")/.."
SAMPEL=${SAMPEL:-24}
for pasang in "masuk 150 -" "orbit 150 -" "panel 120 -" "ekosistem 180 m" "laptop 150 m" "ponsel 150 m"; do
  set -- $pasang
  ekstra=""
  [ "$3" = "m" ] && ekstra="--layar-laptop build/reel2/layar-laptop.png --layar-ponsel build/reel2/layar-ponsel.png"
  mulai=$(date +%s)
  "$BL" -b -P tools/blender/bangun-produk.py -- --mode shot --shot $1 --frames $2 \
      --samples $SAMPEL --putih --studio $ekstra --out build/reel2 > build/reel2/log-$1.txt 2>&1
  echo "$1 selesai: $(ls build/reel2/shot-$1/*.jpg | wc -l) frame, $(( $(date +%s) - mulai )) dtk"
done
