# 哈沁咪@泰坦 潛水艇工房

## Current build

Node.js 26+, ES2025 browser modules, esbuild 0.28.2, and sql.js 1.16.0 (WASM inline build). Versions are pinned in the lockfile or vendored asset with its MIT license. No browser dependency is loaded from a third-party CDN.

`build.mjs` compiles separate ES-module and CSS assets with content-versioned URLs, plus the Worker API. HTML is a small shell; browser assets are cached across pages. The local database engine loads only when a visitor uses guest mode.

## Data boundaries

- Calculation: pure ESM files, including preparation, execution, reservations, priority and acquisition metadata.
- View: UI files assembled into one ES-module entry. The data notice identifies the active mode.
- Guest storage: `guest-db.mjs` / `guest-ui.js` reuse the transactional handlers in a browser-only SQLite file. The file is saved under `hachimi-guest-db-v1` in that origin's localStorage; Web Locks serialize tabs. Local saves never call the cloud data API. Quota failures do not replace the prior saved file.
- Signed-in storage: original account session and shared D1 tables. All cloud stock, search and comment reads require authentication. API writes retain validation, reservations, revisions and idempotent receipts. Signing in does not import guest stock; signing out restores it.
- The build creates a client-only handler factory with a local identity. This is isolated inside the client module; the deployed Worker uses the original signed-session validation. No production credentials are part of generated assets.

Default mandatory-stock location is FC chest page 4. Per-material location changes preserve quantity and reservation protection; shared changes require re-entering the current account password. The site records the location but does not control the game chest.

## Checks

Run `npm ci`, `node build.mjs`, then the tests listed in `.github/workflows/pages.yml`. Guest tests cover reload persistence, isolated stores, completion replay, quota failure, custom chest pages and blocked anonymous cloud reads. Browser QA also covers guest → account → guest switching without merging stock.

`special-sources.json` keeps dated acquisition evidence, including items that cannot be listed on the market. New acquisition labels must be positively verified rather than inferred from a missing gathering record.
