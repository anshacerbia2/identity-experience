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
  'security.authenticators.add': 'Add an authenticator app',
  'security.authenticators.addKey': 'Add a security key',
  'security.authenticators.addCodes': 'Get new recovery codes',
  'security.authenticators.codesLeft': '{remaining} of {total} codes left',
  'security.authenticators.codesUsed':
    'A recovery code was used to sign in. Get a new set of codes, and add another authenticator if one was lost.',
  'security.authenticators.enrolled': 'The authenticator is added. It now works at sign-in.',
  'security.authenticators.enrollCancelled': 'Nothing was added: the setup was cancelled.',
  'security.authenticators.last': 'Refused: this is your last way to sign in.',
  'security.authenticators.floor':
    'Refused: as a provider you keep a second factor. Add another authenticator app or security key first, then remove this one.',

  'security.addresses.title': 'Where you are told',
  'security.addresses.description':
    'When an authenticator is added or removed, recovery codes are issued or used, or an address changes, every address here is told. Keep at least two, so a change still reaches you if one is lost. Adding or removing one needs a recent sign-in.',
  'security.addresses.address': 'Address',
  'security.addresses.state': 'State',
  'security.addresses.active': 'In use',
  'security.addresses.pending': 'Waiting for its code',
  'security.addresses.code': 'Code sent to it',
  'security.addresses.verify': 'Confirm',
  'security.addresses.remove': 'Remove',
  'security.addresses.new': 'Another email address',
  'security.addresses.add': 'Add',
  'security.addresses.addSecond':
    'You have one address in use. Add a second, so a change to your account still reaches you if you lose access to the first.',
  'security.addresses.sent':
    'A code was sent to that address. Enter it next to the address to start using it.',
  'security.addresses.proven':
    'Confirmed. That address is now told about every change, and your other addresses were told it was added.',
  'security.addresses.removed': 'Removed. Every address you held, that one included, was told.',
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
  'security.authenticators.add': 'Tambah aplikasi authenticator',
  'security.authenticators.addKey': 'Tambah security key',
  'security.authenticators.addCodes': 'Buat recovery code baru',
  'security.authenticators.codesLeft': '{remaining} dari {total} kode tersisa',
  'security.authenticators.codesUsed':
    'Sebuah recovery code dipakai untuk login. Buat set kode baru, dan tambahkan authenticator lain kalau ada yang hilang.',
  'security.authenticators.enrolled': 'Authenticator ditambahkan. Sekarang berlaku saat login.',
  'security.authenticators.enrollCancelled': 'Tidak ada yang ditambahkan: pengaturannya dibatalkan.',
  'security.authenticators.last': 'Ditolak: ini cara login terakhirmu.',
  'security.authenticators.floor':
    'Ditolak: sebagai provider kamu wajib punya faktor kedua. Tambahkan aplikasi authenticator atau security key lain dulu, lalu hapus yang ini.',

  'security.addresses.title': 'Tempat kamu diberi tahu',
  'security.addresses.description':
    'Setiap kali authenticator ditambah atau dihapus, kode pemulihan diterbitkan atau dipakai, atau alamat berubah, semua alamat di sini diberi tahu. Simpan minimal dua, supaya perubahan tetap sampai kalau satu hilang. Menambah atau menghapus butuh login yang baru.',
  'security.addresses.address': 'Alamat',
  'security.addresses.state': 'Status',
  'security.addresses.active': 'Dipakai',
  'security.addresses.pending': 'Menunggu kodenya',
  'security.addresses.code': 'Kode yang dikirim ke sana',
  'security.addresses.verify': 'Konfirmasi',
  'security.addresses.remove': 'Hapus',
  'security.addresses.new': 'Alamat email lain',
  'security.addresses.add': 'Tambah',
  'security.addresses.addSecond':
    'Kamu baru punya satu alamat yang dipakai. Tambahkan alamat kedua, supaya perubahan di akunmu tetap sampai kalau kamu kehilangan akses ke yang pertama.',
  'security.addresses.sent':
    'Kode sudah dikirim ke alamat itu. Masukkan di samping alamatnya untuk mulai memakainya.',
  'security.addresses.proven':
    'Terkonfirmasi. Alamat itu sekarang diberi tahu setiap ada perubahan, dan alamatmu yang lain sudah diberi tahu bahwa alamat ini ditambahkan.',
  'security.addresses.removed': 'Dihapus. Semua alamatmu, termasuk yang dihapus, sudah diberi tahu.',
};

export const messages: Readonly<Record<Locale, Messages>> = { en, id };
