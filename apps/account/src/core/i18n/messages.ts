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
  'shell.nav.consents': 'Consents',
  'shell.scope': 'Your own account',

  'consents.pageTitle': 'Consents',
  'consents.lead':
    'The applications run by partners that you allowed to act for you. An application Scnehaux runs itself does not ask: its registration is the consent.',
  'consents.title': 'Applications you allowed',
  'consents.description':
    'Withdrawing stops new access at once. Access an application already holds lasts until its token expires, at most the time shown.',
  'consents.none':
    'You have not allowed any application. Only an application a partner runs asks you, when you first sign in to it.',
  'consents.column.client': 'Application',
  'consents.column.scopes': 'What it may use',
  'consents.column.granted': 'Allowed on',
  'consents.column.lasts': 'Access it holds lasts',
  'consents.lasts': 'Up to {minutes, plural, one {# minute} other {# minutes}}',
  'consents.lasts.unbounded': 'Until its token expires',
  'consents.withdraw': 'Withdraw',
  'consents.withdraw.label': 'Withdraw your consent to {client}',
  'consents.withdrawn':
    'Consent to {client} withdrawn. It gets no new access, and access it already holds ends by {time} at the latest.',
  'consents.withdrawn.unbounded':
    'Consent to {client} withdrawn. It gets no new access, and access it already holds ends when its token expires.',

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
  'security.authenticators.last':
    'Refused: this is your last way to sign in. To replace it, add another one first, then remove this one.',
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
  'security.addresses.unproven': 'In use, not proven',
  'security.addresses.unprovenNote':
    'An address marked not proven is told about every change, but an invitation to an organization can be accepted only with a proven address. Send a code to it, then enter the code beside it.',
  'security.addresses.sendProof': 'Send a code',
  'security.addresses.proofSent': 'A code was sent to that address. Enter it beside the address to prove it.',
  'security.addresses.provenHeld': 'Proven. That address can now be used to accept an invitation.',
  'security.addresses.stillValid':
    'A code sent to that address is still good, so no new one was sent. Enter it beside the address, or ask for a new one once it has expired, 10 minutes after it was sent.',
  'enrolment.eyebrow': 'Invitation',
  'enrolment.title': 'Create your account',
  'enrolment.lead':
    'You were invited to an organization and have no account yet. Prove the invited address with a code, and an account is made for it.',
  'enrolment.missing.title': 'Open the link from your invitation',
  'enrolment.missing.body':
    'This page needs the link you were sent. Open it again, or ask the person who invited you for a new one.',
  'enrolment.start.title': 'Get a code',
  'enrolment.start.body': 'A code is sent to the address the invitation was sent to. Nothing else is needed.',
  'enrolment.start.send': 'Send me a code',
  'enrolment.request.limited':
    'Too many requests came from your network. Try again in {minutes, plural, one {# minute} other {# minutes}}.',
  'enrolment.request.refused': 'This link cannot be used. Ask the person who invited you for a new one.',
  'enrolment.request.unavailable': 'Codes cannot be sent right now. Try again in a few minutes.',
  'enrolment.code.title': 'Enter the code',
  'enrolment.code.sent':
    'If this invitation can still be used, a code is on its way to the address it was sent to. It is good for 10 minutes.',
  'enrolment.code.label': 'Code',
  'enrolment.code.hint': 'The {length} digits from the message.',
  'enrolment.code.invalid': 'The code is {length} digits.',
  'enrolment.code.submit': 'Create my account',
  'enrolment.code.restart': 'Start again',
  'enrolment.verify.wrong':
    'The code is wrong, has expired, or has been tried too often. Start again from the invitation link.',
  'enrolment.verify.limited':
    'Too many codes were tried from your network. Try again in {minutes, plural, one {# minute} other {# minutes}}.',
  'enrolment.verify.unavailable':
    'Your account cannot be created right now. Your code stays good for its 10 minutes: try it again shortly.',
  'enrolment.created.title': 'Your account is ready',
  'enrolment.created.body':
    'Sign in with this username and temporary password. You choose your own password next.',
  'enrolment.created.username': 'Username',
  'enrolment.created.password': 'Temporary password',
  'enrolment.created.lapses': 'Works until',
  'enrolment.created.once':
    'This password is shown once, here. It is not stored anywhere and cannot be shown again. It works for your first sign-in only.',
  'enrolment.created.copy': 'Copy the password',
  'enrolment.created.copied': 'Copied.',
  'enrolment.created.copyFailed': 'It could not be copied. Select it and copy it yourself.',
  'enrolment.created.next':
    'After you have chosen your password, open the invitation link again to accept the invitation.',
  'enrolment.created.continue': 'Continue to sign in',
};

export type MessageKey = keyof typeof en;
export type Messages = Readonly<Record<MessageKey, string>>;

export const id: Messages = {
  ...coreId,
  'app.name': 'Akun Scnehaux',
  'app.environment.development': 'Development',

  'shell.nav.section.account': 'Akunmu',
  'shell.nav.security': 'Keamanan',
  'shell.nav.consents': 'Persetujuan',
  'shell.scope': 'Akunmu sendiri',

  'consents.pageTitle': 'Persetujuan',
  'consents.lead':
    'Aplikasi yang dijalankan partner yang kamu izinkan bertindak untukmu. Aplikasi yang dijalankan Scnehaux sendiri tidak meminta: pendaftarannya adalah persetujuannya.',
  'consents.title': 'Aplikasi yang kamu izinkan',
  'consents.description':
    'Penarikan menghentikan akses baru seketika. Akses yang sudah dipegang aplikasi bertahan sampai tokennya kedaluwarsa, paling lama waktu yang ditampilkan.',
  'consents.none':
    'Kamu belum mengizinkan aplikasi apa pun. Hanya aplikasi yang dijalankan partner yang meminta, saat kamu pertama kali masuk ke sana.',
  'consents.column.client': 'Aplikasi',
  'consents.column.scopes': 'Yang boleh dipakai',
  'consents.column.granted': 'Diizinkan pada',
  'consents.column.lasts': 'Akses yang dipegang bertahan',
  'consents.lasts': 'Paling lama {minutes, plural, other {# menit}}',
  'consents.lasts.unbounded': 'Sampai tokennya kedaluwarsa',
  'consents.withdraw': 'Tarik',
  'consents.withdraw.label': 'Tarik persetujuanmu untuk {client}',
  'consents.withdrawn':
    'Persetujuan untuk {client} ditarik. Ia tidak mendapat akses baru, dan akses yang sudah dipegangnya berakhir paling lambat {time}.',
  'consents.withdrawn.unbounded':
    'Persetujuan untuk {client} ditarik. Ia tidak mendapat akses baru, dan akses yang sudah dipegangnya berakhir saat tokennya kedaluwarsa.',

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
  'security.authenticators.last':
    'Ditolak: ini cara login terakhirmu. Untuk menggantinya, tambahkan yang lain dulu, lalu hapus yang ini.',
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
  'security.addresses.unproven': 'Dipakai, belum terbukti',
  'security.addresses.unprovenNote':
    'Alamat yang belum terbukti tetap diberi tahu setiap ada perubahan, tetapi undangan ke organisasi hanya bisa diterima dengan alamat yang sudah terbukti. Kirim kode ke alamat itu, lalu masukkan kodenya di sampingnya.',
  'security.addresses.sendProof': 'Kirim kode',
  'security.addresses.proofSent':
    'Kode sudah dikirim ke alamat itu. Masukkan di samping alamatnya untuk membuktikannya.',
  'security.addresses.provenHeld': 'Terbukti. Alamat itu sekarang bisa dipakai untuk menerima undangan.',
  'security.addresses.stillValid':
    'Kode yang dikirim ke alamat itu masih berlaku, jadi tidak ada kode baru yang dikirim. Masukkan kode itu di samping alamatnya, atau minta yang baru setelah kedaluwarsa, 10 menit setelah dikirim.',
  'enrolment.eyebrow': 'Undangan',
  'enrolment.title': 'Buat akun Anda',
  'enrolment.lead':
    'Anda diundang ke sebuah organisasi dan belum punya akun. Buktikan alamat yang diundang dengan kode, lalu akun dibuat untuk alamat itu.',
  'enrolment.missing.title': 'Buka tautan dari undangan Anda',
  'enrolment.missing.body':
    'Halaman ini memerlukan tautan yang dikirim kepada Anda. Buka lagi tautan itu, atau minta tautan baru kepada orang yang mengundang Anda.',
  'enrolment.start.title': 'Dapatkan kode',
  'enrolment.start.body': 'Kode dikirim ke alamat tujuan undangan. Tidak ada lagi yang diperlukan.',
  'enrolment.start.send': 'Kirimi saya kode',
  'enrolment.request.limited':
    'Terlalu banyak permintaan dari jaringan Anda. Coba lagi dalam {minutes} menit.',
  'enrolment.request.refused':
    'Tautan ini tidak dapat digunakan. Minta tautan baru kepada orang yang mengundang Anda.',
  'enrolment.request.unavailable': 'Kode tidak dapat dikirim saat ini. Coba lagi dalam beberapa menit.',
  'enrolment.code.title': 'Masukkan kode',
  'enrolment.code.sent':
    'Jika undangan ini masih dapat digunakan, kode sedang dikirim ke alamat tujuan undangan. Kode berlaku 10 menit.',
  'enrolment.code.label': 'Kode',
  'enrolment.code.hint': '{length} angka dari pesan.',
  'enrolment.code.invalid': 'Kode terdiri dari {length} angka.',
  'enrolment.code.submit': 'Buat akun saya',
  'enrolment.code.restart': 'Mulai lagi',
  'enrolment.verify.wrong':
    'Kode salah, kedaluwarsa, atau sudah terlalu sering dicoba. Mulai lagi dari tautan undangan.',
  'enrolment.verify.limited':
    'Terlalu banyak kode dicoba dari jaringan Anda. Coba lagi dalam {minutes} menit.',
  'enrolment.verify.unavailable':
    'Akun Anda tidak dapat dibuat saat ini. Kode Anda tetap berlaku selama 10 menitnya: coba lagi sebentar lagi.',
  'enrolment.created.title': 'Akun Anda siap',
  'enrolment.created.body':
    'Masuk dengan nama pengguna dan kata sandi sementara ini. Selanjutnya Anda memilih kata sandi sendiri.',
  'enrolment.created.username': 'Nama pengguna',
  'enrolment.created.password': 'Kata sandi sementara',
  'enrolment.created.lapses': 'Berlaku sampai',
  'enrolment.created.once':
    'Kata sandi ini ditampilkan sekali, di sini. Tidak disimpan di mana pun dan tidak dapat ditampilkan lagi. Hanya berlaku untuk masuk pertama kali.',
  'enrolment.created.copy': 'Salin kata sandi',
  'enrolment.created.copied': 'Tersalin.',
  'enrolment.created.copyFailed': 'Tidak dapat disalin. Pilih dan salin sendiri.',
  'enrolment.created.next': 'Setelah memilih kata sandi, buka lagi tautan undangan untuk menerima undangan.',
  'enrolment.created.continue': 'Lanjut masuk',
};

export const messages: Readonly<Record<Locale, Messages>> = { en, id };
