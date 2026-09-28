#!/usr/bin/env python3
"""
==========================================================
MEDIVOX — competition poster (INNOPA), 3179 x 4494 px
----------------------------------------------------------
Redesign of MEDIVOX-KIDE.png in the MEDIVOX UI / video style:
a navy header like the video's chapter cards, a light
neumorphic body, the blue → cyan gradient, Sora + Plus Jakarta
Sans, Blender icons and a Blender render of MEDIVOX-1.

Partner logos (INNOPA, SMA Kesatuan Bangsa, SMA 3 Yogyakarta,
INDONESIA) are cropped from the owner's original file.

Evaluation results: fill HASIL_EVALUASI below with real data and
re-run. Empty values are drawn as clearly marked slots, never as
invented numbers.

Run:     python tools/bangun-poster.py
Output:  build/MEDIVOX_Poster.png  (+ .pdf, A-series 300 dpi width)
==========================================================
"""
import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import qrcode

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(AKAR, 'build', 'font')
PST = os.path.join(AKAR, 'build', 'poster')
IKON = os.path.join(AKAR, 'build', 'kit', 'ikon')
KELUAR = os.path.join(AKAR, 'build', 'MEDIVOX_Poster.png')

# ---- evaluation data: replace None with real numbers from the study ----
HASIL_EVALUASI = {
    'ahli':   None,   # expert validation score, e.g. 88  (percent)
    'siswa':  None,   # student questionnaire mean, e.g. 4.4 (out of 5)
    'n':      None,   # number of student respondents, e.g. 60
}

W, H = 3179, 4494
BG = (237, 241, 248)
INK = (14, 26, 58)
INK2 = (52, 66, 106)
MUTED = (91, 106, 140)
BLUE = (47, 98, 245)
BLUE2 = (63, 139, 255)
CYAN = (88, 216, 255)
NAVY = (8, 18, 44)
SD = (166, 180, 205)


# ================================================================ type
_F = {}


def _f(nama, u, b):
    k = (nama, u, b)
    if k not in _F:
        f = ImageFont.truetype(os.path.join(FONT, nama), u)
        try:
            f.set_variation_by_axes([b])
        except Exception:
            pass
        _F[k] = f
    return _F[k]


def disp(u, b=650):
    return _f('Sora.ttf', u, b)


def teks(u, b=500):
    return _f('PlusJakartaSans.ttf', u, b)


def mono(u):
    return _f('JetBrainsMono-Medium.ttf', u, 0)


def bungkus(d, s, f, lebar):
    kata, baris, kini = s.split(), [], ''
    for k in kata:
        u = (kini + ' ' + k).strip()
        if d.textlength(u, font=f) <= lebar:
            kini = u
        else:
            baris.append(kini)
            kini = k
    if kini:
        baris.append(kini)
    return baris


def paragraf(d, xy, s, f, fill, lebar, lh):
    x, y = xy
    for b in bungkus(d, s, f, lebar):
        d.text((x, y), b, font=f, fill=fill)
        y += lh
    return y


def spasi(d, xy, s, f, fill, sp):
    x, y = xy
    for ch in s:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + sp
    return x


# ================================================================ surfaces
def gradien(w, h):
    kecil = Image.new('RGB', (64, 64))
    px = kecil.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            if t < 0.55:
                u = t / 0.55
                c = (37 + 25 * u, 82 + 57 * u, 238 + 17 * u)
            else:
                u = (t - 0.55) / 0.45
                c = (62 + 26 * u, 139 + 77 * u, 255)
            px[x, y] = tuple(int(v) for v in c)
    return kecil.resize((max(1, int(w)), max(1, int(h))), Image.BICUBIC)


def kotak_grad(im, x, y, w, h, r, bayang=True):
    x, y, w, h = int(x), int(y), int(w), int(h)
    if bayang:
        sh = Image.new('RGBA', (w + 160, h + 160), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([80, 100, 80 + w, 100 + h], r, fill=(47, 98, 245, 90))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(30)), (x - 80, y - 80))
    g = gradien(w, h).convert('RGBA')
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    g.putalpha(m)
    im.alpha_composite(g, (x, y))


def neu(im, x, y, w, h, r=56, inset=False, isi=BG):
    """Neumorphic card, raised or inset, scaled for a print poster."""
    x, y, w, h = int(x), int(y), int(w), int(h)
    pad = 110
    lap = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    if not inset:
        g = Image.new('RGBA', lap.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).rounded_rectangle([pad + 26, pad + 30, pad + w + 26, pad + h + 30], r, fill=SD + (175,))
        lap.alpha_composite(g.filter(ImageFilter.GaussianBlur(34)))
        g = Image.new('RGBA', lap.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).rounded_rectangle([pad - 22, pad - 22, pad + w - 22, pad + h - 22], r, fill=(255, 255, 255, 240))
        lap.alpha_composite(g.filter(ImageFilter.GaussianBlur(30)))
    ImageDraw.Draw(lap).rounded_rectangle([pad, pad, pad + w, pad + h], r, fill=isi + (255,))
    if inset:
        g = Image.new('RGBA', lap.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).rounded_rectangle([pad, pad, pad + w, pad + h], r, outline=SD + (130,), width=12)
        g = g.filter(ImageFilter.GaussianBlur(10))
        m = Image.new('L', lap.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([pad, pad, pad + w, pad + h], r, fill=255)
        g.putalpha(Image.composite(g.getchannel('A'), Image.new('L', lap.size, 0), m))
        lap.alpha_composite(g)
    im.alpha_composite(lap, (x - pad, y - pad))


_IK = {}


def ikon(nama, u):
    k = (nama, u)
    if k not in _IK:
        _IK[k] = Image.open(os.path.join(IKON, nama + '.png')).convert('RGBA').resize((u, u), Image.LANCZOS)
    return _IK[k]


def tempel(im, gambar, x, y):
    im.alpha_composite(gambar, (int(x), int(y)))


def logo_mark(u):
    S = u * 4
    m = Image.new('L', (S, int(S * 0.84)), 0)
    d = ImageDraw.Draw(m)
    k = S / 100
    lb = int(22 * k)
    for x in (15, 85):
        d.line([(x * k, 14 * k), (x * k, 70 * k)], fill=255, width=lb)
        for yy in (14, 70):
            d.ellipse([x * k - lb / 2, yy * k - lb / 2, x * k + lb / 2, yy * k + lb / 2], fill=255)
    d.line([(15 * k, 14 * k), (50 * k, 44 * k), (85 * k, 14 * k)], fill=215, width=int(19 * k), joint='curve')
    g = gradien(S, int(S * 0.84)).convert('RGBA')
    g.putalpha(m)
    return g.resize((u, int(u * 0.84)), Image.LANCZOS)


def judul_kartu(im, x, y, ik, judul, no=None, gelap=False):
    """Section header: Blender icon tile + title + small number."""
    tempel(im, ikon(ik, 118), x, y - 14)
    d = ImageDraw.Draw(im)
    d.text((x + 146, y), judul, font=disp(62, 650), fill=(255, 255, 255) if gelap else INK)
    if no:
        d.text((x + 146, y + 76), no, font=mono(24), fill=BLUE)
    return d


def panah(d, p, q, lebar=6, col=BLUE):
    d.line([p, q], fill=col, width=lebar)
    a = math.atan2(q[1] - p[1], q[0] - p[0])
    for s in (-0.5, 0.5):
        d.line([q, (q[0] - 26 * math.cos(a + s), q[1] - 26 * math.sin(a + s))], fill=col, width=lebar)


# ================================================================ poster
def bangun():
    im = Image.new('RGBA', (W, H), BG + (255,))
    # soft glows on the body
    kecil = Image.new('RGBA', (160, 226), (0, 0, 0, 0))
    dk = ImageDraw.Draw(kecil)
    dk.ellipse([100, 30, 240, 150], fill=CYAN + (55,))
    dk.ellipse([-80, 120, 60, 240], fill=BLUE + (34,))
    im.alpha_composite(kecil.filter(ImageFilter.GaussianBlur(18)).resize((W, H), Image.BICUBIC))

    # ------------------------------------------------ header (navy, like the video chapter cards)
    HH = 640
    kepala = Image.new('RGBA', (192, 40), NAVY + (255,))
    lk = Image.new('RGBA', (192, 40), (0, 0, 0, 0))
    dl = ImageDraw.Draw(lk)
    dl.ellipse([120, -40, 250, 60], fill=BLUE + (130,))
    dl.ellipse([-40, 10, 70, 80], fill=CYAN + (45,))
    kepala.alpha_composite(lk.filter(ImageFilter.GaussianBlur(10)))
    kepala = kepala.resize((W, HH), Image.BICUBIC)
    m = Image.new('L', (W, HH), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, -80, W - 1, HH - 1], 80, fill=255)
    kepala.putalpha(m)
    im.alpha_composite(kepala, (0, 0))
    cincin = Image.open(os.path.join(AKAR, 'assets', 'ui', 'ornamen', 'cincin.webp')).convert('RGBA').resize((520, 519))
    cincin.putalpha(cincin.getchannel('A').point(lambda v: int(v * 0.35)))
    im.alpha_composite(cincin, (2760, 260))

    # logo row
    d = ImageDraw.Draw(im)
    inn = Image.open(os.path.join(PST, 'logo-innopa.png'))
    inn = inn.resize((int(inn.width * 150 / inn.height), 150), Image.LANCZOS)
    tempel(im, inn, 110, 50)
    for k, nama in enumerate(['logo-smakb.png', 'logo-sma3.png']):
        lg = Image.open(os.path.join(PST, nama)).convert('RGBA')
        lg = lg.resize((int(lg.width * 150 / lg.height), 150), Image.LANCZOS)
        x = 820 + k * 260
        ImageDraw.Draw(im).rounded_rectangle([x - 20, 38, x + lg.width + 20, 212], 36, fill=(255, 255, 255, 255))
        tempel(im, lg, x, 50)
    mk = logo_mark(130)
    tempel(im, mk, 1470, 62)
    d = ImageDraw.Draw(im)
    x = spasi(d, (1630, 92), 'MEDI', disp(72, 500), (255, 255, 255), 16)
    spasi(d, (x, 92), 'VOX', disp(72, 500), CYAN, 16)
    ind = Image.open(os.path.join(PST, 'logo-indonesia.png'))
    ind = ind.resize((int(ind.width * 170 / ind.height), 170), Image.LANCZOS)
    tempel(im, ind, W - 110 - ind.width, 40)
    d.line([(110, 262), (W - 110, 262)], fill=(88, 216, 255, 110), width=3)

    # title block
    x = spasi(d, (104, 300), 'MEDI', disp(214, 700), (255, 255, 255), 10)
    g = gradien(560, 260).convert('RGBA')
    mm = Image.new('L', (560, 260), 0)
    spasi(ImageDraw.Draw(mm), (0, 0), 'VOX', disp(214, 700), 255, 10)
    g.putalpha(mm)
    im.alpha_composite(g, (int(x), 300))
    d = ImageDraw.Draw(im)
    spasi(d, (112, 548), 'SEE.  SPEAK.  UNDERSTAND.', mono(34), CYAN, 8)
    tx = 1340
    judul = ['Development and Feasibility Evaluation of MEDIVOX,',
             'a Voice- and Gesture-Controlled Pseudo-Holographic',
             'System for Human Anatomy Education']
    for k, b in enumerate(judul):
        d.text((tx, 300 + k * 78), b, font=disp(58, 600), fill=(255, 255, 255))
    penulis = ('Adel Erasmo Farsya, Aline Audina, Aulia Putra Zahra, Diwya Anindyanari Jagadparasraya, '
               'Narendra Nararya Nurhan, W Javier Rafa Ramadhan')
    paragraf(d, (tx, 560 - 20), penulis, teks(33, 500), (190, 212, 240), 1700, 44)

    # ------------------------------------------------ layout grid
    L, R, CW = 110, 1640, 1429
    gap = 60

    # ================= BACKGROUND
    y0, h0 = 700, 860
    neu(im, L, y0, CW, h0)
    judul_kartu(im, L + 56, y0 + 56, 'berkas', 'Background', '01')
    d = ImageDraw.Draw(im)
    baris = [('buka' if False else 'berkas', 'Problem', 'Conventional anatomy learning relies on 2D images and textbooks, which makes complex 3D structures hard to visualise.'),
             ('otak', 'Learning gap', 'Students struggle to understand the spatial relationships between organs and systems, which lowers engagement and conceptual understanding.'),
             ('petir', 'Opportunity', 'Holographic visualisation, voice interaction and gesture control can make anatomy learning more interactive, immersive and effective.')]
    y = y0 + 230
    for k, (ik, lb, s) in enumerate(baris):
        neu(im, L + 56, y, 150, 150, 40, inset=True)
        tempel(im, ikon(ik, 124), L + 69, y + 13)
        d = ImageDraw.Draw(im)
        d.text((L + 240, y + 4), lb, font=disp(44, 650), fill=BLUE)
        paragraf(d, (L + 240, y + 64), s, teks(31, 500), INK2, CW - 300, 42)
        if k < 2:
            panah(d, (L + 131, y + 168), (L + 131, y + 198), 5, (47, 98, 245))
        y += 206

    # ================= SOLUTION
    neu(im, R, y0, CW, h0)
    judul_kartu(im, R + 56, y0 + 56, 'hologram', 'Solution', '02')
    d = ImageDraw.Draw(im)
    s = ('is a pseudo-holographic learning medium that visualises 3D human anatomy and lets users interact '
         'through voice commands, hand gestures and AI assistance, for a more immersive and accessible learning experience.')
    d.text((R + 56, y0 + 222), 'MEDIVOX', font=disp(36, 700), fill=BLUE)
    wmed = d.textlength('MEDIVOX ', font=disp(36, 700))
    baris_s = bungkus(d, s, teks(34, 500), CW - 112)
    # first line starts after the bold word
    pertama = bungkus(d, s, teks(34, 500), CW - 112 - wmed)[0]
    d.text((R + 56 + wmed, y0 + 222), pertama, font=teks(34, 500), fill=INK2)
    sisa = s[len(pertama):].strip()
    paragraf(d, (R + 56, y0 + 270), sisa, teks(34, 500), INK2, CW - 112, 48)
    fitur = [('kubus', '3D Visualization', 'Explore anatomical structures in an interactive 3D display.'),
             ('mik', 'Voice Control', 'Hands-free navigation and information access.'),
             ('tangan', 'Gesture Control', 'Natural, intuitive interaction for exploring models.'),
             ('otak', 'AI Assistance', 'Guided explanations and adaptive learning support.')]
    fw = (CW - 112 - 3 * 34) / 4
    for k, (ik, j, sub) in enumerate(fitur):
        x = R + 56 + k * (fw + 34)
        yy = y0 + 470
        neu(im, x, yy, fw, 340, 40, inset=True)
        tempel(im, ikon(ik, 120), x + (fw - 120) / 2, yy + 26)
        d = ImageDraw.Draw(im)
        w = d.textlength(j, font=disp(30, 650))
        d.text((x + (fw - w) / 2, yy + 160), j, font=disp(30, 650), fill=INK)
        by = yy + 210
        for b in bungkus(d, sub, teks(24, 500), fw - 40):
            w = d.textlength(b, font=teks(24, 500))
            d.text((x + (fw - w) / 2, by), b, font=teks(24, 500), fill=INK2)
            by += 32

    # ================= TIMELINE
    y1, h1 = y0 + h0 + gap, 580
    neu(im, L, y1, CW, h1)
    judul_kartu(im, L + 56, y1 + 56, 'jam', 'Timeline', '03')
    d = ImageDraw.Draw(im)
    track = [('cari', 'JAN – MAR', 'Research &', 'literature study'),
             ('panjang', 'APR – JUN', 'Design &', 'prototyping'),
             ('setelan', 'JUL – SEP', 'Development,', 'testing & evaluation'),
             ('bendera', 'OCT – DEC', 'Finalisation &', 'presentation')]
    neu(im, L + 56, y1 + 210, CW - 112, 320, 44, inset=True)
    d = ImageDraw.Draw(im)
    xs = [L + 56 + (CW - 112) * (k + 0.5) / 4 for k in range(4)]
    g = gradien(int(xs[3] - xs[0]), 10).convert('RGBA')
    im.alpha_composite(g, (int(xs[0]), y1 + 300))
    d = ImageDraw.Draw(im)
    for k, (ik, bln, a, b) in enumerate(track):
        cx = xs[k]
        kotak_grad(im, cx - 62, y1 + 243, 124, 124, 62, bayang=False)
        d = ImageDraw.Draw(im)
        d.ellipse([cx - 52, y1 + 253, cx + 52, y1 + 357], fill=(255, 255, 255))
        tempel(im, ikon(ik, 92), cx - 46, y1 + 259)
        d = ImageDraw.Draw(im)
        w = d.textlength(bln, font=disp(34, 700))
        d.text((cx - w / 2, y1 + 384), bln, font=disp(34, 700), fill=INK)
        for q, t in enumerate((a, b)):
            w = d.textlength(t, font=teks(25, 500))
            d.text((cx - w / 2, y1 + 432 + q * 32), t, font=teks(25, 500), fill=INK2)

    # ================= METHODOLOGY
    neu(im, R, y1, CW, h1)
    judul_kartu(im, R + 56, y1 + 56, 'lapisan', 'Methodology', '04')
    d = ImageDraw.Draw(im)
    langkah = [('berkas', '1  Input', 'Anatomical data (3D models, CT, MRI)'),
               ('probe', '2  Processing', 'Data parsing & 3D volume reconstruction'),
               ('hologram', '3  Projection', 'Synchronised views into the prism'),
               ('mik', '4  Interaction', 'Voice commands & hand gestures'),
               ('otak', '5  Learning', 'Explore · understand · apply')]
    sw = (CW - 112 - 4 * 30) / 5
    for k, (ik, j, s) in enumerate(langkah):
        x = R + 56 + k * (sw + 30)
        yy = y1 + 210
        neu(im, x, yy, sw, 320, 36, inset=True)
        tempel(im, ikon(ik, 104), x + (sw - 104) / 2, yy + 24)
        d = ImageDraw.Draw(im)
        w = d.textlength(j, font=disp(27, 700))
        d.text((x + (sw - w) / 2, yy + 146), j, font=disp(27, 700), fill=INK)
        by = yy + 194
        for b in bungkus(d, s, teks(22, 500), sw - 26):
            w = d.textlength(b, font=teks(22, 500))
            d.text((x + (sw - w) / 2, by), b, font=teks(22, 500), fill=INK2)
            by += 29
        if k < 4:
            panah(d, (x + sw + 4, yy + 160), (x + sw + 26, yy + 160), 4)

    # ================= DESIGN OF THE DEVICE
    y2, h2 = y1 + h1 + gap, 740
    neu(im, L, y2, W - 2 * L, h2)
    judul_kartu(im, L + 56, y2 + 56, 'kubus', 'Design of the Device', '05')
    alat = Image.open(os.path.join(PST, '3d', 'medivox-tigaper.png')).convert('RGBA')
    bb = alat.getchannel('A').getbbox()
    alat = alat.crop(bb)
    aw = 800
    alat = alat.resize((aw, int(alat.height * aw / alat.width)), Image.LANCZOS)
    ax, ay = (W - aw) / 2, y2 + 90
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([W / 2 - 520, ay + 120, W / 2 + 520, ay + alat.height + 40], fill=CYAN + (70,))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(80)))
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([W / 2 - 400, ay + alat.height - 60, W / 2 + 400, ay + alat.height + 10], fill=(22, 52, 98, 90))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(26)))
    tempel(im, alat, ax, ay)

    def titik(fx, fy):
        return ax + fx * aw, ay + fy * alat.height
    info = [  # (side, y, icon, title, text, anchor)
        ('L', y2 + 250, 'hologram', 'Pseudo-holographic prism display',
         'A four-sided transparent prism creates a floating 3D visualisation.', titik(0.17, 0.24)),
        ('L', y2 + 520, 'mik', 'Voice & gesture sensor',
         'A microphone array and camera window detect voice commands and hand gestures.', titik(0.2, 0.79)),
        ('R', y2 + 250, 'otak', '3D anatomy display',
         'Real-time 3D anatomical models for interactive exploration.', titik(0.5, 0.29)),
        ('R', y2 + 520, 'setelan', 'Processing unit',
         'Handles data processing, rendering and system control.', titik(0.66, 0.9)),
    ]
    for sisi, yy, ik, j, s, (px, py) in info:
        cw = 820
        x = L + 56 if sisi == 'L' else W - L - 56 - cw
        neu(im, x, yy, cw, 220, 40)
        tempel(im, ikon(ik, 104), x + 28, yy + 24)
        d = ImageDraw.Draw(im)
        d.text((x + 152, yy + 30), j, font=disp(33, 650), fill=INK)
        paragraf(d, (x + 152, yy + 84), s, teks(26, 500), INK2, cw - 190, 36)
        ex = x + cw if sisi == 'L' else x
        d.line([(ex, yy + 110), ((ex + px) / 2, yy + 110), (px, py)], fill=(47, 98, 245), width=4, joint='curve')
        d.ellipse([px - 14, py - 14, px + 14, py + 14], fill=CYAN, outline=(255, 255, 255), width=5)
    d = ImageDraw.Draw(im)

    # ================= IMPLEMENTATION
    y3, h3 = y2 + h2 + gap, 690
    neu(im, L, y3, CW, h3)
    judul_kartu(im, L + 56, y3 + 56, 'viewer', 'Implementation', '06')
    foto = Image.open(os.path.join(AKAR, 'build', 'reel2', 'shot-ekosistem', 'f0150.jpg')).convert('RGB')
    fw_, fh_ = 690, 420
    r_ = max(fw_ / foto.width, fh_ / foto.height)
    foto = foto.resize((int(foto.width * r_), int(foto.height * r_)), Image.LANCZOS)
    foto = foto.crop(((foto.width - fw_) // 2, (foto.height - fh_) // 2, (foto.width - fw_) // 2 + fw_, (foto.height - fh_) // 2 + fh_)).convert('RGBA')
    mm = Image.new('L', (fw_, fh_), 0)
    ImageDraw.Draw(mm).rounded_rectangle([0, 0, fw_ - 1, fh_ - 1], 36, fill=255)
    foto.putalpha(mm)
    neu(im, L + 56, y3 + 212, fw_, fh_, 36, inset=True)
    tempel(im, foto, L + 56, y3 + 212)
    d = ImageDraw.Draw(im)
    d.text((L + 60, y3 + 650), 'MEDIVOX-1, laptop and Android phone running the same web app', font=teks(22, 500), fill=MUTED)
    butir = ['Web app in HTML, CSS and JavaScript: runs in any browser, nothing to install.',
             'Own DICOM parser and CPU ray casting render four synchronised views.',
             'Prism: an acrylic pyramid over a flat screen, or the MEDIVOX-1 unit.',
             'Voice commands in English and Indonesian via the Web Speech API.',
             'Webcam hand gestures: swipe to rotate, push or pull to zoom.']
    by = y3 + 214
    bx = L + 56 + fw_ + 50
    for b in butir:
        d.ellipse([bx, by + 12, bx + 18, by + 30], fill=BLUE)
        by = paragraf(d, (bx + 34, by), b, teks(27, 500), INK2, CW - (bx - L) - 90, 36) + 16

    # ================= RESULTS
    neu(im, R, y3, CW, h3)
    judul_kartu(im, R + 56, y3 + 56, 'centang', 'Results', '07')
    d = ImageDraw.Draw(im)
    teknis = [('4 views', '24 angles pre-rendered in ≈0.6 s (256² px) in the browser'),
              ('206', 'automated tests passing (127 unit + 79 page tests)'),
              ('20+', 'voice commands in English and Indonesian'),
              ('0 B', 'of image data uploaded: files stay on the device')]
    tw = (CW - 112 - 30) / 2
    for k, (v, s) in enumerate(teknis):
        x = R + 56 + (k % 2) * (tw + 30)
        yy = y3 + 212 + (k // 2) * 196
        neu(im, x, yy, tw, 170, 34, inset=True)
        g = gradien(300, 90).convert('RGBA')
        mm = Image.new('L', (300, 90), 0)
        ImageDraw.Draw(mm).text((0, 0), v, font=disp(62, 700), fill=255)
        g.putalpha(mm)
        tempel(im, g, x + 30, yy + 22)
        d = ImageDraw.Draw(im)
        paragraf(d, (x + 30, yy + 100), s, teks(22, 500), INK2, tw - 50, 29)
    # feasibility evaluation
    yy = y3 + 596
    d.text((R + 60, yy - 10), 'Feasibility evaluation', font=disp(28, 650), fill=INK)
    ev = HASIL_EVALUASI
    slot = [('Expert validation', '%s%%' % ev['ahli'] if ev['ahli'] is not None else None),
            ('Student questionnaire', '%s / 5' % ev['siswa'] if ev['siswa'] is not None else None),
            ('Respondents', 'n = %s' % ev['n'] if ev['n'] is not None else None)]
    x = R + 450
    for lb, v in slot:
        tampil = v if v else '[ add data ]'
        wv = d.textlength(tampil, font=disp(26, 700))
        wl = d.textlength(lb, font=teks(20, 600))
        bw = max(wv, wl) + 40
        if v:
            kotak_grad(im, x, yy - 18, bw, 84, 22, bayang=False)
            d = ImageDraw.Draw(im)
            d.text((x + 20, yy - 12), lb, font=teks(20, 600), fill=(230, 240, 255))
            d.text((x + 20, yy + 16), tampil, font=disp(26, 700), fill=(255, 255, 255))
        else:
            for q in range(0, int(bw), 22):
                d.line([(x + q, yy - 18), (x + min(bw, q + 12), yy - 18)], fill=MUTED, width=3)
                d.line([(x + q, yy + 66), (x + min(bw, q + 12), yy + 66)], fill=MUTED, width=3)
            d.line([(x, yy - 18), (x, yy + 66)], fill=MUTED, width=3)
            d.line([(x + bw, yy - 18), (x + bw, yy + 66)], fill=MUTED, width=3)
            d.text((x + 20, yy - 12), lb, font=teks(20, 600), fill=MUTED)
            d.text((x + 20, yy + 16), tampil, font=disp(26, 700), fill=MUTED)
        x += bw + 24

    # ================= bottom row: conclusions / partnerships / team
    y4, h4 = y3 + h3 + gap, 500
    c3 = (W - 2 * L - 2 * gap) / 3
    xs3 = [L + k * (c3 + gap) for k in range(3)]
    # conclusions
    neu(im, xs3[0], y4, c3, h4)
    judul_kartu(im, xs3[0] + 50, y4 + 50, 'laporan', 'Conclusions')
    d = ImageDraw.Draw(im)
    kes = ['MEDIVOX turns 3D anatomical data into a floating, glasses-free image that a whole group can study together.',
           'Voice and gesture control make exploring anatomy hands-free and natural.',
           'It runs in a standard browser with low-cost hardware, practical for schools.']
    by = y4 + 180
    for b in kes:
        d.ellipse([xs3[0] + 54, by + 11, xs3[0] + 72, by + 29], fill=BLUE)
        by = paragraf(d, (xs3[0] + 90, by), b, teks(25, 500), INK2, c3 - 140, 34) + 14
    # partnerships
    neu(im, xs3[1], y4, c3, h4)
    judul_kartu(im, xs3[1] + 50, y4 + 50, 'pengguna', 'Partnerships')
    for k, (nama, lb) in enumerate([('logo-smakb.png', 'SMA Kesatuan Bangsa'), ('logo-sma3.png', 'SMA 3 Yogyakarta')]):
        cx = xs3[1] + c3 * (0.28 + 0.44 * k)
        neu(im, cx - 150, y4 + 180, 300, 220, 40, inset=True)
        lg = Image.open(os.path.join(PST, nama)).convert('RGBA')
        lg = lg.resize((int(lg.width * 170 / lg.height), 170), Image.LANCZOS)
        ImageDraw.Draw(im).rounded_rectangle([cx - lg.width / 2 - 14, y4 + 190, cx + lg.width / 2 + 14, y4 + 390], 30, fill=(255, 255, 255))
        tempel(im, lg, cx - lg.width / 2, y4 + 205)
        d = ImageDraw.Draw(im)
        w = d.textlength(lb, font=disp(24, 650))
        d.text((cx - w / 2, y4 + 420), lb, font=disp(24, 650), fill=INK)
    # team
    neu(im, xs3[2], y4, c3, h4)
    judul_kartu(im, xs3[2] + 50, y4 + 50, 'pengguna', 'Our Team')
    tim = ['Adel Erasmo Farsya', 'Aline Audina', 'Aulia Putra Zahra', 'Diwya Anindyanari Jagadparasraya',
           'Narendra Nararya Nurhan', 'W Javier Rafa Ramadhan']
    for k, nm in enumerate(tim):
        x = xs3[2] + 50 + (k % 2) * (c3 / 2 - 20)
        yy = y4 + 180 + (k // 2) * 94
        ini = ''.join(p[0] for p in nm.split()[:2]).upper()
        kotak_grad(im, x, yy, 72, 72, 36, bayang=False)
        d = ImageDraw.Draw(im)
        w = d.textlength(ini, font=disp(26, 700))
        d.text((x + 36 - w / 2, yy + 20), ini, font=disp(26, 700), fill=(255, 255, 255))
        baris_nm = bungkus(d, nm, teks(22, 600), c3 / 2 - 140)
        ty = yy + 36 - len(baris_nm) * 15
        for b in baris_nm:
            d.text((x + 90, ty), b, font=teks(22, 600), fill=INK)
            ty += 29

    # ================= footer
    yf = H - 150
    kaki = Image.new('RGBA', (W, 150), NAVY + (255,))
    m = Image.new('L', (W, 150), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, W - 1, 230], 70, fill=255)
    kaki.putalpha(m)
    im.alpha_composite(kaki, (0, yf))
    qr = qrcode.QRCode(border=1, box_size=10)
    qr.add_data('https://medivox-id.web.app')
    qim = qr.make_image(fill_color='black', back_color='white').convert('RGBA').resize((114, 114), Image.NEAREST)
    tempel(im, qim, W - L - 114, yf + 18)
    d = ImageDraw.Draw(im)
    tempel(im, logo_mark(70), L, yf + 42)
    x = spasi(d, (L + 96, yf + 52), 'MEDI', disp(40, 500), (255, 255, 255), 10)
    spasi(d, (x, yf + 52), 'VOX', disp(40, 500), CYAN, 10)
    spasi(d, (L + 520, yf + 42), 'medivox-id.web.app', mono(34), CYAN, 3)
    d.text((L + 520, yf + 90), 'Research prototype, not a medical device. Scan to open the live demo.', font=teks(24, 500), fill=(170, 195, 225))

    im = im.convert('RGB')
    im.save(KELUAR, optimize=True)
    im.save(KELUAR.replace('.png', '.pdf'), resolution=300)
    im.resize((W // 3, H // 3), Image.LANCZOS).save(os.path.join(PST, '_pratinjau.jpg'), quality=88)
    print('poster:', KELUAR)


if __name__ == '__main__':
    bangun()
