// Every user-visible string, in ICU MessageFormat (STD-GLB-FE-009 §3.6). English is the source;
// every other locale is typed against its keys, so a missing translation is a compile error and
// the build fails on it.

export const en = {
  'app.name': 'Scnehaux Identity',
  'app.environment.development': 'Development',
  'app.skipToContent': 'Skip to content',

  'shell.nav.label': 'Primary',
  'shell.nav.overview': 'Overview',
  'shell.nav.section.control': 'Control plane',
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

  'overview.eyebrow': 'Identity control plane',
  'overview.title': 'Every identity, accounted for.',
  'overview.lead':
    'Principals, protocol clients and the drift between what was registered and what Keycloak holds, in one place. Every action here is reauthorized by the Identity Control API.',
  'overview.status.foundation': 'Foundation ready',
  'overview.status.ready': 'Ready',
  'overview.status.next': 'Next',
  'overview.status.planned': 'Planned',

  'overview.card.signin.title': 'Sign-in and session',
  'overview.card.signin.body':
    'Authorization Code with PKCE through this service. The browser holds a session cookie and never a token.',
  'overview.card.registrations.title': 'Registrations and drift',
  'overview.card.registrations.body':
    'Registered clients, the reconciler’s last run, open findings, blocked clients and drift exceptions.',
  'overview.card.principals.title': 'Principals',
  'overview.card.principals.body':
    'Create Principals, see mappings whose Keycloak user is gone, and relink them with a stated reason.',
  'overview.status.inProgress': 'In progress',

  'shell.nav.registrations': 'Registrations',

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

  'registrations.eyebrow': 'Protocol clients',
  'registrations.title': 'Registrations',
  'registrations.lead':
    'Every client and protected resource the Identity Control API has registered, and whether Keycloak still holds what was registered.',
  'registrations.filter.label': 'Filter by state',
  'registrations.filter.all': 'All',
  'registrations.table.caption': 'Registered clients',
  'registrations.column.client': 'Client',
  'registrations.column.profile': 'Profile',
  'registrations.column.audienceClass': 'Audience class',
  'registrations.column.state': 'State',
  'registrations.column.lifespan': 'Token lifetime',
  'registrations.column.findings': 'Open findings',
  'registrations.column.created': 'Registered',
  'registrations.lifespan': '{seconds, number} s',
  'registrations.lifespan.none': 'Not issued',
  'registrations.findings.none': 'None',
  'registrations.findings.count': '{count, number} open',
  'registrations.empty': 'No registration matches this filter.',
  'registrations.loadMore': 'Load more',
  'registrations.loading': 'Loading registrations',
  'registrations.state.pending': 'Pending',
  'registrations.state.active': 'Active',
  'registrations.state.suspended': 'Suspended',
  'registrations.state.retired': 'Retired',
  'registrations.profile.confidential': 'Confidential',
  'registrations.profile.public': 'Public',
  'registrations.profile.workload': 'Workload',
  'registrations.profile.resource': 'Resource',

  'drift.title': 'Drift',
  'drift.description': 'The reconciler compares Keycloak with the registered state on a schedule.',
  'drift.lastRun': 'Last run started',
  'drift.noRun': 'No run yet',
  'drift.running': 'Running',
  'drift.outcome.converged': 'Converged',
  'drift.outcome.drift': 'Drift found',
  'drift.outcome.unresolved': 'Unresolved',
  'drift.open': '{count, plural, =0 {No open findings} one {# open finding} other {# open findings}}',
  'drift.needsOperator': '{count, plural, one {# needs an operator} other {# need an operator}}',

  'registration.back': 'All registrations',
  'registration.details': 'Registration',
  'registration.field.id': 'Registration ID',
  'registration.field.realm': 'Realm',
  'registration.field.profile': 'Profile',
  'registration.field.audienceClass': 'Audience class',
  'registration.field.application': 'Application reference',
  'registration.field.algorithm': 'Signing algorithm',
  'registration.field.lifetimeClass': 'Lifetime class',
  'registration.field.audience': 'Audience',
  'registration.field.redirects': 'Redirect URIs',
  'registration.field.lifespan': 'Token lifetime',
  'registration.field.registeredBy': 'Registered by',
  'registration.field.created': 'Registered',
  'registration.field.version': 'Version',
  'registration.none': 'None',

  'findings.title': 'Findings',
  'findings.description':
    'Every divergence the reconciler recorded for this client, newest first. Converged ones are kept as evidence.',
  'findings.caption': 'Findings for this client',
  'findings.column.detected': 'Detected',
  'findings.column.field': 'Field',
  'findings.column.class': 'Outcome',
  'findings.column.actor': 'Changed by',
  'findings.column.convergence': 'Converged',
  'findings.open': 'Open',
  'findings.convergedAfter': 'after {seconds, number} s',
  'findings.unknownActor': 'Unknown',
  'findings.empty': 'No divergence has been recorded for this client.',
  'findings.class.repaired': 'Repaired',
  'findings.class.recreated': 'Recreated',
  'findings.class.sanctioned': 'Sanctioned',
  'findings.class.blocked': 'Blocked',
  'findings.class.unattributed': 'Unattributed',
  'findings.class.missing': 'Missing',
  'findings.field.redirect_uris': 'Redirect URIs',
  'findings.field.token_lifespan': 'Token lifetime',
  'findings.field.audience_scope': 'Audience scope',
  'findings.field.signing_algorithm': 'Signing algorithm',
  'findings.field.profile': 'Profile',
  'findings.field.client': 'Whole client',

  'api.refused': 'The Identity Control API refused this.',
  'api.said': 'The API said: {detail}',

  'form.cancel': 'Cancel',
  'form.reason.label': 'Reason',
  'form.reason.hint': 'Recorded with the action. At least {min, number} characters.',
  'form.reason.short': 'Write at least {min, number} characters: the reason is the record of why.',
  'form.reason.long': 'Keep it to {max, number} characters.',
  'form.reason.characters':
    'Use letters, digits and common punctuation only. The reason travels in a request header, which cannot carry other characters.',

  'drift.runNow': 'Run a sweep now',
  'drift.deferred': 'Another sweep is already running. Its result shows here when it finishes.',

  'findings.column.action': 'Action',
  'findings.apply': 'Apply registered state',
  'findings.apply.title': 'Apply the registered state',
  'findings.apply.body':
    'Keycloak is set back to what was registered for {field}. The sweep does not do this on its own for a finding like this one, so your reason is recorded on it.',
  'findings.apply.done': 'The registered state was applied. The findings show the result.',

  'exception.open': 'Grant a drift exception',
  'exception.title': 'Drift exception',
  'exception.body':
    'Lets one Keycloak user change one part of this client in the Admin Console, for at most 24 hours. The change is recorded as sanctioned instead of being repaired. To keep it after the exception ends, change the registration.',
  'exception.field.label': 'What may change',
  'exception.actor.label': 'Keycloak user ID',
  'exception.actor.hint': 'The user who will make the change, as Keycloak identifies them in admin events.',
  'exception.actor.required': 'Name the Keycloak user who will make the change.',
  'exception.duration.label': 'For',
  'exception.duration.option': '{hours, plural, one {# hour} other {# hours}}',
  'exception.submit': 'Grant exception',
  'exception.done': 'Exception granted until {until}.',

  'shell.nav.principals': 'Principals',

  'principals.eyebrow': 'Identities',
  'principals.title': 'Principals',
  'principals.lead':
    'Create a Principal, and give one whose Keycloak user is gone a user again. There is no list of every Principal: search arrives with the investigation API, and a directory export is not administration.',

  'principals.create.open': 'Create a Principal',
  'principals.create.title': 'New Principal',
  'principals.create.body':
    'identity-control issues the principal_id and creates the Keycloak user. It never holds the credential: a person sets their own password at first sign-in.',
  'principals.create.kind': 'Kind',
  'principals.subject.human': 'Person',
  'principals.subject.workload': 'Workload',
  'principals.create.username': 'Username',
  'principals.create.username.required': 'A username is required.',
  'principals.create.email': 'Email',
  'principals.create.email.hint': 'Optional. Where Keycloak sends the account messages.',
  'principals.create.owner': 'Accountable owner',
  'principals.create.owner.hint': 'The principal_id of the person accountable for this workload.',
  'principals.create.owner.invalid':
    'Enter a principal_id: a UUID such as 01a0da74-44e7-7000-b600-b464c5cb8cec.',
  'principals.create.submit': 'Create Principal',
  'principals.created.title': 'Principal created',
  'principals.created.id': 'principal_id',
  'principals.created.human': 'Keycloak asks this person to set a password at first sign-in.',
  'principals.created.workload': 'A workload signs in with a client credential, not a password.',
  'principals.create.another': 'Create another',

  'principals.dangling.title': 'Mappings whose Keycloak user is gone',
  'principals.dangling.description':
    'Each keeps its principal_id and every Membership. A relink gives it a Keycloak user again, under the same principal_id.',
  'principals.dangling.caption': 'Principals whose Keycloak user is gone',
  'principals.dangling.empty': 'Every active Principal has its Keycloak user.',
  'principals.dangling.column.principal': 'Principal',
  'principals.dangling.column.detected': 'Detected',
  'principals.dangling.column.action': 'Action',
  'principals.relink': 'Relink',
  'principals.relink.title': 'Relink this Principal',
  'principals.relink.body':
    'The Principal returns to pending, and recovery adopts or recreates a Keycloak user carrying the same principal_id. Your reason is recorded with the relink.',
  'principals.relink.active': 'Relinked. The Principal has a Keycloak user again.',
  'principals.relink.pending':
    'Relinked. The Principal is pending; the scheduled recovery gives it a Keycloak user.',
  'principals.sweep': 'Run the Principal sweep now',
  'principals.sweep.done': 'Sweep finished: {recovered, number} recovered, {dangling, number} dangling.',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Readonly<Record<MessageKey, string>>;

export const id: Messages = {
  'app.name': 'Scnehaux Identity',
  'app.environment.development': 'Development',
  'app.skipToContent': 'Langsung ke konten',

  'shell.nav.label': 'Utama',
  'shell.nav.overview': 'Ringkasan',
  'shell.nav.section.control': 'Control plane',
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

  'overview.eyebrow': 'Control plane identitas',
  'overview.title': 'Setiap identitas, tercatat.',
  'overview.lead':
    'Principal, client protokol, dan penyimpangan antara yang terdaftar dengan yang ada di Keycloak, di satu tempat. Setiap tindakan di sini diotorisasi ulang oleh Identity Control API.',
  'overview.status.foundation': 'Fondasi siap',
  'overview.status.ready': 'Siap',
  'overview.status.next': 'Berikutnya',
  'overview.status.planned': 'Direncanakan',

  'overview.card.signin.title': 'Masuk dan sesi',
  'overview.card.signin.body':
    'Authorization Code dengan PKCE lewat layanan ini. Browser hanya memegang cookie sesi, tidak pernah token.',
  'overview.card.registrations.title': 'Registrasi dan drift',
  'overview.card.registrations.body':
    'Client terdaftar, putaran pembanding terakhir, temuan terbuka, client yang diblokir, dan pengecualian drift.',
  'overview.card.principals.title': 'Principal',
  'overview.card.principals.body':
    'Buat Principal, lihat mapping yang user Keycloak-nya hilang, dan relink dengan alasan tertulis.',
  'overview.status.inProgress': 'Sedang dibangun',

  'shell.nav.registrations': 'Registrasi',

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

  'registrations.eyebrow': 'Client protokol',
  'registrations.title': 'Registrasi',
  'registrations.lead':
    'Setiap client dan resource yang terdaftar di Identity Control API, dan apakah Keycloak masih memegang apa yang didaftarkan.',
  'registrations.filter.label': 'Saring berdasarkan status',
  'registrations.filter.all': 'Semua',
  'registrations.table.caption': 'Client terdaftar',
  'registrations.column.client': 'Client',
  'registrations.column.profile': 'Profil',
  'registrations.column.audienceClass': 'Kelas audiens',
  'registrations.column.state': 'Status',
  'registrations.column.lifespan': 'Umur token',
  'registrations.column.findings': 'Temuan terbuka',
  'registrations.column.created': 'Didaftarkan',
  'registrations.lifespan': '{seconds, number} dtk',
  'registrations.lifespan.none': 'Tidak diterbitkan',
  'registrations.findings.none': 'Tidak ada',
  'registrations.findings.count': '{count, number} terbuka',
  'registrations.empty': 'Tidak ada registrasi yang cocok dengan saringan ini.',
  'registrations.loadMore': 'Muat lagi',
  'registrations.loading': 'Memuat registrasi',
  'registrations.state.pending': 'Menunggu',
  'registrations.state.active': 'Aktif',
  'registrations.state.suspended': 'Ditangguhkan',
  'registrations.state.retired': 'Pensiun',
  'registrations.profile.confidential': 'Rahasia',
  'registrations.profile.public': 'Publik',
  'registrations.profile.workload': 'Workload',
  'registrations.profile.resource': 'Resource',

  'drift.title': 'Drift',
  'drift.description': 'Pembanding memeriksa Keycloak terhadap status terdaftar secara berkala.',
  'drift.lastRun': 'Putaran terakhir dimulai',
  'drift.noRun': 'Belum pernah berjalan',
  'drift.running': 'Sedang berjalan',
  'drift.outcome.converged': 'Selaras',
  'drift.outcome.drift': 'Ada drift',
  'drift.outcome.unresolved': 'Belum terselesaikan',
  'drift.open': '{count, plural, =0 {Tidak ada temuan terbuka} other {# temuan terbuka}}',
  'drift.needsOperator': '{count, plural, other {# perlu tindakan operator}}',

  'registration.back': 'Semua registrasi',
  'registration.details': 'Registrasi',
  'registration.field.id': 'ID registrasi',
  'registration.field.realm': 'Realm',
  'registration.field.profile': 'Profil',
  'registration.field.audienceClass': 'Kelas audiens',
  'registration.field.application': 'Referensi aplikasi',
  'registration.field.algorithm': 'Algoritma tanda tangan',
  'registration.field.lifetimeClass': 'Kelas umur',
  'registration.field.audience': 'Audiens',
  'registration.field.redirects': 'Redirect URI',
  'registration.field.lifespan': 'Umur token',
  'registration.field.registeredBy': 'Didaftarkan oleh',
  'registration.field.created': 'Didaftarkan',
  'registration.field.version': 'Versi',
  'registration.none': 'Tidak ada',

  'findings.title': 'Temuan',
  'findings.description':
    'Setiap penyimpangan yang dicatat pembanding untuk client ini, terbaru di atas. Yang sudah selaras tetap disimpan sebagai bukti.',
  'findings.caption': 'Temuan untuk client ini',
  'findings.column.detected': 'Terdeteksi',
  'findings.column.field': 'Bagian',
  'findings.column.class': 'Hasil',
  'findings.column.actor': 'Diubah oleh',
  'findings.column.convergence': 'Selaras kembali',
  'findings.open': 'Terbuka',
  'findings.convergedAfter': 'setelah {seconds, number} dtk',
  'findings.unknownActor': 'Tidak diketahui',
  'findings.empty': 'Belum ada penyimpangan yang tercatat untuk client ini.',
  'findings.class.repaired': 'Diperbaiki',
  'findings.class.recreated': 'Dibuat ulang',
  'findings.class.sanctioned': 'Diizinkan',
  'findings.class.blocked': 'Diblokir',
  'findings.class.unattributed': 'Tanpa pelaku',
  'findings.class.missing': 'Hilang',
  'findings.field.redirect_uris': 'Redirect URI',
  'findings.field.token_lifespan': 'Umur token',
  'findings.field.audience_scope': 'Scope audiens',
  'findings.field.signing_algorithm': 'Algoritma tanda tangan',
  'findings.field.profile': 'Profil',
  'findings.field.client': 'Seluruh client',

  'api.refused': 'Identity Control API menolak ini.',
  'api.said': 'Kata API: {detail}',

  'form.cancel': 'Batal',
  'form.reason.label': 'Alasan',
  'form.reason.hint': 'Dicatat bersama tindakan ini. Minimal {min, number} karakter.',
  'form.reason.short': 'Tulis minimal {min, number} karakter: alasan adalah catatan kenapa ini dilakukan.',
  'form.reason.long': 'Maksimal {max, number} karakter.',
  'form.reason.characters':
    'Gunakan huruf, angka, dan tanda baca umum saja. Alasan dikirim lewat header permintaan, yang tidak bisa membawa karakter lain.',

  'drift.runNow': 'Jalankan pembanding sekarang',
  'drift.deferred': 'Pembanding lain sedang berjalan. Hasilnya muncul di sini setelah selesai.',

  'findings.column.action': 'Tindakan',
  'findings.apply': 'Terapkan status terdaftar',
  'findings.apply.title': 'Terapkan status terdaftar',
  'findings.apply.body':
    'Keycloak dikembalikan ke yang didaftarkan untuk {field}. Pembanding tidak melakukan ini sendiri untuk temuan seperti ini, jadi alasanmu dicatat di temuan itu.',
  'findings.apply.done': 'Status terdaftar sudah diterapkan. Temuan di bawah menunjukkan hasilnya.',

  'exception.open': 'Beri pengecualian drift',
  'exception.title': 'Pengecualian drift',
  'exception.body':
    'Mengizinkan satu user Keycloak mengubah satu bagian client ini di Admin Console, paling lama 24 jam. Perubahannya dicatat sebagai diizinkan, bukan diperbaiki. Supaya tetap berlaku setelah pengecualian berakhir, ubah registrasinya.',
  'exception.field.label': 'Yang boleh diubah',
  'exception.actor.label': 'ID user Keycloak',
  'exception.actor.hint': 'User yang akan melakukan perubahan, seperti yang dicatat Keycloak di admin event.',
  'exception.actor.required': 'Sebutkan user Keycloak yang akan melakukan perubahan.',
  'exception.duration.label': 'Selama',
  'exception.duration.option': '{hours, number} jam',
  'exception.submit': 'Beri pengecualian',
  'exception.done': 'Pengecualian berlaku sampai {until}.',

  'shell.nav.principals': 'Principal',

  'principals.eyebrow': 'Identitas',
  'principals.title': 'Principal',
  'principals.lead':
    'Buat Principal, dan beri user Keycloak lagi untuk Principal yang user-nya hilang. Tidak ada daftar semua Principal: pencarian datang bersama API investigasi, dan mengekspor direktori bukan administrasi.',

  'principals.create.open': 'Buat Principal',
  'principals.create.title': 'Principal baru',
  'principals.create.body':
    'identity-control menerbitkan principal_id dan membuat user Keycloak-nya. Ia tidak pernah memegang kredensialnya: orang itu mengatur password-nya sendiri saat pertama masuk.',
  'principals.create.kind': 'Jenis',
  'principals.subject.human': 'Orang',
  'principals.subject.workload': 'Workload',
  'principals.create.username': 'Username',
  'principals.create.username.required': 'Username wajib diisi.',
  'principals.create.email': 'Email',
  'principals.create.email.hint': 'Opsional. Ke sini Keycloak mengirim pesan akun.',
  'principals.create.owner': 'Penanggung jawab',
  'principals.create.owner.hint': 'principal_id orang yang bertanggung jawab atas workload ini.',
  'principals.create.owner.invalid':
    'Isi dengan principal_id: UUID seperti 01a0da74-44e7-7000-b600-b464c5cb8cec.',
  'principals.create.submit': 'Buat Principal',
  'principals.created.title': 'Principal dibuat',
  'principals.created.id': 'principal_id',
  'principals.created.human': 'Keycloak meminta orang ini mengatur password saat pertama masuk.',
  'principals.created.workload': 'Workload masuk dengan kredensial client, bukan password.',
  'principals.create.another': 'Buat lagi',

  'principals.dangling.title': 'Mapping yang user Keycloak-nya hilang',
  'principals.dangling.description':
    'Masing-masing tetap memegang principal_id dan semua Membership-nya. Relink memberinya user Keycloak lagi, dengan principal_id yang sama.',
  'principals.dangling.caption': 'Principal yang user Keycloak-nya hilang',
  'principals.dangling.empty': 'Semua Principal aktif masih punya user Keycloak.',
  'principals.dangling.column.principal': 'Principal',
  'principals.dangling.column.detected': 'Terdeteksi',
  'principals.dangling.column.action': 'Tindakan',
  'principals.relink': 'Relink',
  'principals.relink.title': 'Relink Principal ini',
  'principals.relink.body':
    'Principal kembali ke status menunggu, lalu pemulihan mengadopsi atau membuat ulang user Keycloak dengan principal_id yang sama. Alasanmu dicatat bersama relink ini.',
  'principals.relink.active': 'Relink selesai. Principal sudah punya user Keycloak lagi.',
  'principals.relink.pending':
    'Relink tercatat. Principal menunggu; pemulihan terjadwal akan memberinya user Keycloak.',
  'principals.sweep': 'Jalankan pembanding Principal sekarang',
  'principals.sweep.done':
    'Pembanding selesai: {recovered, number} dipulihkan, {dangling, number} kehilangan user.',
};

export type Locale = 'en' | 'id';

export const messages: Readonly<Record<Locale, Messages>> = { en, id };

export const locales: readonly Locale[] = ['en', 'id'];
