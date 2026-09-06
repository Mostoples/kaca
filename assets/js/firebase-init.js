/* ==========================================================
   KACA — jembatan Firebase
   ----------------------------------------------------------
   Berkas ini satu-satunya modul ES di proyek. Ia memuat SDK
   modular Firebase dari CDN lalu menyediakan API kecil di
   window.KFB agar skrip lain (yang bukan module) bisa memakainya.

   Halaman lain menunggu dengan:
     KFB.ready.then(function (fb) { ... })
   atau mendengar event 'kfb-ready' pada window.

   Data yang disimpan hanya status baca dan isi laporan.
   Piksel DICOM tidak pernah dikirim ke mana pun.
   ========================================================== */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut, updateProfile,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, deleteDoc,
  collection, getDocs, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAHpX3B68hK-EPtmjnyrWTKBUQhTAa7T98',
  authDomain: 'kaca-id.firebaseapp.com',
  projectId: 'kaca-id',
  storageBucket: 'kaca-id.firebasestorage.app',
  messagingSenderId: '321641992884',
  appId: '1:321641992884:web:ef2bf9681cb65c58e87de1'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* sesi bertahan di perangkat ini sampai pengguna keluar */
setPersistence(auth, browserLocalPersistence).catch(() => {});

/* ---------- pesan galat berbahasa Indonesia ---------- */
const PESAN = {
  'auth/invalid-email': 'Format alamat email tidak valid.',
  'auth/missing-password': 'Kata sandi belum diisi.',
  'auth/weak-password': 'Kata sandi terlalu lemah — minimal 6 karakter.',
  'auth/email-already-in-use': 'Email ini sudah terdaftar. Silakan masuk.',
  'auth/invalid-credential': 'Email atau kata sandi salah.',
  'auth/invalid-login-credentials': 'Email atau kata sandi salah.',
  'auth/wrong-password': 'Email atau kata sandi salah.',
  'auth/user-not-found': 'Akun dengan email ini belum terdaftar.',
  'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
  'auth/network-request-failed': 'Gagal terhubung ke jaringan.',
  'auth/popup-closed-by-user': 'Jendela masuk ditutup sebelum selesai.',
  'auth/popup-blocked': 'Jendela masuk diblokir peramban. Izinkan pop-up untuk situs ini.',
  'auth/operation-not-allowed':
    'Metode masuk ini belum diaktifkan pada project Firebase. ' +
    'Aktifkan di Firebase Console → Authentication → Sign-in method.',
  'auth/unauthorized-domain':
    'Domain ini belum diizinkan di Firebase Console → Authentication → Settings → Authorized domains.',
  'permission-denied': 'Akses ditolak oleh aturan keamanan Firestore.',
  'unavailable': 'Layanan Firestore sedang tidak dapat dijangkau.'
};
function pesanGalat(err) {
  const kode = (err && (err.code || err.message)) || '';
  return PESAN[kode] || (err && err.message) || 'Terjadi kesalahan yang tidak diketahui.';
}

/* ---------- API yang dipakai halaman lain ---------- */
const KFB = {
  app, auth, db,
  siap: false,
  user: null,
  pesanGalat,

  /* --- autentikasi --- */
  onUser(cb) { return onAuthStateChanged(auth, cb); },

  async masukEmail(email, sandi) {
    const c = await signInWithEmailAndPassword(auth, email, sandi);
    return c.user;
  },
  async daftarEmail(email, sandi, nama) {
    const c = await createUserWithEmailAndPassword(auth, email, sandi);
    if (nama) { try { await updateProfile(c.user, { displayName: nama }); } catch (e) {} }
    return c.user;
  },
  async masukGoogle() {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    const c = await signInWithPopup(auth, p);
    return c.user;
  },
  async resetSandi(email) { return sendPasswordResetEmail(auth, email); },
  async keluar() { return signOut(auth); },

  /* --- status baca worklist --- */
  async simpanStatus(studyId, status) {
    const u = auth.currentUser; if (!u) throw new Error('Belum masuk');
    await setDoc(doc(db, 'users', u.uid, 'worklist', studyId),
      { studyId, status, updatedAt: serverTimestamp() });
  },
  async ambilSemuaStatus() {
    const u = auth.currentUser; if (!u) return {};
    const snap = await getDocs(collection(db, 'users', u.uid, 'worklist'));
    const out = {};
    snap.forEach(d => { out[d.id] = d.data().status; });
    return out;
  },

  /* --- laporan --- */
  async simpanLaporan(studyId, data) {
    const u = auth.currentUser; if (!u) throw new Error('Belum masuk');
    await setDoc(doc(db, 'users', u.uid, 'reports', studyId), {
      studyId,
      clinical: data.clinical || '',
      findings: data.findings || '',
      impression: data.impression || '',
      status: data.status || 'Draf',
      patient: data.patient || '',
      by: u.displayName || u.email || 'Pengguna',
      updatedAt: serverTimestamp()
    });
  },
  async ambilLaporan(studyId) {
    const u = auth.currentUser; if (!u) return null;
    const s = await getDoc(doc(db, 'users', u.uid, 'reports', studyId));
    return s.exists() ? s.data() : null;
  },
  async hapusLaporan(studyId) {
    const u = auth.currentUser; if (!u) return;
    await deleteDoc(doc(db, 'users', u.uid, 'reports', studyId));
  }
};

/* Promise yang selesai begitu status auth pertama diketahui */
KFB.ready = new Promise((resolve) => {
  const stop = onAuthStateChanged(auth, (u) => {
    KFB.user = u;
    KFB.siap = true;
    stop();
    resolve(KFB);
    window.dispatchEvent(new CustomEvent('kfb-ready', { detail: KFB }));
  }, () => {
    KFB.siap = true;
    resolve(KFB);
    window.dispatchEvent(new CustomEvent('kfb-ready', { detail: KFB }));
  });
});

/* jaga KFB.user tetap mutakhir setelah siap */
onAuthStateChanged(auth, (u) => {
  KFB.user = u;
  window.dispatchEvent(new CustomEvent('kfb-user', { detail: u }));
});

window.KFB = KFB;
