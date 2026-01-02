<!-- Copilot instructions for agents working on Offline Invoice App -->
# Copilot instructions — Offline Invoice Maker

Purpose: give AI coding agents the essential, actionable context to be productive in this repo.

- Big picture:
  - This is a client-only Progressive Web App (PWA). All logic runs in the browser; there is no server component in the repo.
  - Offline-first design: service worker (`sw.js`) precaches UI and app assets and enables cache-first fetch behavior.
  - Persistent storage is local: `js/storage.js` uses IndexedDB (object store `invoices`) to persist invoices.
  - PDF generation and sharing are client-side: `js/pdf.js` uses `jsPDF`, and sharing uses URL hash (`#share=`) or WhatsApp links.

- Key files to inspect when making changes (examples):
  - `index.html` — primary UI and script order (loads `storage.js`, `pdf.js`, `app.js`).
  - `js/app.js` — main application logic and UI state (global `items`, event handlers, validation, keyboard shortcuts).
  - `js/storage.js` — IndexedDB open/save/get/delete helpers; use these functions for persistence.
  - `js/pdf.js` — PDF layout, watermark for free users, filename conventions, and `isPremium()` check.
  - `sw.js` — cache list (`PRECACHE_ASSETS`) and cache-first fetch strategy.
  - `manifest.json` — PWA metadata and `share_target` config.

- Important architecture notes (do not change lightly):
  - The app assumes client-only state. Avoid introducing server-side assumptions unless adding a new service explicitly.
  - Invoice numbering & counters are derived from the number of saved invoices (see `initializeInvoiceCounter()` in `app.js`). Changing this affects numbering logic.
  - Free vs Premium gating is enforced client-side (`localStorage` flag `premiumUser` and `isPremium()` in `pdf.js`). PDF watermark and usage limits are implemented in `app.js` + `pdf.js`.

- Developer workflows & commands (how to run/test locally):
  - Serve the repo over HTTP (service worker requires a server):
    - `python -m http.server 8000`
    - or `npx serve .`
    - or use VS Code Live Server extension (right-click `index.html`).
  - Open DevTools → Application to inspect IndexedDB (`invoiceDB` → `invoices`) and Service Worker registration.
  - To test shared link behavior create a URL with `#share=<base64>` (see `openShareModal` / load on startup in `app.js`).

- Project-specific conventions & patterns:
  - Vanilla JS, no bundler: keep code change minimal and avoid adding build steps unless required.
  - UI is DOM-manipulation heavy in `app.js` — prefer small, focused edits to avoid breaking global state.
  - IndexedDB helper functions (`openDB`, `saveInvoice`, `getInvoices`, `deleteInvoice`) return Promises — always `await` them.
  - Service worker uses a fixed cache name `offline-invoice-cache-v1`. Update cache name when changing precached assets.

- Integration & external dependencies:
  - `https://cdnjs.cloudflare.com/ajax/libs/jspdf/...` is loaded from CDN in `index.html` — offline builds rely on it being cached by the service worker.
  - WhatsApp sharing is implemented via `wa.me` URLs (no API keys).
  - PWABuilder pipeline referenced in `PWABUILDER_SETUP.md` for Android packaging and Google Play Billing setup.

- Debugging tips & quick examples:
  - If the service worker caches old assets, increment `CACHE_NAME` in `sw.js` and refresh; or unregister SW in DevTools → Application → Service Workers.
  - To reproduce PDF watermark: ensure `localStorage.setItem('premiumUser','false')` then generate a PDF (calls in `pdf.js`).
  - Inspect saved invoices: DevTools → Application → IndexedDB → `invoiceDB` → `invoices` (newest first returned by `getInvoices()`).
  - Shared-link load: append `#share=${btoa(JSON.stringify(invoiceObject))}` to the app URL; app will auto-load into the form.

- When editing code:
  - Keep changes isolated to one file when possible; update `PRECACHE_ASSETS` in `sw.js` if adding new static assets.
  - Preserve accessibility and ARIA patterns already implemented in `app.js` (search for `aria-` and `role=` usages).
  - Run manual smoke tests: create/save invoice, generate PDF, share via WhatsApp, load offline.

If anything here is unclear or you want more detail (examples of specific code locations), tell me which area to expand. After your feedback I will iterate the file.
