#!/usr/bin/env python3
"""
MEDIVOX — optimasi kit aset hasil Blender untuk web.

  build/kit/ikon/*.png     -> assets/ui/ikon/*.webp      (128 px, alfa)
  build/kit/ornamen/*.png  -> assets/ui/ornamen/*.webp   (alfa)
  build/kit/pola/*.png     -> assets/ui/pola/*.webp      (relief -> lapisan alfa)
  build/putih*/*.png       -> assets/3d/putih-*.webp     (produk putih, alfa)

Pola dirender sebagai relief putih di bawah cahaya menyamping. Di web ia
tidak ditempel apa adanya, melainkan diubah jadi lapisan: bagian yang
lebih gelap dari bidang datar menjadi bayangan navy transparan, yang lebih
terang menjadi sorotan putih transparan. Hasilnya bisa diletakkan di atas
warna latar apa pun tanpa mengubah warna kartunya.
"""
import os, glob, statistics
from PIL import Image

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(AKAR, 'build', 'kit')
UI = os.path.join(AKAR, 'assets', 'ui')
TIGA_D = os.path.join(AKAR, 'assets', '3d')


def simpan(im, jalur, kualitas=88):
    os.makedirs(os.path.dirname(jalur), exist_ok=True)
    im.save(jalur, 'WEBP', quality=kualitas, method=6)
    return os.path.getsize(jalur)


def perkecil(im, lebar):
    if im.width <= lebar:
        return im
    return im.resize((lebar, round(im.height * lebar / im.width)), Image.LANCZOS)


def potong_alfa(im, pad=0.04):
    """Buang tepi transparan kosong supaya ukuran tampil bisa diatur CSS."""
    kotak = im.getchannel('A').getbbox()
    if not kotak:
        return im
    x0, y0, x1, y1 = kotak
    p = int(max(im.size) * pad)
    return im.crop((max(0, x0 - p), max(0, y0 - p), min(im.width, x1 + p), min(im.height, y1 + p)))


def pola_ke_lapisan(im, kuat=5.5):
    abu = im.convert('L')
    data = list(abu.getdata())
    tengah = statistics.median(data)
    keluar = []
    for v in data:
        d = v - tengah
        if d < 0:
            keluar.append((18, 44, 80, min(255, int(-d * kuat))))       # bayangan navy
        else:
            keluar.append((255, 255, 255, min(255, int(d * kuat * 1.6))))  # sorotan
    lap = Image.new('RGBA', im.size)
    lap.putdata(keluar)
    return lap


def main():
    total_a = total_b = 0

    for f in sorted(glob.glob(os.path.join(KIT, 'ikon', '*.png'))):
        im = Image.open(f).convert('RGBA')
        total_a += os.path.getsize(f)
        total_b += simpan(perkecil(im, 128),
                          os.path.join(UI, 'ikon', os.path.basename(f)[:-4] + '.webp'), 92)

    for f in sorted(glob.glob(os.path.join(KIT, 'ornamen', '*.png'))):
        nama = os.path.basename(f)[:-4]
        im = Image.open(f).convert('RGBA')
        im = perkecil(im, 1800) if nama == 'hero-latar' else perkecil(potong_alfa(im), 520)
        total_a += os.path.getsize(f)
        total_b += simpan(im, os.path.join(UI, 'ornamen', nama + '.webp'), 86)

    for f in sorted(glob.glob(os.path.join(KIT, 'pola', '*.png'))):
        im = perkecil(Image.open(f), 600)
        total_a += os.path.getsize(f)
        total_b += simpan(pola_ke_lapisan(im), os.path.join(UI, 'pola', os.path.basename(f)[:-4] + '.webp'), 80)

    putih = {os.path.join(AKAR, 'build', 'putih', 'medivox-%s.png' % n): 'putih-%s' % n
             for n in ('hero', 'tigaper', 'samping', 'atas', 'dekat')}
    putih[os.path.join(AKAR, 'build', 'putih-toraks', 'medivox-hero.png')] = 'putih-toraks'
    putih[os.path.join(AKAR, 'build', 'putih-tengkorak', 'medivox-hero.png')] = 'putih-tengkorak'
    for f, nama in putih.items():
        if not os.path.exists(f):
            continue
        im = perkecil(potong_alfa(Image.open(f).convert('RGBA'), 0.03), 1300)
        total_a += os.path.getsize(f)
        total_b += simpan(im, os.path.join(TIGA_D, nama + '.webp'), 88)

    print('kit dioptimasi: %.1f MB -> %.2f MB' % (total_a / 1048576, total_b / 1048576))


if __name__ == '__main__':
    main()
