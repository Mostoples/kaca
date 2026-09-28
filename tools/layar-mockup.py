#!/usr/bin/env python3
"""
MEDIVOX — tekstur layar untuk mockup perangkat (Blender & showreel).

  layar-laptop.png  tangkapan viewer desktop 16:10
  layar-ponsel.png  tangkapan aplikasi seluler dibingkai sebagai layar Android:
                    bilah status (jam, sinyal, Wi-Fi, baterai), kamera
                    punch-hole di tengah atas, dan gesture bar di bawah

Bahan: build/foto/t-*.png (lihat tools/foto-tex.json)
Jalankan: python tools/layar-mockup.py
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTO = os.path.join(AKAR, 'build', 'foto')
KELUAR = os.path.join(AKAR, 'build', 'reel2')

RASIO_PONSEL = 0.4346          # lebar/tinggi area layar ponsel 20:9 di Blender


def huruf(ukuran):
    for j in (os.path.join(AKAR, 'build', 'font', 'Manrope.ttf'), r'C:\Windows\Fonts\segoeuib.ttf'):
        if os.path.exists(j):
            f = ImageFont.truetype(j, ukuran)
            try:
                f.set_variation_by_axes([700])
            except Exception:
                pass
            return f
    return ImageFont.load_default()


def layar_android(sumber, tinggi=1760, gelap=False):
    """Bingkai tangkapan seluler sebagai layar Android 20:9."""
    lebar = int(round(tinggi * RASIO_PONSEL))
    im = Image.open(sumber).convert('RGB')
    status, gestur = int(tinggi * 0.030), int(tinggi * 0.022)
    isi_t = tinggi - status - gestur
    isi = im.resize((lebar, int(im.height * lebar / im.width)), Image.LANCZOS).crop((0, 0, lebar, isi_t))
    latar = (10, 14, 22) if gelap else isi.getpixel((lebar // 2, 2))
    kan = Image.new('RGB', (lebar, tinggi), latar)
    kan.paste(isi, (0, status))
    d = ImageDraw.Draw(kan)
    tinta = (235, 242, 250) if gelap else (19, 41, 75)
    f = huruf(int(status * 0.52))
    d.text((int(lebar * 0.07), int(status * 0.22)), '10:08', font=f, fill=tinta)
    # kamera punch-hole
    r = int(status * 0.30)
    cx, cy = lebar // 2, status // 2 + 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(4, 6, 10))
    # sinyal, Wi-Fi, baterai di kanan
    x = lebar - int(lebar * 0.07)
    by = int(status * 0.30)
    bw, bh = int(status * 0.62), int(status * 0.36)
    d.rounded_rectangle([x - bw, by, x, by + bh], 3, outline=tinta, width=2)
    d.rectangle([x - bw + 3, by + 3, x - bw + int(bw * 0.78), by + bh - 3], fill=tinta)
    x -= bw + int(status * 0.35)
    for i in range(4):
        h = int(bh * (0.35 + 0.22 * i))
        d.rectangle([x - 16 + i * 5, by + bh - h, x - 13 + i * 5, by + bh], fill=tinta)
    x -= int(status * 0.75)
    d.pieslice([x - 14, by - 2, x + 14, by + bh + 12], 225, 315, fill=tinta)
    # gesture bar
    gy = tinggi - gestur // 2
    pw = int(lebar * 0.30)
    d.rectangle([0, tinggi - gestur, lebar, tinggi], fill=latar)
    d.rounded_rectangle([lebar // 2 - pw // 2, gy - 4, lebar // 2 + pw // 2, gy + 4], 4, fill=tinta)
    return kan


def main():
    os.makedirs(KELUAR, exist_ok=True)
    Image.open(os.path.join(FOTO, 't-viewer.png')).convert('RGB').save(os.path.join(KELUAR, 'layar-laptop.png'))
    sumber = sys.argv[1] if len(sys.argv) > 1 else 't-worklist-m.png'
    layar_android(os.path.join(FOTO, sumber)).save(os.path.join(KELUAR, 'layar-ponsel.png'))
    print('tekstur layar siap di', KELUAR)


if __name__ == '__main__':
    main()
