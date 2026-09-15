# FamilyAccess state consolidation

This refactoring keeps the server-side entitlement decision and all externally observable behavior unchanged while reducing duplicate client-side access state.

- `useFamilyAccess` remains the single owner of the realtime access subscription and refresh lifecycle.
- `AiTools`, `AiAdviceLauncher`, and `DailySummaryEmailSettings` read the same shared snapshot instead of fetching their own copies.
- Preview-plan changes update the shared snapshot immediately after the existing callable succeeds.
- A late preview response is prevented from overwriting a newer family session.
- The Firebase deployment workflow is intentionally unchanged so this frontend-only refactoring does not widen production deployment scope.

The existing component tests now characterize that pricing, AI advice, and daily-summary settings do not issue their own `getFamilyAccess` requests. A focused store test also covers shared publication, preview transitions, and stale-session protection.
