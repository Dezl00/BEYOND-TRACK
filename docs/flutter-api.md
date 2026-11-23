# Flutter API integration

Use the deployed HTTPS origin as the base URL. Routes are relative to that origin. Send JSON with Content-Type: application/json except for file uploads. Persist and rotate the server session cookie using a secure device cookie store. For mutations send Origin equal to the API origin. Keep the cookie scoped to that host; do not forward it to external links. Login, OTP, forgot, reset, rotate and logout use POST /api/auth/{action}. Process the login response before entering the platform. After authentication fetch GET /api/v1/pages/me. A forced password change directs the user to security. Errors have an error message and an HTTP status.

## Screen inventory

| Screen or tool | Read | Write |
|---|---|---|
| Shell, More, account, role permissions | /api/v1/pages/me returns navigation, permissionCatalog and effective permissions | /api/auth/display, preferences, password |
| Dashboard | /api/v1/pages/dashboard?project=UUID | Navigation |
| Projects, BOQ, materials, units, suppliers, users, roles | /api/v1/pages/{projects,boq,materials,units,suppliers,users,roles} (choose one) | project, boq, material, unit, supplier, user, role, activation, delete |
| Requests and workflow queues | /api/v1/pages/{requests,construction,technical,project_management,procurement,finance,accounts,receipts} | See workflow commands below |
| Create and edit | /api/options?resource=projects or materials; /api/requests/{id} for existing values | request |
| Detail and actions | /api/requests/{id} includes lines, quotes, files, receipts and actions (boolean flags) | transition, technical-review, quotations, order, invoice, receipt, overage |
| Print, history, attachments and receipt detail | /api/requests/{id}?part=header, lines, history, attachments or receipts (one value); pass cursor for subsequent pages | POST /api/attachments; GET /api/attachments/{id} to download |
| Reports | /api/v1/pages/reports lists projects; add project for context, overview and data; filters include from, to and items | GET /api/reports/export; authorized print view /reports/print |
| Audit and notifications | /api/v1/pages/audit, /api/v1/pages/notifications, /api/live | notification-read |
| Settings tabs | /api/v1/pages/appearance, security, notification-preferences or system (replace last segment) | preferences, password, settings, revoke-session |
| User sessions | /api/users/{id}/sessions | revoke-session |
| Owner cleanup and project removal | Select scope using projects list | request-purge-code then request-purge-confirm; project-delete-code then project-delete-confirm |
| Import preview, commit, templates, exports | GET /api/import or /api/export with the existing resource filters | POST /api/import following the web import form |
| Device notifications | /api/push serves the Web Push public key | Existing subscription API accepts Web Push subscriptions. Android registers its FCM token via POST /api/v1/android/push with {"token":"..."}; send {"token":"...","remove":true} to unsubscribe. Android delivery uses the current session, notification preferences and request visibility. |

List routes accept the web filters (including q, project, status and cursor where applicable). Continue with the returned next cursor and the same filters. Collections generally return items and next. Report data has its own cursor. Fetch a fresh detail after a successful command or a version conflict to update the buttons. The server enforces authorization on every operation.

## Command contract

POST /api/commands with {"command":"notification-read","data":{"id":"<notification UUID>"}} for a single notification. Other commands use the same envelope. Commands and their exact Zod input schemas are paired in src/app/api/commands/route.ts and defined in src/lib/validation.ts. Preserve request version fields from detail for concurrent edits. A button that opens a sheet, changes a filter or starts printing is local Flutter behavior. Submit the corresponding command when the user confirms the operation.

## Implementation references

Authentication schema and response dispatch: src/app/api/auth/[action]/route.ts and src/server/auth.ts. Upload fields: src/app/api/attachments/route.ts. Import modes and form fields: src/app/api/import/route.ts. Export parameters and formats: src/app/api/export/route.ts and src/app/api/reports/export/route.ts. Workflow transition targets and form payloads: src/components/request-actions.tsx, technical-review.tsx, quotation-editor.tsx, payment-form.tsx and receipt-form.tsx. Display strings: src/messages/ar.ts and en.ts. Device installation, share, print, file selection and offline UI use handset facilities.


## Android submission retries

A new submitted request may include a UUID in data.submissionId. Keep the same UUID and payload for every retry. The server records the payload hash and resulting request ID atomically with the purchase request. Reusing a key with different data produces a conflict. Apply drizzle/custom/0017_mobile_submissions.sql via the project migration runner before enabling this client. Existing callers can omit submissionId.

The Android client queues confirmed submissions by account. Its foreground worker checks the queue every 12 seconds while unlocked. Cached reads are scoped to the authenticated session and expire with it. Rejected submissions stay visible for review. Android does not guarantee execution of this foreground worker after process termination.
