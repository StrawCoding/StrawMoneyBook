# iOS Widget Catalog Plan for SMB-12

## Current Status
- The repository currently has Android widget infrastructure only.
- There is no `frontend/ios/` native project or Widget Extension target in the workspace.
- SMB-12 v2 is implemented on Android first; this document defines the iOS follow-up shape without implementing it.

## Target Catalog
- Keep parity with Android's split widget catalog:
  - Income/expense pie chart widget
  - Income/expense bar chart widget
  - Quick add widget
  - AI bookkeeping widget
- Allow small / medium / large family mapping where the platform supports it.
- Preserve the rule that each widget has one responsibility only.

## Shared Data Contract
- Widget data should be stored outside the web view and made available to the iOS Widget Extension via App Group shared storage.
- Minimum shared payload:
  - `ledgerName`
  - `currencyCode`
  - `incomeMinor`
  - `expenseMinor`
  - `netMinor`
  - `generatedAt`
- The chart widgets should continue to use the active ledger's current-month data only.
- Quick add and AI widgets do not need chart payloads, but should still receive `ledgerName` for subtitle or context.

## Native Architecture
- Add an iOS Widget Extension target with WidgetKit + SwiftUI.
- Add an App Group so the Capacitor app and Widget Extension can read the same serialized widget payload.
- Mirror Android deep-link behavior:
  - chart widgets open `/analysis`
  - quick add widget opens `/transactions/quick-add`
  - AI widget opens `/ai-auto-bookkeeping`
- Keep the deep-link contract app-side, not widget-specific, so Android and iOS route behavior stays aligned.

## Implementation Notes for Future Ticket
- Add a native iOS plugin or bridge helper that writes widget payload JSON into App Group storage whenever Android's `HomeWidget.updateSummary` equivalent runs.
- Introduce one WidgetKit entry per catalog item, not one combined dashboard widget.
- Map family behavior like this:
  - small: single chart or single action emphasis
  - medium: complete primary content
  - large: denser detail while keeping the same single responsibility
- Do not add widget configuration UI, account switching, or user-customized chart modes in the first iOS ticket.
