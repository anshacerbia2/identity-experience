// Every user-visible string, in ICU MessageFormat (STD-GLB-FE-009 §3.6). English is the source;
// every other locale is typed against its keys, so a missing translation is a compile error and
// the build fails on it. The shared pieces' strings come first, from @identity-experience/app-core,
// so this catalogue holds every key the page can render.

import { coreEn, coreId } from '@identity-experience/app-core/i18n';
import type { Locale } from '@identity-experience/app-core/preferences';

export type { Locale };

export const en = {
  ...coreEn,
  'app.name': 'Scnehaux Developer',
  'app.environment.development': 'Development',

  'shell.nav.section.applications': 'Your applications',
  'shell.nav.registrations': 'My registrations',

  'mine.eyebrow': 'Developer Console',
  'mine.title': 'My registrations',
  'mine.lead':
    'The clients and protected resources you are an owner of. As an owner you can read a registration, rotate and revoke its keys, and suspend or restore it. Every action is checked again by the Identity Control API.',
  'mine.loading': 'Loading your registrations',
  'mine.table.caption': 'Registrations you own',
  'mine.column.client': 'Client',
  'mine.column.profile': 'Profile',
  'mine.column.state': 'State',
  'mine.column.created': 'Registered',
  'mine.empty.title': 'You own no registration yet',
  'mine.empty.body':
    'A provider names the owners of each registration, with a reason, and a production registration has at least two. Ask the platform team to add you to the registrations you are accountable for.',

  'registration.back': 'My registrations',

  'register.open': 'Register a client',
  'register.title': 'Register a client',
  'register.lead':
    'A non-production client or protected resource, registered on your application developer standing. You become its first owner.',
  'register.unavailable.title': 'Registration is not available to you here',
  'register.unavailable.standing':
    'Registering a client takes application developer standing, which a provider grants. Ask the platform team.',
  'register.form.title': 'The registration',
  'register.form.body':
    'The Identity Control API checks every field when you register, and a refusal names the rule. Nothing secret is entered here: a confidential client authenticates with a key pair your team keeps.',
  'register.clientKey': 'Client key',
  'register.clientKey.hint':
    'Lowercase letters, digits, dots, dashes and underscores, as the client is named in Keycloak.',
  'register.clientKey.required': 'Name the client.',
  'register.applicationRef': 'Application reference',
  'register.applicationRef.hint': 'The application this client belongs to. Every client traces to one.',
  'register.applicationRef.required': 'Name the application.',
  'register.profile': 'Profile',
  'register.profile.confidential.hint':
    'A server-side application that signs in users and authenticates with its own key. It holds no secret.',
  'register.profile.public.hint':
    'A browser or mobile application that cannot keep a key. It signs in users with PKCE and gets no refresh token.',
  'register.profile.resource.hint': 'An API that verifies the tokens other clients present to it.',
  'register.audienceClass': 'Audience class',
  'register.audienceClass.hint':
    'Internal for Scnehaux users, external for partners. Privileged and workload clients are a provider’s to register.',
  'register.audienceClass.internal': 'Internal',
  'register.audienceClass.external': 'External',
  'register.lifetimeClass': 'Token lifetime',
  'register.lifetimeClass.hint':
    'A longer lifetime is a longer window in which a revoked person keeps access to your API.',
  'register.lifetimeClass.choose': 'Choose a lifetime',
  'register.lifetimeClass.required': 'Choose how long a token for this resource is valid.',
  'register.lifetimeClass.L0':
    'Token valid {token, number} minutes; a revocation takes effect within about {revocation, number} minutes',
  'register.lifetimeClass.L1':
    'Token valid {token, number} minutes; a revocation takes effect within about {revocation, number} minutes',
  'register.lifetimeClass.L2':
    'Token valid {token, number} minutes; a revocation takes effect within about {revocation, number} minutes. External and partner audiences only',
  'register.redirectUris': 'Redirect URIs, one per line',
  'register.redirectUris.hint':
    'Each is matched exactly: https, or http on localhost for local development, with no wildcard and no fragment.',
  'register.audience': 'Audience',
  'register.audience.hint':
    'The resources this client’s tokens are for. You can choose only resources you own.',
  'register.audience.none':
    'You own no protected resource, so this client’s tokens are for no API yet. A provider registers a client for another team’s resource.',
  'register.publicKey': 'First public key (JWK)',
  'register.submit': 'Register',

  'request.open': 'Request a production client',
  'request.form.title': 'The production client you request',
  'request.form.body':
    'This is production: the registration is requested, and a provider other than you approves it before it exists. Name at least two owners, so it is never left with none. Nothing secret is entered here.',
  'request.owners': 'Owners, one principal_id per line',
  'request.owners.hint':
    'At least {min, number} people, each an active person. You are listed first; add a colleague who shares the responsibility.',
  'request.owners.tooFew': 'Name at least {min, number} different owners.',
  'request.submit': 'Request',
  'request.done.title': '{clientKey} is requested',
  'request.done.body':
    'It waits for a provider other than you. You find it under My registrations, with its decision once it is made.',
  'requests.title': 'My production requests',
  'requests.caption': 'Production registrations you requested',
  'requests.column.proposed': 'Requested',
  'requests.column.decision': 'Decision',
  'requests.column.action': 'Action',
  'requests.state.proposed': 'Waiting for approval',
  'requests.state.approved': 'Approved',
  'requests.state.rejected': 'Rejected',
  'requests.state.withdrawn': 'Withdrawn',
  'requests.withdraw.open': 'Withdraw {clientKey}',
  'requests.withdraw.title': 'Withdraw the request for {clientKey}',
  'requests.withdraw': 'Withdraw',
  'requests.note': 'A provider other than you approves or rejects each request, in the Admin Portal.',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Readonly<Record<MessageKey, string>>;

export const id: Messages = {
  ...coreId,
  'app.name': 'Scnehaux Developer',
  'app.environment.development': 'Development',

  'shell.nav.section.applications': 'Aplikasimu',
  'shell.nav.registrations': 'Registrasi saya',

  'mine.eyebrow': 'Developer Console',
  'mine.title': 'Registrasi saya',
  'mine.lead':
    'Client dan protected resource yang kamu miliki sebagai owner. Sebagai owner kamu bisa membaca registrasinya, merotasi dan mencabut key-nya, serta menangguhkan atau memulihkannya. Setiap tindakan diperiksa lagi oleh Identity Control API.',
  'mine.loading': 'Memuat registrasimu',
  'mine.table.caption': 'Registrasi yang kamu miliki',
  'mine.column.client': 'Client',
  'mine.column.profile': 'Profil',
  'mine.column.state': 'Status',
  'mine.column.created': 'Didaftarkan',
  'mine.empty.title': 'Kamu belum memiliki registrasi',
  'mine.empty.body':
    'Provider menetapkan owner tiap registrasi, dengan alasan, dan registrasi production punya minimal dua. Minta tim platform menambahkanmu ke registrasi yang jadi tanggung jawabmu.',

  'registration.back': 'Registrasi saya',

  'register.open': 'Daftarkan client',
  'register.title': 'Daftarkan client',
  'register.lead':
    'Client atau protected resource non-production, didaftarkan dengan standing application developer milikmu. Kamu jadi owner pertamanya.',
  'register.unavailable.title': 'Pendaftaran tidak tersedia untukmu di sini',
  'register.unavailable.standing':
    'Mendaftarkan client butuh standing application developer, yang diberikan provider. Minta ke tim platform.',
  'register.form.title': 'Registrasinya',
  'register.form.body':
    'Identity Control API memeriksa setiap field saat kamu mendaftar, dan penolakan menyebut aturannya. Tidak ada yang rahasia diisi di sini: client confidential autentikasi dengan pasangan kunci yang disimpan timmu.',
  'register.clientKey': 'Client key',
  'register.clientKey.hint':
    'Huruf kecil, angka, titik, strip dan garis bawah, sesuai nama client di Keycloak.',
  'register.clientKey.required': 'Beri nama client.',
  'register.applicationRef': 'Referensi aplikasi',
  'register.applicationRef.hint': 'Aplikasi pemilik client ini. Setiap client terhubung ke satu aplikasi.',
  'register.applicationRef.required': 'Sebutkan aplikasinya.',
  'register.profile': 'Profil',
  'register.profile.confidential.hint':
    'Aplikasi server-side yang memasukkan pengguna dan autentikasi dengan kuncinya sendiri. Tidak menyimpan secret.',
  'register.profile.public.hint':
    'Aplikasi browser atau mobile yang tidak bisa menyimpan kunci. Memasukkan pengguna dengan PKCE dan tidak mendapat refresh token.',
  'register.profile.resource.hint': 'API yang memverifikasi token yang dibawa client lain kepadanya.',
  'register.audienceClass': 'Kelas audiens',
  'register.audienceClass.hint':
    'Internal untuk pengguna Scnehaux, external untuk partner. Client privileged dan workload didaftarkan provider.',
  'register.audienceClass.internal': 'Internal',
  'register.audienceClass.external': 'External',
  'register.lifetimeClass': 'Umur token',
  'register.lifetimeClass.hint':
    'Umur yang lebih panjang berarti jendela yang lebih panjang bagi orang yang sudah dicabut untuk tetap mengakses API-mu.',
  'register.lifetimeClass.choose': 'Pilih umur',
  'register.lifetimeClass.required': 'Pilih berapa lama token untuk resource ini berlaku.',
  'register.lifetimeClass.L0':
    'Token berlaku {token, number} menit; pencabutan berlaku dalam sekitar {revocation, number} menit',
  'register.lifetimeClass.L1':
    'Token berlaku {token, number} menit; pencabutan berlaku dalam sekitar {revocation, number} menit',
  'register.lifetimeClass.L2':
    'Token berlaku {token, number} menit; pencabutan berlaku dalam sekitar {revocation, number} menit. Hanya untuk audiens external dan partner',
  'register.redirectUris': 'Redirect URI, satu per baris',
  'register.redirectUris.hint':
    'Masing-masing dicocokkan persis: https, atau http di localhost untuk pengembangan lokal, tanpa wildcard dan tanpa fragment.',
  'register.audience': 'Audiens',
  'register.audience.hint': 'Resource tujuan token client ini. Kamu hanya bisa memilih resource milikmu.',
  'register.audience.none':
    'Kamu belum memiliki protected resource, jadi token client ini belum untuk API mana pun. Client untuk resource tim lain didaftarkan provider.',
  'register.publicKey': 'Public key pertama (JWK)',
  'register.submit': 'Daftarkan',

  'request.open': 'Minta client production',
  'request.form.title': 'Client production yang kamu minta',
  'request.form.body':
    'Ini production: registrasinya diminta, dan provider selain kamu menyetujuinya sebelum registrasi itu ada. Sebutkan minimal dua owner, supaya tidak pernah tanpa owner. Tidak ada yang rahasia diisi di sini.',
  'request.owners': 'Owner, satu principal_id per baris',
  'request.owners.hint':
    'Minimal {min, number} orang, masing-masing orang yang aktif. Kamu sudah tercantum pertama; tambahkan rekan yang ikut bertanggung jawab.',
  'request.owners.tooFew': 'Sebutkan minimal {min, number} owner yang berbeda.',
  'request.submit': 'Minta',
  'request.done.title': '{clientKey} sudah diminta',
  'request.done.body':
    'Menunggu provider selain kamu. Kamu bisa melihatnya di Registrasi saya, beserta keputusannya setelah diputuskan.',
  'requests.title': 'Permintaan production saya',
  'requests.caption': 'Registrasi production yang kamu minta',
  'requests.column.proposed': 'Diminta',
  'requests.column.decision': 'Keputusan',
  'requests.column.action': 'Tindakan',
  'requests.state.proposed': 'Menunggu persetujuan',
  'requests.state.approved': 'Disetujui',
  'requests.state.rejected': 'Ditolak',
  'requests.state.withdrawn': 'Ditarik',
  'requests.withdraw.open': 'Tarik {clientKey}',
  'requests.withdraw.title': 'Tarik permintaan untuk {clientKey}',
  'requests.withdraw': 'Tarik',
  'requests.note': 'Provider selain kamu menyetujui atau menolak setiap permintaan, di Admin Portal.',
};

export const messages: Readonly<Record<Locale, Messages>> = { en, id };
