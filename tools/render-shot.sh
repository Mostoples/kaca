#!/bin/bash
BL="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
cd "C:/Users/mosto/Desktop/kaca"
for pasang in "masuk 180" "orbit 180" "panel 150" "app 180"; do
  set -- $pasang
  "$BL" -b -P tools/blender/bangun-produk.py -- --mode shot --shot $1 --frames $2 \
      --samples 48 --opaque --layar build/reel/layar.png --out build/reel > build/shot-$1.log 2>&1
  echo "$1 selesai: $(ls build/reel/shot-$1/*.jpg | wc -l) frame"
done
