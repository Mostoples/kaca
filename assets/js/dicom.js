/* ==========================================================
   KACA — Parser DICOM Part-10 (vanilla JS, tanpa dependensi)
   ----------------------------------------------------------
   Mendukung:
     - Preamble 128 byte + magic "DICM" (dan file tanpa preamble)
     - Meta group (0002,xxxx) Explicit VR Little Endian
     - Dataset: Implicit VR LE, Explicit VR LE, Explicit VR BE
     - Deflated Explicit VR LE lewat DICOM.parseAsync()
     - Sequence (SQ) dengan panjang eksplisit maupun undefined
     - Pixel data native 8/16 bit, signed/unsigned, multi-frame
     - MONOCHROME1 / MONOCHROME2 / RGB (planar & interleaved) /
       PALETTE COLOR dengan LUT 8 maupun 16 bit
     - Pixel data terenkapsulasi JPEG baseline (didekode peramban
       lewat <img>); JPEG 2000 / JPEG-LS / RLE dikenali dan ditandai
       perlu dekoder tambahan, bukan dirender sebagai sampah
   ========================================================== */
(function (global) {
  'use strict';

  /* ---------- kamus tag (subset yang dipakai UI) ---------- */
  var DICT = {
    '00020010': ['UI', 'TransferSyntaxUID'],
    '00080005': ['CS', 'SpecificCharacterSet'],
    '00080008': ['CS', 'ImageType'],
    '00080016': ['UI', 'SOPClassUID'],
    '00080018': ['UI', 'SOPInstanceUID'],
    '00080020': ['DA', 'StudyDate'],
    '00080021': ['DA', 'SeriesDate'],
    '00080030': ['TM', 'StudyTime'],
    '00080050': ['SH', 'AccessionNumber'],
    '00080060': ['CS', 'Modality'],
    '00080070': ['LO', 'Manufacturer'],
    '00080080': ['LO', 'InstitutionName'],
    '00081010': ['SH', 'StationName'],
    '00081030': ['LO', 'StudyDescription'],
    '0008103E': ['LO', 'SeriesDescription'],
    '00081090': ['LO', 'ManufacturerModelName'],
    '00100010': ['PN', 'PatientName'],
    '00100020': ['LO', 'PatientID'],
    '00100030': ['DA', 'PatientBirthDate'],
    '00100040': ['CS', 'PatientSex'],
    '00101010': ['AS', 'PatientAge'],
    '00101030': ['DS', 'PatientWeight'],
    '00180015': ['CS', 'BodyPartExamined'],
    '00180050': ['DS', 'SliceThickness'],
    '00180088': ['DS', 'SpacingBetweenSlices'],
    '00180060': ['DS', 'KVP'],
    '00180080': ['DS', 'RepetitionTime'],
    '00180081': ['DS', 'EchoTime'],
    '00181030': ['LO', 'ProtocolName'],
    '00181100': ['DS', 'ReconstructionDiameter'],
    '00181151': ['IS', 'XRayTubeCurrent'],
    '00181160': ['SH', 'FilterType'],
    '00185101': ['CS', 'ViewPosition'],
    '0020000D': ['UI', 'StudyInstanceUID'],
    '0020000E': ['UI', 'SeriesInstanceUID'],
    '00200010': ['SH', 'StudyID'],
    '00200011': ['IS', 'SeriesNumber'],
    '00200013': ['IS', 'InstanceNumber'],
    '00200032': ['DS', 'ImagePositionPatient'],
    '00200037': ['DS', 'ImageOrientationPatient'],
    '00201041': ['DS', 'SliceLocation'],
    '00280002': ['US', 'SamplesPerPixel'],
    '00280004': ['CS', 'PhotometricInterpretation'],
    '00280006': ['US', 'PlanarConfiguration'],
    '00280008': ['IS', 'NumberOfFrames'],
    '00280010': ['US', 'Rows'],
    '00280011': ['US', 'Columns'],
    '00280030': ['DS', 'PixelSpacing'],
    '00280100': ['US', 'BitsAllocated'],
    '00280101': ['US', 'BitsStored'],
    '00280102': ['US', 'HighBit'],
    '00280103': ['US', 'PixelRepresentation'],
    '00281050': ['DS', 'WindowCenter'],
    '00281051': ['DS', 'WindowWidth'],
    '00281052': ['DS', 'RescaleIntercept'],
    '00281053': ['DS', 'RescaleSlope'],
    '00281054': ['LO', 'RescaleType'],
    '00281101': ['US', 'RedPaletteColorLookupTableDescriptor'],
    '00281102': ['US', 'GreenPaletteColorLookupTableDescriptor'],
    '00281103': ['US', 'BluePaletteColorLookupTableDescriptor'],
    '00281201': ['OW', 'RedPaletteColorLookupTableData'],
    '00281202': ['OW', 'GreenPaletteColorLookupTableData'],
    '00281203': ['OW', 'BluePaletteColorLookupTableData'],
    '00082111': ['ST', 'DerivationDescription'],
    '7FE00010': ['OW', 'PixelData'],

    /* Sequence yang umum dijumpai. Pada Implicit VR, VR tidak ada di
       berkas — tanpa entri ini isi sequence akan dibaca seolah elemen
       tingkat atas dan mengacaukan dataset. */
    '00080096': ['SQ', 'ReferringPhysicianIdentificationSequence'],
    '00081032': ['SQ', 'ProcedureCodeSequence'],
    '00081110': ['SQ', 'ReferencedStudySequence'],
    '00081111': ['SQ', 'ReferencedPerformedProcedureStepSequence'],
    '00081115': ['SQ', 'ReferencedSeriesSequence'],
    '00081120': ['SQ', 'ReferencedPatientSequence'],
    '00081140': ['SQ', 'ReferencedImageSequence'],
    '00081250': ['SQ', 'AlternateRepresentationSequence'],
    '00082112': ['SQ', 'SourceImageSequence'],
    '00082218': ['SQ', 'AnatomicRegionSequence'],
    '00089092': ['SQ', 'ReferencedImageEvidenceSequence'],
    '00089215': ['SQ', 'DerivationCodeSequence'],
    '00186011': ['SQ', 'SequenceOfUltrasoundRegions'],
    '00189152': ['SQ', 'MRImagingModifierSequence'],
    '00283010': ['SQ', 'VOILUTSequence'],
    '00289132': ['SQ', 'FrameVOILUTSequence'],
    '00321064': ['SQ', 'RequestedProcedureCodeSequence'],
    '00400260': ['SQ', 'PerformedProtocolCodeSequence'],
    '00400275': ['SQ', 'RequestAttributesSequence'],
    '00400555': ['SQ', 'AcquisitionContextSequence'],
    '00400008': ['SQ', 'ScheduledProtocolCodeSequence'],
    '52009229': ['SQ', 'SharedFunctionalGroupsSequence'],
    '52009230': ['SQ', 'PerFrameFunctionalGroupsSequence']
  };

  /* VR dengan header 12 byte pada Explicit VR */
  var VR_LONG = { OB: 1, OW: 1, OF: 1, OD: 1, OL: 1, OV: 1, SQ: 1, UT: 1, UN: 1, UC: 1, UR: 1, SV: 1, UV: 1 };
  /* VR bernilai string */
  var VR_STR = { AE:1, AS:1, CS:1, DA:1, DS:1, DT:1, IS:1, LO:1, LT:1, PN:1, SH:1, ST:1, TM:1, UC:1, UI:1, UR:1, UT:1 };

  var TS = {
    IMPLICIT_LE: '1.2.840.10008.1.2',
    EXPLICIT_LE: '1.2.840.10008.1.2.1',
    DEFLATE_LE:  '1.2.840.10008.1.2.1.99',
    EXPLICIT_BE: '1.2.840.10008.1.2.2'
  };
  var ENCAPSULATED = {
    '1.2.840.10008.1.2.4.50': 'image/jpeg',   // JPEG Baseline  → bisa didekode browser
    '1.2.840.10008.1.2.4.51': 'image/jpeg',   // JPEG Extended
    '1.2.840.10008.1.2.4.57': null,           // JPEG Lossless
    '1.2.840.10008.1.2.4.70': null,           // JPEG Lossless SV1
    '1.2.840.10008.1.2.4.80': null,           // JPEG-LS Lossless
    '1.2.840.10008.1.2.4.81': null,           // JPEG-LS Lossy
    '1.2.840.10008.1.2.4.90': null,           // JPEG 2000 Lossless
    '1.2.840.10008.1.2.4.91': null,           // JPEG 2000
    '1.2.840.10008.1.2.5':    null,           // RLE
    '1.2.840.10008.1.2.4.201': null,          // HTJ2K Lossless
    '1.2.840.10008.1.2.4.202': null,          // HTJ2K Lossless RPCL
    '1.2.840.10008.1.2.4.203': null,          // HTJ2K
    /* Deflated Image Frame Compression — jangan tertukar dengan
       Deflated Explicit VR LE (…1.2.1.99) yang DIDUKUNG lewat
       parseAsync(). Yang ini men-deflate tiap frame di dalam pixel
       data terenkapsulasi, bukan seluruh dataset. */
    '1.2.840.10008.1.2.8.1':  null
  };

  function pad4(n) { var s = n.toString(16).toUpperCase(); return '00000000'.slice(s.length) + s; }
  function tagKey(group, elem) { return pad4(group).slice(4) + pad4(elem).slice(4); }

  /* ---------- reader ---------- */
  function Reader(buf, littleEndian) {
    this.dv = new DataView(buf);
    this.buf = buf;
    this.pos = 0;
    this.le = littleEndian !== false;
    this.len = buf.byteLength;
  }
  Reader.prototype.u16 = function () { var v = this.dv.getUint16(this.pos, this.le); this.pos += 2; return v; };
  Reader.prototype.u32 = function () { var v = this.dv.getUint32(this.pos, this.le); this.pos += 4; return v; };
  Reader.prototype.str = function (n) {
    var s = '', b = new Uint8Array(this.buf, this.pos, n);
    for (var i = 0; i < n; i++) s += String.fromCharCode(b[i]);
    this.pos += n;
    return s;
  };

  /* ---------- parse dataset ---------- */
  function parseDataset(r, explicit, endAt, out, depth, sampaiItemDelim) {
    while (r.pos + 8 <= endAt) {
      var awal = r.pos;
      var group = r.u16(), elem = r.u16();

      /* Item dan delimiter memakai bentuk tag + panjang 4 byte tanpa VR,
         bahkan pada dataset Explicit VR. Penanganannya HARUS dipisahkan
         dari elemen biasa: satu sequence berisi banyak item, masing-masing
         diakhiri Item Delimitation, jadi berhenti di delimiter pertama
         membuat pembacaan kehilangan sinkron dan sisa berkas jadi sampah. */
      if (group === 0xFFFE) {
        r.u32();                                  /* panjang; tidak dipakai di sini */
        if (elem === 0xE00D) {                    /* Item Delimitation */
          if (sampaiItemDelim) return;            /* akhir item tanpa panjang tetap */
          continue;
        }
        /* Sequence Delimitation atau awal Item di tempat yang tidak
           diharapkan: serahkan ke bacaSequence dengan memundurkan posisi */
        r.pos = awal;
        return;
      }

      var key = tagKey(group, elem), vr, vlen;

      if (explicit) {
        vr = r.str(2);
        if (VR_LONG[vr]) { r.pos += 2; vlen = r.u32(); }
        else { vlen = r.u16(); }
        if (!/^[A-Z]{2}$/.test(vr)) { vr = (DICT[key] && DICT[key][0]) || 'UN'; }
      } else {
        /* Implicit VR: berkas tidak menyimpan VR, jadi VR diambil dari
           kamus. Tag yang tidak dikenal jadi 'UN' dan dilewati apa adanya. */
        vlen = r.u32();
        vr = (DICT[key] && DICT[key][0]) || 'UN';
      }

      /* PixelData terenkapsulasi (undefined length) */
      if (key === '7FE00010' && vlen === 0xFFFFFFFF) {
        var frags = readFragments(r, endAt);
        out.set(key, { vr: vr, offset: 0, length: 0, encapsulated: true, fragments: frags });
        continue;
      }

      if (vr === 'SQ' || (vlen === 0xFFFFFFFF && vr !== 'OB' && vr !== 'OW')) {
        bacaSequence(r, explicit, vlen, endAt, out, depth);
        continue;
      }

      if (vlen === 0xFFFFFFFF || r.pos + vlen > endAt) vlen = Math.max(0, endAt - r.pos);

      /* Isi sequence ikut dicatat supaya terlihat di inspektur tag, tetapi
         tidak boleh menimpa elemen tingkat atas dengan nama yang sama —
         misalnya SOPInstanceUID milik ReferencedImageSequence. */
      if (depth === 0 || !out.has(key)) {
        out.set(key, { vr: vr, offset: r.pos, length: vlen, le: r.le, depth: depth });
      }
      r.pos += vlen + (vlen % 2);   /* panjang DICOM selalu genap; jaga-jaga file rusak */
    }
  }

  /* ----------------------------------------------------------
     Sequence (SQ)
     ----------------------------------------------------------
     Sebuah sequence berisi nol atau lebih Item (FFFE,E000). Baik
     sequence-nya maupun tiap item bisa berpanjang tetap ATAU tanpa
     panjang; keempat kombinasinya sah dan semuanya ditemui di berkas
     nyata. Isi item dicatat ke peta yang sama supaya terlihat di
     inspektur tag, tanpa menimpa elemen tingkat atas.
     ---------------------------------------------------------- */
  function bacaSequence(r, explicit, vlen, endAt, out, depth) {
    var takTentu = vlen === 0xFFFFFFFF;
    var seqEnd = takTentu ? endAt : Math.min(r.pos + vlen, endAt);

    if (depth >= 6) { r.pos = seqEnd; return; }     /* terlalu bersarang: lewati */

    while (r.pos + 8 <= seqEnd) {
      var g = r.u16(), e = r.u16(), l = r.u32();
      if (g !== 0xFFFE) { r.pos -= 8; break; }      /* rusak: serahkan ke pemanggil */
      if (e === 0xE0DD) {                            /* Sequence Delimitation */
        if (!takTentu) r.pos = seqEnd;
        return;
      }
      if (e !== 0xE000) continue;                    /* tag FFFE lain: abaikan */

      if (l === 0xFFFFFFFF) {
        parseDataset(r, explicit, seqEnd, out, depth + 1, true);
      } else {
        var akhirItem = Math.min(r.pos + l, seqEnd);
        parseDataset(r, explicit, akhirItem, out, depth + 1, false);
        r.pos = akhirItem;
      }
    }
    if (!takTentu) r.pos = seqEnd;
  }

  function readFragments(r, endAt) {
    var frags = [], itemIndex = 0;
    while (r.pos + 8 <= endAt) {
      var g = r.u16(), e = r.u16(), l = r.u32();
      if (g !== 0xFFFE) break;
      if (e === 0xE0DD) break;                    // Sequence Delimitation Item
      if (l === 0xFFFFFFFF) break;
      /* item ke-0 selalu Basic Offset Table, bukan data piksel */
      if (itemIndex > 0) frags.push({ offset: r.pos, length: l });
      itemIndex++;
      r.pos += l;
    }
    return frags;
  }

  /* ---------- DataSet wrapper ---------- */
  function DataSet(buf, elements, ts) {
    this.buffer = buf;
    this.elements = elements;
    this.transferSyntax = ts;
  }
  DataSet.prototype.raw = function (tag) { return this.elements.get(tag) || null; };
  DataSet.prototype.has = function (tag) { return this.elements.has(tag); };

  DataSet.prototype.string = function (tag, idx) {
    var el = this.elements.get(tag);
    if (!el || !el.length) return undefined;
    var b = new Uint8Array(this.buffer, el.offset, el.length), s = '';
    for (var i = 0; i < b.length; i++) { if (b[i] === 0) break; s += String.fromCharCode(b[i]); }
    s = s.replace(/\s+$/, '');
    if (idx === undefined) return s;
    return s.split('\\')[idx];
  };
  DataSet.prototype.uint16 = function (tag, i) {
    var el = this.elements.get(tag); if (!el || el.length < 2) return undefined;
    return new DataView(this.buffer).getUint16(el.offset + (i || 0) * 2, el.le !== false);
  };
  DataSet.prototype.int16 = function (tag, i) {
    var el = this.elements.get(tag); if (!el || el.length < 2) return undefined;
    return new DataView(this.buffer).getInt16(el.offset + (i || 0) * 2, el.le !== false);
  };
  DataSet.prototype.uint32 = function (tag, i) {
    var el = this.elements.get(tag); if (!el || el.length < 4) return undefined;
    return new DataView(this.buffer).getUint32(el.offset + (i || 0) * 4, el.le !== false);
  };
  DataSet.prototype.float = function (tag, i) {
    var el = this.elements.get(tag); if (!el) return undefined;
    if (el.vr === 'DS' || el.vr === 'IS' || VR_STR[el.vr]) {
      var v = this.string(tag, i || 0);
      var f = parseFloat(v); return isNaN(f) ? undefined : f;
    }
    if (el.vr === 'FL') return new DataView(this.buffer).getFloat32(el.offset + (i || 0) * 4, el.le !== false);
    if (el.vr === 'FD') return new DataView(this.buffer).getFloat64(el.offset + (i || 0) * 8, el.le !== false);
    if (el.vr === 'US') return this.uint16(tag, i);
    if (el.vr === 'SS') return this.int16(tag, i);
    if (el.vr === 'UL') return this.uint32(tag, i);
    var s = this.string(tag, i || 0); var n = parseFloat(s);
    return isNaN(n) ? undefined : n;
  };
  DataSet.prototype.int = function (tag, i) {
    var el = this.elements.get(tag); if (!el) return undefined;
    if (el.vr === 'US') return this.uint16(tag, i);
    if (el.vr === 'SS') return this.int16(tag, i);
    if (el.vr === 'UL') return this.uint32(tag, i);
    var f = this.float(tag, i); return f === undefined ? undefined : Math.round(f);
  };

  /* daftar semua tag untuk panel inspeksi */
  DataSet.prototype.list = function () {
    var self = this, out = [];
    this.elements.forEach(function (el, key) {
      var name = (DICT[key] && DICT[key][1]) || '';
      var val;
      if (key === '7FE00010') {
        val = el.encapsulated ? '<' + el.fragments.length + ' fragmen terenkapsulasi>' : '<' + el.length + ' byte>';
      } else if (el.length > 220) {
        val = '<' + el.length + ' byte>';
      } else if (VR_STR[el.vr] || el.vr === 'UN') {
        val = self.string(key) || '';
        if (/[\x00-\x08\x0e-\x1f]/.test(val)) val = '<biner ' + el.length + ' byte>';
      } else if (el.vr === 'US' || el.vr === 'SS' || el.vr === 'UL' || el.vr === 'SL' || el.vr === 'FL' || el.vr === 'FD') {
        var n = Math.min(8, Math.floor(el.length / (el.vr === 'FD' ? 8 : (el.vr === 'US' || el.vr === 'SS') ? 2 : 4))) || 1;
        var parts = [];
        for (var i = 0; i < n; i++) { var v = self.float(key, i); if (v !== undefined) parts.push(v); }
        val = parts.join('\\');
      } else {
        val = '<' + el.length + ' byte>';
      }
      out.push({
        tag: '(' + key.slice(0, 4) + ',' + key.slice(4) + ')',
        key: key, vr: el.vr, name: name, value: String(val)
      });
    });
    out.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    return out;
  };

  /* ---------- entry point ---------- */
  function parse(arrayBuffer, opts) {
    opts = opts || {};
    var r = new Reader(arrayBuffer, true);
    var elements = new Map();

    /* deteksi preamble */
    var hasMagic = false;
    if (arrayBuffer.byteLength > 132) {
      r.pos = 128;
      hasMagic = r.str(4) === 'DICM';
    }
    if (!hasMagic) {
      r.pos = 0;
      if (arrayBuffer.byteLength > 4 && r.str(4) === 'DICM') hasMagic = true;
      else r.pos = 0;
    }

    var ts = TS.IMPLICIT_LE;

    if (hasMagic) {
      /* meta group: selalu Explicit VR LE, panjang dari (0002,0000) */
      var metaEnd = r.len;
      var g = r.dv.getUint16(r.pos, true), e = r.dv.getUint16(r.pos + 2, true);
      if (g === 0x0002 && e === 0x0000) {
        /* (0002,0000) UL 4 → panjang sisa meta group setelah elemen ini */
        var glen = r.dv.getUint32(r.pos + 8, true);
        metaEnd = r.pos + 12 + glen;
      }
      parseDataset(r, true, Math.min(metaEnd, r.len), elements, 0);
      var tsRead = new DataSet(arrayBuffer, elements, ts).string('00020010');
      if (tsRead) ts = tsRead.replace(/[\0\s]+$/, '');
      r.pos = Math.min(metaEnd, r.len);
    } else {
      /* file tanpa header meta: tebak explicit vs implicit */
      var probe = new Reader(arrayBuffer, true);
      probe.pos = 4;
      var vrProbe = probe.str(2);
      ts = /^[A-Z]{2}$/.test(vrProbe) ? TS.EXPLICIT_LE : TS.IMPLICIT_LE;
      r.pos = 0;
    }

    var tsAsli = ts;
    if (opts.forceTS) ts = opts.forceTS;

    var dataStart = r.pos;

    /* Deflated Explicit VR LE: hanya meta group yang tidak terkompresi.
       Membaca sisanya sebagai dataset biasa hanya menghasilkan sampah,
       jadi berhenti di sini dan tandai supaya parseAsync bisa mengembangkannya. */
    if (ts === TS.DEFLATE_LE) {
      var dsDeflate = new DataSet(arrayBuffer, elements, ts);
      dsDeflate.deflated = true;
      dsDeflate.dataStart = dataStart;
      return dsDeflate;
    }

    var explicit = ts !== TS.IMPLICIT_LE;
    var bigEndian = ts === TS.EXPLICIT_BE;
    var dr = new Reader(arrayBuffer, !bigEndian);
    dr.pos = dataStart;
    parseDataset(dr, explicit, dr.len, elements, 0);

    var out = new DataSet(arrayBuffer, elements, ts);
    out.dataStart = dataStart;
    if (tsAsli !== ts) out.originalTransferSyntax = tsAsli;
    return out;
  }

  /* ==========================================================
     parseAsync — seperti parse(), tetapi mampu membuka berkas
     Deflated Explicit VR Little Endian (1.2.840.10008.1.2.1.99)
     memakai DecompressionStream milik peramban.

     Hasilnya adalah DataSet biasa di atas buffer yang sudah
     dikembangkan, sehingga pemanggil lain (dan parse() sinkron)
     bisa memakainya tanpa perlakuan khusus.
     ========================================================== */
  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('Peramban ini tidak menyediakan DecompressionStream.'));
    }
    function coba(format) {
      var aliran = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Response(aliran).arrayBuffer();
    }
    /* DICOM memakai deflate mentah (RFC 1951); sebagian encoder
       menambahkan bungkus zlib, jadi keduanya dicoba. */
    return coba('deflate-raw').catch(function () { return coba('deflate'); });
  }

  function parseAsync(arrayBuffer) {
    var ds;
    try { ds = parse(arrayBuffer); }
    catch (e) { return Promise.reject(e); }
    if (!ds.deflated) return Promise.resolve(ds);

    var mulai = ds.dataStart;
    return inflateRaw(new Uint8Array(arrayBuffer, mulai, arrayBuffer.byteLength - mulai))
      .then(function (kembang) {
        var gabung = new Uint8Array(mulai + kembang.byteLength);
        gabung.set(new Uint8Array(arrayBuffer, 0, mulai), 0);
        gabung.set(new Uint8Array(kembang), mulai);
        /* meta group tetap menyebut deflate, jadi transfer syntax dataset
           dipaksa ke Explicit VR LE — itulah isi sebenarnya setelah dibuka */
        return parse(gabung.buffer, { forceTS: TS.EXPLICIT_LE });
      });
  }

  /* ==========================================================
     Ekstraksi piksel → objek image siap render
     ========================================================== */
  function readPixels(ds, frame) {
    frame = frame || 0;
    if (ds.deflated) {
      throw new Error('Dataset masih terkompresi deflate — pakai DICOM.parseAsync() untuk membukanya.');
    }
    var rows = ds.int('00280010'), cols = ds.int('00280011');
    if (!rows || !cols) throw new Error('Dimensi gambar (Rows/Columns) tidak ditemukan.');

    var spp = ds.int('00280002') || 1;
    var bits = ds.int('00280100') || 16;
    var signed = (ds.int('00280103') || 0) === 1;
    var photo = (ds.string('00280004') || 'MONOCHROME2').trim().toUpperCase();
    var frames = parseInt(ds.string('00280008') || '1', 10) || 1;
    var el = ds.raw('7FE00010');
    if (!el) throw new Error('Pixel Data (7FE0,0010) tidak ada dalam file ini.');

    var img = {
      rows: rows, cols: cols, frames: frames, frame: frame,
      samplesPerPixel: spp, bitsAllocated: bits, signed: signed,
      photometric: photo,
      /* modalitas & Rescale Type ikut dibawa agar satuan nilai piksel
         bisa ditentukan per citra, bukan per studi */
      modality: (ds.string('00080060') || '').trim().toUpperCase(),
      rescaleType: (ds.string('00281054') || '').trim().toUpperCase(),
      planar: ds.int('00280006') || 0,
      slope: numOr(ds.float('00281053'), 1),
      intercept: numOr(ds.float('00281052'), 0),
      windowCenter: ds.float('00281050'),
      windowWidth: ds.float('00281051'),
      pixelSpacing: [numOr(ds.float('00280030', 0), 0), numOr(ds.float('00280030', 1), 0)],
      sliceThickness: ds.float('00180050'),
      /* geometri irisan — dipakai assets/js/volume.js untuk mengurutkan
         irisan dan menghitung jarak antar irisan */
      spacingBetweenSlices: ds.float('00180088'),
      sliceLocation: ds.float('00201041'),
      instanceNumber: ds.int('00200013'),
      imagePosition: ds.has('00200032')
        ? [ds.float('00200032', 0), ds.float('00200032', 1), ds.float('00200032', 2)] : null,
      imageOrientation: ds.has('00200037')
        ? [ds.float('00200037', 0), ds.float('00200037', 1), ds.float('00200037', 2),
           ds.float('00200037', 3), ds.float('00200037', 4), ds.float('00200037', 5)] : null,
      encapsulated: !!el.encapsulated,
      mime: null, blobBytes: null,
      pixels: null, min: 0, max: 0
    };

    /* --- terenkapsulasi (JPEG dkk) --- */
    if (el.encapsulated) {
      var mime = ENCAPSULATED[ds.transferSyntax];
      if (!mime) { img.unsupported = ds.transferSyntax; return img; }
      var fr = el.fragments[Math.min(frame, el.fragments.length - 1)] || el.fragments[0];
      if (!fr) { img.unsupported = ds.transferSyntax; return img; }
      img.mime = mime;
      img.blobBytes = new Uint8Array(ds.buffer, fr.offset, fr.length);
      return img;
    }

    /* --- native 1 bit (mis. objek Segmentation) ---
       Bit dikemas rapat dan mengalir menyambung antar frame, bukan
       dibulatkan ke batas byte per frame. Bit paling rendah lebih dulu. */
    if (bits === 1) {
      var n1 = rows * cols * spp;
      var bit = new Uint8Array(n1);
      var sumber = new Uint8Array(ds.buffer, el.offset, el.length);
      var bitAwal = frame * n1;
      for (var q = 0; q < n1; q++) {
        var b = bitAwal + q, bi = b >> 3;
        if (bi >= sumber.length) break;
        bit[q] = (sumber[bi] >> (b & 7)) & 1;
      }
      img.pixels = bit;
      img.min = 0; img.max = 1;
      img.windowWidth = 1; img.windowCenter = 0.5;
      return img;
    }

    /* --- native 8/16 bit --- */
    var frameSize = rows * cols * spp * (bits === 8 ? 1 : 2);
    var start = el.offset + frame * frameSize;
    if (start + frameSize > el.offset + el.length) {
      frameSize = Math.max(0, el.offset + el.length - start);
    }
    var le = el.le !== false;
    var n = rows * cols * spp;
    var arr;

    if (bits === 8) {
      arr = new Uint8Array(ds.buffer, start, Math.min(n, frameSize));
      if (signed) { var s8 = new Int8Array(ds.buffer, start, Math.min(n, frameSize)); arr = s8; }
    } else {
      var maxI = Math.min(n, Math.floor(frameSize / 2));
      if (le && start % 2 === 0 && maxI === n) {
        /* Jalur cepat: little endian dan offset sudah rata 2 byte, jadi
           buffer bisa dibaca langsung tanpa loop DataView per piksel. */
        arr = signed ? new Int16Array(ds.buffer, start, n) : new Uint16Array(ds.buffer, start, n);
      } else {
        var dv = new DataView(ds.buffer);
        arr = signed ? new Int16Array(n) : new Uint16Array(n);
        for (var i = 0; i < maxI; i++) {
          arr[i] = signed ? dv.getInt16(start + i * 2, le) : dv.getUint16(start + i * 2, le);
        }
      }
    }
    img.pixels = arr;

    /* --- PALETTE COLOR: LUT indeks → RGB --- */
    if (photo.indexOf('PALETTE') === 0) {
      img.palette = bacaPalet(ds);
      if (!img.palette) img.photometric = photo = 'MONOCHROME2';   /* LUT tidak lengkap */
    }

    /* min/max untuk auto-window */
    if (spp === 1) {
      var mn = Infinity, mx = -Infinity;
      for (var j = 0; j < arr.length; j++) { var v = arr[j]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mn === Infinity) { mn = 0; mx = 1; }
      img.min = mn * img.slope + img.intercept;
      img.max = mx * img.slope + img.intercept;
    } else {
      img.min = 0; img.max = 255;
    }
    if (img.windowWidth === undefined || !isFinite(img.windowWidth) || img.windowWidth <= 0) {
      img.windowWidth = Math.max(1, img.max - img.min);
      img.windowCenter = (img.max + img.min) / 2;
    }
    return img;
  }

  function numOr(v, d) { return (v === undefined || v === null || isNaN(v)) ? d : v; }

  /* ---------- Palette Color LUT ----------
     Descriptor (0028,110x) berisi tiga nilai: jumlah entri (0 berarti
     65536), nilai piksel pertama yang dipetakan, dan jumlah bit per
     entri (8 atau 16). Data LUT (0028,120x) dinormalkan ke 8 bit. */
  function bacaPalet(ds) {
    var desc = ds.raw('00281101');
    var rEl = ds.raw('00281201'), gEl = ds.raw('00281202'), bEl = ds.raw('00281203');
    if (!desc || !rEl || !gEl || !bEl) return null;

    var jumlah = ds.uint16('00281101', 0) || 65536;
    var pertama = numOr(ds.uint16('00281101', 1), 0);
    var bit = ds.uint16('00281101', 2) || 8;
    if (jumlah > 65536) return null;

    function kanal(el) {
      var out = new Uint8Array(jumlah);
      if (bit === 8 && el.length >= jumlah) {
        /* satu byte per entri */
        out.set(new Uint8Array(ds.buffer, el.offset, jumlah));
        return out;
      }
      var dv = new DataView(ds.buffer), le = el.le !== false;
      var maxI = Math.min(jumlah, Math.floor(el.length / 2));
      for (var i = 0; i < maxI; i++) {
        /* entri 16 bit: byte tinggi yang dipakai untuk tampilan 8 bit */
        out[i] = dv.getUint16(el.offset + i * 2, le) >> 8;
      }
      return out;
    }

    try {
      return { count: jumlah, first: pertama, bits: bit, r: kanal(rEl), g: kanal(gEl), b: kanal(bEl) };
    } catch (e) { return null; }
  }

  /* ==========================================================
     Render image → ImageData dengan window/level + LUT
     ========================================================== */
  function toImageData(img, opts) {
    opts = opts || {};
    var wc = opts.windowCenter !== undefined ? opts.windowCenter : img.windowCenter;
    var ww = opts.windowWidth !== undefined ? opts.windowWidth : img.windowWidth;
    var invert = !!opts.invert;
    if (img.photometric === 'MONOCHROME1') invert = !invert;

    var n = img.rows * img.cols;
    var out = new Uint8ClampedArray(n * 4);
    var px = img.pixels;

    /* PALETTE COLOR: nilai piksel adalah indeks LUT, bukan intensitas,
       jadi window/level tidak berlaku di sini. */
    if (img.palette && px) {
      var pal = img.palette, batas = pal.count - 1;
      for (var q = 0; q < n; q++) {
        var idx = (px[q] | 0) - pal.first;
        if (idx < 0) idx = 0; else if (idx > batas) idx = batas;
        var oq = q * 4;
        var pr = pal.r[idx], pg = pal.g[idx], pb = pal.b[idx];
        if (invert) { pr = 255 - pr; pg = 255 - pg; pb = 255 - pb; }
        out[oq] = pr; out[oq + 1] = pg; out[oq + 2] = pb; out[oq + 3] = 255;
      }
      return new ImageData(out, img.cols, img.rows);
    }

    if (img.samplesPerPixel === 3) {
      /* PlanarConfiguration = 1 berarti kanal tersimpan berurutan
         (RRR…GGG…BBB…), bukan berselang-seling per piksel. */
      var planar = (opts.planar !== undefined ? opts.planar : img.planar) === 1;
      for (var i = 0; i < n; i++) {
        var r, g, b;
        if (planar) { r = px[i]; g = px[n + i]; b = px[2 * n + i]; }
        else { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2]; }
        if (invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
        out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
      }
      return new ImageData(out, img.cols, img.rows);
    }

    var lo = wc - ww / 2, scale = 255 / (ww || 1);
    var slope = img.slope, inter = img.intercept;
    var cmap = opts.colormap && COLORMAPS[opts.colormap] ? COLORMAPS[opts.colormap] : null;

    for (var k = 0; k < n; k++) {
      var val = px[k] * slope + inter;
      var g2 = (val - lo) * scale;
      g2 = g2 < 0 ? 0 : g2 > 255 ? 255 : g2;
      if (invert) g2 = 255 - g2;
      var o = k * 4;
      if (cmap) {
        var c = cmap[g2 | 0];
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
      } else {
        out[o] = out[o + 1] = out[o + 2] = g2;
      }
      out[o + 3] = 255;
    }
    return new ImageData(out, img.cols, img.rows);
  }

  /* colormap sederhana (dibangun sekali) */
  function buildMap(fn) { var a = new Array(256); for (var i = 0; i < 256; i++) a[i] = fn(i / 255); return a; }
  var COLORMAPS = {
    hot: buildMap(function (t) {
      return [Math.min(255, t * 3 * 255), Math.min(255, Math.max(0, (t * 3 - 1)) * 255), Math.min(255, Math.max(0, (t * 3 - 2)) * 255)];
    }),
    jet: buildMap(function (t) {
      var r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3)));
      var g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2)));
      var b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1)));
      return [r * 255, g * 255, b * 255];
    }),
    bone: buildMap(function (t) { return [t * 233 + 12, t * 240 + 10, Math.min(255, t * 255 + 22)]; }),
    pet: buildMap(function (t) {
      return [Math.min(255, t * 2 * 255), Math.min(255, Math.max(0, t - .35) * 2.2 * 255), Math.min(255, Math.max(0, .5 - Math.abs(t - .25)) * 2 * 255)];
    })
  };

  /* ---------- util format ---------- */
  function formatPN(pn) {
    if (!pn) return '';
    var p = pn.split('^');
    return [p[1], p[0]].filter(Boolean).join(' ').trim() || pn.replace(/\^/g, ' ').trim();
  }
  function formatDA(da) {
    if (!da || da.length < 8) return da || '';
    return da.slice(6, 8) + '/' + da.slice(4, 6) + '/' + da.slice(0, 4);
  }
  function formatTM(tm) {
    if (!tm || tm.length < 4) return tm || '';
    return tm.slice(0, 2) + ':' + tm.slice(2, 4) + (tm.length >= 6 ? ':' + tm.slice(4, 6) : '');
  }

  global.DICOM = {
    parse: parse,
    parseAsync: parseAsync,
    readPixels: readPixels,
    toImageData: toImageData,
    colormaps: COLORMAPS,
    dict: DICT,
    formatPN: formatPN,
    formatDA: formatDA,
    formatTM: formatTM,
    TS: TS
  };
})(window);
