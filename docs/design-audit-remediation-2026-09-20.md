# Twinly design audit remediation — 2026-09-20

Baseline audit: `Twinly-design-audit-2026-09-19.md` on `refactor/full-codebase-cleanup`.

The remediation keeps UI behavior, data meaning, authentication, entitlement, synchronization ordering, storage compatibility, and public Cloud Function names unchanged unless the behavior was already fixed on current `master`.

| Finding | Remediation |
| --- | --- |
| F01 CI coverage gaps | Normal Vitest includes parity tests; PR CI runs all Functions tests; independent Firestore Rules emulator and Wear OS build workflows cover those boundaries. |
| F02 Dialog/history reverse dependency | Generic Dialog is feature-agnostic. `HistoryDialogShell` owns history icon, explicit baby identity, preload and swipe switching. |
| F03 sync responsibilities mixed | Event merge policy/field list, diagnostics persistence, and React sync presentation are separated. Queue/confirmed/conflict/receipt semantics remain in AppStore. |
| F04 App/session/sync ownership | Backup I/O, family session lifecycle and history-loading policy are extracted. Orphan family-access bootstrap state was removed. |
| F05 access rules distributed | Named access-policy functions and `docs/family-access-contract.md` document and test intentional entrypoint differences. |
| F06 daily summary export collision | `main.js` explicitly owns daily-summary exports; duplicate legacy handlers were removed from `ai-service.js`. Public Function names remain unchanged. |
| F07 shared diaper stock distributed | Web shared-stock rules are centralized. Wear stock rules are isolated separately with characterization tests so intentional differences are preserved. |
| F08 display components own business calculations | Sleep history calculations, BabyPanel view-model/health draft state, Settings gauge policy and Settings tabs were extracted. |
| F09 Wear voice/backend monolith | Wear rule parser, event projector and stock projector are pure modules covered directly by tests. |
| F10 hidden window/DOM coupling | Comfort controls use explicit React refs/callbacks. Cross-boundary AI-open and Android-auth events have a typed central contract. |
| F11 dead/ambiguous interfaces | Unused Settings/Wear props, unused helpers, orphan bootstrap state and unreachable Wear pairing client code were removed. Magic interaction/layout values have named owners. Notification-oriented naming is used behind compatibility aliases. |
| B01 AI late response/session leak | Current master already scopes AI state by family-access key and rejects late responses after identity changes. |
| B02 sync overwrites in-progress drafts | Current master initializes Milk/Settings drafts only on open. Baby health inputs now also protect dirty values from remote refresh. |
| B03 onboarding logger dependency | Logger is an explicit family-functions dependency with a safe default and is injected from the Functions entrypoint. |

## Intentionally retained compatibility contracts

- v1/v2 storage readers and migration gates.
- pending-event reader/removal paths needed for old unsent records.
- AppStore queue, confirmed overlay, conflict records and receipt replay ordering.
- `AppSnapshot.completeHistory` as an explicit repository snapshot semantic marker used by characterization tests.
- `AiDraft` and `DailySummaryEmailSettings` aliases where existing manual-save/imports may still depend on the old names.
- Existing Cloud Function endpoint names, authentication checks, owner fallbacks and Premium conditions.

These retained paths are not candidates for cleanup without separate usage evidence and migration/rescue validation.
