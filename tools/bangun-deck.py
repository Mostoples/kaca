#!/usr/bin/env python3
"""
==========================================================
MEDIVOX — pembangun deck presentasi (16:9)
----------------------------------------------------------
Gaya: neumorfisme "aura glass".
  * latar: putih kebiruan dengan awan cahaya (aura) biru, cyan,
    dan lila samar, kisi titik halus, ornamen 3D Blender yang
    melayang — sebagian diburamkan untuk kedalaman
  * kartu: kaca beku sungguhan (latar di bawahnya diburamkan
    dan diterangkan), tepi putih bercahaya, bayangan ganda
    neumorfik (terang kiri-atas, gelap kanan-bawah), pola relief
  * ikon, ornamen, pola, dan render produk putih semuanya hasil
    Blender CLI (assets/ui, assets/3d)

Setiap slide = satu kanvas Pillow 2560x1440 (latar + kaca + gambar)
yang ditempel sebagai gambar, lalu judul dan paragraf ditaruh sebagai
kotak teks PowerPoint supaya tetap bisa disunting.

Jalankan:  python tools/bangun-deck.py
Keluaran:  build/MEDIVOX_Deck.pptx
==========================================================
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GBR = os.path.join(AKAR, 'build', 'deck', 'gbr')
TIGA_D = os.path.join(AKAR, 'assets', '3d')
UI = os.path.join(AKAR, 'assets', 'ui')
FOTO = os.path.join(AKAR, 'build', 'foto')
KIT = os.path.join(AKAR, 'build', 'kit')
KELUAR = os.path.join(AKAR, 'build', 'MEDIVOX_Deck.pptx')
os.makedirs(GBR, exist_ok=True)

SW, SH = 2560, 1440
IN_W, IN_H = 13.333, 7.5
SKALA = SW / IN_W              # piksel per inci

PUTIH = (255, 255, 255)
LATAR = (238, 243, 250)
NAVY = (19, 41, 75)
TEKS2 = (61, 90, 130)
MUTED = (90, 114, 144)
BIRU = (47, 111, 208)
CYAN = (94, 201, 242)
LILA = (150, 150, 255)


def px(inci):
    return int(round(inci * SKALA))


# ---------------------------------------------------------------- huruf
_cache = {}


def huruf(ukuran, berat=800, mono=False):
    kunci = (ukuran, berat, mono)
    if kunci in _cache:
        return _cache[kunci]
    f = None
    if mono:
        for j in (os.path.join(AKAR, 'build', 'font', 'JetBrainsMono-Medium.ttf'),
                  r'C:\Windows\Fonts\consola.ttf'):
            if os.path.exists(j):
                f = ImageFont.truetype(j, ukuran)
                break
    else:
        j = os.path.join(AKAR, 'build', 'font', 'Manrope.ttf')
        if os.path.exists(j):
            f = ImageFont.truetype(j, ukuran)
            try:
                f.set_variation_by_axes([berat])
            except Exception:
                pass
        else:
            nama = 'segoeuib.ttf' if berat >= 600 else 'segoeui.ttf'
            f = ImageFont.truetype(os.path.join(r'C:\Windows\Fonts', nama), ukuran)
    _cache[kunci] = f
    return f


def tulis(d, xy, teks, f, warna=NAVY, spasi=0):
    if not spasi:
        d.text(xy, teks, font=f, fill=warna)
        return
    x, y = xy
    for ch in teks:
        d.text((x, y), ch, font=f, fill=warna)
        x += d.textlength(ch, font=f) + spasi


def lebar_spasi(d, teks, f, spasi):
    return sum(d.textlength(c, font=f) + spasi for c in teks) - spasi


def bungkus(d, teks, f, lebar_maks):
    kata, baris, kini = teks.split(), [], ''
    for k in kata:
        uji = (kini + ' ' + k).strip()
        if d.textlength(uji, font=f) <= lebar_maks:
            kini = uji
        else:
            if kini:
                baris.append(kini)
            kini = k
    if kini:
        baris.append(kini)
    return baris


# ---------------------------------------------------------------- aset
def muat(jalur, lebar=None, tinggi=None):
    im = Image.open(jalur).convert('RGBA')
    if lebar:
        im = im.resize((int(lebar), int(im.height * lebar / im.width)), Image.LANCZOS)
    elif tinggi:
        im = im.resize((int(im.width * tinggi / im.height), int(tinggi)), Image.LANCZOS)
    return im


def ikon(nama, ukuran):
    """Ikon 3D Blender; PNG 192 px dari build/kit bila ada (lebih tajam)."""
    besar = os.path.join(KIT, 'ikon', nama + '.png')
    jalur = besar if os.path.exists(besar) else os.path.join(UI, 'ikon', nama + '.webp')
    return muat(jalur, ukuran)


def ornamen(nama, lebar):
    return muat(os.path.join(UI, 'ornamen', nama + '.webp'), lebar)


_POLA = {}


def pola(nama, ukuran):
    """Lapisan pola relief (alfa) dipetakan berulang seukuran kotak."""
    k = (nama, ukuran)
    if k not in _POLA:
        ubin = Image.open(os.path.join(UI, 'pola', nama + '.webp')).convert('RGBA')
        ubin = ubin.resize((420, 420), Image.LANCZOS)
        w, h = ukuran
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        for y in range(0, h, 420):
            for x in range(0, w, 420):
                im.paste(ubin, (x, y))
        _POLA[k] = im
    return _POLA[k].copy()


# ---------------------------------------------------------------- kanvas slide
class Kanvas:
    """Satu slide sebagai gambar: aura, ornamen, kaca, gambar."""

    def __init__(self, varian='polos', benih=0):
        self.im = aura(varian, benih)
        self.d = ImageDraw.Draw(self.im)

    # ---- kaca beku dengan bayangan neumorfik ganda
    def kaca(self, kotak, radius=40, pekat=0.64, pola_nama=None, sorot=True, datar=False):
        x0, y0, x1, y1 = [int(v) for v in kotak]
        w, h = x1 - x0, y1 - y0
        if not datar:
            # bayangan terang (kiri-atas) dan gelap (kanan-bawah)
            lap = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
            dl = ImageDraw.Draw(lap)
            dl.rounded_rectangle([x0 - 16, y0 - 16, x1 - 16, y1 - 16], radius, fill=(255, 255, 255, 190))
            lap = lap.filter(ImageFilter.GaussianBlur(26))
            self.im.alpha_composite(lap)
            lap = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
            dl = ImageDraw.Draw(lap)
            dl.rounded_rectangle([x0 + 18, y0 + 26, x1 + 18, y1 + 26], radius, fill=(22, 52, 98, 52))
            lap = lap.filter(ImageFilter.GaussianBlur(34))
            self.im.alpha_composite(lap)
        # kaca beku: latar di bawahnya diburamkan lalu dicampur putih
        pot = self.im.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(30))
        pot = Image.blend(pot, Image.new('RGBA', pot.size, (255, 255, 255, 255)), pekat)
        topeng = Image.new('L', (w, h), 0)
        ImageDraw.Draw(topeng).rounded_rectangle([0, 0, w - 1, h - 1], radius, fill=255)
        if pola_nama:
            p = pola(pola_nama, (w, h))
            memudar = Image.linear_gradient('L').rotate(-40, expand=True).resize((w, h))
            memudar = memudar.point(lambda v: max(0, int((v - 110) * 1.75)))
            p.putalpha(Image.composite(p.getchannel('A').point(lambda v: int(v * 0.30)),
                                       Image.new('L', (w, h), 0), memudar))
            pot.alpha_composite(p)
        if sorot:
            # kilau lembut dari atas
            kilau = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            ImageDraw.Draw(kilau).ellipse([-w * 0.2, -h * 1.1, w * 1.2, h * 0.35], fill=(255, 255, 255, 60))
            pot.alpha_composite(kilau.filter(ImageFilter.GaussianBlur(40)))
        self.im.paste(pot, (x0, y0), topeng)
        # tepi: putih bercahaya di atas, memudar ke bawah
        tepi = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(tepi).rounded_rectangle([1, 1, w - 2, h - 2], radius, outline=(255, 255, 255, 255), width=3)
        grad = Image.linear_gradient('L').resize((w, h)).point(lambda v: 255 - int(v * 0.6))
        tepi.putalpha(Image.composite(tepi.getchannel('A'), Image.new('L', (w, h), 0), grad))
        self.im.alpha_composite(tepi, (x0, y0))

    def hud(self, kotak, pjg=30, warna=CYAN):
        x0, y0, x1, y1 = kotak
        m = 18
        for (ax, ay, sx, sy) in [(x0 + m, y0 + m, 1, 1), (x1 - m, y0 + m, -1, 1),
                                 (x0 + m, y1 - m, 1, -1), (x1 - m, y1 - m, -1, -1)]:
            self.d.line([(ax, ay), (ax + pjg * sx, ay)], fill=warna + (230,), width=3)
            self.d.line([(ax, ay), (ax, ay + pjg * sy)], fill=warna + (230,), width=3)

    def tempel(self, gambar, xy, bayang=True, kabur=30, turun=30, gelap=60):
        x, y = int(xy[0]), int(xy[1])
        if bayang:
            a = gambar.getchannel('A')
            sil = Image.new('RGBA', gambar.size, (22, 52, 98, 0))
            sil.putalpha(a.point(lambda v: int(v * gelap / 255)))
            pad = kabur * 3
            bs = Image.new('RGBA', (gambar.width + pad * 2, gambar.height + pad * 2), (0, 0, 0, 0))
            bs.alpha_composite(sil, (pad, pad))
            bs = bs.filter(ImageFilter.GaussianBlur(kabur))
            self.im.alpha_composite(bs, (x - pad, y - pad + turun))
        self.im.alpha_composite(gambar, (x, y))

    def ubin_ikon(self, nama, x, y, ukuran=150):
        """Petak kaca kecil berisi ikon 3D."""
        self.kaca([x, y, x + ukuran, y + ukuran], int(ukuran * 0.3), 0.72, sorot=True)
        ik = ikon(nama, int(ukuran * 0.66))
        self.tempel(ik, (x + (ukuran - ik.width) / 2, y + (ukuran - ik.height) / 2),
                    kabur=8, turun=8, gelap=50)

    def jadi(self, nama):
        # satu kanvas penuh per slide: JPEG jauh lebih ringan daripada PNG
        jalur = os.path.join(GBR, nama + '.jpg')
        self.im.convert('RGB').save(jalur, 'JPEG', quality=90, subsampling=0)
        s = PRS.slides.add_slide(KOSONG)
        s.shapes.add_picture(jalur, 0, 0, Inches(IN_W), Inches(IN_H))
        return s


def aura(varian, benih):
    """Latar aura: awan cahaya besar yang diburamkan + kisi titik + ornamen."""
    rnd = random.Random(benih * 7 + 3)
    kecil = Image.new('RGBA', (256, 144), LATAR + (255,))
    lap = Image.new('RGBA', (256, 144), (0, 0, 0, 0))
    d = ImageDraw.Draw(lap)
    ox = rnd.uniform(-20, 20)
    d.ellipse([-70 + ox, -80, 110 + ox, 70], fill=CYAN + (120,))
    d.ellipse([150 - ox, 60, 330 - ox, 210], fill=BIRU + (70,))
    d.ellipse([170 + ox, -60, 300 + ox, 60], fill=LILA + (46,))
    d.ellipse([60 - ox, 90, 190 - ox, 200], fill=(255, 255, 255, 150))
    lap = lap.filter(ImageFilter.GaussianBlur(30))
    kecil.alpha_composite(lap)
    im = kecil.resize((SW, SH), Image.BICUBIC)
    titik = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    dt = ImageDraw.Draw(titik)
    for y in range(30, SH, 40):
        for x in range(30, SW, 40):
            dt.ellipse([x - 1.3, y - 1.3, x + 1.3, y + 1.3], fill=(47, 111, 208, 30))
    im.alpha_composite(titik)

    def taruh(nama, lebar, x, y, kabur=0, alfa=1.0):
        o = ornamen(nama, lebar)
        if kabur:
            pad = kabur * 3
            b = Image.new('RGBA', (o.width + pad * 2, o.height + pad * 2), (0, 0, 0, 0))
            b.alpha_composite(o, (pad, pad))
            o = b.filter(ImageFilter.GaussianBlur(kabur))
            x, y = x - pad, y - pad
        if alfa < 1:
            o.putalpha(o.getchannel('A').point(lambda v: int(v * alfa)))
        im.alpha_composite(o, (int(x), int(y)))

    if varian == 'bab':
        taruh('cincin', 900, 1560, 170, 0, 0.95)
        taruh('bola', 300, 2150, 900, 6, 0.9)
        taruh('kapsul', 380, 1380, 980, 0, 1.0)
        taruh('heliks', 170, 2320, 220, 10, 0.7)
        taruh('palang', 170, 1250, 280, 14, 0.8)
    elif varian == 'sampul':
        taruh('cincin', 620, -190, 900, 10, 0.7)
        taruh('palang', 150, 1180, 120, 6, 0.9)
        taruh('heliks', 150, 2380, 900, 8, 0.8)
    else:
        pilihan = [('bola', 190), ('palang', 130), ('kapsul', 220), ('heliks', 120), ('cincin', 260)]
        nama, lebar = pilihan[benih % len(pilihan)]
        taruh(nama, lebar, SW - lebar - 70, 60, 12, 0.55)
    return im


# ---------------------------------------------------------------- komponen
MARG = px(0.72)


def kartu_poin(k, x, y, w, h, nama_ikon, no, judul, ket, pola_nama='hex'):
    k.kaca([x, y, x + w, y + h], 40, pola_nama=pola_nama)
    k.ubin_ikon(nama_ikon, x + 44, y + 44, 136)
    d = k.d
    tulis(d, (x + w - 44 - lebar_spasi(d, no, huruf(26, mono=True), 4), y + 58), no,
          huruf(26, mono=True), BIRU, spasi=4)
    fj, fk = huruf(44, 800), huruf(29, 500)
    yy = y + 220
    for baris in bungkus(d, judul, fj, w - 88):
        tulis(d, (x + 44, yy), baris, fj, NAVY)
        yy += 56
    yy += 12
    for baris in bungkus(d, ket, fk, w - 88):
        tulis(d, (x + 44, yy), baris, fk, TEKS2)
        yy += 42


def deret_kartu(k, y, h, poin, kolom=3, pola_nama='hex'):
    guna = SW - MARG * 2
    jarak = 52
    lebar = (guna - (kolom - 1) * jarak) // kolom
    for i, p in enumerate(poin):
        kartu_poin(k, MARG + i * (lebar + jarak), y, lebar, h, *p,
                   pola_nama=['hex', 'gelombang', 'titik'][i % 3] if pola_nama == 'campur' else pola_nama)


def deret_angka(k, y, h, angka):
    guna = SW - MARG * 2
    jarak = 48
    lebar = (guna - (len(angka) - 1) * jarak) // len(angka)
    fa, fl = huruf(104, 800), huruf(30, 500)
    for i, (nilai, label) in enumerate(angka):
        x = MARG + i * (lebar + jarak)
        k.kaca([x, y, x + lebar, y + h], 40, pola_nama='lingkar')
        k.hud([x, y, x + lebar, y + h])
        d = k.d
        w = d.textlength(nilai, font=fa)
        # angka bergradien biru -> cyan
        lap = Image.new('RGBA', (int(w) + 10, 140), (0, 0, 0, 0))
        ImageDraw.Draw(lap).text((0, 0), nilai, font=fa, fill=(255, 255, 255, 255))
        grad = Image.new('RGBA', lap.size)
        gd = ImageDraw.Draw(grad)
        for gx in range(lap.width):
            t = gx / max(1, lap.width - 1)
            gd.line([(gx, 0), (gx, lap.height)],
                    fill=tuple(int(BIRU[j] + (CYAN[j] - BIRU[j]) * t) for j in range(3)) + (255,))
        grad.putalpha(lap.getchannel('A'))
        k.im.alpha_composite(grad, (int(x + (lebar - w) / 2), y + 70))
        for j, baris in enumerate(label.split('\n')):
            bw = d.textlength(baris, font=fl)
            tulis(d, (x + (lebar - bw) / 2, y + 222 + j * 42), baris, fl, TEKS2)


def produk_di_kaca(k, kotak, berkas, lebar_gbr, pola_nama='lingkar', label=None):
    x0, y0, x1, y1 = kotak
    k.kaca(kotak, 48, pola_nama=pola_nama)
    k.hud(kotak)
    g = muat(os.path.join(TIGA_D, berkas), lebar_gbr)
    maks_t = (y1 - y0) - (130 if label else 60)
    if g.height > maks_t:
        g = g.resize((int(g.width * maks_t / g.height), maks_t), Image.LANCZOS)
    k.tempel(g, (x0 + (x1 - x0 - g.width) / 2, y0 + 30 + (maks_t - g.height) / 2), kabur=26, turun=34, gelap=70)
    if label:
        judul, sub = label
        tulis(k.d, (x0 + 44, y1 - 104), judul, huruf(34, 800), NAVY)
        tulis(k.d, (x0 + 44, y1 - 58), sub, huruf(22, mono=True), MUTED)


def jendela(k, gambar, x, y, lebar, url):
    im = Image.open(gambar).convert('RGB')
    t_isi = int(im.height * lebar / im.width)
    im = im.resize((lebar, t_isi), Image.LANCZOS)
    bar = 56
    kotak = [x, y, x + lebar + 20, y + t_isi + bar + 10]
    k.kaca(kotak, 30, 0.7)
    d = k.d
    for i, c in enumerate([(236, 106, 94), (244, 191, 79), (97, 197, 84)]):
        d.ellipse([x + 26 + i * 24, y + 21, x + 40 + i * 24, y + 35], fill=c)
    fu = huruf(19, mono=True)
    uw = d.textlength(url, font=fu) + 70
    ux = x + (lebar + 20 - uw) / 2
    d.rounded_rectangle([ux, y + 12, ux + uw, y + 44], 16, fill=(236, 242, 250))
    d.ellipse([ux + 16, y + 23, ux + 26, y + 33], fill=CYAN)
    d.text((ux + 38, y + 15), url, font=fu, fill=MUTED)
    topeng = Image.new('L', im.size, 0)
    ImageDraw.Draw(topeng).rounded_rectangle([0, 0, im.width - 1, im.height - 1], 18, fill=255)
    k.im.paste(im, (x + 10, y + bar), topeng)
    return kotak


def ponsel(k, gambar, x, y, tinggi):
    im = Image.open(gambar).convert('RGB')
    lh = tinggi - 30
    lw = int(im.width * lh / im.height)
    im = im.resize((lw, lh), Image.LANCZOS)
    Wp = lw + 30
    badan = Image.new('RGBA', (Wp, tinggi), (0, 0, 0, 0))
    d = ImageDraw.Draw(badan)
    d.rounded_rectangle([0, 0, Wp - 1, tinggi - 1], int(Wp * 0.16), fill=(228, 234, 243, 255),
                        outline=(255, 255, 255, 255), width=4)
    d.rounded_rectangle([8, 8, Wp - 9, tinggi - 9], int(Wp * 0.14), fill=(10, 14, 22, 255))
    topeng = Image.new('L', im.size, 0)
    ImageDraw.Draw(topeng).rounded_rectangle([0, 0, lw - 1, lh - 1], int(Wp * 0.12), fill=255)
    badan.paste(im, (15, 15), topeng)
    cx = Wp // 2
    d.rounded_rectangle([cx - Wp * 0.15, 26, cx + Wp * 0.15, 26 + Wp * 0.08], int(Wp * 0.04), fill=(0, 0, 0, 255))
    k.tempel(badan, (x, y), kabur=34, turun=36, gelap=80)
    return Wp


def diagram_prisma(k, kotak):
    x0, y0, x1, y1 = kotak
    k.kaca(kotak, 48, pola_nama='gelombang')
    k.hud(kotak)
    d = k.d
    cx = (x0 + x1) // 2
    dasar = y1 - 190
    atas_l, atas_r, bawah_l, bawah_r, puncak = cx - 430, cx + 430, cx - 96, cx + 96, y0 + 150
    for a, b in [((atas_l, puncak), (atas_r, puncak)), ((atas_l, puncak), (bawah_l, dasar)),
                 ((atas_r, puncak), (bawah_r, dasar)), ((bawah_l, dasar), (bawah_r, dasar))]:
        d.line([a, b], fill=BIRU, width=6)
    # volume bercahaya
    pijar = Image.new('RGBA', k.im.size, (0, 0, 0, 0))
    ImageDraw.Draw(pijar).ellipse([cx - 150, puncak + 100, cx + 150, puncak + 300], fill=CYAN + (120,))
    k.im.alpha_composite(pijar.filter(ImageFilter.GaussianBlur(30)))
    otak = ikon('otak', 190)
    k.tempel(otak, (cx - 95, puncak + 105), kabur=10, turun=10, gelap=40)
    d = k.d
    d.rounded_rectangle([cx - 320, dasar + 30, cx + 320, dasar + 88], 20, fill=(236, 245, 254),
                        outline=BIRU, width=3)
    fm, fk = huruf(24, mono=True), huruf(30, 500)
    t = 'PANEL EMPAT KUADRAN'
    tulis(d, (cx - lebar_spasi(d, t, fm, 4) / 2, dasar + 44), t, fm, BIRU, spasi=4)
    for s in (-1, 1):
        d.line([(cx + s * 160, dasar + 26), (cx + s * 340, puncak + 150)], fill=CYAN, width=4)
    for (tx, no, baris) in [(x0 + 90, '01', ['Empat pandangan', 'dipancarkan panel']),
                            (x1 - 460, '02', ['Tiap bidang prisma', 'memantulkan satu sisi'])]:
        tulis(d, (tx, y0 + 110), no, fm, BIRU, spasi=4)
        for i, b in enumerate(baris):
            tulis(d, (tx, y0 + 152 + i * 44), b, fk, TEKS2)
    t = '03  KEEMPATNYA BERTEMU DI SATU TITIK'
    tulis(d, (cx - lebar_spasi(d, t, fm, 4) / 2, y0 + 70), t, fm, BIRU, spasi=4)


# ---------------------------------------------------------------- teks pptx
PRS = Presentation()
PRS.slide_width = Inches(IN_W)
PRS.slide_height = Inches(IN_H)
KOSONG = PRS.slide_layouts[6]
TOTAL = 24


def teks(s, x, y, w, h, isi, ukuran, warna=NAVY, tebal=True, spasi=0,
         rata=PP_ALIGN.LEFT, mono=False, jarak_baris=1.15):
    kotak = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = kotak.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, baris in enumerate(isi.split('\n')):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = rata
        p.line_spacing = jarak_baris
        r = p.add_run()
        r.text = baris
        r.font.size = Pt(ukuran)
        r.font.bold = tebal
        r.font.color.rgb = RGBColor(*warna)
        r.font.name = 'Consolas' if mono else 'Segoe UI'
        if spasi:
            r.font._rPr.set('spc', str(int(spasi * 100)))
    return kotak


def kop(s, bab, nomor):
    if bab:
        teks(s, 0.98, 0.5, 8, 0.3, bab.upper(), 10.5, BIRU, spasi=2.2, mono=True)
    teks(s, IN_W - 1.9, 0.5, 1.2, 0.3, '%02d / %d' % (nomor, TOTAL), 10.5,
         MUTED, tebal=False, spasi=1.4, rata=PP_ALIGN.RIGHT, mono=True)


def titik_kop(k, bab=True):
    """Titik bercahaya di depan label bab (digambar di kanvas)."""
    if not bab:
        return
    x, y = px(0.78), px(0.585)
    pijar = Image.new('RGBA', (80, 80), (0, 0, 0, 0))
    ImageDraw.Draw(pijar).ellipse([26, 26, 54, 54], fill=CYAN + (200,))
    k.im.alpha_composite(pijar.filter(ImageFilter.GaussianBlur(8)), (x - 40, y - 40))
    k.d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=CYAN)


def garis_aksen(k, x, y, w=0.62):
    x0, y0 = px(x), px(y)
    x1 = x0 + px(w)
    for gx in range(x0, x1):
        t = (gx - x0) / max(1, x1 - x0)
        k.d.line([(gx, y0), (gx, y0 + 8)], fill=tuple(int(BIRU[j] + (CYAN[j] - BIRU[j]) * t) for j in range(3)))


def judul_slide(s, judul, sub=None, y=1.25, lebar=11.5):
    teks(s, 0.72, y, lebar, 1.2, judul, 40)
    if sub:
        teks(s, 0.74, y + 0.70 * len(judul.split('\n')) + 0.3, 10.4, 1.0, sub, 15,
             TEKS2, tebal=False, jarak_baris=1.35)


def slide_bab(no, judul, sub, nomor):
    k = Kanvas('bab', nomor)
    k.kaca([px(0.5), px(2.35), px(8.2), px(5.9)], 60, 0.5, pola_nama='hex')
    k.hud([px(0.5), px(2.35), px(8.2), px(5.9)], 40)
    garis_aksen(k, 0.98, 3.35)
    s = k.jadi('bab%s' % no)
    kop(s, None, nomor)
    teks(s, 0.98, 2.85, 3, 0.4, no, 13, BIRU, spasi=3, mono=True)
    teks(s, 0.98, 3.55, 7, 1.2, judul, 54)
    teks(s, 1.0, 4.85, 6.8, 1.0, sub, 17, TEKS2, tebal=False, jarak_baris=1.3)
    return s


# ================================================================ isi deck
def bangun():
    n = [0]

    def nx():
        n[0] += 1
        return n[0]

    # ---- 01 sampul
    k = Kanvas('sampul', 1)
    k.kaca([px(7.0), px(0.9), px(12.75), px(6.75)], 90, 0.42, pola_nama='lingkar')
    k.hud([px(7.0), px(0.9), px(12.75), px(6.75)], 44)
    g = muat(os.path.join(TIGA_D, 'putih-hero.webp'), px(5.3))
    k.tempel(g, (px(7.2), px(1.25)), kabur=40, turun=50, gelap=80)
    garis_aksen(k, 0.74, 2.05)
    # lambang
    k.ubin_ikon('hologram', px(0.72), px(0.62), 150)
    s = k.jadi('s01')
    kop(s, None, nx())
    teks(s, 1.66, 0.78, 5, 0.4, 'MEDIVOX', 18, NAVY, spasi=3)
    teks(s, 0.72, 2.2, 6.2, 1.7, 'Citra CT dan MRI\nyang mengambang', 38)
    teks(s, 0.74, 3.85, 5.8, 1.5,
         'MEDIVOX-1 menyusun tumpukan irisan DICOM menjadi volume tiga dimensi, '
         'lalu memantulkannya lewat prisma menjadi satu bentuk yang tampak melayang.',
         14.5, TEKS2, tebal=False, jarak_baris=1.4)
    teks(s, 0.74, 5.55, 6, 0.3, 'SEE.  SPEAK.  UNDERSTAND.', 10.5, BIRU, spasi=3, mono=True)
    teks(s, 0.74, 5.95, 6, 0.3, 'Prototipe antarmuka — bukan perangkat medis', 10, MUTED,
         tebal=False, mono=True)

    # ---- 02 agenda
    k = Kanvas('polos', 2)
    deret_kartu(k, px(2.75), px(2.05), [
        ('otak', '01', 'Persoalan', 'Volume dibaca sebagai irisan datar.'),
        ('hologram', '02', 'Sistem', 'MEDIVOX-1 dan cara kerjanya.'),
        ('viewer', '03', 'Perangkat lunak', 'Parser, viewer, panggung hologram.'),
    ], pola_nama='campur')
    deret_kartu(k, px(5.05), px(2.05), [
        ('centang', '04', 'Bukti', 'Pengujian otomatis dan data nyata.'),
        ('sinkron', '05', 'Rencana', 'Yang sudah jalan dan berikutnya.'),
        ('perisai', '—', 'Catatan', 'Batas penggunaan dan regulasi.'),
    ], pola_nama='campur')
    s = k.jadi('s02')
    kop(s, None, nx())
    judul_slide(s, 'Agenda', 'Lima bagian, dari persoalan pembacaan sampai bukti pengujian.', y=0.95)

    # ---- 03 bab 1
    slide_bab('01', 'Persoalan', 'Volume tiga dimensi dinilai lewat layar dua dimensi.', nx())

    # ---- 04 masalah
    k = Kanvas('polos', 4)
    titik_kop(k)
    deret_kartu(k, px(3.95), px(3.0), [
        ('otak', 'A', 'Beban kognitif', 'Bentuk tiga dimensi disusun ulang dari potongan datar.'),
        ('pengguna', 'B', 'Sulit dikomunikasikan', 'Menjelaskan letak lesi ke klinisi memakan waktu.'),
        ('lapisan', 'C', 'Butuh pelatihan', 'Kemampuan membaca ruang tumbuh lambat.'),
    ], pola_nama='campur')
    s = k.jadi('s04')
    kop(s, '01 · Persoalan', nx())
    judul_slide(s, 'Hubungan ruang harus\ndibayangkan sendiri',
                'Radiolog menggulir ratusan irisan aksial lalu menyusun bentuknya di kepala.')

    # ---- 05 dampak
    k = Kanvas('polos', 5)
    titik_kop(k)
    deret_angka(k, px(3.0), px(2.35), [('512³', 'ukuran volume CT\nyang lazim'),
                                       ('200+', 'irisan digulir\nper satu studi'),
                                       ('2D', 'dimensi layar\ntempat menilainya'),
                                       ('0', 'kedalaman nyata\npada monitor')])
    s = k.jadi('s05')
    kop(s, '01 · Persoalan', nx())
    judul_slide(s, 'Dampaknya terukur')
    teks(s, 0.72, 6.25, 11.5, 0.5,
         'Angka di atas menggambarkan skala data, bukan klaim kinerja klinis.',
         11.5, MUTED, tebal=False)

    # ---- 06 bab 2
    slide_bab('02', 'Sistem', 'Satu basis, satu prisma, dan volume yang tampak mengambang.', nx())

    # ---- 07 produk
    k = Kanvas('polos', 7)
    titik_kop(k)
    produk_di_kaca(k, [px(6.1), px(0.95), px(12.75), px(6.85)], 'putih-tigaper.webp', px(6.0))
    for i, (ik, a, b) in enumerate([('hologram', 'Prisma kaca', 'empat bidang pemantul'),
                                    ('lapisan', 'Panel pemancar', 'empat kuadran')]):
        x = px(0.72) + i * px(2.65)
        k.kaca([x, px(5.2), x + px(2.45), px(6.55)], 34, pola_nama='titik')
        k.ubin_ikon(ik, x + 28, px(5.2) + 32, 110)
        tulis(k.d, (x + 160, px(5.2) + 44), a, huruf(30, 800), NAVY)
        tulis(k.d, (x + 160, px(5.2) + 90), b, huruf(22, mono=True), MUTED)
    s = k.jadi('s07')
    kop(s, '02 · Sistem', nx())
    judul_slide(s, 'MEDIVOX-1', lebar=5)
    teks(s, 0.74, 2.2, 4.9, 2.6,
         'Basis keramik putih menahan panel empat kuadran yang memancarkan pandangan '
         'volume. Prisma piramida terbalik di atasnya memantulkan keempatnya sehingga '
         'bertemu sebagai satu bentuk di udara.', 14.5, TEKS2, tebal=False, jarak_baris=1.45)
    teks(s, 0.74, 4.45, 5, 0.3, 'EFEK PEPPER’S GHOST', 10.5, BIRU, spasi=2.2, mono=True)

    # ---- 08 cara kerja
    k = Kanvas('polos', 8)
    titik_kop(k)
    diagram_prisma(k, [px(0.72), px(2.25), px(12.6), px(6.9)])
    s = k.jadi('s08')
    kop(s, '02 · Sistem', nx())
    judul_slide(s, 'Cara kerjanya')

    # ---- 09 galeri
    k = Kanvas('polos', 9)
    titik_kop(k)
    for i, (berkas, a, b) in enumerate([('putih-atas.webp', 'Dari atas', 'Panel empat kuadran'),
                                        ('putih-samping.webp', 'Samping', 'Sudut bidang pemantul'),
                                        ('putih-dekat.webp', 'Dekat', 'Detail basis & prisma')]):
        x0 = px(0.72) + i * px(4.08)
        produk_di_kaca(k, [x0, px(2.3), x0 + px(3.8), px(6.55)], berkas, px(3.3),
                       ['lingkar', 'titik', 'hex'][i], (a, b))
    s = k.jadi('s09')
    kop(s, '02 · Sistem', nx())
    judul_slide(s, 'Dari segala sisi')
    teks(s, 0.72, 6.8, 11.8, 0.4, 'Render tiga dimensi dari skrip Blender CLI — bukan foto, bukan gambar stok.',
         11, MUTED, tebal=False)

    # ---- 10 modalitas
    k = Kanvas('polos', 10)
    titik_kop(k)
    for i, (berkas, a, b) in enumerate([('putih-toraks.webp', 'CT toraks', 'Paru, mediastinum, dinding dada'),
                                        ('putih-tengkorak.webp', 'Tengkorak', 'Rekonstruksi permukaan tulang')]):
        x0 = px(0.72) + i * px(6.1)
        produk_di_kaca(k, [x0, px(2.2), x0 + px(5.8), px(6.85)], berkas, px(4.4),
                       ['gelombang', 'lingkar'][i], (a, b))
    s = k.jadi('s10')
    kop(s, '02 · Sistem', nx())
    judul_slide(s, 'Volume apa pun yang konsisten')

    # ---- 11 ekosistem (render Blender: perangkat keras + lunak)
    k = Kanvas('polos', 11)
    titik_kop(k)
    ekos = sorted(__import__('glob').glob(os.path.join(AKAR, 'build', 'reel2', 'shot-ekosistem', 'f*.jpg')))
    kotak = [px(0.72), px(2.4), px(12.6), px(6.95)]
    k.kaca(kotak, 48, 0.4)
    if ekos:
        im = Image.open(ekos[len(ekos) * 2 // 3]).convert('RGB')
        w, h = kotak[2] - kotak[0] - 40, kotak[3] - kotak[1] - 40
        r = max(w / im.width, h / im.height)
        im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
        im = im.crop(((im.width - w) // 2, (im.height - h) // 2, (im.width - w) // 2 + w, (im.height - h) // 2 + h))
        topeng = Image.new('L', (w, h), 0)
        ImageDraw.Draw(topeng).rounded_rectangle([0, 0, w - 1, h - 1], 32, fill=255)
        k.im.paste(im, (kotak[0] + 20, kotak[1] + 20), topeng)
    k.hud(kotak, 40)
    s = k.jadi('s11')
    kop(s, '02 · Sistem', nx())
    judul_slide(s, 'Satu ekosistem',
                'MEDIVOX-1, laptop, dan ponsel membaca studi yang sama — perangkat keras dan lunak jadi satu.', y=0.95)

    # ---- 12 bab 3
    slide_bab('03', 'Perangkat lunak', 'Berjalan di peramban, tanpa framework dan tanpa WebGL.', nx())

    # ---- 13 parser
    k = Kanvas('polos', 13)
    titik_kop(k)
    deret_kartu(k, px(3.95), px(3.0), [
        ('berkas', 'VR', 'Implicit & Explicit', 'Little endian, big endian, dan deflate.'),
        ('lapisan', 'PX', 'Piksel native', '8/16 bit, signed, multi-frame, palette color.'),
        ('wwwc', 'HU', 'Rescale', 'Slope dan intercept diterapkan ke nilai Hounsfield.'),
    ], pola_nama='campur')
    s = k.jadi('s13')
    kop(s, '03 · Perangkat lunak', nx())
    judul_slide(s, 'Parser DICOM ditulis dari nol',
                'Berkas diurai sendiri, sehingga perilakunya bisa dipertanggungjawabkan baris demi baris.')

    # ---- 14 antarmuka desktop
    k = Kanvas('polos', 14)
    titik_kop(k)
    jendela(k, os.path.join(FOTO, 't-viewer.png'), px(4.35), px(1.05), px(8.2),
            'medivox-id.web.app/viewer')
    for i, (ik, a, b) in enumerate([('wwwc', 'Window/level', 'preset CT & MR'),
                                    ('panjang', 'Ukur & ROI', 'mm, derajat, HU'),
                                    ('kubus', 'Volume & MPR', 'MIP, permukaan, STL')]):
        y = px(2.9) + i * px(1.35)
        k.kaca([px(0.72), y, px(3.95), y + px(1.18)], 34, pola_nama='titik')
        k.ubin_ikon(ik, px(0.72) + 26, y + 26, 112)
        tulis(k.d, (px(0.72) + 160, y + 44), a, huruf(32, 800), NAVY)
        tulis(k.d, (px(0.72) + 160, y + 92), b, huruf(22, mono=True), MUTED)
    s = k.jadi('s14')
    kop(s, '03 · Perangkat lunak', nx())
    judul_slide(s, 'Antarmuka\ndesktop', lebar=3.6)

    # ---- 15 alur kerja (tiga jendela)
    k = Kanvas('polos', 15)
    titik_kop(k)
    for i, (g, u) in enumerate([('t-worklist.png', 'medivox-id.web.app/studi'),
                                ('t-viewer.png', 'medivox-id.web.app/viewer'),
                                ('t-prisma.png', 'medivox-id.web.app/hologram')]):
        x = px(0.72) + i * px(4.1)
        jendela(k, os.path.join(FOTO, g), x, px(2.45), px(3.75), u)
        lbl = ['01  STUDI', '02  VIEWER 2D', '03  HOLOGRAM'][i]
        fe = huruf(22, mono=True)
        w = lebar_spasi(k.d, lbl, fe, 3) + 48
        k.d.rounded_rectangle([x + 24, px(4.95), x + 24 + w, px(4.95) + 52], 26, fill=BIRU)
        tulis(k.d, (x + 48, px(4.95) + 12), lbl, fe, PUTIH, spasi=3)
        ket = ['Buka berkas atau folder DICOM, cari & saring studi.',
               'Window/level, ukur, anotasi, dan laporan.',
               'Empat pandangan berputar, siap dipantulkan prisma.'][i]
        yy = px(5.45)
        for b in bungkus(k.d, ket, huruf(28, 500), px(3.6)):
            tulis(k.d, (x + 24, yy), b, huruf(28, 500), TEKS2)
            yy += 40
    s = k.jadi('s15')
    kop(s, '03 · Perangkat lunak', nx())
    judul_slide(s, 'Alur kerja', 'Dari daftar studi ke hologram dalam tiga langkah.', y=0.95)

    # ---- 16 seluler
    k = Kanvas('polos', 16)
    titik_kop(k)
    for i, g in enumerate(('t-landing-m.png', 't-worklist-m.png', 't-viewer-m.png')):
        ponsel(k, os.path.join(FOTO, g), px(5.55) + i * px(2.5), px(0.95) + (0 if i == 1 else px(0.3)), px(5.5))
    for i, (ik, a, b) in enumerate([('tangan', 'Sentuh & gestur', 'pinch, geser, ketuk'),
                                    ('lapisan', 'Laci & bilah bawah', 'panel tidak menutup citra')]):
        y = px(4.1) + i * px(1.4)
        k.kaca([px(0.72), y, px(4.9), y + px(1.22)], 34, pola_nama='gelombang')
        k.ubin_ikon(ik, px(0.72) + 26, y + 26, 112)
        tulis(k.d, (px(0.72) + 160, y + 44), a, huruf(32, 800), NAVY)
        tulis(k.d, (px(0.72) + 160, y + 92), b, huruf(22, mono=True), MUTED)
    s = k.jadi('s16')
    kop(s, '03 · Perangkat lunak', nx())
    judul_slide(s, 'Nyaman di\ngenggaman', 'Satu kode HTML, CSS & JS native\nuntuk semua layar.', lebar=4.5)

    # ---- 17 bahasa visual
    k = Kanvas('polos', 17)
    titik_kop(k)
    kotak = [px(0.72), px(2.4), px(7.9), px(6.95)]
    k.kaca(kotak, 48, pola_nama='hex')
    k.hud(kotak, 40)
    nama_ikon = sorted(os.path.splitext(f)[0] for f in os.listdir(os.path.join(UI, 'ikon')))
    kol, uk = 8, 134
    for i, nm in enumerate(nama_ikon[:48]):
        cx = kotak[0] + 80 + (i % kol) * (uk + 34)
        cy = kotak[1] + 26 + (i // kol) * (uk + 9)
        ik = ikon(nm, 96)
        k.tempel(ik, (cx + (uk - ik.width) / 2, cy + (uk - ik.height) / 2), kabur=6, turun=6, gelap=40)
    kotak2 = [px(8.2), px(2.4), px(12.6), px(6.95)]
    k.kaca(kotak2, 48, pola_nama='lingkar')
    for nm, lb, x, y in [('cincin', 300, 0.25, 0.08), ('kapsul', 250, 0.52, 0.12), ('bola', 200, 0.12, 0.52),
                         ('heliks', 120, 0.72, 0.46), ('palang', 150, 0.42, 0.56)]:
        o = ornamen(nm, lb)
        k.tempel(o, (kotak2[0] + (kotak2[2] - kotak2[0]) * x, kotak2[1] + (kotak2[3] - kotak2[1]) * y),
                 kabur=18, turun=22, gelap=50)
    s = k.jadi('s17')
    kop(s, '03 · Perangkat lunak', nx())
    judul_slide(s, 'Bahasa visual dari Blender',
                '48 ikon, ornamen, dan pola relief kartu dirender lewat Blender CLI — putih, bersih, futuristik.',
                y=0.95)

    # ---- 18 privasi
    k = Kanvas('polos', 18)
    titik_kop(k)
    deret_angka(k, px(4.1), px(2.35), [('0', 'berkas citra\ndiunggah'),
                                       ('13/13', 'pemeriksaan aturan\nkeamanan lulus'),
                                       ('403', 'balasan untuk akses\nlintas pengguna'),
                                       ('lokal', 'citra kamera gestur\ndiproses & dibuang')])
    s = k.jadi('s18')
    kop(s, '03 · Perangkat lunak', nx())
    judul_slide(s, 'Piksel tidak pernah\nmeninggalkan perangkat',
                'Berkas dibaca lewat File API dan diurai di memori peramban. '
                'Ke awan hanya status baca dan teks laporan.')

    # ---- 19 bab 4
    slide_bab('04', 'Bukti', 'Yang diuji, dan bagaimana diujinya.', nx())

    # ---- 20 pengujian
    k = Kanvas('polos', 20)
    titik_kop(k)
    deret_angka(k, px(2.35), px(2.35), [('127', 'uji parser, volume,\npermukaan, kendali'),
                                        ('79', 'uji asap halaman\ndi tiruan DOM'),
                                        ('20', 'berkas .dcm nyata\ndiperiksa ulang'),
                                        ('0', 'dependensi\npihak ketiga')])
    k.kaca([px(0.72), px(4.95), px(12.6), px(6.85)], 40, pola_nama='gelombang')
    s = k.jadi('s20')
    kop(s, '04 · Bukti', nx())
    judul_slide(s, 'Pengujian berjalan tanpa peramban')
    teks(s, 1.0, 5.25, 11.3, 1.4,
         'Uji asap memuat berkas HTML sungguhan ke tiruan DOM, menjalankan setiap skrip apa adanya, '
         'lalu menekan tombol dan memicu pintasan seperti pengguna. Hasil gambar dan tata letak '
         'tetap diperiksa dengan tangkapan layar desktop & ponsel.', 13.5, TEKS2, tebal=False,
         jarak_baris=1.45)

    # ---- 21 data nyata
    k = Kanvas('polos', 21)
    titik_kop(k)
    deret_kartu(k, px(3.95), px(3.0), [
        ('centang', 'OK', 'Harus terbaca', 'Deflate, palette color, RGB planar, big endian, multi-frame.'),
        ('perisai', 'X', 'Harus ditolak', 'JPEG 2000, JPEG-LS, RLE — dengan pesan jelas.'),
        ('probe', '!', 'Yang ditemukan', 'Bug sequence Implicit VR ketahuan lewat berkas nyata.'),
    ], pola_nama='campur')
    s = k.jadi('s21')
    kop(s, '04 · Bukti', nx())
    judul_slide(s, 'Diuji dengan data nyata',
                'Parser diadu dengan berkas pydicom-data dan seri volumetrik The Cancer Imaging Archive.')

    # ---- 22 bab 5
    slide_bab('05', 'Rencana', 'Yang sudah jalan, dan yang berikutnya.', nx())

    # ---- 23 peta jalan
    k = Kanvas('polos', 23)
    titik_kop(k)
    deret_kartu(k, px(2.3), px(3.55), [
        ('centang', 'SUDAH', 'Berjalan hari ini', 'Parser, viewer 2D, volume, MPR/MIP, permukaan, panggung prisma, gestur & suara.'),
        ('sinkron', 'BERIKUT', 'Sedang disiapkan', 'Dekoder JPEG 2000, integrasi DICOMweb, kalibrasi prisma otomatis.'),
        ('perisai', 'KELAK', 'Perlu pihak lain', 'Validasi klinis, kalibrasi monitor, dan izin edar sesuai wilayah.'),
    ], pola_nama='campur')
    s = k.jadi('s23')
    kop(s, '05 · Rencana', nx())
    judul_slide(s, 'Peta jalan')
    teks(s, 0.72, 6.3, 11.8, 0.5,
         'Kolom terakhir bukan pekerjaan rekayasa — itu syarat regulasi sebelum dipakai untuk keputusan klinis.',
         11.5, MUTED, tebal=False)

    # ---- 24 penutup
    k = Kanvas('bab', 24)
    k.kaca([px(0.5), px(1.9), px(7.6), px(6.4)], 60, 0.5, pola_nama='lingkar')
    k.hud([px(0.5), px(1.9), px(7.6), px(6.4)], 40)
    garis_aksen(k, 0.98, 2.55)
    g = muat(os.path.join(TIGA_D, 'putih-hero.webp'), px(4.6))
    k.tempel(g, (px(8.0), px(1.7)), kabur=40, turun=50, gelap=80)
    k.d.rounded_rectangle([px(0.98), px(5.0), px(0.98) + px(3.6), px(5.0) + px(0.46)], px(0.23),
                          fill=(255, 255, 255), outline=CYAN, width=3)
    s = k.jadi('s24')
    kop(s, None, nx())
    teks(s, 0.98, 2.8, 6.5, 2.0, 'See. Speak.\nUnderstand.', 50)
    teks(s, 1.2, 5.08, 3.4, 0.4, 'medivox-id.web.app', 15, BIRU, mono=True)
    teks(s, 1.0, 5.65, 6.3, 1.0,
         'Prototipe antarmuka, bukan perangkat medis. Data pasien fiktif; citra adalah phantom sintetis.',
         12, MUTED, tebal=False, jarak_baris=1.4)

    PRS.save(KELUAR)
    jumlah = len(PRS.slides._sldIdLst)
    assert jumlah == TOTAL, jumlah
    print('deck: %s (%d slide, %.1f MB)' % (KELUAR, jumlah, os.path.getsize(KELUAR) / 1048576))


if __name__ == '__main__':
    bangun()
