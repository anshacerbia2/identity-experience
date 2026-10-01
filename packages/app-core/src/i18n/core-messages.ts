import type { Locale } from '../preferences/preferences-store';

// The strings the shared pieces of this package render (STD-GLB-FE-009 §3.6). An application's
// catalogue spreads these into its own, so one IntlProvider serves both, and its keys are typed
// against these: a missing translation here is a compile error in every application.

export const coreEn = {
  'app.skipToContent': 'Skip to content',
  'shell.session.checking': 'Checking session',
  'shell.session.unavailable': 'Session unavailable',
  'shell.session.signIn': 'Sign in',
  'shell.session.signOut': 'Sign out',
  'shell.session.signedIn': 'Signed in',
  'shell.session.signInFailed':
    'Sign-in did not complete. Try again; if it keeps failing, the reason is in the service log.',
  'shell.session.signInUnavailable':
    'Keycloak could not be reached, so sign-in did not complete. Nothing was refused: try again in a moment.',
  'shell.theme.toDark': 'Switch to dark theme',
  'shell.theme.toLight': 'Switch to light theme',
  'shell.locale.label': 'Language',
  'session.required.title': 'Sign in to continue',
  'session.required.body':
    'This page reads the Identity Control API on your behalf, so it needs a signed-in session.',
  'api.error.title': 'The request did not complete',
  'api.error.forbidden': 'Your session is not allowed to read this.',
  'api.error.notFound': 'Nothing exists at this address.',
  'api.error.unavailable': 'The Identity Control API did not answer. Try again in a moment.',
  'api.error.other': 'The request failed with status {status}.',
  'api.error.correlation': 'Reference: {id}',
  'api.retry': 'Try again',
  'api.refused': 'The Identity Control API refused this.',
  'api.said': 'The API said: {detail}',
  'form.reason.label': 'Reason',
  'form.reason.hint': 'Recorded with the action. At least {min, number} characters.',
  'form.reason.short': 'Write at least {min, number} characters: the reason is the record of why.',
  'form.reason.long': 'Keep it to {max, number} characters.',
  'form.reason.characters':
    'Use letters, digits and common punctuation only. The reason travels in a request header, which cannot carry other characters.',
  'registrations.state.pending': 'Pending',
  'registrations.state.active': 'Active',
  'registrations.state.suspended': 'Suspended',
  'registrations.state.retired': 'Retired',
  'registrations.profile.confidential': 'Confidential',
  'registrations.profile.public': 'Public',
  'registrations.profile.workload': 'Workload',
  'registrations.profile.resource': 'Resource',
} as const;

export type CoreMessageKey = keyof typeof coreEn;
export type CoreMessages = Readonly<Record<CoreMessageKey, string>>;

export const coreId: CoreMessages = {
  'app.skipToContent': 'Langsung ke konten',
  'shell.session.checking': 'Memeriksa sesi',
  'shell.session.unavailable': 'Sesi tidak tersedia',
  'shell.session.signIn': 'Masuk',
  'shell.session.signOut': 'Keluar',
  'shell.session.signedIn': 'Sudah masuk',
  'shell.session.signInFailed':
    'Proses masuk tidak selesai. Coba lagi; kalau terus gagal, alasannya ada di log layanan.',
  'shell.session.signInUnavailable':
    'Keycloak tidak bisa dihubungi, jadi proses masuk tidak selesai. Tidak ada yang ditolak: coba lagi sebentar lagi.',
  'shell.theme.toDark': 'Ganti ke tema gelap',
  'shell.theme.toLight': 'Ganti ke tema terang',
  'shell.locale.label': 'Bahasa',
  'session.required.title': 'Masuk untuk melanjutkan',
  'session.required.body':
    'Halaman ini membaca Identity Control API atas namamu, jadi perlu sesi yang sudah masuk.',
  'api.error.title': 'Permintaan tidak selesai',
  'api.error.forbidden': 'Sesimu tidak diizinkan membaca ini.',
  'api.error.notFound': 'Tidak ada data di alamat ini.',
  'api.error.unavailable': 'Identity Control API tidak menjawab. Coba lagi sebentar lagi.',
  'api.error.other': 'Permintaan gagal dengan status {status}.',
  'api.error.correlation': 'Referensi: {id}',
  'api.retry': 'Coba lagi',
  'api.refused': 'Identity Control API menolak ini.',
  'api.said': 'Kata API: {detail}',
  'form.reason.label': 'Alasan',
  'form.reason.hint': 'Dicatat bersama tindakan ini. Minimal {min, number} karakter.',
  'form.reason.short': 'Tulis minimal {min, number} karakter: alasan adalah catatan kenapa ini dilakukan.',
  'form.reason.long': 'Maksimal {max, number} karakter.',
  'form.reason.characters':
    'Gunakan huruf, angka, dan tanda baca umum saja. Alasan dikirim lewat header permintaan, yang tidak bisa membawa karakter lain.',
  'registrations.state.pending': 'Menunggu',
  'registrations.state.active': 'Aktif',
  'registrations.state.suspended': 'Ditangguhkan',
  'registrations.state.retired': 'Pensiun',
  'registrations.profile.confidential': 'Rahasia',
  'registrations.profile.public': 'Publik',
  'registrations.profile.workload': 'Workload',
  'registrations.profile.resource': 'Resource',
};

export const coreMessages: Readonly<Record<Locale, CoreMessages>> = { en: coreEn, id: coreId };
