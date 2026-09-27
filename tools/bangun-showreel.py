#!/usr/bin/env python3
"""
==========================================================
MEDIVOX — perakit showreel sinematik 1920x1080
----------------------------------------------------------
Struktur mengikuti showcase RePulse:
  1. pembuka: lambang bercahaya muncul dari gelap
  2. empat potongan kamera bergerak hasil Blender, disambung
     crossfade, dengan keterangan kecil di kiri bawah
  3. penutup: nama produk di atas adegan yang diburamkan
  4. musik latar ambient yang disintesis ffmpeg

Bahan (dibuat lebih dulu):
  blender -b -P tools/blender/bangun-produk.py -- --mode shot --shot masuk ...
  (lihat build/render-shot.sh — shot: masuk, orbit, panel, app)

Jalankan:  python tools/bangun-showreel.py
Keluaran:  build/MEDIVOX_Showreel.mp4  (H.264 + AAC, 30 fps)
==========================================================
"""
import os, glob, shutil, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REEL = os.path.join(AKAR, 'build', 'reel')
FRAME = os.path.join(REEL, 'rakit')
KELUAR = os.path.join(AKAR, 'build', 'MEDIVOX_Showreel.mp4')

W, H, FPS = 1920, 1080, 30
SILANG = 15                       # frame crossfade antar potongan

CYAN = (94, 201, 242)
PUTIH = (236, 244, 252)
ABU = (150, 172, 198)

# potongan: (nama shot, detik, eyebrow, judul, keterangan)
POTONGAN = [
    ('masuk', 6.0, 'Perangkat', 'Satu basis. Satu prisma.',
     'MEDIVOX-1 \u00b7 volumetric review system'),
    ('orbit', 6.0, 'Pepper\u2019s ghost', 'Empat pantulan, satu bentuk.',
     'Tanpa kacamata, tanpa proyektor, tanpa headset'),
    ('panel', 5.0, 'Panel pemancar', 'Empat pandangan sekaligus.',
     'Anterior \u00b7 posterior \u00b7 lateral kiri \u00b7 lateral kanan'),
    ('app', 6.0, 'Aplikasi web', 'Dari berkas DICOM ke hologram.',
     'Diurai di peramban \u2014 piksel tidak pernah diunggah'),
]


# ---------------------------------------------------------------- huruf
def huruf(ukuran, gaya='tebal'):
    pilihan = {
        'tebal': ['Manrope-ExtraBold.ttf', 'seguisb.ttf', 'segoeuib.ttf', 'arialbd.ttf'],
        'biasa': ['Manrope-Regular.ttf', 'segoeui.ttf', 'arial.ttf'],
        'tipis': ['Manrope-Light.ttf', 'segoeuil.ttf', 'segoeui.ttf', 'arial.ttf'],
        'mono': ['consola.ttf', 'cour.ttf'],
    }[gaya]
    for nama in pilihan:
        for dasar in (os.path.join(AKAR, 'assets', 'font'), r'C:\Windows\Fonts'):
            jalur = os.path.join(dasar, nama)
            if os.path.exists(jalur):
                return ImageFont.truetype(jalur, ukuran)
    return ImageFont.load_default(ukuran)


def tulis_spasi(d, xy, teks, f, warna, spasi):
    x, y = xy
    for ch in teks:
        d.text((x, y), ch, font=f, fill=warna)
        x += d.textlength(ch, font=f) + spasi
    return x


def lebar_spasi(d, teks, f, spasi):
    return sum(d.textlength(c, font=f) + spasi for c in teks) - spasi


def mulus(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- lapisan
_TABIR = None
_VINYET = None


def tabir_kiri_bawah():
    """Bayangan gelap lembut di kiri bawah agar keterangan selalu terbaca."""
    global _TABIR
    if _TABIR is None:
        kecil = Image.new('L', (96, 54), 0)
        ImageDraw.Draw(kecil).ellipse([-40, 22, 70, 90], fill=190)
        _TABIR = kecil.filter(ImageFilter.GaussianBlur(10)).resize((W, H), Image.BICUBIC)
    return _TABIR


def keterangan(im, eyebrow, judul, sub, alfa):
    """Keterangan kiri bawah ala RePulse: eyebrow bersusun, judul, sub."""
    if alfa <= 0.01:
        return im
    gelap = Image.new('RGB', (W, H), (2, 8, 18))
    tabir = tabir_kiri_bawah().point(lambda v: int(v * alfa * 0.8))
    im = Image.composite(gelap, im, tabir)

    lap = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lap)
    a = int(255 * alfa)
    geser = int(14 * (1 - alfa))
    x, y = 120, H - 250 + geser
    d.rounded_rectangle([x, y, x + 46, y + 3], 2, fill=CYAN + (a,))
    tulis_spasi(d, (x, y + 20), eyebrow.upper(), huruf(19, 'mono'), CYAN + (a,), 6)
    d.text((x, y + 56), judul, font=huruf(52, 'tebal'), fill=PUTIH + (a,))
    d.text((x + 2, y + 128), sub, font=huruf(24, 'biasa'), fill=ABU + (a,))

    dasar = im.convert('RGBA')
    dasar.alpha_composite(lap)
    return dasar.convert('RGB')


def vinyet(im, kuat=0.55):
    """Sudut digelapkan — kesan sinematik, mata tertuju ke tengah."""
    global _VINYET
    if _VINYET is None:
        kecil = Image.new('L', (96, 54), 0)
        ImageDraw.Draw(kecil).ellipse([-18, -14, 114, 68], fill=255)
        _VINYET = kecil.filter(ImageFilter.GaussianBlur(12)).resize((W, H), Image.BICUBIC)
    campur = Image.composite(im, Image.new('RGB', (W, H)), _VINYET)
    return Image.blend(im, campur, kuat)


def batang_bioskop(im, tinggi=46):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, tinggi], fill=(0, 0, 0))
    d.rectangle([0, H - tinggi, W, H], fill=(0, 0, 0))
    return im


# ---------------------------------------------------------------- pembuka
def lambang(ukuran, cahaya):
    """Lambang M bercahaya dalam cincin, digambar besar lalu diperkecil."""
    S = ukuran * 2
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    tebal = int(S * 0.035)
    pad = int(S * 0.08)
    d.ellipse([pad, pad, S - pad, S - pad], outline=CYAN + (255,), width=tebal)
    c = S / 2
    tinggi, lebar = S * 0.30, S * 0.34
    titik = [(c - lebar / 2, c + tinggi / 2), (c - lebar / 2, c - tinggi / 2),
             (c, c + tinggi * 0.05), (c + lebar / 2, c - tinggi / 2),
             (c + lebar / 2, c + tinggi / 2)]
    d.line(titik, fill=(210, 240, 255, 255), width=int(tebal * 1.2), joint='curve')
    for p in (titik[0], titik[-1]):
        r = tebal * 0.6
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(210, 240, 255, 255))

    pijar = im.filter(ImageFilter.GaussianBlur(S * 0.045))
    hasil = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    for _ in range(max(1, int(round(cahaya * 3)))):
        hasil.alpha_composite(pijar)
    hasil.alpha_composite(im)
    return hasil.resize((ukuran, ukuran), Image.LANCZOS)


def adegan_pembuka(n, detik=3.6):
    total = int(detik * FPS)
    for i in range(total):
        t = i / total
        tampil = mulus(t / 0.45)
        redup = 1 - mulus((t - 0.82) / 0.18)
        a = tampil * redup
        ukuran = int(360 + 40 * mulus(t))
        lg = lambang(ukuran, 0.6 + 0.8 * tampil)
        lg.putalpha(lg.getchannel('A').point(lambda v: int(v * a)))
        dasar = Image.new('RGBA', (W, H), (0, 0, 0, 255))
        dasar.alpha_composite(lg, ((W - ukuran) // 2, (H - ukuran) // 2 - 30))
        im = dasar.convert('RGB')

        d = ImageDraw.Draw(im)
        teks, f = 'MEDIVOX', huruf(28, 'mono')
        ta = mulus((t - 0.35) / 0.25) * redup
        if ta > 0:
            w = lebar_spasi(d, teks, f, 14)
            tulis_spasi(d, ((W - w) / 2, H / 2 + ukuran / 2 + 6), teks, f,
                        tuple(int(v * ta) for v in PUTIH), 14)
        n = simpan(batang_bioskop(im), n)
    return n


# ---------------------------------------------------------------- potongan
def frame_shot(nama):
    berkas = sorted(glob.glob(os.path.join(REEL, 'shot-' + nama, 'f*.jpg')))
    if not berkas:
        raise SystemExit('shot %s belum dirender — jalankan build/render-shot.sh' % nama)
    return berkas


def gambar_shot(berkas, i):
    """Ambil frame ke-i; bila shot lebih pendek dari durasi, frame terakhir ditahan."""
    im = Image.open(berkas[min(i, len(berkas) - 1)]).convert('RGB')
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return vinyet(im)


def rakit_potongan(n):
    """Tiap potongan diawali crossfade dari frame terakhir potongan sebelumnya."""
    sebelumnya = None
    for nama, detik, eyebrow, judul, sub in POTONGAN:
        berkas = frame_shot(nama)
        total = int(detik * FPS)
        for i in range(total):
            bersih = gambar_shot(berkas, i)
            im = bersih
            if i < SILANG:
                asal = sebelumnya if sebelumnya is not None else Image.new('RGB', (W, H))
                im = Image.blend(asal, bersih, mulus(i / SILANG))
            t = i / total
            alfa = mulus((t - 0.12) / 0.14) * (1 - mulus((t - 0.84) / 0.12))
            im = keterangan(im, eyebrow, judul, sub, alfa)
            n = simpan(batang_bioskop(im), n)
        # crossfade berikutnya berangkat dari gambar tanpa keterangan
        sebelumnya = gambar_shot(berkas, total - 1)
    return n, sebelumnya


# ---------------------------------------------------------------- penutup
def adegan_penutup(n, latar, detik=6.2):
    total = int(detik * FPS)
    buram = ImageEnhance.Brightness(latar.filter(ImageFilter.GaussianBlur(18))).enhance(0.42)
    fj, ft = huruf(118, 'tebal'), huruf(30, 'tipis')
    fu, fk = huruf(22, 'mono'), huruf(15, 'mono')
    for i in range(total):
        t = i / total
        im = Image.blend(latar, buram, mulus(t / 0.25))
        d = ImageDraw.Draw(im)
        a1 = mulus((t - 0.12) / 0.2)
        a2 = mulus((t - 0.28) / 0.2)
        a3 = mulus((t - 0.42) / 0.2)
        k = 1 - mulus((t - 0.86) / 0.14)

        def warna(c, a):
            return tuple(int(v * a * k) for v in c)

        w = d.textlength('Medivox', font=fj)
        d.text(((W - w) / 2, H / 2 - 150), 'Medivox', font=fj, fill=warna(PUTIH, a1))
        gw = 120 * a1
        d.rounded_rectangle([(W - gw) / 2, H / 2 + 6, (W + gw) / 2 + 1, H / 2 + 9], 2,
                            fill=warna(CYAN, a1))
        tag = 'See. Speak. Understand.'
        w = d.textlength(tag, font=ft)
        d.text(((W - w) / 2, H / 2 + 30), tag, font=ft, fill=warna(PUTIH, a2))
        url = 'kaca-id.web.app'
        w = lebar_spasi(d, url, fu, 3)
        tulis_spasi(d, ((W - w) / 2, H / 2 + 94), url, fu, warna(CYAN, a3), 3)
        kecil = 'PROTOTIPE ANTARMUKA  \u00b7  BUKAN PERANGKAT MEDIS'
        w = lebar_spasi(d, kecil, fk, 4)
        tulis_spasi(d, ((W - w) / 2, H - 120), kecil, fk, warna(ABU, a3 * 0.8), 4)

        if t > 0.86:
            im = Image.blend(im, Image.new('RGB', (W, H)), mulus((t - 0.86) / 0.14))
        n = simpan(batang_bioskop(im), n)
    return n


# ---------------------------------------------------------------- audio
def musik(ffmpeg, detik, jalur):
    """Pad ambient: akor A mayor-sembilan yang bernapas pelan, disaring
    lembut, masuk dan keluar perlahan. Disintesis, tanpa berkas musik
    milik pihak lain."""
    nada = [110.00, 164.81, 220.00, 277.18, 329.63, 493.88]
    bobot = [0.26, 0.18, 0.16, 0.10, 0.09, 0.05]
    suku = []
    for i, (f, b) in enumerate(zip(nada, bobot)):
        laju = 0.07 + i * 0.023
        suku.append('%.3f*sin(2*PI*%.2f*t)*(0.72+0.28*sin(2*PI*%.3f*t+%d))' % (b, f, laju, i))
    saring = ('lowpass=f=1700,aecho=0.8:0.7:420|830:0.28|0.18,'
              'afade=t=in:st=0:d=2.5,afade=t=out:st=%.2f:d=3.2,volume=1.6' % (detik - 3.2))
    subprocess.run([ffmpeg, '-y', '-v', 'error', '-f', 'lavfi',
                    '-i', 'aevalsrc=%s:s=48000:d=%.2f' % ('+'.join(suku), detik),
                    '-af', saring, '-ac', '2', '-c:a', 'aac', '-b:a', '192k', jalur],
                   check=True)


# ---------------------------------------------------------------- perakitan
def simpan(im, n):
    im.save(os.path.join(FRAME, 'r%05d.jpg' % n), 'JPEG', quality=94)
    return n + 1


def cari_ffmpeg():
    ada = shutil.which('ffmpeg')
    if ada:
        return ada
    pola = os.path.expandvars(
        r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\*FFmpeg*\**\bin\ffmpeg.exe')
    for jalur in glob.glob(pola, recursive=True):
        return jalur
    return None


def bangun():
    if os.path.isdir(FRAME):
        shutil.rmtree(FRAME)
    os.makedirs(FRAME)
    n = adegan_pembuka(0)
    n, akhir = rakit_potongan(n)
    n = adegan_penutup(n, akhir)
    print('frame dirakit: %d (%.1f detik)' % (n, n / FPS))
    return n


def encode(n):
    ff = cari_ffmpeg()
    if not ff:
        raise SystemExit('ffmpeg tidak ditemukan')
    audio = os.path.join(REEL, 'musik.m4a')
    musik(ff, n / FPS, audio)
    subprocess.run([ff, '-y', '-v', 'error', '-framerate', str(FPS),
                    '-i', os.path.join(FRAME, 'r%05d.jpg'), '-i', audio,
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
                    '-pix_fmt', 'yuv420p', '-c:a', 'copy',
                    '-shortest', '-movflags', '+faststart', KELUAR], check=True)
    print('video: %s (%.1f MB)' % (KELUAR, os.path.getsize(KELUAR) / 1048576))


if __name__ == '__main__':
    encode(bangun())
