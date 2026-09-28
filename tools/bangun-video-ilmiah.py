#!/usr/bin/env python3
"""
==========================================================
MEDIVOX — scientific explainer video (English, ~4.5 min)
----------------------------------------------------------
A "living slide deck": animated neumorphic slides in the
MEDIVOX UI style, intercut with Blender CLI shots of the
MEDIVOX-1 device, clinicians using it, and the app on a
laptop and an Android phone.

  00  title
  01  background            why 3D imaging is still read in 2D
  02  state of the art      qualitative comparison of approaches
  03  gap & novelty         what MEDIVOX combines
  04  system design         architecture, optics, hardware, rendering
  05  features              device, apps, voice and gesture control
  06  in use                team review, use cases
  07  validation            what is tested, and how
  08  limitations & future  honest limits and next steps
  09  conclusion

Frames are streamed straight into ffmpeg (no frame folders on
disk). Music is synthesised with numpy: no third-party audio.

Inputs:
  bash tools/render-reel.sh                         (Blender shots + jejak.json overlays)
  node --experimental-websocket tools/foto-cdp.js tools/foto-tex.json   (UI screenshots)
Run:      python tools/bangun-video-ilmiah.py
Output:   build/MEDIVOX_Scientific_Video.mp4
==========================================================
"""
import os, sys, json, glob, math, wave, shutil, subprocess, importlib.util
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REEL = os.path.join(AKAR, 'build', 'reel2')
FOTO = os.path.join(AKAR, 'build', 'foto')
UI = os.path.join(AKAR, 'assets', 'ui')
FONT = os.path.join(AKAR, 'build', 'font')
KELUAR = os.path.join(AKAR, 'build', 'MEDIVOX_Scientific_Video.mp4')
W, H, FPS = 1920, 1080, 30
SILANG = 12

BG = (237, 241, 248)
INK = (14, 26, 58)
INK2 = (52, 66, 106)
MUTED = (91, 106, 140)
BLUE = (47, 98, 245)
BLUE2 = (63, 139, 255)
CYAN = (88, 216, 255)
OK = (18, 138, 94)
WARN = (190, 120, 20)
BAD = (200, 53, 79)
NAVY = (6, 15, 43)
SD = (166, 180, 205)

# reuse the mockup helpers from the showreel builder
_spec = importlib.util.spec_from_file_location('sr', os.path.join(AKAR, 'tools', 'bangun-showreel.py'))
SR = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(SR)


# ================================================================ type
_F = {}


def _var(nama, ukuran, berat):
    k = (nama, ukuran, berat)
    if k not in _F:
        f = ImageFont.truetype(os.path.join(FONT, nama), ukuran)
        try:
            f.set_variation_by_axes([berat])
        except Exception:
            pass
        _F[k] = f
    return _F[k]


def disp(u, b=600):
    return _var('Sora.ttf', u, b)


def bersih(s):
    """Sora has no U+2192; titles set in Sora use a chevron instead."""
    return s.replace('\u2192', '\u203a')


def teks(u, b=500):
    return _var('PlusJakartaSans.ttf', u, b)


def mono(u):
    return _var('JetBrainsMono-Medium.ttf', u, 0)


def mulus(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def cepat(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def muncul(t, a, b=1.0, p=0.1):
    return cepat((t - a) / 0.12) * (1 - mulus((t - (b - p)) / p)) if b < 1.0 else cepat((t - a) / 0.12)


def spasi_tulis(d, xy, s, f, fill, sp):
    x, y = xy
    for ch in s:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + sp
    return x


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


def alfa(im, a):
    if a >= 0.999:
        return im
    im = im.copy()
    im.putalpha(im.getchannel('A').point(lambda v: int(v * max(0.0, a))))
    return im


# ================================================================ surfaces
_GRAD = {}


def gradien(w, h):
    k = (w, h)
    if k not in _GRAD:
        kecil = Image.new('RGB', (64, 64))
        px = kecil.load()
        for y in range(64):
            for x in range(64):
                t = (x + y) / 126
                if t < 0.55:
                    u = t / 0.55
                    c = [37 + (62 - 37) * u, 82 + (139 - 82) * u, 238 + (255 - 238) * u]
                else:
                    u = (t - 0.55) / 0.45
                    c = [62 + (88 - 62) * u, 139 + (216 - 139) * u, 255]
                px[x, y] = tuple(int(v) for v in c)
        _GRAD[k] = kecil.resize((w, h), Image.BICUBIC)
    return _GRAD[k]


_LATAR = None


def latar():
    """Neumorphic ground with the two soft glows of the web UI."""
    global _LATAR
    if _LATAR is None:
        kecil = Image.new('RGBA', (192, 108), BG + (255,))
        lap = Image.new('RGBA', (192, 108), (0, 0, 0, 0))
        d = ImageDraw.Draw(lap)
        d.ellipse([120, -70, 260, 50], fill=CYAN + (60,))
        d.ellipse([-70, 60, 70, 170], fill=BLUE + (36,))
        kecil.alpha_composite(lap.filter(ImageFilter.GaussianBlur(24)))
        _LATAR = kecil.resize((W, H), Image.BICUBIC).convert('RGB')
    return _LATAR.copy()


_NEU = {}


def neu(w, h, r=30, isi=BG, inset=False):
    """Raised (or inset) neumorphic card as RGBA with padding for shadows.
    Returns (image, pad)."""
    k = (w, h, r, isi, inset)
    if k in _NEU:
        return _NEU[k]
    pad = 44
    im = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    if not inset:
        g = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).rounded_rectangle([pad + 14, pad + 16, pad + w + 14, pad + h + 16], r, fill=SD + (170,))
        im.alpha_composite(g.filter(ImageFilter.GaussianBlur(18)))
        g = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).rounded_rectangle([pad - 12, pad - 12, pad + w - 12, pad + h - 12], r, fill=(255, 255, 255, 235))
        im.alpha_composite(g.filter(ImageFilter.GaussianBlur(16)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([pad, pad, pad + w, pad + h], r, fill=isi + (255,))
    if inset:
        g = Image.new('RGBA', im.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        gd.rounded_rectangle([pad, pad, pad + w, pad + h], r, outline=SD + (200,), width=10)
        g = g.filter(ImageFilter.GaussianBlur(7))
        m = Image.new('L', im.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([pad, pad, pad + w, pad + h], r, fill=255)
        g.putalpha(Image.composite(g.getchannel('A'), Image.new('L', im.size, 0), m))
        im.alpha_composite(g)
    _NEU[k] = (im, pad)
    return _NEU[k]


def tempel_neu(dasar, x, y, w, h, r=30, a=1.0, inset=False, isi=BG):
    im, pad = neu(int(w), int(h), r, isi, inset)
    dasar.alpha_composite(alfa(im, a), (int(x - pad), int(y - pad)))


def kotak_grad(dasar, x, y, w, h, r, a=1.0):
    g = gradien(int(w), int(h)).convert('RGBA')
    m = Image.new('L', (int(w), int(h)), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, int(w) - 1, int(h) - 1], r, fill=int(255 * a))
    g.putalpha(m)
    sh = Image.new('RGBA', (int(w) + 80, int(h) + 80), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([40, 52, 40 + int(w), 52 + int(h)], r, fill=(47, 98, 245, int(90 * a)))
    dasar.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)), (int(x) - 40, int(y) - 40))
    dasar.alpha_composite(g, (int(x), int(y)))


_IK = {}


def ikon(nama, u):
    k = (nama, u)
    if k not in _IK:
        _IK[k] = Image.open(os.path.join(UI, 'ikon', nama + '.webp')).convert('RGBA').resize((u, u), Image.LANCZOS)
    return _IK[k]


def orn(nama, lebar):
    im = Image.open(os.path.join(UI, 'ornamen', nama + '.webp')).convert('RGBA')
    return im.resize((lebar, int(im.height * lebar / im.width)), Image.LANCZOS)


# ================================================================ brand mark
def logo(u):
    """The MEDIVOX 'M' mark (two pillars + a V), drawn with the gradient."""
    S = u * 4
    m = Image.new('L', (S, int(S * 0.84)), 0)
    d = ImageDraw.Draw(m)
    k = S / 100
    lebar = int(22 * k)
    for x in (15, 85):
        d.line([(x * k, 14 * k), (x * k, 70 * k)], fill=255, width=lebar)
        for yy in (14, 70):
            d.ellipse([x * k - lebar / 2, yy * k - lebar / 2, x * k + lebar / 2, yy * k + lebar / 2], fill=255)
    lv = int(19 * k)
    d.line([(15 * k, 14 * k), (50 * k, 44 * k), (85 * k, 14 * k)], fill=210, width=lv, joint='curve')
    g = gradien(S, int(S * 0.84)).convert('RGBA')
    g.putalpha(m)
    return g.resize((u, int(u * 0.84)), Image.LANCZOS)


def wordmark(d, x, y, u, a=1.0):
    f = disp(u, 500)
    xs = spasi_tulis(d, (x, y), 'MEDI', f, (23, 48, 111, int(255 * a)), int(u * 0.22))
    spasi_tulis(d, (xs, y), 'VOX', f, (62, 170, 255, int(255 * a)), int(u * 0.22))


# ================================================================ chrome shared by slides
BAB_AKTIF = ['']


def kepala(im, a=1.0):
    """Small running header (logo + chapter) and a progress rail."""
    lg = logo(40)
    im.alpha_composite(alfa(lg, a * 0.9), (70, 44))
    d = ImageDraw.Draw(im)
    spasi_tulis(d, (124, 52), BAB_AKTIF[0].upper(), mono(17), MUTED + (int(220 * a),), 4)


def kepala_slide(d, eyebrow, judul, a=1.0, y=120):
    d.ellipse([140, y + 6, 152, y + 18], fill=(34, 197, 139, int(255 * a)))
    spasi_tulis(d, (164, y), eyebrow.upper(), teks(20, 700), BLUE + (int(255 * a),), 4)
    d.text((138, y + 36), judul, font=disp(58, 600), fill=INK + (int(255 * a),))


def keterangan(im, eyebrow, judul, sub, a):
    """Neumorphic caption card, lower left (used over 3D shots)."""
    if a <= 0.01:
        return im
    dasar = im.convert('RGBA')
    judul = bersih(judul)
    d0 = ImageDraw.Draw(dasar)
    fj, fs = disp(44, 600), teks(22, 500)
    lebar = int(max(d0.textlength(judul, font=fj), d0.textlength(sub, font=fs), 360)) + 76
    tinggi = 168
    x, y = 90, H - tinggi - 80 + int(16 * (1 - a))
    tempel_neu(dasar, x, y, lebar, tinggi, 28, a)
    d = ImageDraw.Draw(dasar)
    d.ellipse([x + 36, y + 36, x + 46, y + 46], fill=(34, 197, 139, int(255 * a)))
    spasi_tulis(d, (x + 58, y + 30), eyebrow.upper(), teks(17, 700), BLUE + (int(255 * a),), 4)
    d.text((x + 34, y + 60), judul, font=fj, fill=INK + (int(255 * a),))
    d.text((x + 36, y + 120), sub, font=fs, fill=INK2 + (int(255 * a),))
    return dasar.convert('RGB')


# make the showreel's mockup scenes use this video's look
SR.aura = lambda fase=0: latar()
SR.keterangan = lambda im, e, j, s, a: keterangan(im, e, j, s, a)


# ================================================================ scenes
class Adegan:
    def __init__(self, detik, fn, bab=None, kepala=True):
        self.n = int(round(detik * FPS))
        self.fn = fn
        self.bab = bab
        self.kepala = kepala


def dari_generator(detik, gen_fn, bab=None):
    """Wrap an old-style generator scene (from the showreel builder)."""
    state = {}

    def fn(i, n):
        if 'g' not in state:
            state['g'] = gen_fn()
        try:
            state['last'] = next(state['g'])
        except StopIteration:
            pass
        return state['last']
    a = Adegan(detik, fn, bab, kepala=False)
    return a


def frames_shot(nama):
    f = sorted(glob.glob(os.path.join(REEL, 'shot-' + nama, 'f*.jpg')))
    if not f:
        raise SystemExit('shot %s not rendered: run bash tools/render-reel.sh' % nama)
    j = os.path.join(REEL, 'shot-' + nama, 'jejak.json')
    return f, (json.load(open(j)) if os.path.exists(j) else None)


def shot(nama, detik, eyebrow, judul, sub, bab, overlay=None):
    def fn(i, n):
        f, jejak = frames_shot(nama)
        k = int(i * (len(f) - 1) / max(1, n - 1))
        im = Image.open(f[k]).convert('RGB')
        im = ImageEnhance.Contrast(ImageEnhance.Brightness(im).enhance(0.95)).enhance(1.06)
        t = i / n
        if overlay:
            im = overlay(im, k, jejak[k] if jejak else None, t)
        return keterangan(im, eyebrow, judul, sub, muncul(t, 0.08, 0.96, 0.1))
    return Adegan(detik, fn, bab, kepala=False)


# ---------------------------------------------------------------- 00 title
def s_pembuka(i, n):
    t = i / n
    im = latar().convert('RGBA')
    orns = [('cincin', 300, (0.12, 0.2), 1), ('kapsul', 220, (0.82, 0.16), -1), ('bola', 160, (0.2, 0.74), 1),
            ('heliks', 110, (0.88, 0.62), -1), ('palang', 110, (0.64, 0.8), 1)]
    for k, (nm, lb, (px, py), ar) in enumerate(orns):
        o = _ORN.setdefault((nm, lb), orn(nm, lb))
        a = mulus((t - 0.04 * k) / 0.3)
        yy = py * H - o.height / 2 + 30 * (1 - cepat(t / 0.5)) * ar + 8 * math.sin(t * 6 + k)
        im.alpha_composite(alfa(o, a * 0.95), (int(px * W - o.width / 2), int(yy)))
    a = cepat((t - 0.05) / 0.35)
    lg = logo(200)
    im.alpha_composite(alfa(lg, a), (W // 2 - 100, 330 - int(20 * (1 - a))))
    d = ImageDraw.Draw(im)
    wordmark(d, W // 2 - 230, 530, 64, cepat((t - 0.2) / 0.3))
    at = cepat((t - 0.38) / 0.3)
    s = 'SEE.  SPEAK.  UNDERSTAND.'
    lw = sum(d.textlength(c, font=mono(24)) + 6 for c in s)
    spasi_tulis(d, (W / 2 - lw / 2, 640), s, mono(24), BLUE + (int(255 * at),), 6)
    return im.convert('RGB')


_ORN = {}


def s_judul(i, n):
    t = i / n
    im = latar().convert('RGBA')
    produk = _ORN.setdefault('hero', Image.open(os.path.join(AKAR, 'assets', '3d', 'putih-hero.webp')).convert('RGBA').resize((720, 646), Image.LANCZOS))
    a0 = cepat(t / 0.3)
    tempel_neu(im, 1080, 170, 700, 700, 60, a0, inset=True)
    im.alpha_composite(alfa(produk, a0), (1070, 200 + int(30 * (1 - a0) + 8 * math.sin(t * 4))))
    d = ImageDraw.Draw(im)
    a1 = cepat((t - 0.1) / 0.3)
    d.ellipse([140, 262, 152, 274], fill=(34, 197, 139, int(255 * a1)))
    spasi_tulis(d, (164, 256), 'RESEARCH PROTOTYPE  ·  2026', teks(20, 700), BLUE + (int(255 * a1),), 4)
    y = 300
    for k, b in enumerate(['A pseudo-holographic,', 'touchless volumetric', 'display for DICOM imaging']):
        ak = cepat((t - 0.15 - 0.06 * k) / 0.3)
        d.text((136 + int(30 * (1 - ak)), y), b, font=disp(66, 600), fill=INK + (int(255 * ak),))
        y += 84
    a2 = cepat((t - 0.4) / 0.3)
    d.text((140, y + 24), 'Browser-native rendering  ·  four-view Pepper’s ghost optics  ·  voice & gesture control',
           font=teks(25, 500), fill=INK2 + (int(255 * a2),))
    for k, (v, l) in enumerate([('0', 'headsets'), ('4', 'synchronised views'), ('0 B', 'pixels uploaded')]):
        ak = cepat((t - 0.5 - 0.06 * k) / 0.3)
        x = 140 + k * 250
        tempel_neu(im, x, 740, 220, 120, 24, ak)
        d = ImageDraw.Draw(im)
        g = gradien(200, 60)
        d.text((x + 24, 756), v, font=disp(44, 600), fill=BLUE + (int(255 * ak),))
        d.text((x + 24, 816), l, font=teks(18, 500), fill=MUTED + (int(255 * ak),))
    return im.convert('RGB')


AGENDA = [('otak', '01', 'Background', 'Why 3D imaging is still read in 2D'),
          ('viewer', '02', 'State of the art', 'Viewers, headsets, prints, light fields'),
          ('bendera', '03', 'Gap & novelty', 'What MEDIVOX combines'),
          ('lapisan', '04', 'System design', 'Architecture, optics, hardware'),
          ('hologram', '05', 'Features', 'Device, apps, voice and gesture'),
          ('pengguna', '06', 'In use', 'Team review and use cases'),
          ('centang', '07', 'Validation', 'What is tested, and how'),
          ('sinkron', '08', 'Limits & future', 'Honest limits, next steps')]


def s_agenda(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'Overview', 'Agenda')
    for k, (ik, no, j, sub) in enumerate(AGENDA):
        a = cepat((t - 0.05 - 0.05 * k) / 0.25)
        x = 140 + (k % 4) * 420
        y = 300 + (k // 4) * 320
        tempel_neu(im, x, y, 380, 280, 30, a)
        d = ImageDraw.Draw(im)
        im.alpha_composite(alfa(ikon(ik, 92), a), (x + 32, y + 32))
        d.text((x + 290, y + 34), no, font=disp(40, 700), fill=(47, 98, 245, int(90 * a)))
        d.text((x + 34, y + 150), j, font=disp(30, 600), fill=INK + (int(255 * a),))
        for q, bb in enumerate(bungkus(d, sub, teks(21, 500), 320)):
            d.text((x + 36, y + 196 + q * 30), bb, font=teks(21, 500), fill=INK2 + (int(255 * a),))
    return im.convert('RGB')


# ---------------------------------------------------------------- chapter card
def s_bab(no, label, judul, sub):
    def fn(i, n):
        t = i / n
        kecil = Image.new('RGBA', (192, 108), NAVY + (255,))
        lap = Image.new('RGBA', (192, 108), (0, 0, 0, 0))
        d = ImageDraw.Draw(lap)
        d.ellipse([110 + 10 * t, -20, 240 + 10 * t, 110], fill=BLUE + (120,))
        d.ellipse([-50, 60, 70, 160], fill=CYAN + (50,))
        kecil.alpha_composite(lap.filter(ImageFilter.GaussianBlur(22)))
        im = kecil.resize((W, H), Image.BICUBIC)
        o = _ORN.setdefault(('cincin', 520), orn('cincin', 520))
        im.alpha_composite(alfa(o, cepat(t / 0.4) * 0.5), (1400, 290 + int(16 * math.sin(t * 3))))
        d = ImageDraw.Draw(im)
        a1, a2, a3 = (cepat((t - s) / 0.3) for s in (0.05, 0.15, 0.28))
        x = 150 + 30 * (1 - a1)
        d.text((x - 6, 250), no, font=disp(150, 700), fill=(88, 216, 255, int(70 * a1)))
        spasi_tulis(d, (x, 440), label.upper(), mono(22), (160, 200, 240, int(255 * a2)), 7)
        d.rounded_rectangle([x, 480, x + 120 * a1, 484], 2, fill=CYAN + (int(255 * a1),))
        d.text((x - 3, 504), judul, font=disp(70, 600), fill=(240, 246, 252, int(255 * a2)))
        for k, b in enumerate(bungkus(d, sub, teks(28, 400), 1100)):
            d.text((x, 606 + k * 40), b, font=teks(28, 400), fill=(170, 195, 225, int(255 * a3)))
        return im.convert('RGB')
    return Adegan(3.4, fn, label, kepala=False)


# ---------------------------------------------------------------- 01 background
def potong_ct():
    im = Image.open(os.path.join(FOTO, 't-viewer.png')).convert('RGB')
    k = im.width / 1440
    return im.crop((int(505 * k), int(245 * k), int(1015 * k), int(735 * k)))


_CT = {}


def s_irisan(i, n):
    t = i / n
    if 'st' not in _CT:
        ct = potong_ct()
        st = []
        for k in range(16):
            v = ImageEnhance.Brightness(ct).enhance(0.7 + 0.025 * k)
            s = 1 - abs(k - 8) * 0.03
            c = Image.new('RGB', ct.size, (0, 0, 0))
            vk = v.resize((int(ct.width * s), int(ct.height * s)))
            c.paste(vk, ((ct.width - vk.width) // 2, (ct.height - vk.height) // 2))
            st.append(SR.irisan_miring(c, 720))
        _CT['st'] = st
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'Background', 'Radiology is read one slice at a time')
    for k, sl in enumerate(_CT['st']):
        a = cepat((t - 0.02 * k) / 0.2)
        if a > 0:
            im.alpha_composite(alfa(sl, a * 0.92), (1060, int(640 - k * 24 - (1 - a) * 50)))
    d = ImageDraw.Draw(im)
    rows = ['A CT or MRI study is a stack of hundreds of flat images.',
            'The reader scrolls through them and rebuilds the 3D anatomy',
            'mentally: where a lesion sits, what it touches, how deep it goes.']
    for k, b in enumerate(rows):
        a = cepat((t - 0.25 - 0.08 * k) / 0.25)
        d.text((140, 330 + k * 46), b, font=teks(30, 500), fill=INK2 + (int(255 * a),))
    a = cepat((t - 0.55) / 0.25)
    tempel_neu(im, 140, 540, 760, 200, 30, a)
    d = ImageDraw.Draw(im)
    im.alpha_composite(alfa(ikon('otak', 96), a), (180, 592))
    d.text((310, 580), 'Mental 3D reconstruction', font=disp(34, 600), fill=INK + (int(255 * a),))
    d.text((310, 632), 'is a skill that takes years to build and', font=teks(24, 500), fill=INK2 + (int(255 * a),))
    d.text((310, 666), 'is hard to share with other people.', font=teks(24, 500), fill=INK2 + (int(255 * a),))
    return im.convert('RGB')


def kubus_kawat(d, cx, cy, s, sudut, warna, a, titik=None):
    """Rotating wireframe cube (optionally with a point cloud inside)."""
    ca, sa = math.cos(sudut), math.sin(sudut)
    cb, sb = math.cos(0.45), math.sin(0.45)

    def pr(x, y, z):
        x2 = x * ca - z * sa
        z2 = x * sa + z * ca
        y2 = y * cb - z2 * sb
        return cx + x2 * s, cy + y2 * s
    v = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    for p in range(8):
        for q in range(p + 1, 8):
            if sum(1 for u in range(3) if v[p][u] != v[q][u]) == 1:
                d.line([pr(*v[p]), pr(*v[q])], fill=warna + (int(200 * a),), width=3)
    if titik is not None:
        for (x, y, z) in titik:
            px, py = pr(x, y, z)
            r = 3.2
            d.ellipse([px - r, py - r, px + r, py + r], fill=(63, 139, 255, int(170 * a)))


_AWAN = [(0.7 * math.cos(u) * math.sin(w) * (0.8 + 0.2 * math.sin(3 * u)),
          0.62 * math.cos(w), 0.62 * math.sin(u) * math.sin(w))
         for u in np.linspace(0, 2 * math.pi, 26) for w in np.linspace(0.2, math.pi - 0.2, 12)]


def s_angka(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'Background', 'The size of the problem')
    data = [('512³', 'voxels in a typical', 'CT volume'), ('200+', 'slices scrolled', 'in one study'),
            ('2D', 'screens used to judge', '3D anatomy'), ('1', 'reader at a time', 'in front of the monitor')]
    for k, (v, l1, l2) in enumerate(data):
        a = cepat((t - 0.08 - k * 0.08) / 0.3)
        x = 140 + k * 420
        tempel_neu(im, x, 360, 380, 330, 32, a)
        d = ImageDraw.Draw(im)
        g = gradien(300, 110).convert('RGBA')
        m = Image.new('L', (300, 110), 0)
        ImageDraw.Draw(m).text((0, 0), v, font=disp(92, 700), fill=int(255 * a))
        g.putalpha(m)
        im.alpha_composite(g, (x + 40, 410))
        d.text((x + 42, 560), l1, font=teks(26, 500), fill=INK2 + (int(255 * a),))
        d.text((x + 42, 598), l2, font=teks(26, 500), fill=INK2 + (int(255 * a),))
    a = cepat((t - 0.5) / 0.25)
    d.text((140, 780), 'Figures describe the scale of the data, not measured clinical performance.',
           font=teks(22, 500), fill=MUTED + (int(255 * a),))
    return im.convert('RGB')


def s_masalah(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'Background', 'Two practical gaps')
    kartu = [('pengguna', 'Shared understanding', ['A tumour board gathers surgeons, oncologists',
                                                 'and radiologists around one flat screen.',
                                                 'Only the reader sees the anatomy in 3D.']),
             ('tangan', 'Sterile, hands-busy settings', ['In procedures a mouse or keyboard is a',
                                                         'contamination risk, so images are often',
                                                         'driven by someone else on instruction.'])]
    for k, (ik, j, b) in enumerate(kartu):
        a = cepat((t - 0.1 - 0.15 * k) / 0.3)
        x = 140 + k * 840
        tempel_neu(im, x, 330, 790, 460, 36, a)
        d = ImageDraw.Draw(im)
        im.alpha_composite(alfa(ikon(ik, 130), a), (x + 50, 380))
        d.text((x + 50, 540), j, font=disp(40, 600), fill=INK + (int(255 * a),))
        for q, s in enumerate(b):
            d.text((x + 52, 606 + q * 42), s, font=teks(26, 500), fill=INK2 + (int(255 * a),))
    return im.convert('RGB')


def s_pertanyaan(i, n):
    t = i / n
    im = latar().convert('RGBA')
    a = cepat(t / 0.3)
    kotak_grad(im, 180, 250, 1560, 540, 44, a)
    d = ImageDraw.Draw(im)
    spasi_tulis(d, (260, 320), 'RESEARCH QUESTION', teks(24, 700), (255, 255, 255, int(230 * a)), 5)
    y = 390
    for k, b in enumerate(['Can a low-cost, glasses-free volumetric display,', 'controlled without touch and fed directly from',
                           'DICOM in a browser, make 3D imaging easier to', 'see, share and discuss?']):
        ak = cepat((t - 0.12 - 0.07 * k) / 0.3)
        d.text((258, y), b, font=disp(52, 600), fill=(255, 255, 255, int(255 * ak)))
        y += 72
    return im.convert('RGB')


# ---------------------------------------------------------------- 02 state of the art
BARIS = [
    ('2D PACS viewer', 'Flat slices, the clinical standard', ['n', 'y', 'y', 'n', 'y', 'y']),
    ('3D rendering on a monitor', 'Volume rendering on a flat screen', ['p', 'y', 'y', 'n', 'y', 'y']),
    ('VR / AR headset', 'Stereo 3D in a head-mounted display', ['y', 'n', 'p', 'y', 'p', 'p']),
    ('3D-printed model', 'Physical replica from segmentation', ['y', 'y', 'y', 'n', 'p', 'p']),
    ('Light-field / autostereo', 'Glasses-free multi-view panels', ['y', 'y', 'p', 'n', 'n', 'p']),
    ('Pepper’s-ghost pyramid', 'Consumer prism over a phone', ['p', 'y', 'y', 'n', 'y', 'n']),
    ('MEDIVOX', 'This work', ['p', 'y', 'y', 'y', 'y', 'y']),
]
KOLOM = ['Depth\ncue', 'Glasses-\nfree', 'Multi-\nviewer', 'Touch-\nless', 'Low\ncost', 'Direct\nfrom DICOM']


def tanda(d, cx, cy, jenis, a):
    r = 17
    warna = {'y': OK, 'p': WARN, 'n': BAD}[jenis]
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=warna + (int(40 * a),), outline=warna + (int(255 * a),), width=3)
    if jenis == 'y':
        d.line([(cx - 8, cy), (cx - 2, cy + 7), (cx + 9, cy - 7)], fill=warna + (int(255 * a),), width=4)
    elif jenis == 'n':
        d.line([(cx - 7, cy - 7), (cx + 7, cy + 7)], fill=warna + (int(255 * a),), width=4)
        d.line([(cx - 7, cy + 7), (cx + 7, cy - 7)], fill=warna + (int(255 * a),), width=4)
    else:
        d.line([(cx - 8, cy), (cx + 8, cy)], fill=warna + (int(255 * a),), width=4)


def s_matriks(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'State of the art', 'How existing approaches compare', y=90)
    x0, y0, bw, rh = 140, 250, 1640, 84
    tempel_neu(im, x0, y0, bw, 110 + rh * len(BARIS), 34, cepat(t / 0.2))
    d = ImageDraw.Draw(im)
    kx = [x0 + 700 + k * 155 for k in range(6)]
    a0 = cepat((t - 0.05) / 0.2)
    for k, c in enumerate(KOLOM):
        for q, b in enumerate(c.split('\n')):
            w = d.textlength(b, font=teks(20, 700))
            d.text((kx[k] - w / 2, y0 + 26 + q * 24), b, font=teks(20, 700), fill=MUTED + (int(255 * a0),))
    for r, (nama, sub, nilai) in enumerate(BARIS):
        a = cepat((t - 0.1 - r * 0.07) / 0.14)
        y = y0 + 100 + r * rh
        if nama == 'MEDIVOX':
            a = cepat((t - 0.68) / 0.12)
            if a > 0:
                kotak_grad(im, x0 + 16, y - 6, bw - 32, rh - 4, 22, a)
                d = ImageDraw.Draw(im)
            warna_n, warna_s = (255, 255, 255), (220, 235, 255)
        else:
            warna_n, warna_s = INK, MUTED
            if r > 0:
                d.line([(x0 + 40, y - 4), (x0 + bw - 40, y - 4)], fill=(166, 180, 205, int(90 * a)), width=1)
        d.text((x0 + 44, y + 10), nama, font=disp(28, 600), fill=warna_n + (int(255 * a),))
        d.text((x0 + 44, y + 46), sub, font=teks(19, 500), fill=warna_s + (int(255 * a),))
        for k, v in enumerate(nilai):
            ak = cepat((t - 0.14 - r * 0.07 - k * 0.012) / 0.12)
            if nama == 'MEDIVOX':
                ak = cepat((t - 0.72 - k * 0.015) / 0.1)
                if ak > 0:
                    d.ellipse([kx[k] - 21, y + 21, kx[k] + 21, y + 63], fill=(255, 255, 255, int(235 * ak)))
            tanda(d, kx[k], y + 42, v, ak)
    a = cepat((t - 0.85) / 0.12)
    legend = [('y', 'yes'), ('p', 'partly'), ('n', 'no')]
    x = 140
    for j, l in legend:
        tanda(d, x + 18, 1000, j, a)
        d.text((x + 46, 986), l, font=teks(22, 600), fill=INK2 + (int(255 * a),))
        x += 170
    d.text((x + 20, 986), 'Qualitative comparison by the authors, not a benchmark. MEDIVOX gives a pseudo-3D floating image, not a true volumetric display.',
           font=teks(19, 500), fill=MUTED + (int(255 * a),))
    return im.convert('RGB')


def s_kurang(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'State of the art', 'Where each option falls short')
    kartu = [('viewer', 'Flat viewers', 'Precise and universal, but depth has to be imagined, and only one person drives.'),
             ('mata', 'Headsets', 'Strong depth, but every viewer needs a device and is cut off from the room.'),
             ('kubus', 'Printed models', 'Tangible, but hours to produce, static, and one print per case.')]
    for k, (ik, j, s) in enumerate(kartu):
        a = cepat((t - 0.1 - 0.12 * k) / 0.3)
        x = 140 + k * 560
        tempel_neu(im, x, 320, 520, 470, 34, a)
        d = ImageDraw.Draw(im)
        im.alpha_composite(alfa(ikon(ik, 120), a), (x + 44, 370))
        d.text((x + 44, 520), j, font=disp(38, 600), fill=INK + (int(255 * a),))
        for q, b in enumerate(bungkus(d, s, teks(25, 500), 430)):
            d.text((x + 46, 584 + q * 38), b, font=teks(25, 500), fill=INK2 + (int(255 * a),))
    return im.convert('RGB')


# ---------------------------------------------------------------- 03 gap & novelty
def s_venn(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'Research gap', 'Nobody combines all three')
    pusat = [(820, 520, 'Glasses-free shared 3D', (-270, -220)), (1100, 520, 'Touchless control', (60, -220)),
             (960, 760, 'Straight from DICOM,\nin a browser', (-150, 250))]
    lap = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dl = ImageDraw.Draw(lap)
    for k, (cx, cy, l, (lx, ly)) in enumerate(pusat):
        a = cepat((t - 0.08 - 0.12 * k) / 0.25)
        r = 230
        col = [BLUE, CYAN, (120, 110, 255)][k]
        dl.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (int(46 * a),), outline=col + (int(200 * a),), width=4)
    im.alpha_composite(lap)
    d = ImageDraw.Draw(im)
    tempat = [(-205, -70), (45, -70), (-80, 95)]
    for k, (cx, cy, l, _) in enumerate(pusat):
        a = cepat((t - 0.15 - 0.12 * k) / 0.25)
        baris = {0: ['Glasses-free', 'shared 3D'], 1: ['Touchless', 'control'], 2: ['From DICOM,', 'in a browser']}[k]
        for q, b in enumerate(baris):
            w = d.textlength(b, font=disp(26, 600))
            d.text((cx + tempat[k][0] + (160 - w) / 2, cy + tempat[k][1] + q * 34), b, font=disp(26, 600), fill=INK + (int(255 * a),))
    a = cepat((t - 0.6) / 0.2)
    if a > 0:
        g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse([905, 545, 1015, 655], fill=CYAN + (int(160 * a),))
        im.alpha_composite(g.filter(ImageFilter.GaussianBlur(26)))
        lg = logo(90)
        im.alpha_composite(alfa(lg, a), (915, 562))
    a2 = cepat((t - 0.7) / 0.2)
    d = ImageDraw.Draw(im)
    d.text((1380, 380), 'Headsets and light-field panels', font=teks(24, 600), fill=INK2 + (int(255 * a2),))
    d.text((1380, 414), 'give depth, but need special hardware.', font=teks(24, 500), fill=MUTED + (int(255 * a2),))
    d.text((1380, 470), 'Consumer prisms are cheap,', font=teks(24, 600), fill=INK2 + (int(255 * a2),))
    d.text((1380, 504), 'but play videos, not DICOM volumes.', font=teks(24, 500), fill=MUTED + (int(255 * a2),))
    d.text((1380, 560), 'Touchless viewers exist, but on', font=teks(24, 600), fill=INK2 + (int(255 * a2),))
    d.text((1380, 594), 'flat screens.', font=teks(24, 500), fill=MUTED + (int(255 * a2),))
    return im.convert('RGB')


def s_novelty(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'Novelty', 'What MEDIVOX contributes')
    kartu = [('berkas', '01', 'Browser-native pipeline', 'Own DICOM parser, voxel volume and CPU ray casting in plain JavaScript. No install, no upload.'),
             ('hologram', '02', 'Four-view prism rendering', 'Views 90° apart, pre-rendered and replayed, with face size, centre distance and mirror tuned to any prism.'),
             ('mik', '03', 'Multimodal touchless control', 'Voice commands and webcam hand gestures drive one shared command path, in English or Indonesian.'),
             ('kubus', '04', 'Commodity hardware', 'Any flat screen plus an acrylic pyramid works; MEDIVOX-1 packages it with a mic array and camera.')]
    for k, (ik, no, j, s) in enumerate(kartu):
        a = cepat((t - 0.08 - 0.14 * k) / 0.25)
        x = 140 + (k % 2) * 830
        y = 300 + (k // 2) * 330
        tempel_neu(im, x, y, 790, 290, 32, a)
        d = ImageDraw.Draw(im)
        im.alpha_composite(alfa(ikon(ik, 110), a), (x + 40, y + 40))
        d.text((x + 700, y + 30), no, font=disp(36, 700), fill=(47, 98, 245, int(90 * a)))
        d.text((x + 176, y + 50), j, font=disp(31, 600), fill=INK + (int(255 * a),))
        for q, b in enumerate(bungkus(d, s, teks(24, 500), 570)):
            d.text((x + 178, y + 106 + q * 36), b, font=teks(24, 500), fill=INK2 + (int(255 * a),))
    return im.convert('RGB')


# ---------------------------------------------------------------- 04 system design
def panah(d, p, q, a, putus=False, pulsa=None):
    col = BLUE + (int(200 * a),)
    if putus:
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        n = int(L / 16)
        for k in range(0, n, 2):
            u0, u1 = k / n, min(1, (k + 1) / n)
            d.line([(p[0] + (q[0] - p[0]) * u0, p[1] + (q[1] - p[1]) * u0),
                    (p[0] + (q[0] - p[0]) * u1, p[1] + (q[1] - p[1]) * u1)], fill=col, width=3)
    else:
        d.line([p, q], fill=col, width=4)
    ang = math.atan2(q[1] - p[1], q[0] - p[0])
    for s in (-0.5, 0.5):
        d.line([q, (q[0] - 16 * math.cos(ang + s), q[1] - 16 * math.sin(ang + s))], fill=col, width=4)
    if pulsa is not None and a > 0.5:
        u = pulsa % 1.0
        x, y = p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=CYAN + (255,))


def simpul(im, x, y, w, h, ik, judul, sub, a, grad=False):
    if grad:
        kotak_grad(im, x, y, w, h, 24, a)
    else:
        tempel_neu(im, x, y, w, h, 24, a)
    d = ImageDraw.Draw(im)
    im.alpha_composite(alfa(ikon(ik, 62), a), (int(x + 16), int(y + (h - 62) / 2)))
    c1 = (255, 255, 255) if grad else INK
    c2 = (225, 238, 255) if grad else MUTED
    d.text((x + 92, y + h / 2 - 30), judul, font=disp(24, 600), fill=c1 + (int(255 * a),))
    d.text((x + 92, y + h / 2 + 4), sub, font=teks(18, 500), fill=c2 + (int(255 * a),))


def s_arsitektur(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'System design', 'Architecture', y=90)
    w, h = 360, 100
    atas = [(120, 250, 'berkas', 'DICOM files', 'File API · local'),
            (560, 250, 'probe', 'Parser', 'our own, in JS'),
            (1000, 250, 'kubus', 'Voxel volume', 'true mm spacing'),
            (1440, 250, 'petir', 'Ray caster', 'MIP · VR · avg · iso')]
    tengah = [(1440, 480, 'hologram', '4-view layout', '90° apart, replayed'),
              (1000, 480, 'lapisan', 'Emitter panel', 'any flat screen'),
              (560, 480, 'kubus', 'Glass prism', '4 faces at 45°'),
              (120, 480, 'mata', 'Floating image', 'seen from all sides')]
    bawah = [(120, 760, 'mik', 'Microphone', 'Web Speech API'),
             (560, 760, 'teks', 'Command grammar', 'EN + ID, longest match'),
             (1000, 760, 'setelan', 'Controller', 'one command path'),
             (1440, 760, 'tangan', 'Hand tracker', 'camera, smoothed swipe & scale')]
    semua = atas + tengah + bawah
    for k, (x, y, ik, j, s) in enumerate(semua):
        a = cepat((t - 0.04 - k * 0.045) / 0.12)
        simpul(im, x, y, w, h, ik, j, s, a, grad=(j == 'Controller'))
    d = ImageDraw.Draw(im)
    ph = t * 2.2

    def pa(k, p, q, putus=False):
        a = cepat((t - 0.1 - k * 0.045) / 0.12)
        panah(d, p, q, a, putus, ph + k * 0.17)
    for k in range(3):
        pa(k, (atas[k][0] + w, 300), (atas[k + 1][0] - 6, 300))
    pa(3, (1620, 350), (1620, 474))
    for k in range(3):
        pa(4 + k, (tengah[k][0] - 6, 530), (tengah[k + 1][0] + w + 6, 530))
    pa(8, (bawah[0][0] + w, 810), (bawah[1][0] - 6, 810))
    pa(9, (bawah[1][0] + w, 810), (bawah[2][0] - 6, 810))
    pa(10, (bawah[3][0] - 6, 810), (bawah[2][0] + w + 6, 810))
    pa(11, (1180, 754), (1560, 586), putus=True)
    a = cepat((t - 0.75) / 0.2)
    d.text((140, 930), 'Everything above the dashed line runs in the browser on the CPU (canvas 2D, no WebGL). Only speech recognition may use a cloud service.',
           font=teks(22, 500), fill=MUTED + (int(255 * a),))
    return im.convert('RGB')


def s_optik(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'System design', 'Optics: four-sided Pepper’s ghost')
    tempel_neu(im, 140, 280, 1000, 640, 36, cepat(t / 0.2), inset=True)
    d = ImageDraw.Draw(im)
    a = cepat((t - 0.05) / 0.2)
    cx, by = 640, 800
    # emitter panel
    d.rounded_rectangle([cx - 330, by, cx + 330, by + 26], 8, fill=(20, 30, 60, int(255 * a)))
    for k in (-1, 1):
        d.rectangle([cx + k * 90 - 70, by + 4, cx + k * 90 + 70, by + 20], fill=CYAN + (int(230 * a),))
    d.text((cx - 150, by + 40), 'Emitter panel (views face the centre)', font=teks(20, 600), fill=INK2 + (int(255 * a),))
    # prism faces (side section)
    ap = cepat((t - 0.15) / 0.2)
    d.line([(cx - 60, by - 10), (cx - 300, by - 250)], fill=BLUE + (int(255 * ap),), width=6)
    d.line([(cx + 60, by - 10), (cx + 300, by - 250)], fill=BLUE + (int(255 * ap),), width=6)
    d.text((cx + 210, by - 330), 'glass face at 45°', font=teks(20, 600), fill=BLUE + (int(255 * ap),))
    # rays: panel -> glass -> eye
    ar = cepat((t - 0.3) / 0.25)
    mata = (cx - 480, by - 170)
    src = (cx - 160, by)
    hit = (cx - 160, by - 110)
    for k, (p, q) in enumerate([(src, hit), (hit, mata)]):
        d.line([p, q], fill=(255, 150, 60, int(230 * ar)), width=4)
    u = (t * 1.6) % 1
    if ar > 0.5:
        seg = [(src, hit), (hit, mata)]
        s = seg[0] if u < 0.5 else seg[1]
        v = (u % 0.5) * 2
        x, y = s[0][0] + (s[1][0] - s[0][0]) * v, s[0][1] + (s[1][1] - s[0][1]) * v
        d.ellipse([x - 8, y - 8, x + 8, y + 8], fill=(255, 150, 60, 255))
    # virtual image
    av = cepat((t - 0.5) / 0.25)
    for k in range(18):
        u2 = k / 17
        x = hit[0] + (hit[0] - mata[0]) * u2 * 0.6
        y = hit[1] + (hit[1] - mata[1]) * u2 * 0.6
        if k % 2 == 0:
            d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=MUTED + (int(200 * av),))
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse([cx - 70, by - 230, cx + 70, by - 110], fill=CYAN + (int(190 * av),))
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(im)
    d.text((cx - 90, by - 290), 'virtual image', font=teks(20, 600), fill=INK + (int(255 * av),))
    im.alpha_composite(alfa(ikon('mata', 70), ar), (int(mata[0] - 60), int(mata[1] - 35)))
    # text column
    rows = [('Each face reflects one view.', 'The glass is almost clear, so the reflection seems to hang in the air behind it.'),
            ('Four faces, four views.', 'Views rendered 90° apart meet in one place, so the form holds together from every side.'),
            ('No glasses, no tracking.', 'Several people can stand around the device at once. Depth is suggested, not stereoscopic.')]
    for k, (j, s) in enumerate(rows):
        a = cepat((t - 0.2 - 0.12 * k) / 0.2)
        y = 320 + k * 190
        d.text((1200, y), j, font=disp(32, 600), fill=INK + (int(255 * a),))
        for q, b in enumerate(bungkus(d, s, teks(23, 500), 600)):
            d.text((1202, y + 50 + q * 34), b, font=teks(23, 500), fill=INK2 + (int(255 * a),))
    return im.convert('RGB')


LABEL_LEDAK = {'volume': ('Floating volume', 'pseudo-hologram, rendered from DICOM'),
               'prism': ('Glass prism', 'four reflecting faces at 45°'),
               'panel': ('Emitter panel', 'four synchronised views'),
               'shoulder': ('Microphone array', '16 ports and a listening light ring'),
               'base': ('Camera / ToF window', 'hand tracking · compute base')}


def overlay_ledak(im, k, j, t):
    if not j:
        return im
    buka = j.get('buka', 0)
    if buka < 0.6:
        return im
    a = mulus((buka - 0.6) / 0.4)
    dasar = im.convert('RGBA')
    d = ImageDraw.Draw(dasar)
    urutan = ['volume', 'prism', 'panel', 'shoulder', 'base']
    for q, key in enumerate(urutan):
        if key not in j:
            continue
        ax, ay = j[key][0] * W, j[key][1] * H
        lx, ly = 1280, 170 + q * 150
        d.line([(ax, ay), (lx - 30, ly + 40)], fill=BLUE + (int(200 * a),), width=3)
        d.ellipse([ax - 8, ay - 8, ax + 8, ay + 8], fill=CYAN + (int(255 * a),), outline=(255, 255, 255, int(255 * a)), width=3)
        tempel_neu(dasar, lx - 20, ly, 540, 100, 22, a)
        d = ImageDraw.Draw(dasar)
        n1, n2 = LABEL_LEDAK[key]
        d.text((lx + 8, ly + 16), n1, font=disp(28, 600), fill=INK + (int(255 * a),))
        d.text((lx + 8, ly + 58), n2, font=teks(20, 500), fill=MUTED + (int(255 * a),))
    return dasar.convert('RGB')


def s_render(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'System design', 'Rendering: cast once, replay smoothly')
    tempel_neu(im, 140, 290, 760, 620, 36, cepat(t / 0.2), inset=True)
    d = ImageDraw.Draw(im)
    a = cepat((t - 0.05) / 0.2)
    kubus_kawat(d, 520, 600, 150, t * 2.4, BLUE, a, _AWAN)
    jumlah = min(24, int(t / 0.7 * 24) + 1)
    for k in range(jumlah):
        ang = 2 * math.pi * k / 24
        x, y = 520 + math.cos(ang) * 290, 600 + math.sin(ang) * 250
        d.line([(x, y), (520, 600)], fill=(255, 150, 60, int(110 * a)), width=2)
        d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(255, 150, 60, int(230 * a)))
    d.text((180, 860), '%d / 24 angles pre-rendered' % jumlah, font=mono(22), fill=INK2 + (int(255 * a),))
    # emitter output (app screenshot)
    if 'emit' not in _CT:
        s = Image.open(os.path.join(FOTO, 't-prisma.png')).convert('RGB')
        k = s.width / 1440
        _CT['emit'] = s.crop((int(355 * k), int(275 * k), int(805 * k), int(725 * k))).resize((520, 520), Image.LANCZOS)
    ae = cepat((t - 0.35) / 0.25)
    tempel_neu(im, 1020, 290, 760, 620, 36, cepat(t / 0.2), inset=True)
    e = _CT['emit'].convert('RGBA')
    m = Image.new('L', e.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, 519, 519], 22, fill=int(255 * ae))
    e.putalpha(m)
    im.alpha_composite(e, (1140, 312))
    d = ImageDraw.Draw(im)
    d.text((1060, 860), 'Emitter output: 4 views around the centre mark', font=teks(22, 600), fill=INK2 + (int(255 * ae),))
    return im.convert('RGB')


# ---------------------------------------------------------------- 05 features
FITUR = [('hologram', 'Hologram stage', 'Four-view output for any prism'), ('viewer', '2D viewer', 'W/L, measure, ROI, tags, report'),
         ('kubus', 'MPR · MIP · 3D', 'Seven derived series in one step'), ('petir', 'Surface export', 'Isosurface to STL / OBJ'),
         ('mik', 'Voice commands', 'Rotate, zoom, modes, organs'), ('tangan', 'Hand gestures', 'Swipe to rotate, push to scale'),
         ('otak', 'Anatomy atlas', 'OBJ/STL organs, explode, highlight'), ('kunci', 'Private by design', 'Pixels never leave the device')]


def s_grid(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'Features', 'One workstation, eight capabilities')
    for k, (ik, j, s) in enumerate(FITUR):
        a = cepat((t - 0.06 - 0.05 * k) / 0.25)
        x = 140 + (k % 4) * 420
        y = 300 + (k // 4) * 330
        tempel_neu(im, x, y + int(20 * (1 - a)), 380, 290, 30, a)
        d = ImageDraw.Draw(im)
        im.alpha_composite(alfa(ikon(ik, 100), a), (x + 34, y + 34 + int(20 * (1 - a))))
        d.text((x + 36, y + 160), j, font=disp(30, 600), fill=INK + (int(255 * a),))
        d.text((x + 36, y + 206), s, font=teks(21, 500), fill=INK2 + (int(255 * a),))
    return im.convert('RGB')


def overlay_suara(im, k, j, t):
    if not j:
        return im
    dasar = im.convert('RGBA')
    d = ImageDraw.Draw(dasar)
    hx, hy = j['kepala'][0] * W, j['kepala'][1] * H
    if j.get('bicara'):
        ucap = 'Rotate left'
        nhuruf = int(min(len(ucap), (t - 0.12) / 0.2 * len(ucap)) + 1)
        s = '“' + ucap[:max(1, nhuruf)] + ('”' if nhuruf >= len(ucap) else '')
        bw = int(d.textlength(s, font=disp(34, 600))) + 110
        bx, by = int(hx + 60), int(hy - 150)
        tempel_neu(dasar, bx, by, bw, 90, 45, 1.0)
        d = ImageDraw.Draw(dasar)
        dasar.alpha_composite(ikon('mik', 56), (bx + 18, by + 17))
        d.text((bx + 88, by + 22), s, font=disp(34, 600), fill=INK + (255,))
        d.polygon([(bx + 30, by + 86), (bx + 60, by + 86), (int(hx + 10), int(hy - 20))], fill=BG + (255,))
        for q in range(9):
            hh = 8 + 26 * abs(math.sin(k * 0.6 + q))
            d.rounded_rectangle([bx + 88 + q * 12, by + 98, bx + 94 + q * 12, by + 98 + hh], 3, fill=BLUE2 + (220,))
    if j.get('putar', 0) > 0:
        a = mulus(j['putar'] / 0.2)
        x, y = 1180, 110
        kotak_grad(dasar, x, y, 620, 96, 48, a)
        d = ImageDraw.Draw(dasar)
        d.text((x + 34, y + 18), 'Recognised: rotate left', font=disp(28, 600), fill=(255, 255, 255, int(255 * a)))
        d.text((x + 34, y + 56), 'command → hologram turns left', font=teks(20, 500), fill=(225, 238, 255, int(255 * a)))
    return dasar.convert('RGB')


JEJAK_TANGAN = []


def overlay_gestur(im, k, j, t):
    if not j:
        return im
    dasar = im.convert('RGBA')
    d = ImageDraw.Draw(dasar)
    hx, hy = j['tangan'][0] * W, j['tangan'][1] * H
    if k == 0:
        del JEJAK_TANGAN[:]
    JEJAK_TANGAN.append((hx, hy))
    for q, (x, y) in enumerate(JEJAK_TANGAN[-24:]):
        r = 2 + q * 0.2
        d.ellipse([x - r, y - r, x + r, y + r], fill=CYAN + (int(40 + q * 8),))
    s = 70
    for (ax, ay, sx, sy) in [(hx - s, hy - s, 1, 1), (hx + s, hy - s, -1, 1), (hx - s, hy + s, 1, -1), (hx + s, hy + s, -1, -1)]:
        d.line([(ax, ay), (ax + 22 * sx, ay)], fill=CYAN + (255,), width=4)
        d.line([(ax, ay), (ax, ay + 22 * sy)], fill=CYAN + (255,), width=4)
    d.ellipse([hx - 9, hy - 9, hx + 9, hy + 9], fill=CYAN + (255,), outline=(255, 255, 255, 255), width=3)
    d.text((hx + s + 12, hy - s), 'hand', font=mono(20), fill=(255, 255, 255, 255))
    # phase meter
    f = j.get('fase', 0)
    x, y, w = 1240, 110, 560
    tempel_neu(dasar, x, y, w, 120, 30, 1.0)
    d = ImageDraw.Draw(dasar)
    d.text((x + 28, y + 16), 'Hand position › rotation', font=disp(24, 600), fill=INK + (255,))
    d.rounded_rectangle([x + 28, y + 70, x + w - 28, y + 82], 6, fill=(214, 222, 236, 255))
    px = x + 28 + (w - 56) * (f + 1) / 2
    d.ellipse([px - 14, y + 62, px + 14, y + 90], fill=BLUE + (255,), outline=(255, 255, 255, 255), width=3)
    d.text((x + w - 150, y + 16), '%+.0f°' % (35 * f), font=mono(24), fill=BLUE + (255,))
    return dasar.convert('RGB')


def s_pipa(judul, langkah, catatan, eyebrow):
    def fn(i, n):
        t = i / n
        im = latar().convert('RGBA')
        d = ImageDraw.Draw(im)
        kepala_slide(d, eyebrow, judul)
        m = len(langkah)
        lebar = (1640 - (m - 1) * 40) // m
        for k, (ik, j, s) in enumerate(langkah):
            a = cepat((t - 0.06 - 0.1 * k) / 0.2)
            x = 140 + k * (lebar + 40)
            tempel_neu(im, x, 340, lebar, 380, 30, a)
            d = ImageDraw.Draw(im)
            im.alpha_composite(alfa(ikon(ik, 100), a), (x + (lebar - 100) // 2, 380))
            for q, b in enumerate(bungkus(d, j, disp(27, 600), lebar - 40)):
                w = d.textlength(b, font=disp(27, 600))
                d.text((x + (lebar - w) / 2, 510 + q * 34), b, font=disp(27, 600), fill=INK + (int(255 * a),))
            for q, b in enumerate(bungkus(d, s, teks(20, 500), lebar - 40)):
                w = d.textlength(b, font=teks(20, 500))
                d.text((x + (lebar - w) / 2, 590 + q * 28), b, font=teks(20, 500), fill=INK2 + (int(255 * a),))
            if k < m - 1:
                ap = cepat((t - 0.12 - 0.1 * k) / 0.2)
                panah(d, (x + lebar + 4, 530), (x + lebar + 36, 530), ap, pulsa=t * 3 + k * 0.3)
        a = cepat((t - 0.7) / 0.2)
        d.text((140, 800), catatan, font=teks(23, 500), fill=MUTED + (int(255 * a),))
        return im.convert('RGB')
    return fn


def s_guna(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'In use', 'Where teams need to see the same thing')
    kasus = [('pengguna', 'Tumour boards', 'Everyone sees the lesion from their own side.'),
             ('panjang', 'Surgical planning', 'Walk through the approach before the incision.'),
             ('tangan', 'Sterile settings', 'Voice and gesture, nothing to touch.'),
             ('otak', 'Teaching', 'Students see anatomy as it sits in space.'),
             ('laporan', 'Patient conversations', 'Explain a finding people can picture.'),
             ('kunci', 'Privacy', 'Parsing and rendering stay on the device.')]
    for k, (ik, j, s) in enumerate(kasus):
        a = cepat((t - 0.06 - 0.07 * k) / 0.25)
        x = 140 + (k % 3) * 560
        y = 300 + (k // 3) * 300
        tempel_neu(im, x, y, 520, 260, 30, a)
        d = ImageDraw.Draw(im)
        im.alpha_composite(alfa(ikon(ik, 96), a), (x + 32, y + 36))
        d.text((x + 150, y + 50), j, font=disp(30, 600), fill=INK + (int(255 * a),))
        for q, b in enumerate(bungkus(d, s, teks(22, 500), 330)):
            d.text((x + 152, y + 100 + q * 32), b, font=teks(22, 500), fill=INK2 + (int(255 * a),))
    return im.convert('RGB')


def s_validasi(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'Validation', 'What is tested, and how')
    data = [('127', 'unit tests', 'parser, volume, surface, models, voice grammar'),
            ('79', 'page smoke tests', 'real HTML and scripts in a DOM double'),
            ('20+', 'real DICOM files', 'pydicom-data samples and a TCIA series'),
            ('0 B', 'pixel data uploaded', 'files are parsed in browser memory')]
    for k, (v, l, s) in enumerate(data):
        a = cepat((t - 0.06 - 0.08 * k) / 0.25)
        x = 140 + k * 420
        tempel_neu(im, x, 300, 380, 360, 32, a)
        d = ImageDraw.Draw(im)
        g = gradien(320, 110).convert('RGBA')
        m = Image.new('L', (320, 110), 0)
        ImageDraw.Draw(m).text((0, 0), v, font=disp(84, 700), fill=int(255 * a))
        g.putalpha(m)
        im.alpha_composite(g, (x + 36, 340))
        d.text((x + 38, 470), l, font=disp(28, 600), fill=INK + (int(255 * a),))
        for q, b in enumerate(bungkus(d, s, teks(21, 500), 310)):
            d.text((x + 38, 520 + q * 30), b, font=teks(21, 500), fill=INK2 + (int(255 * a),))
    a = cepat((t - 0.45) / 0.25)
    tempel_neu(im, 140, 720, 1640, 190, 30, a, inset=True)
    d = ImageDraw.Draw(im)
    for q, b in enumerate(['Also checked by hand: rendered output and layout, in desktop and phone screenshots.',
                           'Not yet done: a user study with clinicians, and any clinical accuracy evaluation.']):
        d.text((180, 760 + q * 52), b, font=teks(25, 600 if q == 1 else 500), fill=(INK if q == 0 else BAD) + (int(255 * a),))
    return im.convert('RGB')


def s_batas(i, n):
    t = i / n
    im = latar().convert('RGBA')
    d = ImageDraw.Draw(im)
    kepala_slide(d, 'Limitations & future work', 'Honest limits, clear next steps')
    kol = [('Limitations', BAD, ['Pseudo-3D: a reflected image, not a true volumetric light field.',
                                 'Brightness depends on room light and viewing angle.',
                                 'Voice in Chrome uses a cloud speech service.',
                                 'Gesture tracking is colour-based and lighting-sensitive.',
                                 'No clinical validation; not a medical device.']),
           ('Future work', OK, ['On-device speech recognition for fully offline use.',
                                'Learned hand-landmark tracking for richer gestures.',
                                'JPEG 2000 decoding and DICOMweb (QIDO/WADO) access.',
                                'Automatic prism calibration with the camera.',
                                'A structured user study with clinical teams.'])]
    for k, (j, col, rows) in enumerate(kol):
        a = cepat((t - 0.06 - 0.15 * k) / 0.25)
        x = 140 + k * 840
        tempel_neu(im, x, 290, 800, 620, 34, a)
        d = ImageDraw.Draw(im)
        d.text((x + 44, 330), j, font=disp(38, 600), fill=INK + (int(255 * a),))
        for q, b in enumerate(rows):
            aq = cepat((t - 0.12 - 0.15 * k - 0.04 * q) / 0.2)
            y = 410 + q * 96
            d.ellipse([x + 46, y + 10, x + 64, y + 28], fill=col + (int(255 * aq),))
            for r, bb in enumerate(bungkus(d, b, teks(24, 500), 650)):
                d.text((x + 84, y + r * 32), bb, font=teks(24, 500), fill=INK2 + (int(255 * aq),))
    return im.convert('RGB')


def s_penutup(i, n):
    t = i / n
    im = latar().convert('RGBA')
    produk = _ORN.setdefault('hero', Image.open(os.path.join(AKAR, 'assets', '3d', 'putih-hero.webp')).convert('RGBA').resize((720, 646), Image.LANCZOS))
    a0 = cepat(t / 0.3)
    cincin = _ORN.setdefault(('cincin', 620), orn('cincin', 620))
    im.alpha_composite(alfa(cincin, a0 * 0.8), (1100, 230 + int(10 * math.sin(t * 3))))
    im.alpha_composite(alfa(produk, a0), (1060, 220 + int(30 * (1 - a0))))
    d = ImageDraw.Draw(im)
    lg = logo(96)
    a1 = cepat((t - 0.08) / 0.3)
    im.alpha_composite(alfa(lg, a1), (140, 250))
    wordmark(d, 262, 262, 64, a1)
    y = 400
    for k, b in enumerate(['A shared, glasses-free 3D view of DICOM volumes.',
                           'Controlled by voice and gesture, with nothing to touch.',
                           'Rendered in the browser; pixels never leave the device.']):
        ak = cepat((t - 0.2 - 0.08 * k) / 0.3)
        d.ellipse([144, y + 14, 160, y + 30], fill=BLUE + (int(255 * ak),))
        d.text((182, y), b, font=teks(30, 500), fill=INK2 + (int(255 * ak),))
        y += 64
    a3 = cepat((t - 0.5) / 0.25)
    kotak_grad(im, 140, 640, 420, 76, 38, a3)
    d = ImageDraw.Draw(im)
    spasi_tulis(d, (176, 660), 'medivox-id.web.app', mono(28), (255, 255, 255, int(255 * a3)), 2)
    spasi_tulis(d, (140, 960), 'RESEARCH PROTOTYPE  ·  NOT A MEDICAL DEVICE  ·  SYNTHETIC DATA ONLY', mono(17),
                MUTED + (int(220 * a3),), 4)
    if t > 0.9:
        im = Image.blend(im.convert('RGB'), Image.new('RGB', (W, H), NAVY), mulus((t - 0.9) / 0.1)).convert('RGBA')
    return im.convert('RGB')


# ================================================================ timeline
def rencana():
    B1, B2, B3, B4, B5, B6, B7, B8 = ('Background', 'State of the art', 'Gap & novelty', 'System design',
                                      'Features', 'In use', 'Validation', 'Limitations & future work')
    return [
        Adegan(5.5, s_pembuka, '', kepala=False),
        Adegan(7.0, s_judul, 'MEDIVOX', kepala=False),
        s_bab('01', B1, 'Anatomy is 3D. Screens are flat.', 'Why reading volumes slice by slice is still hard, and hard to share.'),
        Adegan(9.0, s_irisan, B1),
        Adegan(7.0, s_angka, B1),
        Adegan(8.0, s_masalah, B1),
        Adegan(7.0, s_pertanyaan, B1),
        s_bab('02', B2, 'What exists today', 'From flat PACS viewers to headsets, printed models and light-field panels.'),
        Adegan(17.0, s_matriks, B2),
        Adegan(8.0, s_kurang, B2),
        s_bab('03', B3, 'The missing middle', 'A shared, touchless 3D view that works from raw DICOM on ordinary hardware.'),
        Adegan(9.0, s_venn, B3),
        Adegan(12.0, s_novelty, B3),
        s_bab('04', B4, 'How MEDIVOX works', 'Data path, optics, hardware and rendering.'),
        Adegan(15.0, s_arsitektur, B4),
        Adegan(11.0, s_optik, B4),
        shot('ledak', 8.0, 'Hardware', 'MEDIVOX-1, exploded', 'Prism, emitter, microphone array and camera window', B4, overlay_ledak),
        Adegan(10.0, s_render, B4),
        s_bab('05', B5, 'Features', 'The device, the apps, and touchless control.'),
        shot('masuk', 5.0, 'MEDIVOX-1', 'One base. One glass prism.', 'A tabletop display for CT and MRI volumes', B5),
        shot('orbit', 5.0, 'Pepper’s ghost', 'Four reflections, one floating form.', 'No glasses, no projector, no headset', B5),
        shot('panel', 4.0, 'Emitter panel', 'Every view, projected at once.', 'Anterior · posterior · left · right', B5),
        Adegan(8.0, s_grid, B5),
        shot('ekosistem', 6.0, 'Ecosystem', 'One study, every screen.', 'MEDIVOX-1, laptop and Android phone read the same study', B5),
        shot('laptop', 5.0, 'Desktop app', 'A clear 2D diagnostic viewer.', 'Window/level, measure, annotate and report', B5),
        dari_generator(5.4, SR.adegan_laptop_web, B5),
        dari_generator(5.8, SR.adegan_alur, B5),
        shot('suara', 6.5, 'Voice control', 'Say it, and it happens.', 'Spoken command → grammar → the same controls as the buttons', B5, overlay_suara),
        Adegan(9.0, s_pipa('Voice pipeline', [
            ('mik', 'Microphone', 'Speech captured only after the user turns voice on'),
            ('awan', 'Web Speech API', 'Browser recogniser returns a transcript (cloud in Chrome)'),
            ('teks', 'Command grammar', 'Longest-match lookup over a fixed EN + ID vocabulary'),
            ('setelan', 'Controller', 'Same handlers as buttons, chips and keys'),
            ('hologram', 'Hologram', 'Rotate, zoom, change mode, pick an organ')],
            'A small, closed vocabulary keeps recognition reliable and makes every command predictable.', 'Voice control'), B5),
        shot('gestur', 6.5, 'Gesture control', 'Swipe to turn it.', 'The camera follows the hand; the hologram follows the camera', B5, overlay_gestur),
        Adegan(9.0, s_pipa('Gesture pipeline', [
            ('kamera', 'Camera frame', '15 fps, low resolution, never stored'),
            ('tangan', 'Skin & motion mask', 'Pixels that look like a moving hand'),
            ('probe', 'Centroid & box', 'Hand position and apparent size'),
            ('sinkron', 'Smoothing', 'Exponential filter removes jitter'),
            ('hologram', 'Rotation & scale', 'Left-right turns it, near-far resizes it')],
            'Frames are processed in the browser and discarded immediately. Nothing leaves the device.', 'Gesture control'), B5),
        shot('ponsel', 5.0, 'Android', 'Mobile-first by design.', 'Bottom navigation, drawers and thumb-reach controls', B5),
        dari_generator(5.6, SR.adegan_android, B5),
        s_bab('06', B6, 'In the room', 'A floating image the whole team can gather around.'),
        shot('tim', 7.0, 'Tumour board', 'Everyone sees the same thing.', 'Each person looks from their own side of the table', B6),
        Adegan(8.0, s_guna, B6),
        s_bab('07', B7, 'How it is checked', 'Automated tests, real DICOM data, and what is still missing.'),
        Adegan(9.0, s_validasi, B7),
        s_bab('08', B8, 'What it is not, yet', 'The honest limits of a research prototype, and where it goes next.'),
        Adegan(11.0, s_batas, B8),
        Adegan(8.0, s_penutup, 'Conclusion', kepala=False),
    ]


# ================================================================ audio
def musik(detik, jalur, sr=44100):
    """Ambient pad through four chords, soft plucks and gentle pulses,
    with a simple feedback delay. Synthesised here; no samples."""
    n = int(detik * sr)
    t = np.arange(n) / sr
    akor = [[146.83, 220.0, 277.18, 329.63, 440.0],   # D maj9-ish
            [123.47, 185.0, 246.94, 293.66, 369.99],  # B minor 9
            [98.0, 146.83, 246.94, 293.66, 392.0],    # G maj9
            [110.0, 164.81, 220.0, 277.18, 329.63]]   # A add9
    seg = 16.0
    out = np.zeros(n)
    idx = ((t // seg) % 4).astype(int)
    fase_seg = (t % seg) / seg
    silang = np.clip(np.minimum(fase_seg * seg / 2.0, (1 - fase_seg) * seg / 2.0), 0, 1)
    for c in range(4):
        m = (idx == c).astype(float) * silang
        for k, f in enumerate(akor[c]):
            lfo = 0.72 + 0.28 * np.sin(2 * np.pi * (0.07 + 0.02 * k) * t + k)
            out += m * (0.16 / (1 + k * 0.35)) * np.sin(2 * np.pi * f * t) * lfo
    # plucks on the chord tones, every half second
    pluck = np.zeros(n)
    langkah = int(0.5 * sr)
    for s in range(0, n, langkah):
        c = int((s / sr) // seg) % 4
        f = akor[c][[4, 3, 2, 3][(s // langkah) % 4]] * 2
        L = min(int(0.9 * sr), n - s)
        tt = np.arange(L) / sr
        pluck[s:s + L] += 0.05 * np.sin(2 * np.pi * f * tt) * np.exp(-tt * 5)
    out += pluck
    # delay / reverb
    for d_, g in ((0.29, 0.32), (0.53, 0.2), (0.83, 0.12)):
        k = int(d_ * sr)
        out[k:] += g * out[:-k]
    fade = np.minimum(1, np.minimum(t / 3.0, (detik - t) / 4.0))
    out *= np.clip(fade, 0, 1)
    out /= max(1e-6, np.max(np.abs(out))) / 0.6
    kanan = np.roll(out, int(0.011 * sr))
    st = np.stack([out, kanan], 1)
    data = (st * 32767).astype(np.int16)
    with wave.open(jalur, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data.tobytes())


def cari_ffmpeg():
    ada = shutil.which('ffmpeg')
    if ada:
        return ada
    for j in glob.glob(os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\*FFmpeg*\**\bin\ffmpeg.exe'), recursive=True):
        return j
    raise SystemExit('ffmpeg not found')


def bangun(hanya=None):
    adegan = rencana()
    if hanya is not None:
        adegan = [adegan[k] for k in hanya]
    total = sum(a.n for a in adegan)
    detik = total / FPS
    print('scenes: %d, frames: %d (%.1f s)' % (len(adegan), total, detik))
    audio = os.path.join(AKAR, 'build', 'musik-ilmiah.wav')
    musik(detik + 1, audio)
    ff = cari_ffmpeg()
    proc = subprocess.Popen([ff, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H),
                             '-r', str(FPS), '-i', '-', '-i', audio, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                             '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', KELUAR],
                            stdin=subprocess.PIPE)
    sebelumnya = None
    nomor = 0
    for q, a in enumerate(adegan):
        if a.bab is not None:
            BAB_AKTIF[0] = a.bab
        akhir = None
        for i in range(a.n):
            im = a.fn(i, a.n)
            if a.kepala and a.bab:
                rgba = im.convert('RGBA')
                kepala(rgba, cepat(i / 10))
                im = rgba.convert('RGB')
            if sebelumnya is not None and i < SILANG:
                im = Image.blend(sebelumnya, im, mulus((i + 1) / (SILANG + 1)))
            proc.stdin.write(im.tobytes())
            akhir = im
            nomor += 1
        sebelumnya = akhir
        print('  %2d/%d  %-26s %5.1f s' % (q + 1, len(adegan), (a.bab or '')[:26], nomor / FPS), flush=True)
    proc.stdin.close()
    proc.wait()
    print('video: %s (%.1f MB)' % (KELUAR, os.path.getsize(KELUAR) / 1048576))


def pratinjau(keluar):
    """Save one representative frame of every scene as a contact sheet."""
    adegan = rencana()
    os.makedirs(keluar, exist_ok=True)
    for q, a in enumerate(adegan):
        BAB_AKTIF[0] = a.bab or ''
        try:
            i = int(a.n * 0.7)
            if isinstance(a.fn, type(pratinjau)) and a.fn.__code__.co_name == 'fn' and 'state' in a.fn.__code__.co_freevars:
                for k in range(i):
                    a.fn(k, a.n)
            im = a.fn(i, a.n)
            if a.kepala and a.bab:
                rgba = im.convert('RGBA')
                kepala(rgba)
                im = rgba.convert('RGB')
            im.resize((640, 360)).save(os.path.join(keluar, '%02d.jpg' % q), quality=85)
        except SystemExit as e:
            print('  skip %d: %s' % (q, e))


if __name__ == '__main__':
    if '--pratinjau' in sys.argv:
        pratinjau(os.path.join(AKAR, 'build', 'pv-ilmiah'))
    else:
        bangun()
