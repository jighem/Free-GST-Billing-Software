# Anytime GST — Full original-portal integration acceptance

Brand: **Anytime GST**  
Tagline: **Your GST. Anytime. Anywhere.**

## Requirement

After **registration → verified email → login → workspace selection → one-time company setup**, users must enter the **full original Free-GST-Billing-Software portal**, with its existing interactive modules, layout, components and invoice/PDF features preserved wherever technically compatible.

The current `apps/portal/src/BillingWorkspace.jsx` is an **intermediate, read-only dashboard only**, **not** completion of this requirement. Merely displaying the navigation, using an iframe, or enabling buttons without safe working APIs does not count as full integration.

## Source inventory (fork)

- `src/App.jsx`: full application layout, menu, feature routing, first-run setup.
- `src/components/Dashboard.jsx`: saved invoices, status, printing and business overview.
- `src/components/InvoiceGenerator.jsx`, `InvoicePreview.jsx`, `PrintPreviewModal.jsx`: invoicing/printing/PDF.
- `src/components/ClientsView.jsx`, `ClientModal.jsx`: customer management and linked invoices.
- `src/components/InventoryView.jsx`: product and stock management.
- `src/components/PurchaseBills.jsx`, `PurchaseOrders.jsx`, `ReceiptVoucher.jsx`, `ExpenseTracker.jsx`, `CashBook.jsx`: finance workflows.
- `src/components/RecurringInvoices.jsx`, `ReportsView.jsx`, `GSTReturns.jsx`, `IncomeTax.jsx`: other functional modules.
- `src/components/SettingsView.jsx`: configuration, GST and customization.
- `src/store.js`: core legacy browser data adapter, currently calls `/api/*`.
- `server.js`: local Express JSON-file backend, **not approved for internet-facing multi-tenant hosting**.

## Safety and feature coverage gates

1. **Preserve the original React UI** in the shared SaaS frontend. Use the existing components and styles; introduce a SaaS integration adapter, not a parallel imitation of every screen.
2. **Keep NestJS as the sole public backend**. No public exposure of the original local JSON `server.js`, host filesystem, backup/restore, OS control-panel, local PIN lock, offline sync or unrestricted file import endpoints.
3. **Authorize each operation** using current bearer session plus tenant membership and company access; `tenant_id` must be scoped in a PostgreSQL transaction with FORCE RLS. Never trust a tenant identifier alone from a client URL or header.
4. **Map the old store API contracts** (`/api/bills`, `/api/profile`, `/api/clients`, `/api/products`, `/api/meta`, `/api/purchases`, receipts, reports, etc.) to independently tested tenant-aware NestJS APIs, then point the original React store functions at those APIs.
5. **Preserve business rules** for tax rates, HSN/SAC, GSTIN and state validation, invoice types, numbering, credit/debit behavior, stock, cancellations, payments and PDF. Verify each before accepting writes.
6. **Reuse existing user-facing components** for dashboard, invoice creation/editing, customers, stock/products, purchases, reports, GST Returns, expenses, cashbook, templates and settings. A menu item is complete only when the action functions end-to-end and can be used without calling an unsafe endpoint.
7. **Enforce tenant A/B isolation** for every API and exported report, including update/delete/import/print/PDF paths, not merely the dashboard metrics.
8. **Keep signup gated** until MailEnable outbound verification, expiration, resend, anti-abuse and session security are verified.
9. **Do not upload/live-enable a partial portal as a finished release**. A staged deployment must show precisely which original modules are functional; don't mislabel inactive modules as active.
10. **Preserve existing deployments and rollback**: staging-api.anytimegst.com and staging.anytimegst.com Plesk changes only after candidate API, frontend, CI, and A/B browser workflows pass.

## Migration workstreams (all required for final parity)

| Workstream | Original reuse | Tenant-aware backend | Acceptance |
| --- | --- | --- | --- |
| Login/registration/company | New SaaS portal | NestJS identity/onboarding/company | New account enters original app after first setup |
| Profile / settings | SettingsView + existing print prefs | Profile / settings read/write | Profile persisted per company, survives login |
| Clients | ClientsView + ClientModal | Customer CRUD | Add/edit/delete/search clients in A; B sees none |
| Products / stock | InventoryView | Product CRUD and stock ledger | Items saved per company; B cannot read/update |
| Invoices | Dashboard + InvoiceGenerator + InvoicePreview | Invoice + lines, counters, tax, status | New/edit/issue/void/print; unique numbering |
| Purchases/expenses | PurchaseBills, PurchaseOrders, ExpenseTracker | Tenant purchase/expense models | Create/edit/report without cross-company access |
| Cash / receipts | CashBook, ReceiptVoucher | Tenant payment and ledger models | Paid/partial/unpaid balances correct |
| Reports and GST | ReportsView, GSTReturns, IncomeTax | Tenant-filtered aggregates + exports | No cross-tenant reports; verify statutory correctness |
| Templates/customization | PrintSettings, templates, branding | Tenant/company settings | Existing PDF templates preserved |
| Integration APIs | Existing business model | Scoped tokens, webhooks, audit | Third-party API cannot escape permitted tenant |

## Implementation order (does not reduce final scope)

Foundation already done → **shared auth-aware original-app shell and storage contract adapter** → profile/settings → clients/products → invoices/PDF → purchases/expenses/receipts → GST reports → subscription entitlement/API integration → end-to-end full parity.

### Current status

- M1/M2 identity and company onboarding: working in staging with synthetic accounts.
- M3 read-only dashboard bridge: committed, but **not the original full portal**.
- Full original UI / API contract migration: **outstanding**. Do not promise it is ready merely because CI for read-only dashboard passes.

The operating goal is **one Anytime GST product**, not two independent business applications.
