#!/usr/bin/env python3
"""
==========================================================
MEDIVOX — perakit showreel 1920x1080 (perangkat keras + aplikasi)
----------------------------------------------------------
Satu film putih-bersih futuristik yang menyatukan dua hal:

  PERANGKAT KERAS  shot kamera bergerak hasil Blender di studio putih
                   (masuk, orbit, panel, ekosistem, laptop, ponsel)
  PERANGKAT LUNAK  mockup antarmuka Medivox yang dianimasikan di sini:
                   jendela peramban melayang, alur kerja tiga layar,
                   dan tiga ponsel — memakai tangkapan layar UI asli

Struktur:
  pembuka (lambang + ornamen 3D) -> perangkat -> ekosistem -> aplikasi
  desktop -> aplikasi seluler -> penutup (produk + nama + URL)

Bahan (dibuat lebih dulu):
  bash tools/render-reel.sh                      -> build/reel2/shot-*/f*.jpg
  node --experimental-websocket tools/foto-cdp.js tools/foto-tex.json
                                                 -> build/foto/t-*.png

Jalankan:  python tools/bangun-showreel.py            (film gabungan)
           python tools/bangun-showreel.py --app      (mockup aplikasi saja)
Keluaran:  build/MEDIVOX_Showreel.mp4 / build/MEDIVOX_App_Mockup.mp4
==========================================================
"""
import os, sys, glob, math, shutil, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REEL = os.path.join(AKAR, 'build', 'reel2')
FOTO = os.path.join(AKAR, 'build', 'foto')
UI = os.path.join(AKAR, 'assets', 'ui')
HANYA_APP = '--app' in sys.argv
FRAME = os.path.join(REEL, 'rakit-app' if HANYA_APP else 'rakit')
KELUAR = os.path.join(AKAR, 'build', 'MEDIVOX_App_Mockup.mp4' if HANYA_APP else 'MEDIVOX_Showreel.mp4')

W, H, FPS = 1920, 1080, 30
SILANG = 14                                   # frame crossfade antar adegan

# palet merek (sama dengan token CSS)
BG = (244, 247, 251)
NAVY = (19, 41, 75)
TEKS2 = (61, 90, 130)
MUTED = (90, 114, 144)
BIRU = (47, 111, 208)
CYAN = (94, 201, 242)


# ---------------------------------------------------------------- huruf
def huruf(ukuran, berat=800):
    """Manrope variabel (build/font) bila ada; Segoe UI sebagai cadangan."""
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
    """ease-out kubik: cepat di awal, mendarat lembut."""
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


# ---------------------------------------------------------------- latar aura
_AURA = {}


def aura(fase=0.0):
    """Latar putih dengan dua awan cahaya biru/cyan yang bergeser pelan
    dan kisi titik halus — sama seperti body::before/::after di web."""
    k = round(fase, 2)
    if k in _AURA:
        return _AURA[k].copy()
    kecil = Image.new('RGB', (192, 108), BG)
    lap = Image.new('RGBA', (192, 108), (0, 0, 0, 0))
    d = ImageDraw.Draw(lap)
    gx = 40 + 14 * math.sin(fase * 2 * math.pi)
    d.ellipse([gx - 60, -50, gx + 60, 50], fill=CYAN + (70,))
    hx = 150 - 12 * math.sin(fase * 2 * math.pi)
    d.ellipse([hx - 62, 50, hx + 62, 150], fill=BIRU + (40,))
    lap = lap.filter(ImageFilter.GaussianBlur(26))
    kecil = kecil.convert('RGBA')
    kecil.alpha_composite(lap)
    im = kecil.convert('RGB').resize((W, H), Image.BICUBIC)
    titik = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dt = ImageDraw.Draw(titik)
    for y in range(24, H, 30):
        for x in range(24, W, 30):
            dt.point((x, y), fill=(47, 111, 208, 34))
    im = im.convert('RGBA')
    im.alpha_composite(titik)
    im = im.convert('RGB')
    if len(_AURA) < 64:
        _AURA[k] = im.copy()
    return im


# ---------------------------------------------------------------- elemen kaca
def bayangan(ukuran, radius, kabur=34, gelap=70, turun=26):
    """Bayangan lembut untuk kartu/jendela yang melayang."""
    w, h = ukuran
    pad = kabur * 3
    im = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([pad, pad + turun, pad + w, pad + h + turun], radius,
                                         fill=(22, 52, 98, gelap))
    return im.filter(ImageFilter.GaussianBlur(kabur)), pad


def tempel(dasar, lap, xy, alfa=1.0):
    if alfa <= 0.003:
        return
    if alfa < 0.999:
        lap = lap.copy()
        lap.putalpha(lap.getchannel('A').point(lambda v: int(v * alfa)))
    dasar.alpha_composite(lap, (int(xy[0]), int(xy[1])))


def jendela(gambar, lebar, url):
    """Jendela peramban kaca putih berisi tangkapan layar."""
    im = Image.open(gambar).convert('RGB')
    tinggi_isi = int(im.height * lebar / im.width)
    im = im.resize((lebar, tinggi_isi), Image.LANCZOS)
    bar = 46
    r = 20
    W_, H_ = lebar + 16, tinggi_isi + bar + 8
    kan = Image.new('RGBA', (W_, H_), (0, 0, 0, 0))
    d = ImageDraw.Draw(kan)
    d.rounded_rectangle([0, 0, W_ - 1, H_ - 1], r, fill=(255, 255, 255, 236),
                        outline=(255, 255, 255, 255), width=2)
    for i, c in enumerate([(236, 106, 94), (244, 191, 79), (97, 197, 84)]):
        d.ellipse([22 + i * 20, 17, 34 + i * 20, 29], fill=c + (230,))
    fu = mono(15)
    uw = d.textlength(url, font=fu) + 60
    ux = (W_ - uw) / 2
    d.rounded_rectangle([ux, 10, ux + uw, 36], 13, fill=(236, 242, 250, 255))
    d.ellipse([ux + 14, 19, ux + 22, 27], fill=CYAN + (255,))
    d.text((ux + 32, 13), url, font=fu, fill=MUTED)
    topeng = Image.new('L', (lebar, tinggi_isi), 0)
    ImageDraw.Draw(topeng).rounded_rectangle([0, 0, lebar - 1, tinggi_isi - 1], 14, fill=255)
    kan.paste(im, (8, bar), topeng)
    return kan


def ponsel_2d(gambar, tinggi):
    """Ponsel putih-perak dengan layar tangkapan UI seluler."""
    im = Image.open(gambar).convert('RGB')
    layar_h = tinggi - 26
    layar_w = int(im.width * layar_h / im.height)
    im = im.resize((layar_w, layar_h), Image.LANCZOS)
    Wp, Hp = layar_w + 26, tinggi
    kan = Image.new('RGBA', (Wp, Hp), (0, 0, 0, 0))
    d = ImageDraw.Draw(kan)
    d.rounded_rectangle([0, 0, Wp - 1, Hp - 1], int(Wp * 0.16), fill=(226, 232, 241, 255),
                        outline=(255, 255, 255, 255), width=3)
    d.rounded_rectangle([7, 7, Wp - 8, Hp - 8], int(Wp * 0.14), fill=(10, 14, 22, 255))
    topeng = Image.new('L', (layar_w, layar_h), 0)
    ImageDraw.Draw(topeng).rounded_rectangle([0, 0, layar_w - 1, layar_h - 1], int(Wp * 0.12), fill=255)
    kan.paste(im, (13, 13), topeng)
    cx = Wp // 2
    d.rounded_rectangle([cx - Wp * 0.15, 22, cx + Wp * 0.15, 22 + Wp * 0.08], int(Wp * 0.04),
                        fill=(0, 0, 0, 255))
    return kan


# ---------------------------------------------------------------- keterangan
def keterangan(im, eyebrow, judul, sub, alfa, gelap=False):
    """Kartu kaca kiri bawah: eyebrow mono + titik bercahaya, judul, sub."""
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
    bay, pad = bayangan((lebar, tinggi), 26, 28, 55, 18)
    tempel(dasar, bay, (x - pad, y - pad), alfa)
    kartu = Image.new('RGBA', (lebar, tinggi), (0, 0, 0, 0))
    d = ImageDraw.Draw(kartu)
    d.rounded_rectangle([0, 0, lebar - 1, tinggi - 1], 26, fill=(255, 255, 255, 214),
                        outline=(255, 255, 255, 255), width=2)
    # siku HUD cyan
    for (ax, ay, sx, sy) in [(12, 12, 1, 1), (lebar - 13, 12, -1, 1),
                             (12, tinggi - 13, 1, -1), (lebar - 13, tinggi - 13, -1, -1)]:
        d.line([(ax, ay), (ax + 18 * sx, ay)], fill=CYAN + (220,), width=2)
        d.line([(ax, ay), (ax, ay + 18 * sy)], fill=CYAN + (220,), width=2)
    d.ellipse([36, 38, 46, 48], fill=CYAN + (255,))
    tulis_spasi(d, (58, 32), eyebrow.upper(), fe, BIRU + (255,), 5)
    d.text((34, 60), judul, font=fj, fill=NAVY + (255,))
    d.text((36, 128), sub, font=fs, fill=TEKS2 + (255,))
    tempel(dasar, kartu, (x, y), alfa)
    return dasar.convert('RGB')


# ---------------------------------------------------------------- pembuka
def tanda_m(ukuran):
    """Lambang Medivox: petak bergradien biru->cyan dengan huruf M putih."""
    S = ukuran * 2
    grad = Image.new('RGB', (S, S))
    gd = ImageDraw.Draw(grad)
    for i in range(S * 2):
        t = i / (S * 2)
        c = tuple(int(BIRU[j] + (CYAN[j] - BIRU[j]) * t) for j in range(3))
        gd.line([(i, 0), (0, i)], fill=c, width=2)
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
    # kilau atas
    kilau = Image.new('L', (S, S), 0)
    ImageDraw.Draw(kilau).ellipse([-S * 0.3, -S * 0.9, S * 1.3, S * 0.45], fill=46)
    putih = Image.new('RGBA', (S, S), (255, 255, 255, 0))
    putih.putalpha(Image.composite(kilau, Image.new('L', (S, S), 0), topeng))
    im.alpha_composite(putih)
    return im.resize((ukuran, ukuran), Image.LANCZOS)


def muat_ornamen(nama, lebar):
    im = Image.open(os.path.join(UI, 'ornamen', nama + '.webp')).convert('RGBA')
    return im.resize((lebar, int(im.height * lebar / im.width)), Image.LANCZOS)


def adegan_pembuka(n, detik=3.8):
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
            ang = 18 * math.sin((t + k) * 2.2) * arah
            yy = py * H + 40 * (1 - keluar_cepat(t / 0.6)) * arah - 10 * math.sin(t * 5 + k)
            tempel(im, o, (px * W - o.width / 2, yy - o.height / 2), a * 0.95)
        a = keluar_cepat((t - 0.08) / 0.4)
        s = 0.86 + 0.14 * a
        ukuran = int(170 * s)
        l2 = lg.resize((ukuran, ukuran), Image.LANCZOS)
        cx, cy = W / 2 - 280, H / 2 - 40
        tempel(im, bay.resize((int(bay.width * s), int(bay.height * s))),
               (cx - (ukuran / 2) - pad * s, cy - ukuran / 2 - pad * s), a)
        tempel(im, l2, (cx - ukuran / 2, cy - ukuran / 2), a)
        d = ImageDraw.Draw(im)
        at = keluar_cepat((t - 0.25) / 0.35)
        if at > 0:
            lap = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            dl = ImageDraw.Draw(lap)
            dl.text((cx + 120 + 30 * (1 - at), cy - 72), 'Medivox', font=fj, fill=NAVY + (int(255 * at),))
            tulis_spasi(dl, (cx + 126 + 30 * (1 - at), cy + 52), 'SEE. SPEAK. UNDERSTAND.', ft,
                        BIRU + (int(255 * mulus((t - 0.4) / 0.3)),), 7)
            im.alpha_composite(lap)
        n = simpan(im.convert('RGB'), n)
    return n


# ---------------------------------------------------------------- shot Blender
def frame_shot(nama):
    berkas = sorted(glob.glob(os.path.join(REEL, 'shot-' + nama, 'f*.jpg')))
    if not berkas:
        raise SystemExit('shot %s belum dirender — jalankan bash tools/render-reel.sh' % nama)
    return berkas


def gambar_shot(berkas, i):
    im = Image.open(berkas[min(i, len(berkas) - 1)]).convert('RGB')
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return im


def adegan_shot(nama, detik, eyebrow, judul, sub):
    berkas = frame_shot(nama)
    total = int(detik * FPS)
    # shot yang lebih pendek diperlambat, bukan ditahan di frame terakhir
    for i in range(total):
        j = int(i * (len(berkas) - 1) / max(1, total - 1))
        im = gambar_shot(berkas, j)
        t = i / total
        alfa = mulus((t - 0.10) / 0.14) * (1 - mulus((t - 0.84) / 0.12))
        yield keterangan(im, eyebrow, judul, sub, alfa)


# ---------------------------------------------------------------- mockup 2D
def adegan_gulir(detik=5.0):
    """Jendela peramban melayang; halaman web Medivox bergulir pelan."""
    total = int(detik * FPS)
    penuh = Image.open(os.path.join(FOTO, 't-landing-penuh.png')).convert('RGB')
    lebar = 1100
    skala = lebar / penuh.width
    penuh = penuh.resize((lebar, int(penuh.height * skala)), Image.LANCZOS)
    tinggi_isi = int(lebar * 0.60)
    bar = 46
    Wj, Hj = lebar + 16, tinggi_isi + bar + 8
    bay, pad = bayangan((Wj, Hj), 20, 40, 80, 34)
    maks = min(penuh.height - tinggi_isi, 1150)   # hero -> galeri produk
    fu = mono(15)
    for i in range(total):
        t = i / total
        masuk = keluar_cepat(t / 0.3)
        gul = int(maks * mulus((t - 0.12) / 0.8))
        isi = penuh.crop((0, gul, lebar, gul + tinggi_isi))
        kan = Image.new('RGBA', (Wj, Hj), (0, 0, 0, 0))
        d = ImageDraw.Draw(kan)
        d.rounded_rectangle([0, 0, Wj - 1, Hj - 1], 20, fill=(255, 255, 255, 240),
                            outline=(255, 255, 255, 255), width=2)
        for k, c in enumerate([(236, 106, 94), (244, 191, 79), (97, 197, 84)]):
            d.ellipse([22 + k * 20, 17, 34 + k * 20, 29], fill=c + (230,))
        url = 'medivox-id.web.app'
        uw = d.textlength(url, font=fu) + 60
        ux = (Wj - uw) / 2
        d.rounded_rectangle([ux, 10, ux + uw, 36], 13, fill=(236, 242, 250, 255))
        d.ellipse([ux + 14, 19, ux + 22, 27], fill=CYAN + (255,))
        d.text((ux + 32, 13), url, font=fu, fill=MUTED)
        topeng = Image.new('L', (lebar, tinggi_isi), 0)
        ImageDraw.Draw(topeng).rounded_rectangle([0, 0, lebar - 1, tinggi_isi - 1], 14, fill=255)
        kan.paste(isi, (8, bar), topeng)
        im = aura(t * 0.2).convert('RGBA')
        x = W - Wj - 110
        y = 70 + 60 * (1 - masuk)
        tempel(im, bay, (x - pad, y - pad), masuk)
        tempel(im, kan, (x, y), masuk)
        yield keterangan(im.convert('RGB'), 'Situs web', 'Putih, lapang, futuristik.',
                         'Ikon, ornamen & pola kartu dibuat dengan Blender',
                         mulus((t - 0.18) / 0.14) * (1 - mulus((t - 0.86) / 0.1)))


def adegan_alur(detik=5.6):
    """Tiga jendela aplikasi bertumpuk: studi -> viewer 2D -> hologram."""
    total = int(detik * FPS)
    daftar = [('t-worklist.png', 'medivox-id.web.app/studi'),
              ('t-viewer.png', 'medivox-id.web.app/viewer'),
              ('t-prisma.png', 'medivox-id.web.app/hologram')]
    jend = [jendela(os.path.join(FOTO, g), 900, u) for g, u in daftar]
    bay, pad = bayangan(jend[0].size, 20, 36, 70, 30)
    posisi = [(150, 150), (520, 250), (890, 350)]
    for i in range(total):
        t = i / total
        im = aura(0.3 + t * 0.2).convert('RGBA')
        for k, (jn, (px, py)) in enumerate(zip(jend, posisi)):
            a = keluar_cepat((t - 0.08 - k * 0.16) / 0.3)
            if a <= 0:
                continue
            geser = 80 * (1 - a)
            apung = 6 * math.sin(t * 4 + k)
            tempel(im, bay, (px - pad + geser, py - pad + apung + geser * 0.5), a)
            tempel(im, jn, (px + geser, py + apung + geser * 0.5), a)
        # pil langkah
        d = ImageDraw.Draw(im)
        fe = mono(16)
        for k, label in enumerate(['01  STUDI', '02  VIEWER 2D', '03  HOLOGRAM']):
            a = keluar_cepat((t - 0.2 - k * 0.16) / 0.25)
            if a <= 0:
                continue
            px, py = posisi[k]
            lap = Image.new('RGBA', (220, 40), (0, 0, 0, 0))
            dl = ImageDraw.Draw(lap)
            dl.rounded_rectangle([0, 0, 219, 39], 20, fill=BIRU + (235,))
            dl.text((20, 10), label, font=fe, fill=(255, 255, 255, 255))
            tempel(im, lap, (px + 900 - 240, py - 20), a)
        yield keterangan(im.convert('RGB'), 'Alur kerja', 'Dari daftar studi ke hologram.',
                         'Berkas DICOM diurai di peramban \u2014 tanpa unggahan',
                         mulus((t - 0.5) / 0.12) * (1 - mulus((t - 0.9) / 0.08)))


def adegan_seluler(detik=5.2):
    """Tiga ponsel naik bergantian: landing, studi, viewer."""
    total = int(detik * FPS)
    hp = [ponsel_2d(os.path.join(FOTO, g), 760) for g in
          ('t-landing-m.png', 't-worklist-m.png', 't-viewer-m.png')]
    bay, pad = bayangan(hp[0].size, 60, 34, 80, 30)
    xs = [W / 2 - 60 - hp[0].width * 1.5 - 30, W / 2 - 60 - hp[0].width / 2, W / 2 - 60 + hp[0].width / 2 + 30]
    xs = [x + 380 for x in xs]
    for i in range(total):
        t = i / total
        im = aura(0.6 + t * 0.2).convert('RGBA')
        for k, (p, x) in enumerate(zip(hp, xs)):
            a = keluar_cepat((t - 0.05 - k * 0.12) / 0.34)
            if a <= 0:
                continue
            y = (H - p.height) / 2 + 30 + (1 - a) * 220 + (-30 if k == 1 else 0) + 8 * math.sin(t * 3.5 + k * 1.3)
            tempel(im, bay, (x - pad, y - pad), a)
            tempel(im, p, (x, y), a)
        yield keterangan(im.convert('RGB'), 'Mode seluler', 'Nyaman di genggaman.',
                         'Laci, bilah alat bawah, dan kartu studi',
                         mulus((t - 0.2) / 0.14) * (1 - mulus((t - 0.86) / 0.1)))


# ---------------------------------------------------------------- penutup
def adegan_penutup(detik=5.6):
    total = int(detik * FPS)
    produk = Image.open(os.path.join(AKAR, 'assets', '3d', 'putih-hero.webp')).convert('RGBA')
    produk = produk.resize((620, int(produk.height * 620 / produk.width)), Image.LANCZOS)
    lg = tanda_m(96)
    fj, ft, fu, fk = huruf(112, 800), huruf(32, 400), mono(24), mono(15)
    cincin = muat_ornamen('cincin', 560)
    for i in range(total):
        t = i / total
        im = aura(0.9 + t * 0.1).convert('RGBA')
        a0 = keluar_cepat(t / 0.35)
        tempel(im, cincin, (1270 - cincin.width / 2, 540 - cincin.height / 2 + 10 * math.sin(t * 3)), a0 * 0.8)
        tempel(im, produk, (1270 - produk.width / 2, 520 - produk.height / 2 + 40 * (1 - a0)), a0)
        lap = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lap)
        a1 = keluar_cepat((t - 0.12) / 0.3)
        a2 = keluar_cepat((t - 0.26) / 0.3)
        a3 = keluar_cepat((t - 0.40) / 0.3)
        x0 = 170 + 30 * (1 - a1)
        tempel(lap, lg, (x0, 330), a1)
        d.text((x0 + 120, 318), 'Medivox', font=fj, fill=NAVY + (int(255 * a1),))
        d.rounded_rectangle([x0, 478, x0 + 120 * a2, 482], 2, fill=CYAN + (int(255 * a2),))
        d.text((x0, 504), 'See. Speak. Understand.', font=ft, fill=TEKS2 + (int(255 * a2),))
        lebar = lebar_spasi(d, 'medivox-id.web.app', fu, 3) + 48
        d.rounded_rectangle([x0, 580, x0 + lebar, 628], 24, fill=(255, 255, 255, int(230 * a3)),
                            outline=CYAN + (int(200 * a3),), width=2)
        tulis_spasi(d, (x0 + 24, 591), 'medivox-id.web.app', fu, BIRU + (int(255 * a3),), 3)
        tulis_spasi(d, (x0, H - 130), 'PROTOTIPE ANTARMUKA  \u00b7  BUKAN PERANGKAT MEDIS', fk,
                    MUTED + (int(220 * a3),), 4)
        im.alpha_composite(lap)
        if t > 0.9:
            im = Image.blend(im.convert('RGB'), Image.new('RGB', (W, H), (255, 255, 255)),
                             mulus((t - 0.9) / 0.1)).convert('RGBA')
        yield im.convert('RGB')


# ---------------------------------------------------------------- audio
def musik(ffmpeg, detik, jalur):
    """Pad ambient yang lebih terang: akor D mayor-sembilan dengan denyut
    lembut, disintesis ffmpeg — tanpa berkas musik milik pihak lain."""
    nada = [146.83, 220.00, 293.66, 369.99, 440.00, 659.26]
    bobot = [0.24, 0.17, 0.15, 0.10, 0.09, 0.05]
    suku = []
    for i, (f, b) in enumerate(zip(nada, bobot)):
        laju = 0.08 + i * 0.021
        suku.append('%.3f*sin(2*PI*%.2f*t)*(0.72+0.28*sin(2*PI*%.3f*t+%d))' % (b, f, laju, i))
    # denyut halus tiap 2 detik: kesan teknologi, bukan dentum
    suku.append('0.05*sin(2*PI*880*t)*exp(-6*(t-2*floor(t/2)))')
    saring = ('lowpass=f=2400,aecho=0.8:0.7:380|760:0.26|0.16,'
              'afade=t=in:st=0:d=2.2,afade=t=out:st=%.2f:d=3.0,volume=1.6' % (detik - 3.0))
    subprocess.run([ffmpeg, '-y', '-v', 'error', '-f', 'lavfi',
                    '-i', 'aevalsrc=%s:s=48000:d=%.2f' % ('+'.join(suku), detik),
                    '-af', saring, '-ac', '2', '-c:a', 'aac', '-b:a', '192k', jalur],
                   check=True)


# ---------------------------------------------------------------- perakitan
def simpan(im, n):
    im.save(os.path.join(FRAME, 'r%05d.jpg' % n), 'JPEG', quality=93)
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


def urutan():
    """Daftar adegan (generator frame). Film gabungan atau mockup aplikasi."""
    shot = lambda *a: (lambda: adegan_shot(*a))
    app = [
        shot('laptop', 5.0, 'Aplikasi desktop', 'Viewer 2D yang jernih.',
             'Area citra tetap gelap \u2014 kontras jaringan terjaga'),
        adegan_gulir,
        adegan_alur,
        shot('ponsel', 5.0, 'Aplikasi seluler', 'Studi di saku jas.',
             'Satu kode HTML, CSS & JS native untuk semua layar'),
        adegan_seluler,
    ]
    if HANYA_APP:
        return app
    return [
        shot('masuk', 5.0, 'Perangkat', 'Satu basis. Satu prisma.',
             'MEDIVOX-1 \u00b7 volumetric review system'),
        shot('orbit', 5.0, 'Pepper\u2019s ghost', 'Empat pantulan, satu bentuk.',
             'Tanpa kacamata, tanpa proyektor, tanpa headset'),
        shot('panel', 4.2, 'Panel pemancar', 'Empat pandangan sekaligus.',
             'Anterior \u00b7 posterior \u00b7 lateral kiri \u00b7 lateral kanan'),
        shot('ekosistem', 6.0, 'Perangkat keras + lunak', 'Satu ekosistem.',
             'MEDIVOX-1, laptop, dan ponsel membaca studi yang sama'),
    ] + app


def bangun():
    if os.path.isdir(FRAME):
        shutil.rmtree(FRAME)
    os.makedirs(FRAME)
    n = adegan_pembuka(0)
    sebelumnya = Image.open(os.path.join(FRAME, 'r%05d.jpg' % (n - 1))).convert('RGB')
    adegan = urutan() + [adegan_penutup]
    for buat in adegan:
        for i, im in enumerate(buat()):
            if i < SILANG:
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
