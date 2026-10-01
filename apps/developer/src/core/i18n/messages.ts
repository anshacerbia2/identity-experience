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
};

export const messages: Readonly<Record<Locale, Messages>> = { en, id };
