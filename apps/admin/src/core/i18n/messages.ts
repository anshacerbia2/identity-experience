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
  'shell.session.signedOut': 'Not signed in',
  'shell.theme.toDark': 'Switch to dark theme',
  'shell.theme.toLight': 'Switch to light theme',
  'shell.locale.label': 'Language',

  'overview.eyebrow': 'Identity control plane',
  'overview.title': 'Every identity, accounted for.',
  'overview.lead':
    'Principals, protocol clients and the drift between what was registered and what Keycloak holds, in one place. Every action here is reauthorized by the Identity Control API.',
  'overview.status.foundation': 'Foundation ready',
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
  'shell.session.signedOut': 'Belum masuk',
  'shell.theme.toDark': 'Ganti ke tema gelap',
  'shell.theme.toLight': 'Ganti ke tema terang',
  'shell.locale.label': 'Bahasa',

  'overview.eyebrow': 'Control plane identitas',
  'overview.title': 'Setiap identitas, tercatat.',
  'overview.lead':
    'Principal, client protokol, dan penyimpangan antara yang terdaftar dengan yang ada di Keycloak, di satu tempat. Setiap tindakan di sini diotorisasi ulang oleh Identity Control API.',
  'overview.status.foundation': 'Fondasi siap',
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
};

export type Locale = 'en' | 'id';

export const messages: Readonly<Record<Locale, Messages>> = { en, id };

export const locales: readonly Locale[] = ['en', 'id'];
