#!/usr/bin/env python3
"""
==========================================================
MEDIVOX — perakit showreel 1920x1080 (perangkat keras + aplikasi)
----------------------------------------------------------
Film berbahasa Inggris, putih-bersih futuristik, bernada lebih
redup, dengan alur cerita:

  01 BACKGROUND   persoalan: volume 3D dibaca sebagai tumpukan irisan
  02 THE PRODUCT  MEDIVOX-1 di studio siklorama (masuk, orbit, panel)
  03 FEATURES     ekosistem, laptop, web, alur kerja, Android,
                  seluler, dan kartu fitur

Tiap bab dibuka kartu judul navy. Adegan perangkat keras adalah
shot Blender; adegan perangkat lunak dianimasikan di sini dengan
mockup laptop dan ponsel Android berisi tangkapan UI asli.

Bahan (dibuat lebih dulu):
  node --experimental-websocket tools/foto-cdp.js tools/foto-tex.json   -> build/foto/t-*.png
  python tools/layar-mockup.py                                          -> tekstur layar
  bash tools/render-reel.sh                                             -> build/reel2/shot-*/

Jalankan:  python tools/bangun-showreel.py            (film lengkap)
           python tools/bangun-showreel.py --app      (bab fitur saja)
Keluaran:  build/MEDIVOX_Showreel.mp4 / build/MEDIVOX_App_Mockup.mp4
==========================================================
"""
import os, sys, glob, math, shutil, subprocess, importlib.util
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REEL = os.path.join(AKAR, 'build', 'reel2')
FOTO = os.path.join(AKAR, 'build', 'foto')
UI = os.path.join(AKAR, 'assets', 'ui')
HANYA_APP = '--app' in sys.argv
FRAME = os.path.join(REEL, 'rakit-app' if HANYA_APP else 'rakit')
KELUAR = os.path.join(AKAR, 'build', 'MEDIVOX_App_Mockup.mp4' if HANYA_APP else 'MEDIVOX_Showreel.mp4')

W, H, FPS = 1920, 1080, 30
SILANG = 14

# palet: latar sedikit lebih dalam daripada web supaya video tidak menyilaukan
BG = (226, 233, 243)
NAVY = (19, 41, 75)
NAVY_DALAM = (9, 20, 40)
TEKS2 = (61, 90, 130)
MUTED = (90, 114, 144)
BIRU = (47, 111, 208)
CYAN = (94, 201, 242)

_spec = importlib.util.spec_from_file_location('lm', os.path.join(AKAR, 'tools', 'layar-mockup.py'))
LM = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(LM)


# ---------------------------------------------------------------- huruf
def huruf(ukuran, berat=800):
    jalur = os.path.join(AKAR, 'build', 'font', 'Manrope.ttf')
    if os.path.exists(jalur):
        f = ImageFont.truetype(jalur, ukuran)
        try:
            f.set_variation_by_axes([berat])
        except Exception:
            pass
        return f
    nama = 'segoeuib.ttf' if berat >= 600 else ('segoeuil.ttf' if berat <= 300 else 'segoeui.ttf')
    return ImageFont.truetype(os.path.join(r'C:\Windows\Fonts', nama), ukuran)


def mono(ukuran):
    jalur = os.path.join(AKAR, 'build', 'font', 'JetBrainsMono-Medium.ttf')
    if os.path.exists(jalur):
        return ImageFont.truetype(jalur, ukuran)
    return ImageFont.truetype(r'C:\Windows\Fonts\consola.ttf', ukuran)


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


def keluar_cepat(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def muncul(t, a, b, pudar=0.1):
    """Alfa yang naik setelah a dan turun menjelang b."""
    return keluar_cepat((t - a) / 0.14) * (1 - mulus((t - (b - pudar)) / pudar))


# ---------------------------------------------------------------- nuansa
_VINYET = None


def vinyet(im):
    """Sudut digelapkan lembut dengan navy: mata tertuju ke tengah dan
    bidang putih tidak terasa menyilaukan."""
    global _VINYET
    if _VINYET is None:
        kecil = Image.new('L', (96, 54), 0)
        ImageDraw.Draw(kecil).ellipse([-22, -18, 118, 72], fill=255)
        topeng = kecil.filter(ImageFilter.GaussianBlur(11)).resize((W, H), Image.BICUBIC)
        _VINYET = topeng.point(lambda v: 255 - int((255 - v) * 0.30))
    return Image.composite(im, Image.new('RGB', (W, H), NAVY_DALAM), _VINYET)


def grade_shot(im):
    """Render Blender sedikit diredupkan dan diberi kontras."""
    im = ImageEnhance.Brightness(im).enhance(0.94)
    return ImageEnhance.Contrast(im).enhance(1.07)


# ---------------------------------------------------------------- latar aura
_AURA = {}


def aura(fase=0.0):
    k = round(fase, 2)
    if k in _AURA:
        return _AURA[k].copy()
    kecil = Image.new('RGBA', (192, 108), BG + (255,))
    lap = Image.new('RGBA', (192, 108), (0, 0, 0, 0))
    d = ImageDraw.Draw(lap)
    gx = 40 + 14 * math.sin(fase * 2 * math.pi)
    d.ellipse([gx - 60, -50, gx + 60, 50], fill=CYAN + (80,))
    hx = 150 - 12 * math.sin(fase * 2 * math.pi)
    d.ellipse([hx - 62, 50, hx + 62, 150], fill=BIRU + (56,))
    d.ellipse([90, -40, 190, 40], fill=(150, 150, 255, 28))
    kecil.alpha_composite(lap.filter(ImageFilter.GaussianBlur(26)))
    im = kecil.resize((W, H), Image.BICUBIC)
    titik = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dt = ImageDraw.Draw(titik)
    for y in range(24, H, 30):
        for x in range(24, W, 30):
            dt.point((x, y), fill=(47, 111, 208, 40))
    im.alpha_composite(titik)
    im = im.convert('RGB')
    if len(_AURA) < 64:
        _AURA[k] = im.copy()
    return im


# ---------------------------------------------------------------- elemen
def bayangan(ukuran, radius, kabur=34, gelap=70, turun=26):
    w, h = ukuran
    pad = kabur * 3
    im = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([pad, pad + turun, pad + w, pad + h + turun], radius,
                                         fill=(12, 32, 66, gelap))
    return im.filter(ImageFilter.GaussianBlur(kabur)), pad


def tempel(dasar, lap, xy, alfa=1.0):
    if alfa <= 0.003:
        return
    if alfa < 0.999:
        lap = lap.copy()
        lap.putalpha(lap.getchannel('A').point(lambda v: int(v * alfa)))
    dasar.alpha_composite(lap, (int(xy[0]), int(xy[1])))


def ikon(nama, ukuran):
    im = Image.open(os.path.join(UI, 'ikon', nama + '.webp')).convert('RGBA')
    return im.resize((ukuran, ukuran), Image.LANCZOS)


def muat_ornamen(nama, lebar):
    im = Image.open(os.path.join(UI, 'ornamen', nama + '.webp')).convert('RGBA')
    return im.resize((lebar, int(im.height * lebar / im.width)), Image.LANCZOS)


def kartu_kaca(w, h, r=26, isi=222):
    kartu = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(kartu)
    d.rounded_rectangle([0, 0, w - 1, h - 1], r, fill=(255, 255, 255, isi),
                        outline=(255, 255, 255, 255), width=2)
    for (ax, ay, sx, sy) in [(12, 12, 1, 1), (w - 13, 12, -1, 1), (12, h - 13, 1, -1), (w - 13, h - 13, -1, -1)]:
        d.line([(ax, ay), (ax + 18 * sx, ay)], fill=CYAN + (220,), width=2)
        d.line([(ax, ay), (ax, ay + 18 * sy)], fill=CYAN + (220,), width=2)
    return kartu


# ---- mockup laptop 2D
def laptop_2d(layar, lebar_layar):
    """Laptop perak dari depan: layar ber-bezel hitam dan alas trapesium."""
    lh = int(lebar_layar * 10 / 16)
    bez = int(lebar_layar * 0.022)
    Wt = lebar_layar + bez * 2
    Ht = lh + bez * 2 + int(bez * 0.6)
    alas_h = int(Wt * 0.035)
    lebar_alas = int(Wt * 1.16)
    kan = Image.new('RGBA', (lebar_alas, Ht + alas_h + 6), (0, 0, 0, 0))
    ox = (lebar_alas - Wt) // 2
    d = ImageDraw.Draw(kan)
    d.rounded_rectangle([ox, 0, ox + Wt, Ht], int(bez * 1.3), fill=(196, 204, 216, 255))
    d.rounded_rectangle([ox + 3, 3, ox + Wt - 3, Ht - 3], int(bez * 1.1), fill=(10, 13, 19, 255))
    d.ellipse([ox + Wt // 2 - 4, bez // 2 - 4, ox + Wt // 2 + 4, bez // 2 + 4], fill=(40, 48, 60, 255))
    isi = layar.resize((lebar_layar, lh), Image.LANCZOS) if layar.size != (lebar_layar, lh) else layar
    kan.paste(isi, (ox + bez, bez))
    # alas: trapesium perak dengan takik pembuka di tengah
    y0 = Ht
    d.polygon([(0, y0 + alas_h), (lebar_alas, y0 + alas_h), (lebar_alas - 26, y0), (26, y0)],
              fill=(214, 220, 229, 255))
    d.rectangle([0, y0 + alas_h - 6, lebar_alas, y0 + alas_h], fill=(176, 185, 199, 255))
    d.rounded_rectangle([lebar_alas // 2 - 90, y0, lebar_alas // 2 + 90, y0 + 10], 5,
                        fill=(186, 194, 207, 255))
    return kan, (ox + bez, bez, lebar_layar, lh)


# ---- mockup Android 2D
_HP = {}


def android_2d(sumber, tinggi):
    """Ponsel Android porselen putih: bezel tipis seragam, kamera
    punch-hole, bilah status & gesture bar (tools/layar-mockup.py),
    tombol daya dan volume di sisi kanan."""
    k = (sumber, tinggi)
    if k in _HP:
        return _HP[k]
    bez = max(8, int(tinggi * 0.012))
    layar_h = tinggi - bez * 2
    layar = LM.layar_android(sumber, layar_h * 2).resize(
        (int(layar_h * LM.RASIO_PONSEL), layar_h), Image.LANCZOS)
    Wp = layar.width + bez * 2
    kan = Image.new('RGBA', (Wp + 8, tinggi), (0, 0, 0, 0))
    d = ImageDraw.Draw(kan)
    r = int(Wp * 0.11)
    # tombol di sisi kanan
    d.rounded_rectangle([Wp - 4, int(tinggi * 0.20), Wp + 5, int(tinggi * 0.27)], 3, fill=(190, 198, 212, 255))
    d.rounded_rectangle([Wp - 4, int(tinggi * 0.31), Wp + 5, int(tinggi * 0.45)], 3, fill=(190, 198, 212, 255))
    d.rounded_rectangle([0, 0, Wp - 1, tinggi - 1], r, fill=(222, 229, 239, 255),
                        outline=(255, 255, 255, 255), width=3)
    d.rounded_rectangle([4, 4, Wp - 5, tinggi - 5], r - 3, fill=(8, 11, 17, 255))
    topeng = Image.new('L', layar.size, 0)
    ImageDraw.Draw(topeng).rounded_rectangle([0, 0, layar.width - 1, layar.height - 1], r - bez, fill=255)
    kan.paste(layar, (bez, bez), topeng)
    _HP[k] = kan
    return kan


# ---------------------------------------------------------------- keterangan
def keterangan(im, eyebrow, judul, sub, alfa):
    if alfa <= 0.01:
        return im
    dasar = im.convert('RGBA')
    fj, fs, fe = huruf(50, 800), huruf(23, 500), mono(17)
    d0 = ImageDraw.Draw(dasar)
    lebar = int(max(d0.textlength(judul, font=fj), d0.textlength(sub, font=fs),
                    lebar_spasi(d0, eyebrow.upper(), fe, 5) + 30)) + 72
    tinggi = 178
    geser = int(18 * (1 - alfa))
    x, y = 96, H - tinggi - 92 + geser
    bay, pad = bayangan((lebar, tinggi), 26, 28, 60, 18)
    tempel(dasar, bay, (x - pad, y - pad), alfa)
    kartu = kartu_kaca(lebar, tinggi)
    d = ImageDraw.Draw(kartu)
    d.ellipse([36, 38, 46, 48], fill=CYAN + (255,))
    tulis_spasi(d, (58, 32), eyebrow.upper(), fe, BIRU + (255,), 5)
    d.text((34, 60), judul, font=fj, fill=NAVY + (255,))
    d.text((36, 128), sub, font=fs, fill=TEKS2 + (255,))
    tempel(dasar, kartu, (x, y), alfa)
    return dasar.convert('RGB')


# ---------------------------------------------------------------- pembuka
def tanda_m(ukuran):
    S = ukuran * 2
    grad = Image.new('RGB', (S, S))
    gd = ImageDraw.Draw(grad)
    for i in range(S * 2):
        t = i / (S * 2)
        gd.line([(i, 0), (0, i)], fill=tuple(int(BIRU[j] + (CYAN[j] - BIRU[j]) * t) for j in range(3)), width=2)
    topeng = Image.new('L', (S, S), 0)
    ImageDraw.Draw(topeng).rounded_rectangle([0, 0, S - 1, S - 1], int(S * 0.28), fill=255)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    im.paste(grad, (0, 0), topeng)
    d = ImageDraw.Draw(im)
    c = S / 2
    t, l = S * 0.40, S * 0.46
    titik = [(c - l / 2, c + t / 2), (c - l / 2, c - t / 2), (c, c + t * 0.02),
             (c + l / 2, c - t / 2), (c + l / 2, c + t / 2)]
    d.line(titik, fill=(255, 255, 255, 255), width=int(S * 0.09), joint='curve')
    for p in (titik[0], titik[-1]):
        r = S * 0.045
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255, 255))
    return im.resize((ukuran, ukuran), Image.LANCZOS)


def adegan_pembuka(detik=3.8):
    total = int(detik * FPS)
    orn = [(muat_ornamen('cincin', 300), (0.10, 0.16), 1.0),
           (muat_ornamen('kapsul', 230), (0.80, 0.14), -1.3),
           (muat_ornamen('bola', 170), (0.18, 0.70), 0.8),
           (muat_ornamen('heliks', 120), (0.86, 0.60), -0.9),
           (muat_ornamen('palang', 110), (0.66, 0.78), 1.2)]
    lg = tanda_m(170)
    bay, pad = bayangan((170, 170), 44, 30, 80, 24)
    fj, ft = huruf(104, 800), mono(24)
    for i in range(total):
        t = i / total
        im = aura(t * 0.3).convert('RGBA')
        for k, (o, (px, py), arah) in enumerate(orn):
            a = mulus((t - 0.05 * k) / 0.35)
            yy = py * H + 40 * (1 - keluar_cepat(t / 0.6)) * arah - 10 * math.sin(t * 5 + k)
            tempel(im, o, (px * W - o.width / 2, yy - o.height / 2), a * 0.95)
        a = keluar_cepat((t - 0.08) / 0.4)
        s = 0.86 + 0.14 * a
        ukuran = int(170 * s)
        cx, cy = W / 2 - 280, H / 2 - 40
        tempel(im, bay.resize((int(bay.width * s), int(bay.height * s))),
               (cx - ukuran / 2 - pad * s, cy - ukuran / 2 - pad * s), a)
        tempel(im, lg.resize((ukuran, ukuran), Image.LANCZOS), (cx - ukuran / 2, cy - ukuran / 2), a)
        at = keluar_cepat((t - 0.25) / 0.35)
        if at > 0:
            lap = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            dl = ImageDraw.Draw(lap)
            dl.text((cx + 120 + 30 * (1 - at), cy - 72), 'Medivox', font=fj, fill=NAVY + (int(255 * at),))
            tulis_spasi(dl, (cx + 126 + 30 * (1 - at), cy + 52), 'SEE. SPEAK. UNDERSTAND.', ft,
                        BIRU + (int(255 * mulus((t - 0.4) / 0.3)),), 7)
            im.alpha_composite(lap)
        yield im.convert('RGB')


# ---------------------------------------------------------------- kartu bab
def kartu_bab(no, eyebrow, judul, sub, detik=3.0):
    """Kartu judul bab bernuansa navy dalam: jeda gelap di antara adegan
    putih, sekaligus penanda alur cerita."""
    def gen():
        total = int(detik * FPS)
        cincin = muat_ornamen('cincin', 520)
        fn, fe, fj, fs = mono(22), mono(20), huruf(76, 800), huruf(30, 400)
        for i in range(total):
            t = i / total
            kecil = Image.new('RGB', (192, 108), NAVY_DALAM)
            lap = Image.new('RGBA', (192, 108), (0, 0, 0, 0))
            dl = ImageDraw.Draw(lap)
            dl.ellipse([110 + 8 * t, -10, 230 + 8 * t, 110], fill=BIRU + (120,))
            dl.ellipse([-40, 60, 70, 150], fill=CYAN + (60,))
            kecil = kecil.convert('RGBA')
            kecil.alpha_composite(lap.filter(ImageFilter.GaussianBlur(22)))
            im = kecil.resize((W, H), Image.BICUBIC)
            a0 = keluar_cepat(t / 0.4)
            tempel(im, cincin, (1480, 300 + 20 * math.sin(t * 3)), a0 * 0.5)
            d = ImageDraw.Draw(im)
            a1, a2, a3 = (keluar_cepat((t - s) / 0.3) for s in (0.05, 0.15, 0.28))
            x = 150 + 30 * (1 - a1)
            tulis_spasi(d, (x, 360), no, fn, CYAN + (int(255 * a1),), 6)
            d.rounded_rectangle([x, 402, x + 110 * a1, 406], 2, fill=CYAN + (int(255 * a1),))
            tulis_spasi(d, (x, 428), eyebrow.upper(), fe, (160, 190, 225, int(255 * a2)), 7)
            d.text((x - 3, 470), judul, font=fj, fill=(240, 246, 252, int(255 * a2)))
            d.text((x, 578), sub, font=fs, fill=(170, 195, 225, int(255 * a3)))
            yield im.convert('RGB')
    return gen


# ---------------------------------------------------------------- BAB 1: latar
def potong_ct():
    """Irisan CT dari tangkapan viewer desktop (area citra asli)."""
    im = Image.open(os.path.join(FOTO, 't-viewer.png')).convert('RGB')
    k = im.width / 1440
    return im.crop((int(420 * k), int(250 * k), int(960 * k), int(710 * k)))


def koef_perspektif(tujuan, asal):
    import numpy as np
    A, B = [], []
    for (x, y), (u, v) in zip(tujuan, asal):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()


def irisan_miring(ct, lebar):
    """Satu irisan sebagai bidang miring (dilihat dari atas-samping)."""
    w, h = ct.size
    tinggi = int(lebar * 0.36)
    geser = int(lebar * 0.22)
    tujuan = [(geser, 0), (lebar, 0), (lebar - geser, tinggi), (0, tinggi)]
    asal = [(0, 0), (w, 0), (w, h), (0, h)]
    rgba = ct.convert('RGBA')
    ImageDraw.Draw(rgba).rectangle([0, 0, w - 1, h - 1], outline=CYAN + (255,), width=6)
    return rgba.transform((lebar, tinggi), Image.PERSPECTIVE, koef_perspektif(tujuan, asal), Image.BICUBIC)


def adegan_latar_irisan(detik=6.0):
    total = int(detik * FPS)
    ct = potong_ct()
    varian = []
    for k in range(14):
        v = ImageEnhance.Brightness(ct).enhance(0.72 + 0.03 * k)
        s = 1 - abs(k - 7) * 0.035
        v2 = Image.new('RGB', ct.size, (0, 0, 0))
        vk = v.resize((int(ct.width * s), int(ct.height * s)))
        v2.paste(vk, ((ct.width - vk.width) // 2, (ct.height - vk.height) // 2))
        varian.append(irisan_miring(v2, 760))
    for i in range(total):
        t = i / total
        im = aura(0.1 + t * 0.2).convert('RGBA')
        for k, sl in enumerate(varian):
            a = keluar_cepat((t - 0.03 * k) / 0.22)
            if a <= 0:
                continue
            y = 520 - k * 26 - (1 - a) * 60
            tempel(im, sl, (1040, y), a * 0.9)
        d = ImageDraw.Draw(im)
        fe = mono(22)
        a = keluar_cepat((t - 0.55) / 0.25)
        if a > 0:
            tulis_spasi(d, (1220, 150), '200+ SLICES  \u00b7  ONE STUDY', fe, BIRU + (int(255 * a),), 5)
        yield keterangan(im.convert('RGB'), 'Background', 'Radiology is read one slice at a time.',
                         'A CT study is hundreds of flat images \u2014 the 3D shape is rebuilt in the head',
                         muncul(t, 0.12, 1.0))


def adegan_latar_angka(detik=5.2):
    total = int(detik * FPS)
    data = [('512\u00b3', 'voxels in a typical', 'CT volume'),
            ('200+', 'slices scrolled', 'per study'),
            ('2D', 'screens used to judge', '3D anatomy'),
            ('0', 'true depth on a', 'flat monitor')]
    fa, fl = huruf(96, 800), huruf(27, 500)
    lebar, tinggi, jarak = 360, 300, 36
    x0 = (W - (lebar * 4 + jarak * 3)) // 2
    bay, pad = bayangan((lebar, tinggi), 30, 30, 60, 24)
    for i in range(total):
        t = i / total
        im = aura(0.3 + t * 0.2).convert('RGBA')
        for k, (nilai, l1, l2) in enumerate(data):
            a = keluar_cepat((t - 0.05 - k * 0.09) / 0.3)
            if a <= 0:
                continue
            x, y = x0 + k * (lebar + jarak), 250 + (1 - a) * 60
            tempel(im, bay, (x - pad, y - pad), a)
            kartu = kartu_kaca(lebar, tinggi, 30)
            d = ImageDraw.Draw(kartu)
            w = d.textlength(nilai, font=fa)
            d.text(((lebar - w) / 2, 60), nilai, font=fa, fill=BIRU + (255,))
            for j, b in enumerate((l1, l2)):
                bw = d.textlength(b, font=fl)
                d.text(((lebar - bw) / 2, 186 + j * 38), b, font=fl, fill=TEKS2 + (255,))
            tempel(im, kartu, (x, y), a)
        yield keterangan(im.convert('RGB'), 'The gap', 'Depth is imagined, not seen.',
                         'Hard to explain to clinicians, patients and students',
                         muncul(t, 0.35, 1.0))


# ---------------------------------------------------------------- shot Blender
def frame_shot(nama):
    berkas = sorted(glob.glob(os.path.join(REEL, 'shot-' + nama, 'f*.jpg')))
    if not berkas:
        raise SystemExit('shot %s belum dirender — jalankan bash tools/render-reel.sh' % nama)
    return berkas


def adegan_shot(nama, detik, eyebrow, judul, sub):
    def gen():
        berkas = frame_shot(nama)
        total = int(detik * FPS)
        for i in range(total):
            j = int(i * (len(berkas) - 1) / max(1, total - 1))
            im = Image.open(berkas[j]).convert('RGB')
            if im.size != (W, H):
                im = im.resize((W, H), Image.LANCZOS)
            t = i / total
            yield keterangan(grade_shot(im), eyebrow, judul, sub, muncul(t, 0.10, 0.96, 0.12))
    return gen


# ---------------------------------------------------------------- BAB 3: mockup 2D
def adegan_laptop_web(detik=5.4):
    """Laptop 2D menggulir situs Medivox."""
    total = int(detik * FPS)
    penuh = Image.open(os.path.join(FOTO, 't-landing-penuh.png')).convert('RGB')
    lebar_layar = 1060
    penuh = penuh.resize((lebar_layar, int(penuh.height * lebar_layar / penuh.width)), Image.LANCZOS)
    lh = int(lebar_layar * 10 / 16)
    maks = min(penuh.height - lh, 1100)
    kosong, (sx, sy, _, _) = laptop_2d(Image.new('RGB', (lebar_layar, lh)), lebar_layar)
    bay, pad = bayangan((kosong.width - 60, kosong.height - 40), 30, 44, 90, 40)
    for i in range(total):
        t = i / total
        masuk = keluar_cepat(t / 0.3)
        gul = int(maks * mulus((t - 0.15) / 0.78))
        lap = kosong.copy()
        lap.paste(penuh.crop((0, gul, lebar_layar, gul + lh)), (sx, sy))
        im = aura(t * 0.2).convert('RGBA')
        x = W - lap.width - 60
        y = 90 + 70 * (1 - masuk)
        tempel(im, bay, (x + 30 - pad, y - pad), masuk)
        tempel(im, lap, (x, y), masuk)
        yield keterangan(im.convert('RGB'), 'Web', 'Nothing to install.',
                         'Open medivox-id.web.app on any laptop', muncul(t, 0.18, 1.0))


def adegan_alur(detik=5.8):
    """Laptop berganti layar: worklist -> viewer 2D -> hologram."""
    total = int(detik * FPS)
    lebar_layar = 1100
    layar = []
    for g in ('t-worklist.png', 't-viewer.png', 't-prisma.png'):
        lap, geo = laptop_2d(Image.open(os.path.join(FOTO, g)).convert('RGB'), lebar_layar)
        layar.append(lap)
    bay, pad = bayangan((layar[0].width - 60, layar[0].height - 40), 30, 44, 90, 40)
    label = ['01  WORKLIST', '02  2D VIEWER', '03  HOLOGRAM']
    fe = mono(20)
    for i in range(total):
        t = i / total
        im = aura(0.3 + t * 0.2).convert('RGBA')
        x = W - layar[0].width - 60
        y = 80
        a0 = keluar_cepat(t / 0.25)
        tempel(im, bay, (x + 30 - pad, y - pad + (1 - a0) * 60), a0)
        fase = min(2.0, max(0.0, (t - 0.12) / 0.26))
        k = int(fase)
        campur = mulus((fase - k - 0.75) / 0.25) if k < 2 else 0
        tempel(im, layar[k], (x, y + (1 - a0) * 60), a0)
        if campur > 0:
            tempel(im, layar[k + 1], (x, y), campur)
        # langkah di kiri atas
        d = ImageDraw.Draw(im)
        for j, lb in enumerate(label):
            aktif = j == (k + (1 if campur > 0.5 else 0))
            yy = 150 + j * 74
            a = keluar_cepat((t - 0.05 - j * 0.05) / 0.2)
            if a <= 0:
                continue
            w = lebar_spasi(d, lb, fe, 3) + 52
            if aktif:
                d.rounded_rectangle([96, yy, 96 + w, yy + 50], 25, fill=BIRU + (int(240 * a),))
                tulis_spasi(d, (122, yy + 13), lb, fe, (255, 255, 255, int(255 * a)), 3)
            else:
                d.rounded_rectangle([96, yy, 96 + w, yy + 50], 25, fill=(255, 255, 255, int(200 * a)),
                                    outline=(255, 255, 255, int(255 * a)), width=2)
                tulis_spasi(d, (122, yy + 13), lb, fe, MUTED + (int(255 * a),), 3)
        yield keterangan(im.convert('RGB'), 'Workflow', 'Worklist \u2192 2D viewer \u2192 hologram.',
                         'DICOM is parsed in the browser \u2014 nothing is uploaded', muncul(t, 0.1, 1.0))


def adegan_android(detik=5.6):
    """Tiga ponsel Android naik bergantian: landing, worklist, viewer."""
    total = int(detik * FPS)
    hp = [android_2d(os.path.join(FOTO, g), 660) for g in
          ('t-landing-m.png', 't-worklist-m.png', 't-viewer-m.png')]
    bay, pad = bayangan((hp[0].width - 8, hp[0].height), 56, 34, 90, 30)
    jarak = 44
    x0 = W - (hp[0].width * 3 + jarak * 2) - 150
    for i in range(total):
        t = i / total
        im = aura(0.6 + t * 0.2).convert('RGBA')
        for k, p in enumerate(hp):
            a = keluar_cepat((t - 0.05 - k * 0.12) / 0.34)
            if a <= 0:
                continue
            x = x0 + k * (p.width + jarak)
            y = 90 + (1 - a) * 220 + (-26 if k == 1 else 0) + 7 * math.sin(t * 3.5 + k)
            tempel(im, bay, (x - pad, y - pad), a)
            tempel(im, p, (x, y), a)
        yield keterangan(im.convert('RGB'), 'Android', 'The workstation in your pocket.',
                         'Bottom tab bar, drawers and thumb-reach controls', muncul(t, 0.2, 1.0))


def adegan_fitur(detik=5.6):
    """Empat kartu fitur dengan ikon 3D Blender."""
    total = int(detik * FPS)
    data = [('perisai', 'Private by design', 'Pixels never leave', 'the device'),
            ('tangan', 'Touch-free control', 'Hand gestures and', 'voice commands'),
            ('berkas', 'Native DICOM parser', 'Written from scratch,', 'tested on real data'),
            ('kubus', '3D reconstruction', 'MPR, MIP, surface,', 'STL / OBJ export')]
    fj, fl = huruf(30, 800), huruf(24, 500)
    lebar, tinggi, jarak = 380, 360, 34
    x0 = (W - (lebar * 4 + jarak * 3)) // 2
    bay, pad = bayangan((lebar, tinggi), 30, 30, 60, 24)
    ik = {n: ikon(n, 124) for n, *_ in data}
    fh = huruf(60, 800)
    for i in range(total):
        t = i / total
        im = aura(0.8 + t * 0.2).convert('RGBA')
        d = ImageDraw.Draw(im)
        a = keluar_cepat(t / 0.25)
        judul = 'Built for the reading room.'
        d.text(((W - d.textlength(judul, font=fh)) / 2, 150 - 20 * (1 - a)), judul, font=fh,
               fill=NAVY + (int(255 * a),))
        for k, (n, j1, l1, l2) in enumerate(data):
            a = keluar_cepat((t - 0.12 - k * 0.08) / 0.3)
            if a <= 0:
                continue
            x, y = x0 + k * (lebar + jarak), 330 + (1 - a) * 60
            tempel(im, bay, (x - pad, y - pad), a)
            kartu = kartu_kaca(lebar, tinggi, 30)
            kartu.alpha_composite(ik[n], (40, 40))
            dk = ImageDraw.Draw(kartu)
            dk.text((42, 190), j1, font=fj, fill=NAVY + (255,))
            dk.text((42, 244), l1, font=fl, fill=TEKS2 + (255,))
            dk.text((42, 280), l2, font=fl, fill=TEKS2 + (255,))
            tempel(im, kartu, (x, y), a)
        yield im.convert('RGB')


# ---------------------------------------------------------------- penutup
def adegan_penutup(detik=5.6):
    total = int(detik * FPS)
    produk = Image.open(os.path.join(AKAR, 'assets', '3d', 'putih-hero.webp')).convert('RGBA')
    produk = produk.resize((620, int(produk.height * 620 / produk.width)), Image.LANCZOS)
    hp = android_2d(os.path.join(FOTO, 't-prisma-m.png'), 470)
    lg = tanda_m(96)
    fj, ft, fu, fk = huruf(112, 800), huruf(32, 400), mono(24), mono(15)
    cincin = muat_ornamen('cincin', 560)
    for i in range(total):
        t = i / total
        im = aura(0.9 + t * 0.1).convert('RGBA')
        a0 = keluar_cepat(t / 0.35)
        tempel(im, cincin, (1230 - cincin.width / 2, 540 - cincin.height / 2 + 10 * math.sin(t * 3)), a0 * 0.8)
        tempel(im, produk, (1180 - produk.width / 2, 520 - produk.height / 2 + 40 * (1 - a0)), a0)
        tempel(im, hp, (1540, 380 + 60 * (1 - a0)), keluar_cepat((t - 0.1) / 0.35))
        lap = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lap)
        a1, a2, a3 = (keluar_cepat((t - s) / 0.3) for s in (0.12, 0.26, 0.40))
        x0 = 150 + 30 * (1 - a1)
        tempel(lap, lg, (x0, 330), a1)
        d.text((x0 + 120, 318), 'Medivox', font=fj, fill=NAVY + (int(255 * a1),))
        d.rounded_rectangle([x0, 478, x0 + 120 * a2, 482], 2, fill=CYAN + (int(255 * a2),))
        d.text((x0, 504), 'See. Speak. Understand.', font=ft, fill=TEKS2 + (int(255 * a2),))
        lebar = lebar_spasi(d, 'medivox-id.web.app', fu, 3) + 48
        d.rounded_rectangle([x0, 580, x0 + lebar, 628], 24, fill=(255, 255, 255, int(230 * a3)),
                            outline=CYAN + (int(200 * a3),), width=2)
        tulis_spasi(d, (x0 + 24, 591), 'medivox-id.web.app', fu, BIRU + (int(255 * a3),), 3)
        tulis_spasi(d, (x0, H - 130), 'UI PROTOTYPE  \u00b7  NOT A MEDICAL DEVICE', fk,
                    MUTED + (int(220 * a3),), 4)
        im.alpha_composite(lap)
        if t > 0.9:
            im = Image.blend(im.convert('RGB'), Image.new('RGB', (W, H), NAVY_DALAM),
                             mulus((t - 0.9) / 0.1)).convert('RGBA')
        yield im.convert('RGB')


# ---------------------------------------------------------------- audio
def musik(ffmpeg, detik, jalur):
    """Pad ambient D mayor-sembilan dengan denyut halus, disintesis ffmpeg."""
    nada = [146.83, 220.00, 293.66, 369.99, 440.00, 659.26]
    bobot = [0.24, 0.17, 0.15, 0.10, 0.09, 0.05]
    suku = []
    for i, (f, b) in enumerate(zip(nada, bobot)):
        laju = 0.08 + i * 0.021
        suku.append('%.3f*sin(2*PI*%.2f*t)*(0.72+0.28*sin(2*PI*%.3f*t+%d))' % (b, f, laju, i))
    # tanpa koma: koma di dalam ekspresi dibaca ffmpeg sebagai pemisah filter
    suku.append('0.05*sin(2*PI*880*t)*exp(-6*(t-2*floor(t/2)))')
    saring = ('lowpass=f=2400,aecho=0.8:0.7:380|760:0.26|0.16,'
              'afade=t=in:st=0:d=2.2,afade=t=out:st=%.2f:d=3.0,volume=1.6' % (detik - 3.0))
    subprocess.run([ffmpeg, '-y', '-v', 'error', '-f', 'lavfi',
                    '-i', 'aevalsrc=%s:s=48000:d=%.2f' % ('+'.join(suku), detik),
                    '-af', saring, '-ac', '2', '-c:a', 'aac', '-b:a', '192k', jalur], check=True)


# ---------------------------------------------------------------- perakitan
def simpan(im, n):
    im.save(os.path.join(FRAME, 'r%05d.jpg' % n), 'JPEG', quality=93)
    return n + 1


def cari_ffmpeg():
    ada = shutil.which('ffmpeg')
    if ada:
        return ada
    pola = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\*FFmpeg*\**\bin\ffmpeg.exe')
    for jalur in glob.glob(pola, recursive=True):
        return jalur
    return None


def urutan():
    fitur = [
        kartu_bab('03', 'Features', 'Hardware and software, together.',
                  'A web app for desktop and Android \u2014 it runs in the browser.'),
        adegan_shot('ekosistem', 6.0, 'Ecosystem', 'One study, every screen.',
                    'MEDIVOX-1, laptop and Android phone read the same study'),
        adegan_shot('laptop', 5.0, 'Desktop app', 'A clear 2D diagnostic viewer.',
                    'Window/level, measure, annotate and report'),
        adegan_laptop_web,
        adegan_alur,
        adegan_shot('ponsel', 5.0, 'Android', 'Mobile-first by design.',
                    'The same app, rebuilt for one-handed use'),
        adegan_android,
        adegan_fitur,
    ]
    if HANYA_APP:
        return [adegan_pembuka] + fitur[1:] + [adegan_penutup]
    return [
        adegan_pembuka,
        kartu_bab('01', 'Background', 'Anatomy is 3D. Screens are flat.',
                  'Why reading volumes slice by slice is still hard.'),
        adegan_latar_irisan,
        adegan_latar_angka,
        kartu_bab('02', 'The product', 'Meet MEDIVOX-1.',
                  'A tabletop hologram display for DICOM volumes.'),
        adegan_shot('masuk', 5.0, 'MEDIVOX-1', 'One base. One glass prism.',
                    'A volumetric review system for CT and MRI'),
        adegan_shot('orbit', 5.0, 'Pepper\u2019s ghost', 'Four reflections, one floating form.',
                    'No glasses, no projector, no headset'),
        adegan_shot('panel', 4.2, 'Four-quadrant panel', 'Every view, projected at once.',
                    'Anterior \u00b7 posterior \u00b7 left \u00b7 right'),
    ] + fitur + [adegan_penutup]


def bangun():
    if os.path.isdir(FRAME):
        shutil.rmtree(FRAME)
    os.makedirs(FRAME)
    n = 0
    sebelumnya = None
    for buat in urutan():
        for i, im in enumerate(buat()):
            im = vinyet(im)
            if sebelumnya is not None and i < SILANG:
                im = Image.blend(sebelumnya, im, mulus((i + 1) / (SILANG + 1)))
            n = simpan(im, n)
            akhir = im
        sebelumnya = akhir
        print('  adegan selesai, frame %d' % n)
    print('frame dirakit: %d (%.1f detik)' % (n, n / FPS))
    return n


def encode(n):
    ff = cari_ffmpeg()
    if not ff:
        raise SystemExit('ffmpeg tidak ditemukan')
    audio = os.path.join(REEL, 'musik-app.m4a' if HANYA_APP else 'musik.m4a')
    musik(ff, n / FPS, audio)
    subprocess.run([ff, '-y', '-v', 'error', '-framerate', str(FPS),
                    '-i', os.path.join(FRAME, 'r%05d.jpg'), '-i', audio,
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
                    '-pix_fmt', 'yuv420p', '-c:a', 'copy',
                    '-shortest', '-movflags', '+faststart', KELUAR], check=True)
    print('video: %s (%.1f MB)' % (KELUAR, os.path.getsize(KELUAR) / 1048576))


if __name__ == '__main__':
    encode(bangun())
