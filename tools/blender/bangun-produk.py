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
    p.add_argument('--shot', default='masuk')
    p.add_argument('--layar', default='')
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
    if ARG.opaque:
        panggung_gelap()
    if ARG.mode == 'shot':
        sorot_atas()
        if ARG.shot == 'app' and ARG.layar and os.path.exists(ARG.layar):
            tablet(os.path.abspath(ARG.layar))


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
}


def sorot_atas():
    """Genangan cahaya dari atas seperti meja pameran."""
    d = bpy.data.lights.new('sorot', 'SPOT')
    d.energy = 8
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
        if 'orbit' in cfg:
            a0, a1 = cfg['orbit']
            sudut = math.radians(a0 + (a1 - a0) * t) - math.pi / 2
            lok = (math.cos(sudut) * cfg['radius'], math.sin(sudut) * cfg['radius'], cfg['z'])
        else:
            lok = lerp(cfg['awal'], cfg['akhir'], t)
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
