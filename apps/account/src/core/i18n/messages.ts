// Every user-visible string, in ICU MessageFormat (STD-GLB-FE-009 §3.6). English is the source;
// every other locale is typed against its keys, so a missing translation is a compile error and
// the build fails on it. The shared pieces' strings come first, from @identity-experience/app-core,
// so this catalogue holds every key the page can render.

import { coreEn, coreId } from '@identity-experience/app-core/i18n';
import type { Locale } from '@identity-experience/app-core/preferences';

export type { Locale };

export const en = {
  ...coreEn,
  'app.name': 'Scnehaux Account',
  'app.environment.development': 'Development',

  'shell.nav.section.account': 'Your account',
  'shell.nav.security': 'Security',

  'security.eyebrow': 'Your account',
  'security.title': 'Security',
  'security.lead':
    'Where you are signed in, and how you sign in. Every change here is checked again by the Identity Control API and recorded.',
  'security.column.action': 'Action',
  'security.refused': 'Refused ({code}).',
  'security.unresolved':
    'Keycloak did not confirm it after every attempt. It is parked for an operator. Operation {id}.',
  'security.running': 'Accepted and still running. Read this page again in a moment.',

  'security.sessions.title': 'Where you are signed in',
  'security.sessions.description':
    'Each session, when it started and was last used, and the applications it is signed in to. Ending one stops its refresh at once; a page it already has keeps working for at most four minutes.',
  'security.sessions.started': 'Started',
  'security.sessions.lastAccess': 'Last used',
  'security.sessions.clients': 'Applications',
  'security.sessions.current': 'This browser',
  'security.sessions.end': 'End',
  'security.sessions.ended': 'Ended. That device signs in again to continue, within four minutes at most.',
  'security.sessions.endAll': 'Sign out everywhere',
  'security.sessions.endAll.title': 'Sign out everywhere, this browser included',
  'security.sessions.endAll.body':
    'Every session ends, including the one you are using now. You will be signed out here too and sign in again to continue.',
  'security.sessions.endAll.confirm': 'Sign out everywhere',

  'security.authenticators.title': 'How you sign in',
  'security.authenticators.description':
    'The authenticators enrolled on your account. Removing one needs a recent sign-in.',
  'security.authenticators.none': 'No authenticator is enrolled.',
  'security.authenticators.type': 'Type',
  'security.authenticators.label': 'Label',
  'security.authenticators.created': 'Enrolled',
  'security.authenticators.remove': 'Remove',
  'security.authenticators.remove.title': 'Remove this {type}',
  'security.authenticators.remove.body': 'It stops working at once. You can enroll it again later.',
  'security.authenticators.removed': 'Removed.',
  'security.authenticators.last':
    'Refused: this is your last way to sign in. Enrolling a replacement here is not available yet; ask your administrator.',
};

export type MessageKey = keyof typeof en;
export type Messages = Readonly<Record<MessageKey, string>>;

export const id: Messages = {
  ...coreId,
  'app.name': 'Akun Scnehaux',
  'app.environment.development': 'Development',

  'shell.nav.section.account': 'Akunmu',
  'shell.nav.security': 'Keamanan',

  'security.eyebrow': 'Akunmu',
  'security.title': 'Keamanan',
  'security.lead':
    'Di mana kamu sedang login, dan bagaimana kamu login. Setiap perubahan di sini diperiksa ulang oleh Identity Control API dan dicatat.',
  'security.column.action': 'Aksi',
  'security.refused': 'Ditolak ({code}).',
  'security.unresolved':
    'Keycloak tidak mengonfirmasi setelah semua percobaan. Perintah ini diparkir untuk operator. Operasi {id}.',
  'security.running': 'Diterima dan masih berjalan. Baca halaman ini lagi sebentar lagi.',

  'security.sessions.title': 'Di mana kamu sedang login',
  'security.sessions.description':
    'Setiap sesi, kapan mulai dan terakhir dipakai, dan aplikasi yang login lewat sesi itu. Mengakhiri satu sesi langsung menghentikan refresh-nya; halaman yang sudah terbuka masih jalan paling lama empat menit.',
  'security.sessions.started': 'Mulai',
  'security.sessions.lastAccess': 'Terakhir dipakai',
  'security.sessions.clients': 'Aplikasi',
  'security.sessions.current': 'Browser ini',
  'security.sessions.end': 'Akhiri',
  'security.sessions.ended':
    'Diakhiri. Perangkat itu harus login lagi untuk lanjut, paling lama dalam empat menit.',
  'security.sessions.endAll': 'Keluar dari semua perangkat',
  'security.sessions.endAll.title': 'Keluar dari semua perangkat, termasuk browser ini',
  'security.sessions.endAll.body':
    'Semua sesi berakhir, termasuk yang sedang kamu pakai. Kamu juga akan keluar di sini dan perlu login lagi untuk lanjut.',
  'security.sessions.endAll.confirm': 'Keluar dari semua perangkat',

  'security.authenticators.title': 'Cara kamu login',
  'security.authenticators.description':
    'Authenticator yang terdaftar di akunmu. Menghapus satu butuh login yang baru.',
  'security.authenticators.none': 'Tidak ada authenticator yang terdaftar.',
  'security.authenticators.type': 'Jenis',
  'security.authenticators.label': 'Label',
  'security.authenticators.created': 'Didaftarkan',
  'security.authenticators.remove': 'Hapus',
  'security.authenticators.remove.title': 'Hapus {type} ini',
  'security.authenticators.remove.body': 'Langsung berhenti berfungsi. Kamu bisa mendaftarkannya lagi nanti.',
  'security.authenticators.removed': 'Dihapus.',
  'security.authenticators.last':
    'Ditolak: ini cara login terakhirmu. Mendaftarkan pengganti di sini belum tersedia; hubungi administratormu.',
};

export const messages: Readonly<Record<Locale, Messages>> = { en, id };
