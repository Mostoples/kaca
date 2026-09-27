"""
==========================================================
MEDIVOX — pembangun kit aset UI (Blender CLI)
----------------------------------------------------------
Semua aset visual antarmuka dibangun di sini: ikon, ornamen,
pola kartu, dan render produk putih. Gaya: futuristik medis,
putih bersih, aksen biru royal -> cyan dari logo.

  blender -b -P tools/blender/bangun-kit-ui.py -- --mode ikon
  blender -b -P tools/blender/bangun-kit-ui.py -- --mode ornamen
  blender -b -P tools/blender/bangun-kit-ui.py -- --mode pola
  blender -b -P tools/blender/bangun-kit-ui.py -- --mode semua

Keluaran PNG beralfa ke build/kit/, lalu dikonversi ke WebP
oleh tools/optimasi-kit.py ke assets/ui/.

Ikon: jalur SVG ikon antarmuka diimpor, setiap garis diberi
ketebalan tabung, lalu dirender dari atas. Hasilnya tetap
terbaca di 24 px karena bentuknya sama persis dengan glyph
aslinya — hanya kini bervolume.
==========================================================
"""
import bpy, math, os, sys, argparse, tempfile
from mathutils import Vector


def argumen():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--mode', default='semua',
                   choices=['ikon', 'ornamen', 'pola', 'semua'])
    p.add_argument('--out', default='build/kit')
    p.add_argument('--samples', type=int, default=48)
    p.add_argument('--hanya', default='')          # daftar nama dipisah koma
    return p.parse_args(argv)


ARG = argumen()
OUT = os.path.abspath(ARG.out)

BIRU = (0.184, 0.435, 0.816, 1.0)
CYAN = (0.369, 0.788, 0.949, 1.0)
CYAN_TER = (0.647, 0.886, 0.984, 1.0)
PUTIH = (0.96, 0.975, 0.99, 1.0)


# ================================================================ ikon
# Glyph 24x24 bergaya garis. 'g' = isi elemen SVG (garis), 'isi' = bentuk padat.
IKON = {
    # --- navigasi & worklist
    'hologram': dict(g='<path d="M3 5h18L12 20z"/><path d="M12 5v15"/><path d="M7.5 12.5h9"/>'),
    'viewer':   dict(g='<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/><circle cx="12" cy="11" r="3.2"/>'),
    'studi':    dict(g='<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>'),
    'inbox':    dict(g='<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>'),
    'jam':      dict(g='<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    'centang':  dict(g='<path d="M20 6 9 17l-5-5"/>'),
    'bendera':  dict(g='<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'),
    'pengguna': dict(g='<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    'berkas':   dict(g='<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>'),
    'folder':   dict(g='<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    'unggah':   dict(g='<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    'cari':     dict(g='<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    'kunci':    dict(g='<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    'perisai':  dict(g='<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    'awan':     dict(g='<path d="M17.5 19a4.5 4.5 0 0 0 .5-9A6 6 0 0 0 6.2 9.2 4 4 0 0 0 6.5 19z"/>'),
    'petir':    dict(g='<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    'lapisan':  dict(g='<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'),
    'otak':     dict(g='<path d="M12 5a3 3 0 0 0-6 0v1a3 3 0 0 0-2 5.5A3 3 0 0 0 7 17a3 3 0 0 0 5 2z"/><path d="M12 5a3 3 0 0 1 6 0v1a3 3 0 0 1 2 5.5A3 3 0 0 1 17 17a3 3 0 0 1-5 2z"/>'),
    'paru':     dict(g='<path d="M12 4v8"/><path d="M12 11c-2 0-3-2-5-2-2 0-3 3-3 7 0 3 1 4 3 4s5-2 5-6z"/><path d="M12 11c2 0 3-2 5-2 2 0 3 3 3 7 0 3-1 4-3 4s-5-2-5-6z"/>'),
    'laporan':  dict(g='<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M9 13h6M9 17h4"/>'),
    'putar':    dict(g='<circle cx="12" cy="12" r="9"/>', isi='<path d="M10 8.5v7l6-3.5z"/>'),
    'tangan':   dict(g='<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 11.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-12.4 4.4L5 16a1.6 1.6 0 0 1 2.5-2L8 15"/>'),
    'mik':      dict(g='<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    'ekspor':   dict(g='<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
    'setelan':  dict(g='<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    'sinkron':  dict(g='<path d="M20 11a8 8 0 0 0-14-5l-2 2"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 20v-4h-4"/>'),
    'kubus':    dict(g='<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>'),
    'grid':     dict(g='<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    'keluar':   dict(g='<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
    # --- alat viewer
    'wwwc':     dict(g='<circle cx="12" cy="12" r="9"/>', isi='<path d="M12 3a9 9 0 0 0 0 18z"/>'),
    'geser':    dict(g='<path d="M12 3v18M3 12h18"/><path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),
    'zoom':     dict(g='<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>'),
    'tumpuk':   dict(g='<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
    'panjang':  dict(g='<path d="M3 15 15 3l6 6L9 21z"/><path d="m7 11 2 2M10 8l2 2M13 5l2 2"/>'),
    'sudut':    dict(g='<path d="M4 20h16M4 20 16 5"/><path d="M9 20a7 7 0 0 0 1.6-4.4"/>'),
    'persegi':  dict(g='<rect x="4" y="5" width="16" height="14" rx="2"/>'),
    'elips':    dict(g='<ellipse cx="12" cy="12" rx="8" ry="6"/>'),
    'probe':    dict(g='<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><circle cx="12" cy="12" r="2"/>'),
    'teks':     dict(g='<path d="M5 6h14M9 6v13"/>'),
    'inversi':  dict(g='<circle cx="12" cy="12" r="9"/>', isi='<path d="M12 3v18a9 9 0 0 0 0-18z"/>'),
    'rotasi':   dict(g='<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>'),
    'cermin':   dict(g='<path d="M12 3v18"/><path d="M9 7 4 12l5 5zM15 7l5 5-5 5z"/>'),
    'cerminv':  dict(g='<path d="M3 12h18"/><path d="M7 9 12 4l5 5zM7 15l5 5 5-5z"/>'),
    'pas':      dict(g='<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    'reset':    dict(g='<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/>'),
    'hapus':    dict(g='<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    'mata':     dict(g='<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    'kamera':   dict(g='<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="14" r="3.5"/>'),
}


def bersihkan():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module='io_curve_svg')
    except Exception:
        pass


def mesin(sc):
    ada = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    sc.render.engine = next(e for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES') if e in ada)
    ee = sc.eevee
    for k, v in (('taa_render_samples', ARG.samples), ('use_raytracing', True)):
        if hasattr(ee, k):
            setattr(ee, k, v)
    vt = [v.name for v in bpy.types.ColorManagedViewSettings.bl_rna
          .properties['view_transform'].enum_items]
    sc.view_settings.view_transform = 'AgX' if 'AgX' in vt else 'Standard'


def tembus(m):
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'BLENDED'
    if hasattr(m, 'blend_method'):
        m.blend_method = 'BLEND'


def bahan_kilap_merek(nama='kilap'):
    """Keramik mengilap bergradien biru -> cyan, seperti ikon 3D modern."""
    m = bpy.data.materials.new(nama)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    koord = nt.nodes.new('ShaderNodeTexCoord')
    pisah = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.08
    ramp.color_ramp.elements[0].color = (0.08, 0.24, 0.86, 1)
    ramp.color_ramp.elements[1].position = 0.95
    ramp.color_ramp.elements[1].color = (0.12, 0.72, 1.0, 1)
    # koordinat dunia: gradien menyapu seluruh glyph secara diagonal,
    # bukan diulang pada tiap potongan garisnya
    tambah = nt.nodes.new('ShaderNodeMath')
    tambah.operation = 'ADD'
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    nt.links.new(geo.outputs['Position'], pisah.inputs['Vector'])
    nt.links.new(pisah.outputs['X'], tambah.inputs[0])
    nt.links.new(pisah.outputs['Y'], tambah.inputs[1])
    geser = nt.nodes.new('ShaderNodeMapRange')
    geser.inputs['From Min'].default_value = -0.75
    geser.inputs['From Max'].default_value = 0.75
    nt.links.new(tambah.outputs[0], geser.inputs['Value'])
    nt.links.new(geser.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = 0.24
    b.inputs['Roughness'].default_value = 0.22
    if 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = 1.0
        b.inputs['Coat Roughness'].default_value = 0.06
    return m


def bahan(nama, warna, kasar=0.4, logam=0.0, emisi=None, kuat=0.0, alpha=1.0,
          transmisi=0.0, coat=0.0):
    m = bpy.data.materials.new(nama)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = warna
    b.inputs['Roughness'].default_value = kasar
    b.inputs['Metallic'].default_value = logam
    b.inputs['Alpha'].default_value = alpha
    if 'Transmission Weight' in b.inputs:
        b.inputs['Transmission Weight'].default_value = transmisi
    if coat and 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = coat
    if emisi:
        b.inputs['Emission Color'].default_value = emisi
        b.inputs['Emission Strength'].default_value = kuat
    if alpha < 1:
        tembus(m)
    return m


def bahan_kaca_beku(nama='kaca_beku', warna=(0.78, 0.88, 1.0, 1), pantul=0.7, alfa_isi=0.58):
    """Kaca beku putih: separuh bening, separuh putih susu, pantulan Fresnel.
    Principled beralfa rendah tetap dirender pekat pada build ini, jadi
    disusun dari node Transparent / Diffuse / Glossy."""
    m = bpy.data.materials.new(nama)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    keluar = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    su = nt.nodes.new('ShaderNodeBsdfDiffuse')
    su.inputs['Color'].default_value = warna
    gl = nt.nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = 0.08
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.45
    m1 = nt.nodes.new('ShaderNodeMixShader')
    m1.inputs['Fac'].default_value = alfa_isi
    nt.links.new(tr.outputs[0], m1.inputs[1])
    nt.links.new(su.outputs[0], m1.inputs[2])
    kali = nt.nodes.new('ShaderNodeMath')
    kali.operation = 'MULTIPLY'
    kali.inputs[1].default_value = pantul
    nt.links.new(fr.outputs['Fac'], kali.inputs[0])
    m2 = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(kali.outputs[0], m2.inputs['Fac'])
    nt.links.new(m1.outputs[0], m2.inputs[1])
    nt.links.new(gl.outputs[0], m2.inputs[2])
    nt.links.new(m2.outputs[0], keluar.inputs['Surface'])
    tembus(m)
    return m


def lampu_studio(kuat=1.0, dunia_putih=0.9, kuat_dunia=0.9):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('dunia')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (dunia_putih, dunia_putih * 1.01, min(1, dunia_putih * 1.03), 1)
    bg.inputs[1].default_value = kuat_dunia

    def area(nama, lok, rot, ukuran, daya, warna=(1, 1, 1)):
        d = bpy.data.lights.new(nama, 'AREA')
        d.energy, d.size, d.color = daya * kuat, ukuran, warna
        o = bpy.data.objects.new(nama, d)
        o.location, o.rotation_euler = lok, rot
        sc.collection.objects.link(o)

    area('kunci', (-3, -3, 5), (math.radians(40), 0, math.radians(-45)), 4, 900)
    area('isi', (4, -2, 3), (math.radians(60), 0, math.radians(60)), 5, 350, (0.9, 0.95, 1.0))
    area('tepi', (0, 4, 4), (math.radians(-45), 0, 0), 3, 500, (0.8, 0.9, 1.0))


def kamera_orto(skala, lok=(0, 0, 10), rot=(0, 0, 0)):
    d = bpy.data.cameras.new('kam')
    d.type = 'ORTHO'
    d.ortho_scale = skala
    o = bpy.data.objects.new('kam', d)
    o.location, o.rotation_euler = lok, rot
    bpy.context.scene.collection.objects.link(o)
    bpy.context.scene.camera = o
    return o


def kamera_persp(lok, lihat, lensa=50):
    d = bpy.data.cameras.new('kam')
    d.lens = lensa
    o = bpy.data.objects.new('kam', d)
    o.location = lok
    o.rotation_euler = (Vector(lihat) - Vector(lok)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.collection.objects.link(o)
    bpy.context.scene.camera = o
    return o


def render(berkas, w, h, transparan=True):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = transparan
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA' if transparan else 'RGB'
    sc.render.filepath = berkas
    bpy.ops.render.render(write_still=True)
    print('  tersimpan:', os.path.basename(berkas))


# ---------------------------------------------------------------- ikon
def impor_svg(isi):
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" '
           'fill="none" stroke="#000" stroke-width="1.8">%s</svg>' % isi)
    fd, jalur = tempfile.mkstemp(suffix='.svg')
    with os.fdopen(fd, 'w') as f:
        f.write(svg)
    sebelum = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=jalur)
    os.remove(jalur)
    return [o for o in bpy.data.objects if o not in sebelum and o.type == 'CURVE']


def satu_ikon(nama, spek, mat, mat_isi):
    for o in list(bpy.data.objects):
        if o.type in {'CURVE', 'MESH'}:
            bpy.data.objects.remove(o, do_unlink=True)

    garis = impor_svg(spek['g'])
    isi = impor_svg(spek['isi']) if spek.get('isi') else []
    semua = garis + isi
    if not semua:
        print('  LEWAT (kosong):', nama)
        return

    # skala: importer memakai satuan 1 px = 1/90 inci; ukur dari 24 satuan
    # viewBox agar ketebalan tabung sama untuk setiap ikon
    satu_px = 1.0 / 90 * 0.0254
    skala = 1.0 / (24 * satu_px)
    for o in semua:
        o.scale = (skala, skala, skala)

    for o in garis:
        c = o.data
        c.dimensions = '3D'
        c.fill_mode = 'FULL'
        c.bevel_depth = 0.9 * satu_px          # separuh stroke-width 1.8
        c.bevel_resolution = 6
        if hasattr(c, 'use_fill_caps'):
            c.use_fill_caps = True
        c.materials.clear()
        c.materials.append(mat)
    for o in isi:
        c = o.data
        c.dimensions = '2D'
        c.fill_mode = 'BOTH'
        c.extrude = 0.6 * satu_px
        c.bevel_depth = 0.25 * satu_px
        c.materials.clear()
        c.materials.append(mat_isi)

    # pusatkan menurut kotak batas gabungan
    bpy.context.view_layer.update()
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in semua:
        for v in o.bound_box:
            w = o.matrix_world @ Vector(v)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    tengah = (mn + mx) / 2
    for o in semua:
        o.location -= Vector((tengah.x, tengah.y, 0))

    print('  ukuran %s: %.2f x %.2f' % (nama, mx.x - mn.x, mx.y - mn.y))
    render(os.path.join(OUT, 'ikon', nama + '.png'), 192, 192)


def mode_ikon():
    bersihkan()
    sc = bpy.context.scene
    mesin(sc)
    lampu_studio(kuat=0.14, dunia_putih=0.85, kuat_dunia=0.18)
    # AgX meredam kejenuhan; ikon butuh biru merek yang tetap hidup
    sc.view_settings.view_transform = 'Standard'
    # sedikit miring agar tabung terasa bervolume, tapi glyph tetap terbaca
    kamera_orto(1.16, lok=(0, -3.5, 20), rot=(math.radians(10), 0, 0))
    os.makedirs(os.path.join(OUT, 'ikon'), exist_ok=True)
    mat = bahan_kilap_merek()
    mat_isi = bahan_kilap_merek('kilap_isi')
    pilih = [n for n in ARG.hanya.split(',') if n] or list(IKON)
    for nama in pilih:
        satu_ikon(nama, IKON[nama], mat, mat_isi)


# ================================================================ ornamen
def bola_kaca(lok, r, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=r, location=lok)
    o = bpy.context.object
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.append(mat)
    return o


def cincin(lok, r_besar, r_kecil, rot, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=r_besar, minor_radius=r_kecil,
                                     major_segments=128, minor_segments=32,
                                     location=lok, rotation=rot)
    o = bpy.context.object
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.append(mat)
    return o


def kapsul(lok, panjang, r, rot, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r, depth=panjang, location=lok,
                                        rotation=rot)
    badan = bpy.context.object
    bev = badan.modifiers.new('bulat', 'BEVEL')
    bev.width = r * 0.98
    bev.segments = 10
    bev.limit_method = 'NONE'
    for p in badan.data.polygons:
        p.use_smooth = True
    badan.data.materials.append(mat)
    return badan


def palang_medis(lok, ukuran, tebal, rot, mat):
    hasil = []
    for sx, sy in ((1, 0.32), (0.32, 1)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=lok, rotation=rot)
        o = bpy.context.object
        o.scale = (ukuran * sx, ukuran * sy, tebal)
        bev = o.modifiers.new('bev', 'BEVEL')
        bev.width = ukuran * 0.1
        bev.segments = 8
        o.data.materials.append(mat)
        hasil.append(o)
    return hasil


def heliks(lok, tinggi, putaran, r, n, mat_a, mat_b):
    """Heliks ganda bola-bola kecil — penanda 'medis' tanpa klise stetoskop."""
    for i in range(n):
        t = i / (n - 1)
        a = t * putaran * math.tau
        z = lok[2] + (t - 0.5) * tinggi
        for sisi, mat in ((0, mat_a), (math.pi, mat_b)):
            x = lok[0] + math.cos(a + sisi) * r
            y = lok[1] + math.sin(a + sisi) * r
            bola_kaca((x, y, z), r * 0.16, mat)


def lantai_putih(ukuran=40, z=0):
    bpy.ops.mesh.primitive_plane_add(size=ukuran, location=(0, 0, z))
    o = bpy.context.object
    o.data.materials.append(bahan('lantai', PUTIH, kasar=0.55))
    return o


def kapsul_dua_warna(lok, panjang, r, rot, mat_a, mat_b):
    """Pil medis dua warna: separuh keramik putih, separuh biru mengilap."""
    hasil = []
    for tanda, mat in ((-1, mat_a), (1, mat_b)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r, depth=panjang / 2,
                                            location=(0, 0, tanda * panjang / 4))
        o = bpy.context.object
        bev = o.modifiers.new('bulat', 'BEVEL')
        bev.width = r * 0.95
        bev.segments = 10
        bev.limit_method = 'NONE'
        for p in o.data.polygons:
            p.use_smooth = True
        o.data.materials.append(mat)
        hasil.append(o)
    bpy.ops.object.empty_add(location=lok, rotation=rot)
    poros = bpy.context.object
    for o in hasil:
        o.parent = poros
    return hasil


def mode_ornamen():
    """Ornamen dirender beralfa tanpa lantai: warna latar diatur CSS, jadi
    ornamen yang sama bisa dipakai di atas putih, gradien, maupun kaca."""
    os.makedirs(os.path.join(OUT, 'ornamen'), exist_ok=True)

    def adegan():
        bersihkan()
        sc = bpy.context.scene
        mesin(sc)
        sc.view_settings.view_transform = 'Standard'
        lampu_studio(kuat=0.32, dunia_putih=0.92, kuat_dunia=0.55)
        return dict(
            beku=bahan_kaca_beku(),
            kilap=bahan_kilap_merek(),
            putih=bahan('keramik', (0.93, 0.95, 0.98, 1), kasar=0.2, coat=1.0),
            cahaya=bahan('cahaya', (0, 0, 0, 1), emisi=CYAN, kuat=2.4),
        )

    # 1) komposisi hero: benda kaca & keramik melayang
    m = adegan()
    cincin((-3.5, 1.0, 0.4), 1.35, 0.15, (math.radians(70), 0, math.radians(20)), m['beku'])
    cincin((-3.5, 1.0, 0.4), 1.02, 0.045, (math.radians(70), 0, math.radians(20)), m['kilap'])
    bola_kaca((3.7, 1.8, 1.0), 0.95, m['beku'])
    bola_kaca((3.7, 1.8, 1.0), 0.42, m['kilap'])
    kapsul_dua_warna((4.5, -0.9, -0.7), 2.0, 0.34, (0, math.radians(60), math.radians(-30)),
                     m['putih'], m['kilap'])
    palang_medis((-1.3, 3.2, 1.7), 1.0, 0.28,
                 (math.radians(20), math.radians(-15), math.radians(12)), m['kilap'])
    bola_kaca((1.3, -1.3, -1.0), 0.3, m['kilap'])
    bola_kaca((-4.9, -1.4, -1.0), 0.45, m['putih'])
    heliks((0.6, 4.6, 0.4), 3.2, 1.6, 0.55, 18, m['kilap'], m['putih'])
    kamera_persp((0, -12, 3.4), (0, 1.2, 0.1), 42)
    render(os.path.join(OUT, 'ornamen', 'hero-latar.png'), 2400, 1200)

    # 2) ornamen lepas
    lepas = {
        'cincin': lambda m: (cincin((0, 0, 0), 1.3, 0.15, (math.radians(62), 0, math.radians(18)), m['beku']),
                             cincin((0, 0, 0), 0.98, 0.05, (math.radians(62), 0, math.radians(18)), m['kilap'])),
        'bola':   lambda m: (bola_kaca((0, 0, 0), 1.2, m['beku']), bola_kaca((0, 0, 0), 0.55, m['kilap'])),
        'kapsul': lambda m: kapsul_dua_warna((0, 0, 0), 2.8, 0.52,
                                             (0, math.radians(58), math.radians(-24)), m['putih'], m['kilap']),
        'palang': lambda m: palang_medis((0, 0, 0), 1.6, 0.44,
                                         (math.radians(24), math.radians(-18), math.radians(10)), m['kilap']),
        'heliks': lambda m: heliks((0, 0, 0), 3.4, 1.5, 0.62, 20, m['kilap'], m['putih']),
    }
    for nama, bangun in lepas.items():
        m = adegan()
        bangun(m)
        kamera_persp((0, -7.5, 1.6), (0, 0, 0), 62)
        render(os.path.join(OUT, 'ornamen', nama + '.png'), 720, 720)


# ================================================================ pola kartu
def mode_pola():
    """Relief putih timbul dirender dari atas dengan cahaya menyamping —
    dipakai sebagai latar kartu dengan opasitas rendah."""
    os.makedirs(os.path.join(OUT, 'pola'), exist_ok=True)

    def adegan():
        bersihkan()
        sc = bpy.context.scene
        mesin(sc)
        w = bpy.data.worlds.new('d')
        sc.world = w
        w.use_nodes = True
        w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
        w.node_tree.nodes['Background'].inputs[1].default_value = 0.35
        d = bpy.data.lights.new('sisi', 'SUN')
        d.energy = 3.2
        d.angle = math.radians(4)
        o = bpy.data.objects.new('sisi', d)
        o.rotation_euler = (math.radians(62), 0, math.radians(-40))
        sc.collection.objects.link(o)
        bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
        dasar = bpy.context.object
        mat = bahan('putih_matte', (0.97, 0.98, 1.0, 1), kasar=0.7)
        dasar.data.materials.append(mat)
        kamera_orto(8, lok=(0, 0, 10))
        return mat

    def hex_prisma(x, y, r, h, mat):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=r, depth=h, location=(x, y, h / 2))
        o = bpy.context.object
        bev = o.modifiers.new('b', 'BEVEL')
        bev.width = r * 0.18
        bev.segments = 3
        o.data.materials.append(mat)

    # hex: sarang lebah timbul
    mat = adegan()
    r = 0.42
    for i in range(-12, 13):
        for j in range(-12, 13):
            x = i * r * 1.75 + (j % 2) * r * 0.875
            y = j * r * 1.52
            if abs(x) < 5 and abs(y) < 5:
                hex_prisma(x, y, r * 0.9, 0.06, mat)
    render(os.path.join(OUT, 'pola', 'hex.png'), 800, 800, transparan=False)

    # titik: matriks titik halus seperti panel pemindai
    mat = adegan()
    for i in range(-14, 15):
        for j in range(-14, 15):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=(i * 0.3, j * 0.3, 0),
                                                 segments=12, ring_count=8)
            bpy.context.object.data.materials.append(mat)
    render(os.path.join(OUT, 'pola', 'titik.png'), 800, 800, transparan=False)

    # gelombang: kontur seperti irisan topografi / gradien densitas
    mat = adegan()
    for k in range(-14, 15):
        kurva = bpy.data.curves.new('g%d' % k, 'CURVE')
        kurva.dimensions = '3D'
        kurva.bevel_depth = 0.03
        sp = kurva.splines.new('POLY')
        n = 90
        sp.points.add(n - 1)
        for i in range(n):
            x = -4.5 + 9 * i / (n - 1)
            y = k * 0.34 + 0.22 * math.sin(x * 1.3 + k * 0.4) + 0.12 * math.sin(x * 2.9 - k)
            sp.points[i].co = (x, y, 0.02, 1)
        ob = bpy.data.objects.new('g%d' % k, kurva)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(mat)
    render(os.path.join(OUT, 'pola', 'gelombang.png'), 800, 800, transparan=False)

    # lingkar: cincin konsentris seperti irisan CT aksial
    mat = adegan()
    for k in range(1, 16):
        bpy.ops.mesh.primitive_torus_add(major_radius=k * 0.3, minor_radius=0.022,
                                         major_segments=160, minor_segments=8, location=(1.6, -1.2, 0))
        bpy.context.object.data.materials.append(mat)
    render(os.path.join(OUT, 'pola', 'lingkar.png'), 800, 800, transparan=False)


# ================================================================
if ARG.mode in ('ikon', 'semua'):
    mode_ikon()
if ARG.mode in ('ornamen', 'semua'):
    mode_ornamen()
if ARG.mode in ('pola', 'semua'):
    mode_pola()
print('SELESAI kit mode=%s' % ARG.mode)
