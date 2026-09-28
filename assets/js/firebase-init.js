/* ==========================================================
   MEDIVOX — jembatan Firebase
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
  'auth/invalid-email': 'That email address is not valid.',
  'auth/missing-password': 'Please enter a password.',
  'auth/weak-password': 'That password is too weak: use at least 6 characters.',
  'auth/email-already-in-use': 'This email is already registered. Please sign in.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-login-credentials': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account is registered with this email.',
  'auth/too-many-requests': 'Too many attempts. Please try again in a moment.',
  'auth/network-request-failed': 'Could not connect to the network.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/popup-blocked': 'The browser blocked the sign-in window. Allow pop-ups for this site.',
  'auth/operation-not-allowed':
    'This sign-in method is not enabled in the Firebase project. ' +
    'Enable it in Firebase Console → Authentication → Sign-in method.',
  'auth/unauthorized-domain':
    'This domain is not authorised in Firebase Console → Authentication → Settings → Authorized domains.',
  'permission-denied': 'Access denied by the Firestore security rules.',
  'unavailable': 'The Firestore service cannot be reached right now.'
};
function pesanGalat(err) {
  const kode = (err && (err.code || err.message)) || '';
  return PESAN[kode] || (err && err.message) || 'An unknown error occurred.';
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
    const u = auth.currentUser; if (!u) throw new Error('Not signed in');
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
    const u = auth.currentUser; if (!u) throw new Error('Not signed in');
    await setDoc(doc(db, 'users', u.uid, 'reports', studyId), {
      studyId,
      clinical: data.clinical || '',
      findings: data.findings || '',
      impression: data.impression || '',
      status: data.status || 'Draf',
      patient: data.patient || '',
      by: u.displayName || u.email || 'User',
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
