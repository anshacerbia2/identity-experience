# @identity-experience/app-core

What every browser application in this repository shares and must not differ in: the Identity
Administration Portal (`apps/admin`) and the Developer Identity Console (`apps/developer`) take
it from here (TDD-identity-experience-004 §Delivery).

| Entry point                                   | Contents                                                                                                                |
| :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| `@identity-experience/app-core/api`           | The BFF's `/api` proxy, `ApiError`, and the panels that state a failure                                                 |
| `@identity-experience/app-core/session`       | The BFF session, sign-in and sign-out, and the controls that show them                                                  |
| `@identity-experience/app-core/query`         | The query client every application runs on                                                                              |
| `@identity-experience/app-core/preferences`   | Theme and language, kept once for the whole origin                                                                      |
| `@identity-experience/app-core/forms`         | The reason field every audited command asks for                                                                         |
| `@identity-experience/app-core/shell`         | The frame every page renders in; the application supplies its navigation                                                |
| `@identity-experience/app-core/i18n`          | The strings the shared pieces render, which each application's catalogue spreads                                        |
| `@identity-experience/app-core/registrations` | One registration: its record, key panel, lifecycle controls and owners, their calls, and its state and profile as words |
| `@identity-experience/app-core/domain/*`      | Pure TypeScript read models: registration, reason, public key                                                           |

Components come from `@identity-experience/ui`, as in every application. Nothing here imports an
application: a piece that needs one application's string or route belongs to that application.
`.dependency-cruiser.cjs` enforces that, and that `domain/` stays pure.
