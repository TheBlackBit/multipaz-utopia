# Utopia Brewery — MCP Marketplace with UPay/DPC checkout

- **Date:** 2026-07-09
- **Branch:** `feature/brewery-mcp-marketplace`
- **Status:** Draft for review
- **Location:** `organizations/brewery/mcp` (new Node/TypeScript module) + a targeted extension of the existing `organizations/brewery/backend` (Kotlin)

## 1. Goal

Add an **agentic MCP marketplace** for the Utopia Brewery: one MCP server an AI
agent (Claude, ChatGPT, Goose, Claude Code) uses to browse the brewery catalog,
build a cart, and check out. Checkout is a **hand-off** to the repo's existing
**UPay + Digital Payment Credential (DPC)** ceremony — the buyer proves a 21+ age
credential **and** presents a `org.multipaz.payment.sca.1` DPC in one Multipaz
`multipazVerifyCredentials()` presentation, amount-bound via `transaction_data`,
settled by UPay's `PaymentProcessor`.

Modeled on [`openmobilehub/mcp-apps-shopping-demo`](https://github.com/openmobilehub/mcp-apps-shopping-demo),
built on the [`@openmobilehub/credentagent`](https://github.com/openmobilehub/credentagent)
SDK, but with the SDK's mock payment rail replaced by UPay/DPC.

## 2. Background & key finding

Two payment worlds exist and they do **not** natively interoperate:

- **CredentAgent SDK** (`@openmobilehub/credentagent-storefront` + `-gate`) is
  **Node/TypeScript**. `createStorefront()` stands up a full MCP shopping server
  (nine tools + a widget + a checkout page) in ~10 lines. Its built-in
  `payment.in("usd")` gate is its **own presence-only rail** (WebAuthn passkey /
  its own OpenID4VP mock, with optional x402/Hedera settlement). It has **no
  knowledge of UPay** or the Multipaz `PaymentProcessor` RPC.
- **UPay + DPC** in this repo is a **Multipaz/Kotlin** flow. The brewery's
  existing checkout already implements it end-to-end:
  - `organizations/brewery/backend/.../BreweryHandler.kt` `POST /checkout` takes
    `{productName, price}`, calls UPay's `PaymentProcessor.createTransaction()`,
    and returns `{ dcql, transaction_data, nonce }`.
  - The browser runs `multipazVerifyCredentials()` (served by `configureVerifier`),
    presenting an **age credential** (mDL / EU PID / PhotoID / Aadhaar) **and** a
    **DPC** (`org.multipaz.payment.sca.1`) in one OpenID4VP presentation.
  - `BreweryVerifierAssistant.processResponse()` checks age + DPC fields, then
    UPay's `PaymentProcessor.commitTransaction()` settles it.
  - `organizations/upay/backend` is the payment processor server
    (`TransactionProcessor.kt`), trust-anchored to the records/enrollment server.

**Consequence:** to "use UPay + DPC," the SDK is kept as the **agentic shopping
layer only** (catalog, cart, widget, MCP tools, order minting). The **checkout
hand-off targets the Multipaz UPay/DPC ceremony**, reusing the brewery Kotlin
backend rather than reimplementing Multipaz RPC in Node.

## 3. Decisions (approved)

| # | Decision | Choice |
|---|----------|--------|
| 1 | How to build on the SDK | Ready-made `createStorefront()` + injected brewery catalog |
| 2 | Widget UI | Use the SDK's built-in product-grid widget (no custom UI) |
| 3 | Payment rail | **UPay + DPC** (not the SDK's mock rail, not x402/Hedera) |
| 4 | Integration shape | SDK for shopping; **checkout hands off** to UPay/DPC |
| 5 | Where the ceremony lives | **Reuse & extend** the brewery Kotlin backend |

## 4. Architecture

Two cooperating servers:

```
AI host (Claude / ChatGPT / Goose / Claude Code)
        │  MCP over streamable HTTP  (/mcp)
        ▼
┌─────────────────────────────────────────┐        ┌──────────────────────────────────────────────┐
│  Node MCP server  (organizations/        │        │  Brewery Kotlin backend (extended)             │
│  brewery/mcp)  — @openmobilehub/          │        │  organizations/brewery/backend                 │
│  credentagent-storefront                        │        │                                                │
│                                           │        │  GET  /checkout?order=<id>   → cart-aware      │
│  tools: browse / add / set-qty / remove / │        │        UPay/DPC ceremony page                  │
│  get-cart / checkout / details / reviews /│        │  POST /checkout               → createTransaction│
│  get-order-status   + widget resource     │  link  │  (verifier) make_request / process_response    │
│                                           │ ─────► │  multipazVerifyCredentials(): age + DPC        │
│  checkout tool mints order, returns       │        │  BreweryVerifierAssistant → UPay commit        │
│  checkoutUrl = <breweryBaseUrl>/checkout  │        │  GET  /checkout/order-status?orderId=<id>      │
│  GET /order?order=<id> (order read seam)  │ ◄───── │        (completion for the widget poll)         │
└─────────────────────────────────────────┘  fetch  └──────────────────────────────────────────────┘
                                              order            │
                                                               ▼
                                                     UPay backend (organizations/upay/backend)
                                                     PaymentProcessor.createTransaction / commitTransaction
                                                               │
                                                     Records / enrollment server (trust anchor)
```

### The three execution contexts (SDK's model, adapted)

1. **Tool — mints the link.** The `checkout` MCP tool snapshots the cart into an
   order (priced from the Node catalog), stores it, and returns
   `{ orderId, checkoutUrl }` where `checkoutUrl` points at the **brewery
   backend**. No wallet in the loop yet.
2. **Page — runs the ceremony.** The buyer opens `checkoutUrl`. The brewery page
   fetches the order total from the Node server, calls UPay
   `createTransaction(total)`, and runs `multipazVerifyCredentials()` for **age +
   DPC** in one presentation. `BreweryVerifierAssistant` verifies and UPay commits.
3. **Poll — reports completion.** The brewery serves
   `GET /checkout/order-status?orderId=<id>`; the widget polls it and shows the
   confirmation. (Reflecting completion in the `get-order-status` **MCP tool** is
   an optional enhancement — see §8.)

## 5. The hand-off wiring (the crux)

The SDK's `checkout` tool hardcodes
`checkoutUrl = \`${baseUrl}/checkout?order=${order.id}\`` (storefront
`server.ts:526`); there is **no option to override the checkout URL**. `baseUrl`
is the lever. Therefore:

- **`createStorefront({ baseUrl })` is set to the brewery backend origin**, so the
  minted `checkoutUrl` resolves to the brewery's `GET /checkout` page.
- The order lives in the Node server's `createdOrderStore` (default in-memory). We
  **inject our own instance** and add a read route on the storefront's Express app
  (`store.app`) so the brewery page can fetch it:
  `GET /order?order=<id>` → `{ orderId, total, currency, lines:[{name, quantity, lineTotal}] }`.
  This endpoint sets `Access-Control-Allow-Origin` so the brewery page (different
  origin in local dev) can read it. In the docker/nginx deployment both sit behind
  one origin (like the existing `/brewery/` routing), so CORS is moot.
- **Order read, not order price, crosses the wire.** The amount originates from the
  Node catalog pricing; the brewery backend passes it to UPay `createTransaction`,
  which binds it into the DPC `transaction_data`. This matches the existing trust
  model (today the browser posts `{price}` and the merchant sets the transaction
  amount).

**Alternative considered (not chosen for v1):** enable the SDK's
`statelessOrders: true` so the order rides on the link as a signed Cart Mandate
(`?order=<id>&cart=<base64url>`), letting the brewery decode it with a shared
`GATE_SECRET` and skip the fetch-by-id round-trip. Rejected for v1 because it
couples the brewery to the SDK's internal Cart Mandate wire format; the explicit
`GET /order` endpoint is easier to reason about. Revisit if a stateless/serverless
deployment needs it.

## 6. Component A — Node MCP module (`organizations/brewery/mcp`)

```
organizations/brewery/mcp/
├── package.json          # ESM ("type":"module"); deps: @openmobilehub/credentagent-storefront (^0.2)
├── tsconfig.json         # NodeNext, target ES2022, strict
├── .env.example          # BREWERY_CHECKOUT_ORIGIN, MCP_PORT, (optional) GATE_SECRET
├── .gitignore            # node_modules, dist, .env
├── README.md             # run + "add to Claude/ChatGPT/Goose/Claude Code" + stack deps + honest caveat
├── src/
│   ├── catalog.ts        # brewery Product[] + reviews (the real authoring work)
│   ├── orderStore.ts     # tiny in-memory OrderStore we hold a reference to
│   └── server.ts         # createStorefront(...) + /order read route + listen
└── test/
    └── catalog.test.ts   # pure-model pricing check over the brewery catalog
```

- **`catalog.ts`** — the brewery product list using the SDK's `Product` shape
  (`{ id, name, price, currency, image, category, description, minimumAge? }`).
  Craft spirits & beers with `minimumAge: 21` (Old Oak Bourbon, Highland Botanical
  Gin, Winter Wheat Vodka, Dark Port Spiced Rum, Heritage Batch Rye, Islay Mist
  Single Malt — mirroring `brewery.js`'s existing catalog and reusing its
  `images/*.webp`), **plus a few non-restricted merch items** (branded pint-glass
  set, tee, tasting-tour gift card) so the flow demonstrates a cart with and
  without an age gate. Exports `{ catalog, reviews }`.
- **`orderStore.ts`** — a minimal `OrderStore<Order>` (Map-backed `read`/`write`/
  `clear`) so `server.ts` can both hand it to `createStorefront` and read from it
  in the `/order` route.
- **`server.ts`** — wiring:
  ```ts
  const orders = new MemoryOrderStore();
  const store = createStorefront({
    catalog, reviews,
    createdOrderStore: orders,
    baseUrl: process.env.BREWERY_CHECKOUT_ORIGIN,   // e.g. http://localhost:8010
  });
  store.app.get("/order", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const o = await orders.read(String(req.query.order ?? ""));
    o ? res.json(o) : res.status(404).json({ error: "unknown order" });
  });
  const { url } = await store.listen(Number(process.env.MCP_PORT ?? 3005));
  ```
  Note: `new CredentAgent().mount()` and `store.gate()` are **intentionally not
  used** — UPay/DPC replaces the SDK's gate, so surfacing an SDK `requires`
  manifest (whose approve links would point at unmounted `/credentagent/*` routes)
  would be misleading.
- **`package.json`** scripts: `dev` (`tsx src/server.ts`), `start`, `test`
  (`vitest run` or `node --test`). `tsx` gives zero-build dev.

## 7. Component B — Brewery Kotlin backend extension (`organizations/brewery/backend`)

Reuse the existing UPay/DPC machinery; generalize it from single-product to a
cart order and add the pages/routes the hand-off needs.

- **Cart-aware checkout page** — a new `checkout.html` + `checkout.js` (frontend
  module) served at `GET /checkout`. It:
  1. reads `order` from the query string,
  2. `fetch`es `<MCP_ORIGIN>/order?order=<id>` for `{ total, currency, lines }`
     (MCP origin from a build/runtime config value, mirroring `breweryBaseUrl`),
  3. renders an order summary,
  4. on confirm, `POST`s `{ description, price }` to `/checkout` (description =
     e.g. "Utopia Brewery — N items"; price = total), then runs
     `multipazVerifyCredentials()` with the returned `{ dcql, transaction_data,
     nonce }` — **exactly the existing `brewery.js` `onBuyClick` flow**, reused.
- **`BreweryHandler.breweryCheckout`** — already amount-based; keep as-is (it takes
  `{productName/description, price}`). Optionally rename the field to `description`
  for clarity. `BREWERY_DCQL_QUERY` already requests age + the `payment` DPC — no
  change needed. `BreweryVerifierAssistant` age + DPC + UPay commit — **no change**.
- **Completion status route** — add `GET /checkout/order-status?orderId=<id>`
  returning `{ completed, order }`. Back it with a small in-memory
  completed-orders map keyed by order id, written when
  `BreweryVerifierAssistant.processResponse()` approves. Enables the widget's
  post-checkout poll (§8). The `orderId` threads through from the checkout page.
- **Age threshold** — the existing brewery verifier checks **≥ 18**. Products here
  are labeled 21+. Decision for review: keep the backend's 18+ logic (matches the
  current module and Multipaz `age_over_18` claim priority) **or** tighten the
  brewery flow to 21+. Recommend **keep 18+** for v1 to avoid touching the
  verified `checkAge` logic / `CheckAgeTest`; note the discrepancy in the README.

## 8. Completion reflection (scope)

- **v1 (in scope):** the brewery serves `/checkout/order-status`; the SDK widget
  polls it and shows the confirmation. The checkout page itself also shows the
  approved result (the existing `showResult` overlay).
- **Optional (deferred):** make the **`get-order-status` MCP tool** reflect
  completion too. This needs the brewery backend to notify the Node server on
  commit (a `POST /order/complete` webhook writing the Node `orderStore` that
  `get-order-status` reads). Deferred because it adds a cross-language callback for
  a secondary UX nicety; the agent can otherwise report "complete checkout on the
  page."

## 9. Loyalty discount (scope)

The original brief included an optional loyalty discount. The existing UPay/DPC
ceremony does **age + payment only**. Recommend **deferring loyalty to v1.1** to
keep the ceremony identical to the working brewery flow. If wanted in v1: add the
`org.multipaz.loyalty.1` doctype to `BREWERY_DCQL_QUERY` and apply
`LOYALTY_DISCOUNT_PCT` to the total before `createTransaction`. Flagged for the
reviewer to confirm.

## 10. Security posture

Inherited and unchanged from the existing UPay/DPC flow:
- Fail-closed gates; age requires an explicit positive claim.
- The DPC is verified against the trust manager (`org.multipaz.payment.sca.1`
  issuer trust) and the amount is bound in `transaction_data`.
- Per-order state; no global cart on the ceremony side.
- **Honest caveat (carried in the README):** the CredentAgent SDK's own status is
  `trust_level: "presence-only-demo"`, but here the actual credential ceremony is
  the **Multipaz UPay/DPC** flow with real issuer trust via the records server —
  the sample's trust properties are those of the existing brewery/UPay demo, not
  the SDK's mock rail.

## 11. Testing

- **Node (unit):** `catalog.test.ts` against the pure pricing model
  (`priceCart`/`createOrder` from `@openmobilehub/credentagent-storefront`) over
  the brewery catalog — asserts (a) an all-merch cart is not age-restricted,
  (b) any spirit/beer cart is, (c) totals are correct.
- **Kotlin (unit):** extend the existing `CheckAgeTest` coverage if the age
  threshold changes; add a small test for the cart-aware checkout handler input
  (description + total → transaction request).
- **Manual e2e:** documented in the README — run records/enrollment + UPay + brewery
  backend + the Node MCP server, add the `/mcp` URL to a host (or use
  `npx @modelcontextprotocol/inspector`), browse → cart → checkout → complete the
  age + DPC presentation with a wallet → see the approved result.

## 12. Non-goals (YAGNI)

- No x402 / Hedera on-chain settlement (UPay is the settlement rail).
- No `CredentAgent().mount()` / SDK `store.gate()` (UPay replaces the gate).
- No Redis / Firestore stores; in-memory only.
- No custom widget UI (the SDK's is used).
- No Vercel/Docker config authored in v1 beyond notes (deployment mirrors the
  existing nginx pattern; a follow-up can add compose wiring).
- No change to `BreweryVerifierAssistant` verification logic beyond recording
  completion for the status route.

## 13. Running it (dev)

Requires the multipaz-utopia stack (same as the existing brewery demo):
1. Records/enrollment server + UPay backend + brewery backend running (Gradle
   `:organizations:brewery:backend:run` etc., or the docker stack).
2. `cd organizations/brewery/mcp && npm install && BREWERY_CHECKOUT_ORIGIN=http://localhost:8010 npm run dev`
   → MCP at `http://localhost:3005/mcp`.
3. Add the `/mcp` URL to Claude / ChatGPT / Goose / Claude Code.

## 14. Open questions / risks

1. **Age threshold** (§7): keep the backend's 18+ or tighten to 21+? (Recommend 18+ for v1.)
2. **Loyalty** (§9): include in v1 or defer? (Recommend defer.)
3. **`get-order-status` MCP completion** (§8): include the brewery→Node webhook or defer? (Recommend defer.)
4. **Widget order-status poll URL** — confirm during implementation that the SDK
   widget polls `\`${baseUrl}/checkout/order-status\`` (so pointing `baseUrl` at
   the brewery backend routes the poll there). If the widget derives it
   differently, add the route accordingly. Low risk; validated against the bundle
   during build.
5. **Two catalogs** — the Node module and the existing `brewery.js` both define
   products. The Node catalog is authoritative for the MCP cart; the legacy
   `brewery.js` product page is untouched. Acceptable duplication for a sample.

## 15. File-by-file change list

**New (Node module):**
- `organizations/brewery/mcp/package.json`
- `organizations/brewery/mcp/tsconfig.json`
- `organizations/brewery/mcp/.env.example`
- `organizations/brewery/mcp/.gitignore`
- `organizations/brewery/mcp/README.md`
- `organizations/brewery/mcp/src/catalog.ts`
- `organizations/brewery/mcp/src/orderStore.ts`
- `organizations/brewery/mcp/src/server.ts`
- `organizations/brewery/mcp/test/catalog.test.ts`

**New (brewery frontend):**
- `organizations/brewery/frontend/src/main/resources/resources/www/checkout.html`
- `organizations/brewery/frontend/src/main/resources/resources/www/checkout.js`

**Modified (brewery backend):**
- `ApplicationExt.kt` — route `GET /checkout` (page), `GET /checkout/order-status`.
- `BreweryHandler.kt` — record completion for the status route; (optional) rename
  `productName` → `description`.

**Docs:**
- `organizations/brewery/README.md` — document the new `mcp/` sibling module.
