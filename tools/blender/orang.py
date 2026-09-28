"""
MEDIVOX — stylised clinicians for the showreel (Blender).

Mannequin-style figures built only from primitives: a white lab
coat, smooth featureless head, and a jointed right arm with an
open hand, so a figure can swipe in front of the device, point,
or stand and speak. Faceless on purpose: it keeps the clean white
look and avoids the uncanny valley of low-poly realistic faces.

Every joint is an Empty; poses are set per frame by rotating the
empties (no keyframes, see bangun-produk.py for why).
"""
import bpy, math
from mathutils import Vector


def _bahan(nama, warna, kasar=0.4, coat=0.0, logam=0.0):
    m = bpy.data.materials.get(nama)
    if m:
        return m
    m = bpy.data.materials.new(nama)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = warna
    b.inputs['Roughness'].default_value = kasar
    b.inputs['Metallic'].default_value = logam
    if coat and 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.2
    return m


def _pasang(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def _kosong(nama, induk=None, lok=(0, 0, 0)):
    e = bpy.data.objects.new(nama, None)
    bpy.context.collection.objects.link(e)
    e.empty_display_size = 0.03
    if induk:
        e.parent = induk
    e.location = lok
    return e


def _kapsul(nama, panjang, r, m, induk, arah=-1):
    """Rounded cylinder hanging from the parent's origin along -Z."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=panjang,
                                        location=(0, 0, arah * panjang / 2))
    o = bpy.context.object
    o.name = nama
    b = o.modifiers.new('bulat', 'BEVEL')
    b.width = r * 0.9
    b.segments = 6
    b.limit_method = 'ANGLE'
    _pasang(o, m)
    o.parent = induk
    return o


def _bola(nama, r, lok, m, induk, skala=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=lok)
    o = bpy.context.object
    o.name = nama
    o.scale = skala
    _pasang(o, m)
    o.parent = induk
    return o


def _tangan(nama, induk, m):
    """Open hand: palm plus four fingers and a thumb, palm facing +Y."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.05))
    telapak = bpy.context.object
    telapak.name = nama + '_telapak'
    telapak.scale = (0.085, 0.028, 0.095)
    bpy.ops.object.transform_apply(scale=True)
    b = telapak.modifiers.new('bulat', 'BEVEL')
    b.width = 0.012
    b.segments = 4
    _pasang(telapak, m)
    telapak.parent = induk
    for k, (x, pj) in enumerate([(-0.03, 0.068), (-0.01, 0.078), (0.01, 0.075), (0.03, 0.062)]):
        jari = _kosong(nama + '_jari%d' % k, induk, (x, 0, -0.098))
        _kapsul(nama + '_ruas%d' % k, pj, 0.0095, m, jari)
    ibu = _kosong(nama + '_ibu', induk, (0.045, 0, -0.045))
    ibu.rotation_euler = (0, math.radians(-50), 0)
    _kapsul(nama + '_ibujari', 0.055, 0.011, m, ibu)


def bangun_orang(nama, lok=(0, 0, 0), hadap=0.0, jas=(0.93, 0.95, 0.98, 1),
                 celana=(0.55, 0.62, 0.74, 1), kulit=(0.86, 0.89, 0.94, 1), aksen=(0.18, 0.44, 0.9, 1)):
    """Build one clinician. Feet at `lok`, facing the direction `hadap`
    (radians around Z; 0 faces +Y). Returns a dict of joint empties."""
    m_jas = _bahan('jas_' + nama, jas, kasar=0.55)
    m_cel = _bahan('celana_' + nama, celana, kasar=0.6)
    m_kul = _bahan('kulit_manekin', kulit, kasar=0.25, coat=0.6)
    m_aks = _bahan('aksen_orang', aksen, kasar=0.35)

    akar = _kosong(nama, None, lok)
    akar.rotation_euler = (0, 0, hadap)

    # legs
    for sx in (-0.095, 0.095):
        pinggul = _kosong(nama + '_pinggul%d' % (sx > 0), akar, (sx, 0, 0.92))
        _kapsul(nama + '_kaki%d' % (sx > 0), 0.9, 0.066, m_cel, pinggul)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.04, -0.9))
        sep = bpy.context.object
        sep.name = nama + '_sepatu%d' % (sx > 0)
        sep.scale = (0.1, 0.24, 0.07)
        bpy.ops.object.transform_apply(scale=True)
        sep.modifiers.new('b', 'BEVEL').width = 0.02
        _pasang(sep, m_aks)
        sep.parent = pinggul

    # lab coat: tapered body
    bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=0.25, radius2=0.2, depth=0.92, location=(0, 0, 0.98))
    jasb = bpy.context.object
    jasb.name = nama + '_jas'
    jasb.scale = (1, 0.72, 1)
    bpy.ops.object.transform_apply(scale=True)
    bev = jasb.modifiers.new('bulat', 'BEVEL')
    bev.width = 0.06
    bev.segments = 5
    _pasang(jasb, m_jas)
    jasb.parent = akar
    # shoulders
    _bola(nama + '_bahu', 0.2, (0, 0, 1.42), m_jas, akar, (1.15, 0.72, 0.42))
    # badge stripe (brand accent)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.1, 0.148, 1.26))
    lencana = bpy.context.object
    lencana.name = nama + '_lencana'
    lencana.scale = (0.05, 0.004, 0.07)
    _pasang(lencana, m_aks)
    lencana.parent = akar

    # neck + head
    leher = _kosong(nama + '_leher', akar, (0, 0, 1.46))
    _kapsul(nama + '_lehero', 0.1, 0.05, m_kul, leher, arah=1)
    kepala = _kosong(nama + '_kepala', leher, (0, 0, 0.19))
    _bola(nama + '_kepalao', 0.105, (0, 0, 0), m_kul, kepala, (0.9, 0.98, 1.18))

    sendi = {'akar': akar, 'kepala': kepala}
    # arms: shoulder -> elbow -> wrist -> hand
    for sisi, sx in (('ka', 0.235), ('ki', -0.235)):
        bahu = _kosong(nama + '_bahu_' + sisi, akar, (sx, 0, 1.4))
        _bola(nama + '_sendibahu_' + sisi, 0.058, (0, 0, 0), m_jas, bahu)
        _kapsul(nama + '_lengan_' + sisi, 0.3, 0.054, m_jas, bahu)
        siku = _kosong(nama + '_siku_' + sisi, bahu, (0, 0, -0.3))
        _bola(nama + '_sendisiku_' + sisi, 0.05, (0, 0, 0), m_jas, siku)
        _kapsul(nama + '_hasta_' + sisi, 0.26, 0.048, m_jas, siku)
        pergelangan = _kosong(nama + '_pg_' + sisi, siku, (0, 0, -0.27))
        _tangan(nama + '_tangan_' + sisi, pergelangan, m_kul)
        sendi['bahu_' + sisi] = bahu
        sendi['siku_' + sisi] = siku
        sendi['pg_' + sisi] = pergelangan
    # relaxed arms by default
    for sisi, s in (('ka', 1), ('ki', -1)):
        sendi['bahu_' + sisi].rotation_euler = (math.radians(6), math.radians(-6 * s), 0)
        sendi['siku_' + sisi].rotation_euler = (math.radians(14), 0, 0)
    return sendi


def pose_swipe(sendi, fase, lebar=26.0, angkat=1.0):
    """Right hand held forward and low, hovering over the device and
    sweeping left/right. `fase` in [-1, 1] maps to the sweep position."""
    a = angkat
    sendi['bahu_ka'].rotation_euler = (math.radians(6 + 46 * a), 0, math.radians((lebar * fase + 16) * a))
    sendi['siku_ka'].rotation_euler = (math.radians(14 + 6 * a), 0, 0)
    sendi['pg_ka'].rotation_euler = (math.radians(-30 * a), math.radians(-12 * fase * a), 0)


def pose_tunjuk(sendi, t=1.0):
    """Right arm pointing forward and slightly down, towards a table."""
    sendi['bahu_ka'].rotation_euler = (math.radians(55 * t + 6 * (1 - t)), 0, math.radians(-6 * t))
    sendi['siku_ka'].rotation_euler = (math.radians(18 * t + 14 * (1 - t)), 0, 0)


def pose_bicara(sendi, t):
    """Small head nods and a gesturing left hand while speaking."""
    sendi['kepala'].rotation_euler = (math.radians(6 + 3 * math.sin(t * 9)), 0, math.radians(2 * math.sin(t * 5)))
    sendi['bahu_ki'].rotation_euler = (math.radians(28 + 6 * math.sin(t * 6)), math.radians(8), 0)
    sendi['siku_ki'].rotation_euler = (math.radians(62), 0, 0)


def titik_dunia(obj, lokal=(0, 0, 0)):
    bpy.context.view_layer.update()
    return obj.matrix_world @ Vector(lokal)
