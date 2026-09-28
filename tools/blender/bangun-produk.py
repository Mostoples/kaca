"""
==========================================================
MEDIVOX — pembangun aset 3D produk (Blender CLI)
----------------------------------------------------------
Membangun perangkat MEDIVOX-1 dari nol lewat skrip: basis
silinder beralur, panel atas yang menyala, prisma piramida
terbalik dari kaca, dan volume hologram di dalamnya.

Bentuknya mengikuti KACA-1_Compilation_1.pdf: puck aluminium
dengan prisma terbalik di atasnya, memantulkan empat pandangan
menjadi satu bentuk yang tampak mengambang (Pepper's ghost).

Jalankan:
  blender -b -P tools/blender/bangun-produk.py -- --mode still
  blender -b -P tools/blender/bangun-produk.py -- --mode turntable --frames 120
  blender -b -P tools/blender/bangun-produk.py -- --mode still --engine CYCLES --samples 256

Keluaran PNG beralfa (latar transparan) supaya bisa
ditempatkan di atas tema terang maupun gelap.
==========================================================
"""
import bpy, bmesh, math, os, sys, argparse
from mathutils import Vector

# ---------------------------------------------------------------- argumen
def argumen():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--mode', default='still', choices=['still', 'turntable', 'hologram', 'shot'])
    p.add_argument('--engine', default='EEVEE')
    p.add_argument('--samples', type=int, default=64)
    p.add_argument('--frames', type=int, default=120)
    p.add_argument('--res', type=int, default=1600)
    p.add_argument('--out', default='build/3d')
    p.add_argument('--organ', default='otak', choices=['otak', 'toraks', 'tengkorak'])
    p.add_argument('--save-blend', action='store_true')
    p.add_argument('--opaque', action='store_true')
    p.add_argument('--putih', action='store_true',
                   help='varian keramik putih untuk tema terang')
    p.add_argument('--shot', default='masuk')
    p.add_argument('--layar', default='')
    p.add_argument('--studio', action='store_true',
                   help='panggung putih lapang (lantai & latar terang) untuk shot')
    p.add_argument('--layar-laptop', default='')
    p.add_argument('--layar-ponsel', default='')
    return p.parse_args(argv)

ARG = argumen()

# ---------------------------------------------------------------- warna merek
BIRU      = (0.184, 0.435, 0.816, 1.0)   # #2f6fd0
CYAN      = (0.369, 0.788, 0.949, 1.0)   # #5ec9f2
CYAN_TER  = (0.647, 0.886, 0.984, 1.0)   # #a5e2fb
NAVY      = (0.106, 0.227, 0.388, 1.0)   # #1b3a63
LOGAM     = (0.055, 0.075, 0.105, 1.0)

MM = 0.001   # skrip memakai milimeter, Blender memakai meter


# ================================================================ utilitas
def bersihkan():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # factory reset menonaktifkan addon; Cycles perlu diaktifkan kembali
    try:
        bpy.ops.preferences.addon_enable(module='cycles')
    except Exception:
        pass


def bahan(nama, dasar=(0.5, 0.5, 0.5, 1), logam=0.0, kasar=0.5,
          emisi=None, kuat=0.0, transmisi=0.0, ior=1.45, alpha=1.0):
    m = bpy.data.materials.new(nama)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']

    def set(key, nilai):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = nilai

    set('Base Color', dasar)
    set('Metallic', logam)
    set('Roughness', kasar)
    set('IOR', ior)
    set('Alpha', alpha)
    set('Transmission Weight', transmisi)
    if emisi:
        set('Emission Color', emisi)
        set('Emission Strength', kuat)
    if transmisi > 0 or alpha < 1:
        tembus(m)
    return m


def tembus(m):
    """Blender 4.2+ (EEVEE Next) memakai surface_render_method;
    versi lama memakai blend_method. Keduanya dicoba."""
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'BLENDED'
    if hasattr(m, 'blend_method'):
        m.blend_method = 'BLEND'
    if hasattr(m, 'shadow_method'):
        m.shadow_method = 'NONE'
    if hasattr(m, 'use_transparent_shadow'):
        m.use_transparent_shadow = True
    return m


def bahan_kaca(nama, pantul=0.16, warna=(0.80, 0.90, 1.0, 1.0), kasar=0.03):
    """Bidang pemantul Pepper's ghost: hampir bening, hanya memantul
    tipis. Disusun dari Transparent + Glossy karena Principled dengan
    Alpha rendah tetap dirender pekat oleh EEVEE pada build ini."""
    m = bpy.data.materials.new(nama)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    keluar = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')

    transparan = nt.nodes.new('ShaderNodeBsdfTransparent')
    glossy = nt.nodes.new('ShaderNodeBsdfGlossy')
    glossy.inputs['Color'].default_value = warna
    glossy.inputs['Roughness'].default_value = kasar

    # pantulan menguat di sudut serong, seperti kaca sungguhan
    fresnel = nt.nodes.new('ShaderNodeFresnel')
    fresnel.inputs['IOR'].default_value = 1.52
    kuatkan = nt.nodes.new('ShaderNodeMath')
    kuatkan.operation = 'MULTIPLY'
    kuatkan.inputs[1].default_value = pantul   # Fresnel sudah 0..1

    campur = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fresnel.outputs['Fac'], kuatkan.inputs[0])
    nt.links.new(kuatkan.outputs['Value'], campur.inputs['Fac'])
    nt.links.new(transparan.outputs['BSDF'], campur.inputs[1])
    nt.links.new(glossy.outputs['BSDF'], campur.inputs[2])
    nt.links.new(campur.outputs['Shader'], keluar.inputs['Surface'])
    tembus(m)
    return m


def pasang(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def bevel(obj, lebar=0.6 * MM, segmen=3):
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = lebar
    mod.segments = segmen
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(40)
    return obj


def halus(obj):
    for pol in obj.data.polygons:
        pol.use_smooth = True
    return obj


# ================================================================ perangkat
def basis():
    """Puck aluminium seperti pada kompilasi KACA-1: badan silinder
    dengan celah ventilasi melingkar, bahu brushed berlubang sekrup,
    dan panel empat kuadran yang memancarkan pandangan."""
    bagian = []

    # --- badan bawah (bertuliskan nama produk)
    bpy.ops.mesh.primitive_cylinder_add(vertices=160, radius=60 * MM, depth=26 * MM,
                                        location=(0, 0, 13 * MM))
    bawah = bpy.context.object
    bawah.name = 'basis_bawah'
    bevel(bawah, 1.4 * MM, 4)
    halus(bawah)
    pasang(bawah, bahan('logam_bawah', LOGAM, logam=1.0, kasar=0.42))
    bagian.append(bawah)

    # --- celah ventilasi: cincin gelap yang tenggelam
    bpy.ops.mesh.primitive_cylinder_add(vertices=160, radius=58.4 * MM, depth=7 * MM,
                                        location=(0, 0, 29.5 * MM))
    celah = bpy.context.object
    celah.name = 'celah'
    halus(celah)
    pasang(celah, bahan('celah_gelap', (0.012, 0.018, 0.026, 1), logam=0.7, kasar=0.85))
    bagian.append(celah)

    # --- bahu atas brushed
    bpy.ops.mesh.primitive_cylinder_add(vertices=160, radius=60.5 * MM, depth=11 * MM,
                                        location=(0, 0, 38.5 * MM))
    atas = bpy.context.object
    atas.name = 'basis_atas'
    bevel(atas, 1.6 * MM, 4)
    halus(atas)
    mat_atas = bahan('logam_atas', (0.115, 0.145, 0.185, 1), logam=1.0, kasar=0.30)
    # goresan melingkar: noise halus pada roughness
    nt = mat_atas.node_tree
    bsdf = nt.nodes['Principled BSDF']
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 60.0
    noise.inputs['Detail'].default_value = 1.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[0].color = (0.27, 0.27, 0.27, 1)
    ramp.color_ramp.elements[1].position = 0.60
    ramp.color_ramp.elements[1].color = (0.33, 0.33, 0.33, 1)
    koord = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(koord.outputs['Object'], noise.inputs['Vector'])
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Roughness'])
    pasang(atas, mat_atas)
    bagian.append(atas)

    # --- lubang sekrup di bahu
    mat_sekrup = bahan('sekrup', (0.03, 0.04, 0.05, 1), logam=1.0, kasar=0.55)
    for i in range(8):
        a = math.radians(22.5 + 45 * i)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=2.1 * MM, depth=1.6 * MM,
                                            location=(math.cos(a) * 52 * MM,
                                                      math.sin(a) * 52 * MM, 43.8 * MM))
        sk = bpy.context.object
        sk.name = 'sekrup_%d' % i
        halus(sk)
        pasang(sk, mat_sekrup)
        bagian.append(sk)

    # --- panel empat kuadran: bingkai cyan + pandangan yang memancar
    bpy.ops.mesh.primitive_plane_add(size=78 * MM, location=(0, 0, 44.4 * MM))
    bingkai = bpy.context.object
    bingkai.name = 'panel_bingkai'
    pasang(bingkai, bahan('panel_kaca', (0.012, 0.022, 0.034, 1), logam=0.2, kasar=0.10))
    bagian.append(bingkai)

    mat_garis = bahan('garis_panel', (0, 0, 0, 1), emisi=CYAN, kuat=1.8)
    for i in range(4):
        sudut = math.radians(90 * i)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 44.6 * MM))
        g = bpy.context.object
        g.name = 'panel_garis_%d' % i
        g.scale = (78 * MM, 0.5 * MM, 0.3 * MM)
        bpy.ops.object.transform_apply(scale=True)
        g.location = (math.cos(sudut) * 39 * MM, math.sin(sudut) * 39 * MM, 44.6 * MM)
        g.rotation_euler[2] = sudut
        pasang(g, mat_garis)
        bagian.append(g)

    # --- empat pandangan organ yang benar-benar memancar
    for i in range(4):
        sudut = math.radians(45 + 90 * i)
        r = 21 * MM
        bpy.ops.mesh.primitive_circle_add(vertices=32, radius=9 * MM, fill_type='NGON',
                                          location=(math.cos(sudut) * r,
                                                    math.sin(sudut) * r, 44.8 * MM))
        kuad = bpy.context.object
        kuad.name = 'pandangan_%d' % i
        kuad.scale = (1.0, 0.78, 1.0)
        pasang(kuad, bahan('pandangan', (0, 0, 0, 1), emisi=CYAN_TER, kuat=3.4))
        bagian.append(kuad)

    # --- nama produk di badan bawah
    teks = bpy.data.curves.new('nama', 'FONT')
    teks.body = 'MEDIVOX'
    teks.size = 7.5 * MM
    teks.extrude = 0.25 * MM
    teks.align_x = 'CENTER'
    ot = bpy.data.objects.new('nama_produk', teks)
    bpy.context.collection.objects.link(ot)
    ot.location = (0, -60.6 * MM, 13 * MM)
    ot.rotation_euler = (math.radians(90), 0, 0)
    ot.data.materials.append(bahan('teks_produk', (0.62, 0.70, 0.80, 1), logam=0.9, kasar=0.4))
    bagian.append(ot)

    sub = bpy.data.curves.new('sub', 'FONT')
    sub.body = 'VOLUMETRIC REVIEW SYSTEM  ·  MEDIVOX-1'
    sub.size = 2.6 * MM
    sub.extrude = 0.12 * MM
    sub.align_x = 'CENTER'
    os_ = bpy.data.objects.new('sub_produk', sub)
    bpy.context.collection.objects.link(os_)
    os_.location = (0, -60.6 * MM, 5.5 * MM)
    os_.rotation_euler = (math.radians(90), 0, 0)
    os_.data.materials.append(bahan('teks_sub', (0.34, 0.40, 0.48, 1), logam=0.8, kasar=0.5))
    bagian.append(os_)

    # --- kaki karet
    for i in range(4):
        a = math.radians(45 + 90 * i)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=5 * MM, depth=2 * MM,
                                            location=(math.cos(a) * 44 * MM,
                                                      math.sin(a) * 44 * MM, -0.6 * MM))
        kaki = bpy.context.object
        kaki.name = 'kaki_%d' % i
        halus(kaki)
        pasang(kaki, bahan('karet', (0.01, 0.01, 0.015, 1), kasar=0.95))
        bagian.append(kaki)

    return bagian


def prisma():
    """Piramida terbalik dari kaca: empat bidang pemantul Pepper's ghost."""
    atas, bawah, tinggi = 122 * MM, 26 * MM, 74 * MM
    z0 = 45.5 * MM

    me = bpy.data.meshes.new('prisma')
    obj = bpy.data.objects.new('prisma', me)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    a, b = atas / 2, bawah / 2
    vt = [bm.verts.new(v) for v in [(-a, -a, z0 + tinggi), (a, -a, z0 + tinggi),
                                    (a, a, z0 + tinggi), (-a, a, z0 + tinggi)]]
    vb = [bm.verts.new(v) for v in [(-b, -b, z0), (b, -b, z0),
                                    (b, b, z0), (-b, b, z0)]]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new([vt[i], vt[j], vb[j], vb[i]])
    bm.to_mesh(me)
    bm.free()

    if bpy.context.scene.render.engine == 'CYCLES':
        solid = obj.modifiers.new('tebal', 'SOLIDIFY')
        solid.thickness = 1.6 * MM
        solid.offset = 0

    kaca = bahan_kaca('kaca_prisma', pantul=0.16, kasar=0.06)
    pasang(obj, kaca)
    return [obj]


def tepi_prisma():
    """Garis tepi tipis yang menangkap cahaya — pembaca bentuk prisma."""
    atas, bawah, tinggi = 122 * MM, 26 * MM, 74 * MM
    z0 = 45.5 * MM
    a, b = atas / 2, bawah / 2
    titik = [((-a, -a, z0 + tinggi), (-b, -b, z0)), ((a, -a, z0 + tinggi), (b, -b, z0)),
             ((a, a, z0 + tinggi), (b, b, z0)), ((-a, a, z0 + tinggi), (-b, b, z0))]
    mat = bahan('tepi', (0.1, 0.4, 0.6, 1), emisi=CYAN, kuat=2.6)
    keluar = []

    # bingkai persegi pada bukaan atas dan ujung bawah
    for z, sisi in ((z0 + tinggi, a), (z0, b)):
        kurva = bpy.data.curves.new('bingkai', 'CURVE')
        kurva.dimensions = '3D'
        kurva.bevel_depth = 1.1 * MM
        sp = kurva.splines.new('POLY')
        sp.points.add(3)
        for i, (px_, py_) in enumerate([(-sisi, -sisi), (sisi, -sisi), (sisi, sisi), (-sisi, sisi)]):
            sp.points[i].co = (px_, py_, z, 1)
        sp.use_cyclic_u = True
        ob = bpy.data.objects.new('bingkai_%d' % int(z * 1000), kurva)
        bpy.context.collection.objects.link(ob)
        ob.data.materials.append(mat)
        keluar.append(ob)
    for i, (p1, p2) in enumerate(titik):
        kurva = bpy.data.curves.new('tepi%d' % i, 'CURVE')
        kurva.dimensions = '3D'
        kurva.bevel_depth = 1.1 * MM
        sp = kurva.splines.new('POLY')
        sp.points.add(1)
        sp.points[0].co = (*p1, 1)
        sp.points[1].co = (*p2, 1)
        ob = bpy.data.objects.new('tepi%d' % i, kurva)
        bpy.context.collection.objects.link(ob)
        ob.data.materials.append(mat)
        keluar.append(ob)
    return keluar


# ================================================================ hologram
def hologram(jenis='otak'):
    """Volume bercahaya di dalam prisma.

    Metaball menghasilkan gumpalan bulat yang tidak meyakinkan sebagai
    organ. Di sini dipakai bola yang diregangkan lalu diberi Displace
    bertekstur awan — hasilnya berlekuk seperti girus, mendekati render
    pada kompilasi KACA-1.
    """
    z = 92 * MM
    hasil = []

    mat = bahan('holo_cahaya', (0.02, 0.10, 0.16, 1), emisi=CYAN, kuat=1.15, alpha=0.52)

    def gumpal(nama, lok, skala, ukuran, lekuk, skala_lekuk, sub=2):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=ukuran * MM,
                                              location=lok)
        o = bpy.context.object
        o.name = nama
        o.scale = skala
        bpy.ops.object.transform_apply(scale=True)

        tex = bpy.data.textures.new(nama + '_tex', 'CLOUDS')
        tex.noise_scale = skala_lekuk
        tex.noise_depth = 2
        dis = o.modifiers.new('lekuk', 'DISPLACE')
        dis.texture = tex
        dis.strength = lekuk * MM
        dis.mid_level = 0.5

        sb = o.modifiers.new('halus', 'SUBSURF')
        sb.levels = sub
        sb.render_levels = sub
        halus(o)
        pasang(o, mat)
        hasil.append(o)
        return o

    if jenis == 'otak':
        # dua belahan dengan celah di tengah
        for sisi, nama in ((-1, 'holo_kiri'), (1, 'holo_kanan')):
            gumpal(nama, (sisi * 10 * MM, 0, z), (1.0, 1.30, 0.92), 18, 3.6, 0.16)
        # serebelum di belakang-bawah
        gumpal('holo_serebelum', (0, 19 * MM, z - 13 * MM), (1.25, 0.8, 0.62), 11, 1.8, 0.09)
        # batang otak
        gumpal('holo_batang', (0, 9 * MM, z - 20 * MM), (0.55, 0.6, 1.25), 8, 0.8, 0.12, sub=1)
    elif jenis == 'toraks':
        for sisi, nama in ((-1, 'holo_paru_kiri'), (1, 'holo_paru_kanan')):
            gumpal(nama, (sisi * 14 * MM, 0, z), (0.78, 1.0, 1.45), 17, 2.2, 0.14)
        gumpal('holo_jantung', (0, -4 * MM, z - 5 * MM), (1.0, 0.9, 1.1), 11, 1.4, 0.11)
    else:  # tengkorak
        gumpal('holo_kranium', (0, 0, z + 3 * MM), (1.0, 1.18, 1.06), 21, 1.6, 0.10)
        gumpal('holo_rahang', (0, -12 * MM, z - 16 * MM), (0.92, 0.7, 0.5), 12, 1.1, 0.09)

    return hasil


def bidang_irisan():
    """Bidang irisan tipis di bawah hologram — penanda data volumetrik."""
    hasil = []
    mat = bahan('irisan', (0, 0, 0, 1), emisi=CYAN_TER, kuat=0.9, alpha=0.16)
    tembus(mat)
    for i in range(5):
        bpy.ops.mesh.primitive_plane_add(size=50 * MM, location=(0, 0, (64 + i * 4) * MM))
        p = bpy.context.object
        p.name = 'irisan_%d' % i
        p.scale = (1 - abs(i - 2) * 0.12,) * 3
        pasang(p, mat)
        hasil.append(p)
    return hasil


# ================================================================ panggung
def panggung_gelap():
    """Lantai memantul dan latar bergradien, seperti pada kompilasi
    KACA-1. Dipakai untuk render 'panggung'; pada render beralfa
    panggung ini dilewati."""
    bpy.ops.mesh.primitive_plane_add(size=4.0, location=(0, 0, -0.0012))
    lantai = bpy.context.object
    lantai.name = 'lantai'
    m = bahan('lantai', (0.010, 0.014, 0.022, 1), logam=0.0, kasar=0.55)
    pasang(lantai, m)

    dunia = bpy.context.scene.world
    nt = dunia.node_tree
    latar = nt.nodes['Background']
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    koord = nt.nodes.new('ShaderNodeTexCoord')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.10
    ramp.color_ramp.elements[0].color = (0.010, 0.016, 0.026, 1)
    ramp.color_ramp.elements[1].position = 0.92
    ramp.color_ramp.elements[1].color = (0.045, 0.062, 0.088, 1)
    nt.links.new(koord.outputs['Window'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], latar.inputs[0])
    latar.inputs[1].default_value = 0.55
    return lantai


def panggung_putih():
    """Studio putih lapang berupa siklorama: lantai yang melengkung naik
    menjadi dinding belakang, tanpa garis cakrawala. Bagian yang naik
    memancarkan cahaya putih-biru es sendiri, sehingga latar tampak putih
    bersih tanpa perlu menerangi lantai sampai terbakar."""
    me = bpy.data.meshes.new('siklorama')
    bm = bmesh.new()
    profil = []
    for i in range(24):                      # lantai datar
        profil.append((-3.0 + i * (3.6 / 23), 0.0))
    r = 0.7
    for i in range(1, 25):                   # lengkung seperempat lingkaran
        a = (math.pi / 2) * i / 24
        profil.append((0.6 + math.sin(a) * r, r - math.cos(a) * r))
    for i in range(1, 8):                    # dinding tegak
        profil.append((0.6 + r, r + i * 0.4))
    xs = [-9.0 + i * 0.5 for i in range(37)]
    grid = [[bm.verts.new((x, y, z)) for (y, z) in profil] for x in xs]
    for i in range(len(xs) - 1):
        for j in range(len(profil) - 1):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me)
    bm.free()
    lantai = bpy.data.objects.new('lantai', me)
    bpy.context.collection.objects.link(lantai)
    lantai.location = (0, 0, -0.0012)
    halus(lantai)

    m = bpy.data.materials.new('siklorama')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.36, 0.40, 0.46, 1)
    bsdf.inputs['Roughness'].default_value = 0.32
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.3
    keluar = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    pisah = nt.nodes.new('ShaderNodeSeparateXYZ')
    petak = nt.nodes.new('ShaderNodeMapRange')
    petak.inputs['From Min'].default_value = 0.0
    petak.inputs['From Max'].default_value = 0.10
    petak.interpolation_type = 'SMOOTHSTEP'
    # lantai juga memudar ke putih menjauhi perangkat (radial)
    pisah2 = nt.nodes.new('ShaderNodeVectorMath')
    pisah2.operation = 'MULTIPLY'
    pisah2.inputs[1].default_value = (1.0, 1.0, 0.0)
    panjang = nt.nodes.new('ShaderNodeVectorMath')
    panjang.operation = 'LENGTH'
    petak2 = nt.nodes.new('ShaderNodeMapRange')
    petak2.inputs['From Min'].default_value = 0.34
    petak2.inputs['From Max'].default_value = 0.95
    petak2.interpolation_type = 'SMOOTHSTEP'
    maks = nt.nodes.new('ShaderNodeMath')
    maks.operation = 'MAXIMUM'
    pancar = nt.nodes.new('ShaderNodeEmission')
    # latar biru-abu yang lembut, bukan putih menyilaukan
    pancar.inputs['Color'].default_value = (0.80, 0.87, 0.97, 1)
    pancar.inputs['Strength'].default_value = 1.45
    campur = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(geo.outputs['Position'], pisah.inputs[0])
    nt.links.new(pisah.outputs['Z'], petak.inputs['Value'])
    nt.links.new(geo.outputs['Position'], pisah2.inputs[0])
    nt.links.new(pisah2.outputs['Vector'], panjang.inputs[0])
    nt.links.new(panjang.outputs['Value'], petak2.inputs['Value'])
    nt.links.new(petak.outputs['Result'], maks.inputs[0])
    nt.links.new(petak2.outputs['Result'], maks.inputs[1])
    nt.links.new(maks.outputs['Value'], campur.inputs['Fac'])
    nt.links.new(bsdf.outputs['BSDF'], campur.inputs[1])
    nt.links.new(pancar.outputs['Emission'], campur.inputs[2])
    nt.links.new(campur.outputs['Shader'], keluar.inputs['Surface'])
    pasang(lantai, m)

    dunia = bpy.context.scene.world
    dunia.node_tree.nodes['Background'].inputs[0].default_value = (0.86, 0.91, 0.98, 1)
    dunia.node_tree.nodes['Background'].inputs[1].default_value = 0.45
    # lampu studio dirancang untuk panggung gelap; di atas putih diredam
    bpy.context.scene.view_settings.exposure = -1.3
    return lantai


def bahan_layar(nama, gambar, kuat=1.0):
    """Layar menyala: emisi dari tangkapan layar ditambah kilap kaca tipis."""
    m = bpy.data.materials.new(nama)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    keluar = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(gambar)
    tex.interpolation = 'Cubic'
    emisi = nt.nodes.new('ShaderNodeEmission')
    emisi.inputs['Strength'].default_value = kuat
    kilap = nt.nodes.new('ShaderNodeBsdfGlossy')
    kilap.inputs['Roughness'].default_value = 0.04
    kilap.inputs['Color'].default_value = (1, 1, 1, 1)
    fresnel = nt.nodes.new('ShaderNodeFresnel')
    fresnel.inputs['IOR'].default_value = 1.5
    kali = nt.nodes.new('ShaderNodeMath')
    kali.operation = 'MULTIPLY'
    kali.inputs[1].default_value = 0.14
    campur = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(tex.outputs['Color'], emisi.inputs['Color'])
    nt.links.new(fresnel.outputs['Fac'], kali.inputs[0])
    nt.links.new(kali.outputs['Value'], campur.inputs['Fac'])
    nt.links.new(emisi.outputs['Emission'], campur.inputs[1])
    nt.links.new(kilap.outputs['BSDF'], campur.inputs[2])
    nt.links.new(campur.outputs['Shader'], keluar.inputs['Surface'])
    return m


def kotak_bulat(nama, lebar, tinggi, tebal, jari, segmen=10):
    """Balok bersudut membulat (sudut denah), seperti badan ponsel/laptop."""
    me = bpy.data.meshes.new(nama)
    bm = bmesh.new()
    x, y = lebar / 2, tinggi / 2
    vs = [bm.verts.new(v) for v in ((-x, -y, 0), (x, -y, 0), (x, y, 0), (-x, y, 0))]
    bm.faces.new(vs)
    bmesh.ops.bevel(bm, geom=list(bm.verts), offset=jari, segments=segmen, affect='VERTICES')
    hasil = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
    naik = [e for e in hasil['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=naik, vec=(0, 0, tebal))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nama, me)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    bevel(o, 0.9 * MM, 3)
    halus(o)
    return o


def bidang(nama, lebar, tinggi, mat):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    o = bpy.context.object
    o.name = nama
    o.scale = (lebar, tinggi, 1)
    bpy.ops.object.transform_apply(scale=True)
    pasang(o, mat)
    return o


# posisi mockup dicatat supaya lintasan kamera bisa menujunya
MOCKUP = {}


def laptop(gambar):
    """Laptop putih-perak ramping dengan aplikasi Medivox di layarnya.
    Bagian dibangun di titik nol, dipasangkan ke induk, lalu induk
    dipindah (lihat catatan di tablet())."""
    perak = bahan('laptop_perak', (0.74, 0.77, 0.81, 1), logam=0.7, kasar=0.26)
    dek = bahan('laptop_dek', (0.62, 0.66, 0.72, 1), logam=0.5, kasar=0.4)
    kaca_hitam = bahan('laptop_bezel', (0.012, 0.015, 0.02, 1), kasar=0.08)
    L, D = 0.304, 0.212

    alas = kotak_bulat('laptop_alas', L, D, 0.0072, 0.010)
    pasang(alas, perak)
    kb = bidang('laptop_keyboard', L * 0.86, D * 0.40, dek)
    kb.location = (0, 0.036, 0.0074)
    kb.parent = alas
    tp = bidang('laptop_trackpad', 0.112, 0.068, dek)
    tp.location = (0, -0.062, 0.0074)
    tp.parent = alas

    # tutup: berdiri pada engsel (tepi belakang alas), menghadap -Y
    engsel = bpy.data.objects.new('laptop_engsel', None)
    bpy.context.collection.objects.link(engsel)
    tutup = kotak_bulat('laptop_tutup', L, 0.206, 0.0048, 0.010)
    pasang(tutup, perak)
    tutup.rotation_euler = (math.radians(90), 0, 0)
    tutup.location = (0, 0.0048, 0.104)   # tebal ke +Y, muka depan di y=0
    tutup.parent = engsel
    bezel = bidang('laptop_bezel', L - 0.006, 0.200, kaca_hitam)
    bezel.rotation_euler = (math.radians(90), 0, 0)
    bezel.location = (0, -0.0003, 0.104)
    bezel.parent = engsel
    # layar 16:10
    lw, lh = 0.286, 0.1788
    layar = bidang('laptop_layar', lw, lh, bahan_layar('layar_laptop', gambar, 2.3))
    layar.rotation_euler = (math.radians(90), 0, 0)
    layar.location = (0, -0.0006, 0.106)
    layar.parent = engsel
    engsel.location = (0, D / 2 - 0.004, 0.0072)
    engsel.rotation_euler = (math.radians(-14), 0, 0)
    engsel.parent = alas

    alas.location = (-0.32, 0.17, 0.0)
    alas.rotation_euler = (0, 0, math.radians(20))
    bpy.context.view_layer.update()
    MOCKUP['laptop'] = (layar.matrix_world.translation.copy(),
                        (layar.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized())


def ponsel(gambar):
    """Ponsel Android 20:9 berwarna porselen putih: bezel tipis seragam,
    kamera punch-hole (digambar di tekstur layar), tombol daya dan volume
    di sisi kanan, bersandar pada penyangga kecil."""
    badan_m = bahan('ponsel_badan', (0.90, 0.92, 0.95, 1), logam=0.35, kasar=0.26)
    rangka = bahan('ponsel_rangka', (0.80, 0.84, 0.89, 1), logam=0.9, kasar=0.2)
    bingkai = bahan('ponsel_bingkai', (0.012, 0.015, 0.02, 1), kasar=0.08)
    W, H, T = 0.0718, 0.1600, 0.0086
    induk = bpy.data.objects.new('ponsel', None)
    bpy.context.collection.objects.link(induk)
    badan = kotak_bulat('ponsel_badan', W, H, T, 0.0080, 12)
    pasang(badan, badan_m)
    badan.parent = induk
    # rangka logam tipis mengelilingi sisi
    sisi = kotak_bulat('ponsel_rangka', W + 0.0006, H + 0.0006, 0.0034, 0.0083, 12)
    sisi.location = (0, 0, T * 0.35)
    pasang(sisi, rangka)
    sisi.parent = induk
    kaca = kotak_bulat('ponsel_kaca', W - 0.0010, H - 0.0010, 0.0003, 0.0075, 12)
    kaca.location = (0, 0, T)
    pasang(kaca, bingkai)
    kaca.parent = induk
    layar = bidang('ponsel_layar', W - 0.0040, H - 0.0040, bahan_layar('layar_ponsel', gambar, 2.3))
    layar.location = (0, 0, T + 0.00035)
    layar.parent = induk
    # tombol daya (pendek) dan volume (panjang) di sisi kanan
    for nama, y, pjg in (('tombol_daya', 0.018, 0.011), ('tombol_volume', 0.040, 0.024)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(W / 2 + 0.0005, y, T * 0.5))
        t = bpy.context.object
        t.name = nama
        t.scale = (0.0012, pjg, 0.0026)
        pasang(t, rangka)
        t.parent = induk

    peny = kotak_bulat('ponsel_penyangga', 0.058, 0.040, 0.014, 0.008)
    pasang(peny, bahan('penyangga', (0.92, 0.935, 0.955, 1), kasar=0.3))
    peny.location = (0.206, 0.016, 0)
    peny.rotation_euler = (0, 0, math.radians(8))

    induk.location = (0.200, -0.030, 0.076)
    induk.rotation_euler = (math.radians(72), 0, math.radians(8))
    bpy.context.view_layer.update()
    MOCKUP['ponsel'] = (layar.matrix_world.translation.copy(),
                        (layar.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized())


def jadikan_putih():
    """Varian putih untuk antarmuka terang.

    Tepi prisma yang bercahaya cyan akan lenyap di atas latar putih, jadi
    tepi dan pita aksen memakai biru merek yang tidak memancar; hologram
    diberi biru jenuh supaya tetap terbaca tanpa latar gelap.
    """
    def kilap(nama, warna, kasar=0.18, logam=0.0, coat=1.0):
        m = bahan(nama, warna, logam=logam, kasar=kasar)
        b = m.node_tree.nodes['Principled BSDF']
        if 'Coat Weight' in b.inputs:
            b.inputs['Coat Weight'].default_value = coat
            b.inputs['Coat Roughness'].default_value = 0.05
        return m

    keramik = kilap('keramik_putih', (0.90, 0.925, 0.955, 1))
    aksen = kilap('aksen_biru', (0.10, 0.34, 0.82, 1), kasar=0.2, logam=0.2)
    krom = bahan('krom', (0.86, 0.90, 0.95, 1), logam=1.0, kasar=0.12)
    teks_sub = bahan('teks_sub_putih', (0.42, 0.50, 0.62, 1), kasar=0.5)
    holo = bahan('holo_putih', (0.06, 0.30, 0.86, 1), emisi=(0.14, 0.52, 1.0, 1),
                 kuat=1.05, alpha=0.86)
    irisan = bahan('irisan_putih', (0.2, 0.5, 0.95, 1), emisi=CYAN, kuat=0.6, alpha=0.18)
    # BLENDED tidak menulis kedalaman, sehingga DOF mengaburkan hologram
    # seolah-olah ia sejauh dinding latar. DITHERED menulis kedalaman.
    if hasattr(holo, 'surface_render_method'):
        holo.surface_render_method = 'DITHERED'

    def ganti(o, m):
        if o.data and hasattr(o.data, 'materials'):
            o.data.materials.clear()
            o.data.materials.append(m)

    for o in bpy.context.scene.objects:
        n = o.name
        if n.startswith(('basis_bawah', 'basis_atas', 'kaki')):
            ganti(o, keramik)
        elif n.startswith(('celah', 'tepi', 'bingkai', 'nama_produk', 'panel_garis')):
            ganti(o, aksen)
        elif n.startswith('sekrup'):
            ganti(o, krom)
        elif n.startswith('sub_produk'):
            ganti(o, teks_sub)
        elif n.startswith('holo_'):
            ganti(o, holo)
        elif n.startswith('irisan'):
            ganti(o, irisan)
    bpy.context.scene.view_settings.view_transform = 'Standard'


def pencahayaan():
    dunia = bpy.data.worlds.new('dunia')
    bpy.context.scene.world = dunia
    dunia.use_nodes = True
    dunia.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.03, 0.05, 1)
    dunia.node_tree.nodes['Background'].inputs[1].default_value = 0.35

    def area(nama, lok, rot, ukuran, daya, warna=(1, 1, 1)):
        d = bpy.data.lights.new(nama, 'AREA')
        d.energy = daya
        d.size = ukuran
        d.color = warna
        o = bpy.data.objects.new(nama, d)
        o.location = lok
        o.rotation_euler = rot
        bpy.context.collection.objects.link(o)
        return o

    # kunci dari kiri-atas, isi lembut dari kanan, tepi dingin dari belakang
    area('kunci', (-0.34, -0.30, 0.42), (math.radians(52), 0, math.radians(-42)), 0.55, 26)
    area('isi', (0.46, -0.20, 0.30), (math.radians(64), 0, math.radians(62)), 0.9, 2.6,
         (0.85, 0.92, 1.0))
    area('tepi', (0.10, 0.44, 0.30), (math.radians(-58), 0, math.radians(14)), 0.5, 20,
         (0.55, 0.78, 1.0))
    # sorot bawah untuk memisahkan puck dari latar
    if not ARG.opaque:
        area('bawah', (0, -0.18, -0.10), (math.radians(-90), 0, 0), 0.4, 4,
             (0.4, 0.6, 1.0))


def kamera(nama, lok, lihat=(0, 0, 0.09), lensa=85):
    d = bpy.data.cameras.new(nama)
    d.lens = lensa
    o = bpy.data.objects.new(nama, d)
    o.location = lok
    bpy.context.collection.objects.link(o)
    arah = Vector(lihat) - Vector(lok)
    o.rotation_euler = arah.to_track_quat('-Z', 'Y').to_euler()
    return o


def siapkan_render(res_x, res_y):
    sc = bpy.context.scene
    # nama enum mesin berbeda antar versi Blender; pilih yang tersedia
    tersedia = [e.identifier for e in
                bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    minta = ARG.engine.upper()
    if minta.startswith('EEVEE'):
        pilih = next((e for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE') if e in tersedia),
                     tersedia[0])
    elif minta.startswith('CYCLES'):
        pilih = 'CYCLES' if 'CYCLES' in tersedia else tersedia[0]
    else:
        pilih = minta if minta in tersedia else tersedia[0]
    sc.render.engine = pilih
    print('  mesin render:', pilih)
    sc.render.resolution_x = res_x
    sc.render.resolution_y = res_y
    sc.render.film_transparent = not ARG.opaque   # PNG beralfa kecuali diminta lain
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.compression = 20

    if sc.render.engine == 'CYCLES':
        sc.cycles.samples = ARG.samples
        sc.cycles.use_denoising = True
        sc.cycles.max_bounces = 8
        sc.cycles.transmission_bounces = 8
    else:
        ee = sc.eevee
        for atribut, nilai in [('taa_render_samples', ARG.samples),
                               ('use_raytracing', True),
                               ('use_bloom', True),
                               ('bloom_intensity', 0.04)]:
            if hasattr(ee, atribut):
                setattr(ee, atribut, nilai)

    sc.view_settings.view_transform = 'AgX' if 'AgX' in [
        v.name for v in bpy.types.ColorManagedViewSettings.bl_rna
        .properties['view_transform'].enum_items] else 'Standard'
    sc.view_settings.look = 'None'
    return sc


# ================================================================ bangun
def bangun():
    bersihkan()
    # mesin ditetapkan lebih dulu: pilihan material kaca bergantung padanya
    siapkan_render(ARG.res, ARG.res)
    basis()
    prisma()
    tepi_prisma()
    hologram(ARG.organ)
    bidang_irisan()
    pencahayaan()
    if ARG.studio:
        panggung_putih()
    elif ARG.opaque:
        panggung_gelap()
    if ARG.putih:
        jadikan_putih()
    if ARG.mode == 'shot':
        sorot_atas()
        if ARG.shot == 'app' and ARG.layar and os.path.exists(ARG.layar):
            tablet(os.path.abspath(ARG.layar))
        if ARG.layar_laptop and os.path.exists(ARG.layar_laptop):
            laptop(os.path.abspath(ARG.layar_laptop))
        if ARG.layar_ponsel and os.path.exists(ARG.layar_ponsel):
            ponsel(os.path.abspath(ARG.layar_ponsel))


def render_ke(sc, kam, berkas):
    sc.camera = kam
    sc.render.filepath = berkas
    bpy.ops.render.render(write_still=True)
    print('  tersimpan:', berkas)


# ================================================================ shot sinematik
# Lintasan kamera per shot, mengikuti gaya showcase RePulse: kamera
# bergerak pelan di atas meja gelap, fokus dangkal, sorot dari atas.
#   awal/akhir : posisi kamera (meter)
#   lihat_a/b  : titik yang dilihat di awal dan akhir
#   lensa, f   : panjang fokus (mm) dan bukaan diafragma
SHOT = {
    'masuk': dict(awal=(0.95, -1.15, 0.44), akhir=(0.42, -0.52, 0.25),
                  lihat_a=(0, 0, 0.075), lihat_b=(0, 0, 0.082), lensa=70, f=2.8),
    'orbit': dict(orbit=(-38, 22), radius=0.66, z=0.22,
                  lihat_a=(0, 0, 0.092), lihat_b=(0, 0, 0.092), lensa=85, f=2.0),
    'panel': dict(awal=(0.20, -0.46, 0.58), akhir=(0.12, -0.30, 0.46),
                  lihat_a=(0, 0, 0.05), lihat_b=(0, 0, 0.055), lensa=90, f=3.2),
    'app':   dict(awal=(0.70, -0.86, 0.30), akhir=(0.56, -0.74, 0.25),
                  lihat_a=(0.10, 0.02, 0.07), lihat_b=(0.10, 0.02, 0.07), lensa=58, f=4.0),
    # perangkat keras + perangkat lunak dalam satu bingkai
    'ekosistem': dict(awal=(0.34, -0.78, 0.36), akhir=(0.04, -0.72, 0.27),
                      lihat_a=(-0.04, 0.06, 0.07), lihat_b=(-0.06, 0.06, 0.075), lensa=44, f=5.6),
    # mendekat ke layar laptop / ponsel; titik dihitung dari MOCKUP
    'laptop': dict(mockup='laptop', jarak=(0.62, 0.40), geser=(0.10, 0.02), lensa=50, f=3.2),
    'ponsel': dict(mockup='ponsel', jarak=(0.62, 0.42), geser=(-0.10, -0.03), lensa=60, f=3.2),
}


def sorot_atas():
    """Genangan cahaya dari atas seperti meja pameran."""
    d = bpy.data.lights.new('sorot', 'SPOT')
    d.energy = 2.2 if ARG.studio else 8
    d.spot_size = math.radians(52)
    d.spot_blend = 0.9
    d.color = (0.82, 0.90, 1.0)
    o = bpy.data.objects.new('sorot', d)
    o.location = (0.05, -0.08, 0.95)
    o.rotation_euler = (math.radians(4), 0, 0)
    bpy.context.collection.objects.link(o)


def tablet(gambar):
    """Tablet berdiri di samping perangkat, menampilkan aplikasi Medivox.

    Badan dan layar dibangun di titik nol, layar dipasangkan ke badan,
    baru kemudian badan dipindah dan dimiringkan. Urutan ini penting:
    memindah badan lebih dulu membuat layar tertinggal di titik nol.
    """
    lebar, tinggi, tebal = 0.170, 0.112, 0.008
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    badan = bpy.context.object
    badan.name = 'tablet_badan'
    badan.scale = (lebar + 0.010, tinggi + 0.010, tebal)
    bpy.ops.object.transform_apply(scale=True)
    bevel(badan, 2.2 * MM, 4)
    pasang(badan, bahan('tablet_logam', (0.03, 0.035, 0.045, 1), logam=0.8, kasar=0.35))

    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, tebal / 2 + 0.0004))
    layar = bpy.context.object
    layar.name = 'tablet_layar'
    layar.scale = (lebar, tinggi, 1)
    bpy.ops.object.transform_apply(scale=True)

    m = bpy.data.materials.new('layar_app')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(gambar)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 0.8
    bsdf.inputs['Roughness'].default_value = 0.15
    pasang(layar, m)

    layar.parent = badan
    # tablet berdiri miring menghadap kamera, seperti di atas penyangga
    badan.location = (0.215, 0.07, 0.056)
    badan.rotation_euler = (math.radians(68), 0, math.radians(-24))


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def halus_t(t):
    """Percepatan-perlambatan lembut untuk gerak kamera."""
    return t * t * (3 - 2 * t)


def render_shot(nama, frames, out):
    cfg = SHOT[nama]
    sc = siapkan_render(1920, 1080)
    # Shot selalu opak, jadi tak butuh alfa. JPEG ±5x lebih kecil dari PNG;
    # 690 frame PNG 1080p memakan lebih dari satu gigabita.
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.quality = 94
    if ARG.putih:
        sc.view_settings.view_transform = 'Standard'
    if ARG.frames == 1:
        sc.render.image_settings.quality = 90
    kam = kamera('kam_' + nama, (1, -1, 0.3), (0, 0, 0.08), cfg['lensa'])
    kam.data.dof.use_dof = True
    kam.data.dof.aperture_fstop = cfg['f']
    sc.camera = kam

    holo = [o for o in bpy.context.scene.objects if o.name.startswith('holo_')]
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0.092))
    poros = bpy.context.object
    poros.name = 'poros_holo'
    for o in holo:
        o.parent = poros
        o.matrix_parent_inverse = poros.matrix_world.inverted()
    folder = os.path.join(out, 'shot-' + nama)
    os.makedirs(folder, exist_ok=True)

    for i in range(frames):
        t = halus_t(i / max(1, frames - 1))
        if 'mockup' in cfg:
            pusat, normal = MOCKUP[cfg['mockup']]
            samping = normal.cross(Vector((0, 0, 1))).normalized()
            jarak = cfg['jarak'][0] + (cfg['jarak'][1] - cfg['jarak'][0]) * t
            geser = cfg['geser'][0] + (cfg['geser'][1] - cfg['geser'][0]) * t
            lok = tuple(pusat + normal * jarak + samping * geser + Vector((0, 0, 0.03 * (1 - t))))
            lihat = pusat
        elif 'orbit' in cfg:
            a0, a1 = cfg['orbit']
            sudut = math.radians(a0 + (a1 - a0) * t) - math.pi / 2
            lok = (math.cos(sudut) * cfg['radius'], math.sin(sudut) * cfg['radius'], cfg['z'])
        else:
            lok = lerp(cfg['awal'], cfg['akhir'], t)
        if 'mockup' not in cfg:
            lihat = Vector(lerp(cfg['lihat_a'], cfg['lihat_b'], t))
        kam.location = lok
        kam.rotation_euler = (lihat - Vector(lok)).to_track_quat('-Z', 'Y').to_euler()
        kam.data.dof.focus_distance = (lihat - Vector(lok)).length

        # hologram berputar pelan: volume terasa hidup, bukan gambar diam
        poros.rotation_euler[2] = math.radians(0.9 * i)

        sc.render.filepath = os.path.join(folder, 'f%04d.jpg' % i)
        bpy.ops.render.render(write_still=True)
        if i % 30 == 0:
            print('  %s %d/%d' % (nama, i, frames))
    print('  shot %s selesai' % nama)


def main():
    out = os.path.abspath(ARG.out)
    os.makedirs(out, exist_ok=True)
    bangun()

    if ARG.mode == 'still':
        sc = siapkan_render(ARG.res, int(ARG.res * 0.78))
        # Tinggi perangkat ~120 mm; pada lensa 85 mm kamera perlu berada
        # sekitar 0,6 m agar seluruh prisma masuk bingkai.
        sudut = {
            'hero':    ((0.46, -0.58, 0.30), (0, 0, 0.082), 80),
            'tigaper': ((0.62, -0.40, 0.24), (0, 0, 0.078), 85),
            'samping': ((0.02, -0.70, 0.16), (0, 0, 0.076), 85),
            'atas':    ((0.28, -0.34, 0.66), (0, 0, 0.055), 80),
            'dekat':   ((0.30, -0.38, 0.20), (0, 0, 0.092), 120),
        }
        for nama, (lok, lihat, lensa) in sudut.items():
            kam = kamera('kam_' + nama, lok, lihat, lensa)
            render_ke(sc, kam, os.path.join(out, 'medivox-%s.png' % nama))

    elif ARG.mode == 'shot':
        render_shot(ARG.shot, ARG.frames, out)

    elif ARG.mode == 'hologram':
        # hanya volume bercahaya, untuk dipakai sebagai elemen lepas
        for o in bpy.data.objects:
            if o.name.startswith(('basis', 'alur', 'panel', 'prisma', 'tepi', 'kaki',
                                  'pandangan', 'bingkai', 'sekrup', 'celah', 'nama', 'sub')):
                bpy.data.objects.remove(o, do_unlink=True)
        sc = siapkan_render(ARG.res, ARG.res)
        kam = kamera('kam_holo', (0.26, -0.32, 0.17), (0, 0, 0.094), 90)
        render_ke(sc, kam, os.path.join(out, 'medivox-hologram.png'))

    else:  # turntable
        # Rotasi diatur langsung per frame, bukan lewat keyframe: API Action
        # berubah antar versi Blender, sedangkan loop ini bekerja di semuanya.
        sc = siapkan_render(1920, 1080)
        kam = kamera('kam_putar', (0.46, -0.56, 0.29), (0, 0, 0.082), 80)
        sc.camera = kam

        bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
        poros = bpy.context.object
        poros.name = 'poros_putar'
        for o in list(bpy.context.scene.objects):
            if o.type in {'MESH', 'META', 'CURVE', 'FONT'} and o.parent is None                and o.name not in ('poros_putar', 'lantai'):
                o.parent = poros
                o.matrix_parent_inverse = poros.matrix_world.inverted()

        folder = os.path.join(out, 'putar')
        os.makedirs(folder, exist_ok=True)
        for i in range(ARG.frames):
            poros.rotation_euler[2] = math.radians(360.0 * i / ARG.frames)
            sc.render.filepath = os.path.join(folder, 'f%04d.png' % i)
            bpy.ops.render.render(write_still=True)
            if i % 12 == 0:
                print('  frame %d/%d' % (i, ARG.frames))
        print('  sekuens putar selesai:', ARG.frames, 'frame')

    if ARG.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'medivox-produk.blend'))
        print('  .blend tersimpan')

    print('SELESAI mode=%s engine=%s' % (ARG.mode, ARG.engine))


main()
