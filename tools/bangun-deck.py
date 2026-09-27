#!/usr/bin/env python3
"""
==========================================================
MEDIVOX — pembangun deck presentasi (16:9)
----------------------------------------------------------
Menyusun PPTX bergaya neumorphic terang: latar, kartu, dan
diagram digambar dengan Pillow lalu ditempel sebagai gambar,
karena PowerPoint tidak bisa membuat bayangan lembut ganda
dan gradien halus yang dipakai bahasa visual Medivox.

Render produk 3D diambil dari assets/3d (hasil Blender CLI).

Jalankan:  python tools/bangun-deck.py
Keluaran:  build/MEDIVOX_Deck.pptx
==========================================================
"""
import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GBR = os.path.join(AKAR, 'build', 'deck', 'gbr')
TIGA_D = os.path.join(AKAR, 'assets', '3d')
KELUAR = os.path.join(AKAR, 'build', 'MEDIVOX_Deck.pptx')

os.makedirs(GBR, exist_ok=True)

# ---- kanvas gambar: 2x ukuran slide supaya tajam di layar
SW, SH = 2560, 1440
IN_W, IN_H = 13.333, 7.5
SKALA = SW / IN_W          # piksel per inci

# ---- warna merek (sama dengan assets/css/base.css)
PUTIH = (255, 255, 255)
LATAR = (246, 249, 253)
LATAR2 = (238, 244, 251)
NAVY = (18, 35, 60)
TEKS2 = (65, 96, 138)
MUTED = (90, 114, 144)
BIRU = (47, 111, 208)
CYAN = (94, 201, 242)
GARIS = (222, 231, 242)


def inci(px):
    return Inches(px / SKALA)


# ---------------------------------------------------------------- huruf
_cache = {}


def huruf(ukuran, tebal=True, mono=False):
    kunci = (ukuran, tebal, mono)
    if kunci in _cache:
        return _cache[kunci]
    kandidat = (['consola.ttf'] if mono else
                (['Manrope-ExtraBold.ttf', 'seguisb.ttf', 'segoeuib.ttf', 'arialbd.ttf']
                 if tebal else ['Manrope-Regular.ttf', 'segoeui.ttf', 'arial.ttf']))
    f = None
    for nama in kandidat:
        for dasar in (r'C:\Windows\Fonts', os.path.join(AKAR, 'assets', 'font')):
            jalur = os.path.join(dasar, nama)
            if os.path.exists(jalur):
                try:
                    f = ImageFont.truetype(jalur, ukuran)
                    break
                except Exception:
                    pass
        if f:
            break
    f = f or ImageFont.load_default(ukuran)
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


# ---------------------------------------------------------------- primitif gambar
def bayangan(im, kotak, radius, kabur=26, kuat=42, geser=10):
    """Bayangan lembut di bawah kartu — inti tampilan neumorphic terang."""
    lap = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lap)
    x0, y0, x1, y1 = kotak
    d.rounded_rectangle([x0, y0 + geser, x1, y1 + geser], radius, fill=(19, 45, 80, kuat))
    lap = lap.filter(ImageFilter.GaussianBlur(kabur))
    im.alpha_composite(lap)


def kartu(im, kotak, radius=28, isi=PUTIH, garis=GARIS, kabur=26, kuat=42):
    bayangan(im, kotak, radius, kabur, kuat)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(kotak, radius, fill=isi + (255,), outline=garis + (255,), width=2)


def latar_slide(varian='polos'):
    im = Image.new('RGBA', (SW, SH), LATAR + (255,))
    # sapuan cahaya halus, digambar kecil lalu diburamkan
    kecil = Image.new('RGB', (160, 90), LATAR)
    d = ImageDraw.Draw(kecil)
    for i in range(26, 0, -1):
        t = i / 26.0
        r = int(78 * t)
        warna = (int(246 - 12 * (1 - t) ** 2), int(249 - 8 * (1 - t) ** 2), 253)
        d.ellipse([-14 - r, -22 - r, -14 + r, -22 + r], fill=warna)
    for i in range(22, 0, -1):
        t = i / 22.0
        r = int(64 * t)
        warna = (int(246 - 6 * (1 - t) ** 2), int(250 - 3 * (1 - t) ** 2), 254)
        d.ellipse([170 - r, 104 - r, 170 + r, 104 + r], fill=warna)
    kecil = kecil.filter(ImageFilter.GaussianBlur(7))
    im.alpha_composite(kecil.resize((SW, SH), Image.BICUBIC).convert('RGBA'))

    if varian == 'bab':
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, SW, SH], fill=None)
        pita = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
        pd = ImageDraw.Draw(pita)
        pd.polygon([(SW * 0.52, 0), (SW, 0), (SW, SH), (SW * 0.30, SH)],
                   fill=BIRU + (16,))
        im.alpha_composite(pita.filter(ImageFilter.GaussianBlur(40)))
    return im


def simpan(im, nama):
    """Disimpan sebagai PNG beralfa. convert('RGB') akan mengubah bagian
    transparan menjadi hitam dan memunculkan blok gelap di slide."""
    jalur = os.path.join(GBR, nama + '.png')
    if im.mode != 'RGBA':
        im = im.convert('RGBA')
    im.save(jalur, 'PNG', compress_level=6)
    return jalur


# ---------------------------------------------------------------- komposisi gambar
def gbr_latar(nama, varian='polos'):
    return simpan(latar_slide(varian), nama)


MARG = int(0.72 * SKALA)      # sejajar dengan judul slide


def gbr_kartu_poin(nama, poin, kolom=3, tinggi=560, ikon_warna=None):
    """Deretan kartu berisi judul + keterangan."""
    im = Image.new('RGBA', (SW, tinggi), (0, 0, 0, 0))
    guna = SW - MARG * 2
    lebar = (guna - (kolom - 1) * 44) // kolom
    fj = huruf(42)
    fk = huruf(27, tebal=False)
    fn = huruf(24, mono=True)
    d = ImageDraw.Draw(im)
    for i, (no, judul, ket) in enumerate(poin[:kolom]):
        x = MARG + i * (lebar + 44)
        kartu(im, [x, 30, x + lebar, tinggi - 30], 30)
        d = ImageDraw.Draw(im)
        tulis(d, (x + 44, 78), no, fn, (ikon_warna or CYAN), spasi=5)
        d.rounded_rectangle([x + 44, 122, x + 44 + 62, 127], 3, fill=BIRU)
        yy = 158
        for baris in bungkus(d, judul, fj, lebar - 88):
            tulis(d, (x + 44, yy), baris, fj, NAVY)
            yy += 54
        yy += 10
        for baris in bungkus(d, ket, fk, lebar - 88):
            tulis(d, (x + 44, yy), baris, fk, MUTED)
            yy += 38
    return simpan(im, nama)


def gbr_angka(nama, angka, tinggi=420):
    im = Image.new('RGBA', (SW, tinggi), (0, 0, 0, 0))
    guna = SW - MARG * 2
    lebar = (guna - (len(angka) - 1) * 40) // len(angka)
    fa = huruf(92)
    fl = huruf(28, tebal=False)
    for i, (nilai, label) in enumerate(angka):
        x = MARG + i * (lebar + 40)
        kartu(im, [x, 24, x + lebar, tinggi - 24], 28)
        d = ImageDraw.Draw(im)
        w = d.textlength(nilai, font=fa)
        tulis(d, (x + (lebar - w) / 2, 88), nilai, fa, BIRU)
        for j, baris in enumerate(label.split('\n')):
            bw = d.textlength(baris, font=fl)
            tulis(d, (x + (lebar - bw) / 2, 214 + j * 40), baris, fl, MUTED)
    return simpan(im, nama)


def gbr_diagram_prisma(nama):
    """Diagram cara kerja Pepper's ghost: panel -> empat bidang -> satu bentuk."""
    W2, H2, PAD = SW, 900, 30
    im = Image.new('RGBA', (W2, H2 + PAD * 2), (0, 0, 0, 0))
    kartu(im, [PAD, PAD, W2 - PAD, H2 + PAD], 32)
    d = ImageDraw.Draw(im)

    cx, dasar = W2 // 2, 700 + PAD // 2
    atas_l, atas_r = cx - 430, cx + 430
    bawah_l, bawah_r = cx - 96, cx + 96
    puncak = 245

    # prisma
    d.line([(atas_l, puncak), (atas_r, puncak)], fill=BIRU + (255,), width=5)
    d.line([(atas_l, puncak), (bawah_l, dasar)], fill=BIRU + (255,), width=5)
    d.line([(atas_r, puncak), (bawah_r, dasar)], fill=BIRU + (255,), width=5)
    d.line([(bawah_l, dasar), (bawah_r, dasar)], fill=BIRU + (255,), width=5)

    # panel pemancar
    d.rounded_rectangle([cx - 300, dasar + 26, cx + 300, dasar + 74], 12,
                        fill=(232, 243, 253, 255), outline=BIRU + (255,), width=3)
    fk = huruf(26, tebal=False)
    fm = huruf(24, mono=True)
    tulis(d, (cx - 292, dasar + 34), 'PANEL EMPAT KUADRAN', fm, BIRU, spasi=3)

    # berkas cahaya
    for sisi in (-1, 1):
        d.line([(cx + sisi * 150, dasar + 22), (cx + sisi * 330, puncak + 130)],
               fill=CYAN + (170,), width=3)

    # volume yang tampak mengambang
    d.ellipse([cx - 112, 372, cx + 112, 528], fill=CYAN + (46,), outline=CYAN + (220,), width=3)
    fw = huruf(30)
    w = d.textlength('VOLUME', font=fw)
    tulis(d, (cx - w / 2, 436), 'VOLUME', fw, BIRU)

    # keterangan
    tulis(d, (110, 100), '01', fm, CYAN, spasi=4)
    for i, baris in enumerate(['Empat pandangan', 'dipancarkan panel']):
        tulis(d, (110, 142 + i * 40), baris, fk, MUTED)
    tulis(d, (W2 - 500, 100), '02', fm, CYAN, spasi=4)
    for i, baris in enumerate(['Tiap bidang prisma', 'memantulkan satu sisi']):
        tulis(d, (W2 - 500, 142 + i * 40), baris, fk, MUTED)
    lbl = '03  KEEMPATNYA BERTEMU'
    w = sum(d.textlength(c, font=fm) + 3 for c in lbl) - 3
    tulis(d, (cx - w / 2, 150), lbl, fm, BIRU, spasi=3)
    return simpan(im, nama)


def gbr_gambar_berbingkai(nama, sumber, lebar=SW, radius=30):
    """Render produk (latar gelap) dibingkai kartu."""
    foto = Image.open(sumber).convert('RGB')
    r = lebar / foto.width
    foto = foto.resize((int(lebar), int(foto.height * r)), Image.LANCZOS)
    pad = 26
    im = Image.new('RGBA', (foto.width + pad * 2, foto.height + pad * 2), (0, 0, 0, 0))
    bayangan(im, [pad, pad, pad + foto.width, pad + foto.height], radius, 28, 52)
    masker = Image.new('L', foto.size, 0)
    ImageDraw.Draw(masker).rounded_rectangle([0, 0, foto.width, foto.height], radius, fill=255)
    im.paste(foto, (pad, pad), masker)
    return simpan(im, nama)


# ---------------------------------------------------------------- slide
PRS = Presentation()
PRS.slide_width = Inches(IN_W)
PRS.slide_height = Inches(IN_H)
KOSONG = PRS.slide_layouts[6]
TOTAL = 20


def slide(varian='polos'):
    s = PRS.slides.add_slide(KOSONG)
    s.shapes.add_picture(gbr_latar('latar_' + varian, varian), 0, 0,
                         Inches(IN_W), Inches(IN_H))
    return s


def teks(s, x, y, w, h, isi, ukuran, warna=NAVY, tebal=True, spasi=0,
         rata=PP_ALIGN.LEFT, mono=False, jarak_baris=1.18):
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
            from pptx.oxml.ns import qn
            r.font._rPr.set('spc', str(int(spasi * 100)))
    return kotak


def kop(s, bab, nomor):
    if bab:
        teks(s, 0.72, 0.52, 8, 0.3, bab.upper(), 10.5, BIRU, spasi=2.2, mono=True)
    teks(s, IN_W - 1.9, 0.52, 1.2, 0.3, '%02d / %d' % (nomor, TOTAL), 10.5,
         MUTED, tebal=False, spasi=1.4, rata=PP_ALIGN.RIGHT, mono=True)


def garis_aksen(s, x, y, w=0.62):
    from pptx.enum.shapes import MSO_SHAPE
    bentuk = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                Inches(x), Inches(y), Inches(w), Inches(0.045))
    bentuk.fill.solid()
    bentuk.fill.fore_color.rgb = RGBColor(*BIRU)
    bentuk.line.fill.background()
    bentuk.shadow.inherit = False


def judul_slide(s, judul, sub=None, y=1.25):
    garis_aksen(s, 0.72, y - 0.22)
    teks(s, 0.72, y, 11.5, 1.2, judul, 40)
    if sub:
        teks(s, 0.74, y + 0.70 * len(judul.split('\n')) + 0.28, 10.4, 1.0, sub, 15,
             TEKS2, tebal=False, jarak_baris=1.35)


# ================================================================ isi deck
def bangun():
    n = [0]

    def nx():
        n[0] += 1
        return n[0]

    # ---- 01 sampul
    s1 = slide()
    kop(s1, None, nx())
    teks(s1, 0.72, 0.5, 6, 0.4, 'MEDIVOX', 15, BIRU, spasi=3)
    garis_aksen(s1, 0.72, 2.05)
    teks(s1, 0.72, 2.2, 6.0, 1.7, 'Citra CT dan MRI\nyang mengambang', 36)
    teks(s1, 0.74, 3.75, 5.9, 1.5,
         'MEDIVOX-1 menyusun tumpukan irisan DICOM menjadi volume tiga '
         'dimensi, lalu memantulkannya lewat prisma menjadi satu bentuk '
         'yang benar-benar tampak melayang.', 14.5, TEKS2, tebal=False, jarak_baris=1.4)
    teks(s1, 0.74, 5.55, 6, 0.3, 'SEE.  SPEAK.  UNDERSTAND.', 10.5, CYAN, spasi=3, mono=True)
    teks(s1, 0.74, 5.95, 6, 0.3, 'Prototipe antarmuka — bukan perangkat medis',
         10, MUTED, tebal=False, mono=True)
    g = gbr_gambar_berbingkai('sampul', os.path.join(TIGA_D, 'medivox-hero.webp'), 1500)
    s1.shapes.add_picture(g, Inches(7.15), Inches(1.5), Inches(5.75))

    # ---- 02 agenda
    s2 = slide()
    kop(s2, None, nx())
    judul_slide(s2, 'Agenda', 'Lima bagian, dari persoalan pembacaan sampai bukti pengujian.')
    g = gbr_kartu_poin('agenda1', [
        ('01', 'Persoalan', 'Volume dibaca sebagai tumpukan irisan datar.'),
        ('02', 'Sistem', 'Perangkat MEDIVOX-1 dan cara kerjanya.'),
        ('03', 'Perangkat lunak', 'Parser DICOM, viewer, dan panggung hologram.'),
    ], 3, 430)
    s2.shapes.add_picture(g, 0, Inches(3.2), Inches(IN_W))
    g = gbr_kartu_poin('agenda2', [
        ('04', 'Bukti', 'Pengujian otomatis dan data nyata.'),
        ('05', 'Rencana', 'Yang sudah jalan dan yang berikutnya.'),
        ('—', 'Catatan', 'Batas penggunaan dan status regulasi.'),
    ], 3, 430)
    s2.shapes.add_picture(g, 0, Inches(5.3), Inches(IN_W))

    # ---- 03 kop bab 1
    s3 = slide('bab')
    kop(s3, None, nx())
    teks(s3, 0.72, 2.9, 3, 0.4, '01', 13, CYAN, spasi=3, mono=True)
    garis_aksen(s3, 0.72, 3.35)
    teks(s3, 0.72, 3.6, 9, 1.2, 'Persoalan', 54)
    teks(s3, 0.74, 4.9, 7.6, 1.0,
         'Volume tiga dimensi dinilai lewat layar dua dimensi.', 17, TEKS2, tebal=False)

    # ---- 04 masalah
    s4 = slide()
    kop(s4, '01 · Persoalan', nx())
    judul_slide(s4, 'Hubungan ruang harus\ndibayangkan sendiri',
                'Radiolog menggulir ratusan irisan aksial, lalu menyusun bentuknya di kepala. '
                'Yang paling sulit bukan melihat satu irisan, melainkan menahan '
                'hubungan antar-irisan.')
    g = gbr_kartu_poin('masalah', [
        ('A', 'Beban kognitif', 'Bentuk tiga dimensi disusun ulang dari potongan datar.'),
        ('B', 'Sulit dikomunikasikan', 'Menjelaskan letak lesi ke klinisi memakan waktu.'),
        ('C', 'Butuh pelatihan', 'Kemampuan membaca ruang tumbuh lambat.'),
    ], 3, 520)
    s4.shapes.add_picture(g, 0, Inches(4.35), Inches(IN_W))

    # ---- 05 dampak
    s5 = slide()
    kop(s5, '01 · Persoalan', nx())
    judul_slide(s5, 'Dampaknya terukur')
    g = gbr_angka('dampak', [('512³', 'ukuran volume CT\nyang lazim'),
                             ('200+', 'irisan digulir\nper satu studi'),
                             ('2D', 'dimensi layar\ntempat menilainya'),
                             ('0', 'kedalaman nyata\npada monitor')])
    s5.shapes.add_picture(g, 0, Inches(3.5), Inches(IN_W))
    teks(s5, 0.72, 6.35, 11.5, 0.5,
         'Angka di atas menggambarkan skala data, bukan klaim kinerja klinis.',
         11.5, MUTED, tebal=False)

    # ---- 06 kop bab 2
    s6 = slide('bab')
    kop(s6, None, nx())
    teks(s6, 0.72, 2.9, 3, 0.4, '02', 13, CYAN, spasi=3, mono=True)
    garis_aksen(s6, 0.72, 3.35)
    teks(s6, 0.72, 3.6, 9, 1.2, 'Sistem', 54)
    teks(s6, 0.74, 4.9, 7.6, 1.0,
         'Satu basis, satu prisma, dan volume yang tampak mengambang.', 17,
         TEKS2, tebal=False)

    # ---- 07 produk
    s7 = slide()
    kop(s7, '02 · Sistem', nx())
    judul_slide(s7, 'MEDIVOX-1')
    teks(s7, 0.74, 2.5, 4.6, 2.6,
         'Basis aluminium menahan panel empat kuadran yang memancarkan pandangan '
         'volume. Prisma piramida terbalik di atasnya memantulkan keempatnya '
         'sehingga bertemu sebagai satu bentuk di udara.', 14.5, TEKS2,
         tebal=False, jarak_baris=1.45)
    teks(s7, 0.74, 5.2, 5, 0.3, 'EFEK PEPPER’S GHOST', 10.5, BIRU, spasi=2.2, mono=True)
    teks(s7, 0.74, 5.6, 5, 0.9, 'Tanpa kacamata, tanpa proyektor,\ntanpa headset.',
         14, MUTED, tebal=False)
    g = gbr_gambar_berbingkai('produk7', os.path.join(TIGA_D, 'medivox-tigaper.webp'), 1300)
    s7.shapes.add_picture(g, Inches(6.05), Inches(1.75), Inches(6.9))

    # ---- 08 cara kerja
    s8 = slide()
    kop(s8, '02 · Sistem', nx())
    judul_slide(s8, 'Cara kerjanya')
    g = gbr_diagram_prisma('diagram')
    s8.shapes.add_picture(g, Inches(0.9), Inches(2.5), Inches(11.5))

    # ---- 09 galeri
    s9 = slide()
    kop(s9, '02 · Sistem', nx())
    judul_slide(s9, 'Dari segala sisi')
    for i, (berkas, label) in enumerate([
            ('medivox-atas.webp', 'Panel empat kuadran'),
            ('medivox-samping.webp', 'Sudut bidang pemantul'),
            ('medivox-dekat.webp', 'Detail basis')]):
        g = gbr_gambar_berbingkai('gal%d' % i, os.path.join(TIGA_D, berkas), 900)
        s9.shapes.add_picture(g, Inches(0.62 + i * 4.06), Inches(2.6), Inches(3.9))
        teks(s9, 0.72 + i * 4.06, 5.85, 3.8, 0.4, label, 12.5, NAVY)
    teks(s9, 0.72, 6.5, 11.8, 0.6,
         'Seluruh gambar adalah render tiga dimensi yang dibangun lewat skrip '
         'Blender CLI — bukan foto dan bukan gambar stok.', 11.5, MUTED, tebal=False)

    # ---- 10 modalitas
    s10 = slide()
    kop(s10, '02 · Sistem', nx())
    judul_slide(s10, 'Volume apa pun yang konsisten')
    for i, (berkas, judul, ket) in enumerate([
            ('medivox-toraks.webp', 'CT toraks', 'Paru, mediastinum, dinding dada'),
            ('medivox-tengkorak.webp', 'Tengkorak', 'Rekonstruksi permukaan tulang')]):
        g = gbr_gambar_berbingkai('mod%d' % i, os.path.join(TIGA_D, berkas), 1100)
        s10.shapes.add_picture(g, Inches(0.62 + i * 6.15), Inches(2.3), Inches(4.9))
        teks(s10, 0.74 + i * 6.15, 6.3, 5.6, 0.4, judul, 17)
        teks(s10, 0.74 + i * 6.15, 6.72, 5.6, 0.4, ket, 12.5, MUTED, tebal=False)

    # ---- 11 kop bab 3
    s11 = slide('bab')
    kop(s11, None, nx())
    teks(s11, 0.72, 2.9, 3, 0.4, '03', 13, CYAN, spasi=3, mono=True)
    garis_aksen(s11, 0.72, 3.35)
    teks(s11, 0.72, 3.6, 9, 1.2, 'Perangkat lunak', 54)
    teks(s11, 0.74, 4.9, 7.6, 1.0,
         'Berjalan di peramban, tanpa framework dan tanpa WebGL.', 17, TEKS2, tebal=False)

    # ---- 12 parser
    s12 = slide()
    kop(s12, '03 · Perangkat lunak', nx())
    judul_slide(s12, 'Parser DICOM ditulis dari nol',
                'Bukan pembungkus pustaka orang lain: berkas diurai sendiri, '
                'sehingga perilakunya bisa dipertanggungjawabkan baris demi baris.')
    g = gbr_kartu_poin('parser', [
        ('VR', 'Implicit & Explicit', 'Little endian, big endian, dan deflate.'),
        ('PX', 'Piksel native', '8/16 bit, signed, multi-frame, palette color.'),
        ('HU', 'Rescale', 'Slope dan intercept diterapkan ke nilai Hounsfield.'),
    ], 3, 520)
    s12.shapes.add_picture(g, 0, Inches(4.35), Inches(IN_W))

    # ---- 13 alur kerja
    s13 = slide()
    kop(s13, '03 · Perangkat lunak', nx())
    judul_slide(s13, 'Alur kerja')
    g = gbr_kartu_poin('alur1', [
        ('01', 'Studi', 'Daftar studi, buka berkas atau folder DICOM.'),
        ('02', 'Viewer 2D', 'Window/level, ukur, ROI, laporan.'),
        ('03', 'Volume', 'MPR, MIP, rekonstruksi permukaan, ekspor STL/OBJ.'),
    ], 3, 400)
    s13.shapes.add_picture(g, 0, Inches(2.5), Inches(IN_W))
    g = gbr_kartu_poin('alur2', [
        ('04', 'Panggung', 'Empat pandangan berputar siap dipantulkan prisma.'),
        ('05', 'Kendali', 'Gestur tangan dan perintah suara, diproses lokal.'),
        ('06', 'Laporan', 'Temuan dan kesan tersinkron ke akun.'),
    ], 3, 400)
    s13.shapes.add_picture(g, 0, Inches(4.72), Inches(IN_W))

    # ---- 14 privasi
    s14 = slide()
    kop(s14, '03 · Perangkat lunak', nx())
    judul_slide(s14, 'Piksel tidak pernah\nmeninggalkan perangkat',
                'Berkas dibaca lewat File API dan diurai di memori peramban. '
                'Yang tersimpan ke awan hanya status baca dan teks laporan.')
    g = gbr_angka('privasi', [('0', 'berkas citra\ndiunggah'),
                              ('13/13', 'pemeriksaan aturan\nkeamanan lulus'),
                              ('403', 'balasan untuk akses\nlintas pengguna'),
                              ('lokal', 'citra kamera gestur\ndiproses & dibuang')])
    s14.shapes.add_picture(g, 0, Inches(4.5), Inches(IN_W))

    # ---- 15 kop bab 4
    s15 = slide('bab')
    kop(s15, None, nx())
    teks(s15, 0.72, 2.9, 3, 0.4, '04', 13, CYAN, spasi=3, mono=True)
    garis_aksen(s15, 0.72, 3.35)
    teks(s15, 0.72, 3.6, 9, 1.2, 'Bukti', 54)
    teks(s15, 0.74, 4.9, 7.6, 1.0, 'Yang diuji, dan bagaimana diujinya.', 17,
         TEKS2, tebal=False)

    # ---- 16 pengujian
    s16 = slide()
    kop(s16, '04 · Bukti', nx())
    judul_slide(s16, 'Pengujian berjalan tanpa peramban')
    g = gbr_angka('uji', [('127', 'uji parser, volume,\npermukaan, kendali'),
                          ('79', 'uji asap halaman\ndi tiruan DOM'),
                          ('20', 'berkas .dcm nyata\ndiperiksa ulang'),
                          ('0', 'dependensi\npihak ketiga')])
    s16.shapes.add_picture(g, 0, Inches(2.6), Inches(IN_W))
    teks(s16, 0.72, 4.85, 11.8, 1.6,
         'Uji asap memuat berkas HTML sungguhan ke tiruan DOM, menjalankan setiap '
         'skrip apa adanya, lalu menekan tombol dan memicu pintasan seperti pengguna. '
         'Yang tidak teruji tetap sama: hasil gambar, tata letak, dan gaya — '
         'untuk itu perlu dilihat mata di peramban.', 13.5, TEKS2, tebal=False,
         jarak_baris=1.5)

    # ---- 17 data nyata
    s17 = slide()
    kop(s17, '04 · Bukti', nx())
    judul_slide(s17, 'Diuji dengan data nyata',
                'Selain phantom sintetis, parser diadu dengan berkas dari pydicom-data '
                'dan seri volumetrik dari The Cancer Imaging Archive.')
    g = gbr_kartu_poin('data', [
        ('OK', 'Yang harus terbaca', 'Deflate, palette color, RGB planar, big endian, multi-frame.'),
        ('X', 'Yang harus ditolak', 'JPEG 2000, JPEG-LS, RLE — dengan pesan jelas, bukan sampah.'),
        ('!', 'Yang ditemukan', 'Bug sequence pada Implicit VR ketahuan lewat berkas nyata.'),
    ], 3, 560)
    s17.shapes.add_picture(g, 0, Inches(4.2), Inches(IN_W))

    # ---- 18 kop bab 5
    s18 = slide('bab')
    kop(s18, None, nx())
    teks(s18, 0.72, 2.9, 3, 0.4, '05', 13, CYAN, spasi=3, mono=True)
    garis_aksen(s18, 0.72, 3.35)
    teks(s18, 0.72, 3.6, 9, 1.2, 'Rencana', 54)
    teks(s18, 0.74, 4.9, 7.6, 1.0, 'Yang sudah jalan, dan yang berikutnya.', 17,
         TEKS2, tebal=False)

    # ---- 19 peta jalan
    s19 = slide()
    kop(s19, '05 · Rencana', nx())
    judul_slide(s19, 'Peta jalan')
    g = gbr_kartu_poin('peta', [
        ('SUDAH', 'Berjalan hari ini', 'Parser, viewer 2D, volume, MPR/MIP, permukaan, '
                                       'panggung prisma, gestur dan suara.'),
        ('BERIKUT', 'Sedang disiapkan', 'Dekoder JPEG 2000, integrasi DICOMweb, '
                                        'kalibrasi prisma otomatis.'),
        ('KELAK', 'Perlu pihak lain', 'Validasi klinis, kalibrasi monitor, '
                                      'dan izin edar sesuai wilayah.'),
    ], 3, 600)
    s19.shapes.add_picture(g, 0, Inches(2.7), Inches(IN_W))
    teks(s19, 0.72, 6.35, 11.8, 0.5,
         'Kolom terakhir bukan pekerjaan rekayasa — itu syarat regulasi yang '
         'harus dipenuhi sebelum dipakai untuk keputusan klinis.', 11.5, MUTED, tebal=False)

    # ---- 20 penutup
    s20 = slide('bab')
    kop(s20, None, nx())
    garis_aksen(s20, 0.72, 2.6)
    teks(s20, 0.72, 2.85, 8.5, 2.0, 'See. Speak.\nUnderstand.', 50)
    teks(s20, 0.74, 5.0, 6.4, 0.8, 'medivox  ·  kaca-id.web.app', 16, BIRU, mono=True)
    teks(s20, 0.74, 5.65, 7.2, 1.2,
         'Prototipe antarmuka, bukan perangkat medis. Seluruh data pasien fiktif dan '
         'citra yang ditampilkan adalah phantom sintetis.', 12.5, MUTED, tebal=False,
         jarak_baris=1.45)
    g = gbr_gambar_berbingkai('penutup', os.path.join(TIGA_D, 'medivox-atas.webp'), 1000)
    s20.shapes.add_picture(g, Inches(8.3), Inches(2.3), Inches(4.5))

    PRS.save(KELUAR)
    jumlah = len(PRS.slides._sldIdLst)
    print('deck: %s (%d slide, %.1f MB)' % (KELUAR, jumlah,
                                            os.path.getsize(KELUAR) / 1048576))


if __name__ == '__main__':
    bangun()
