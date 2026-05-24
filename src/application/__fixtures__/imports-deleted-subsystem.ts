// @ts-nocheck — positive-control fixture for the deleted-subsystem guard
// (TEST-PSR-017). It intentionally imports a path removed in the P0 reboot so
// the ESLint `no-restricted-imports` DELETED_SUBSYSTEM_BAN fires. The import is
// unresolvable by design (`@ts-nocheck` keeps `tsc` quiet); `__fixtures__` is
// ignored by daily `npm run lint`, and the architecture test lints this file
// on demand with `ignore: false`.
import '@/domain/feature/Feature'
