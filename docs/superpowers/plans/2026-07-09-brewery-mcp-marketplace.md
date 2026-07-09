# Brewery MCP Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an agentic MCP marketplace for the Utopia Brewery whose checkout hands off to the repo's existing Multipaz UPay + Digital Payment Credential (DPC) ceremony.

**Architecture:** A new standalone Node/TypeScript module (`organizations/brewery/mcp`) uses `@openmobilehub/credentagent-storefront`'s `createStorefront()` for the MCP shopping tools + widget + cart + order minting. Its `checkout` tool returns a link (`${BREWERY_CHECKOUT_ORIGIN}/checkout?order=<id>`) to the existing brewery Kotlin backend, extended with a cart-aware checkout page that runs `multipazVerifyCredentials()` (age credential + `org.multipaz.payment.sca.1` DPC) and settles via UPay. The Node server exposes `GET /order?order=<id>` so the brewery page can read the order total.

**Tech Stack:** Node ≥20 + TypeScript (ESM, `tsx`), `@openmobilehub/credentagent-storefront` / `-gate` (^0.2), `node:test`; Kotlin/Ktor + Multipaz (existing brewery + UPay backends).

**Spec:** `docs/superpowers/specs/2026-07-09-brewery-mcp-marketplace-design.md`

**v1 scope decisions (from spec §14):** age threshold stays the backend's existing ≥18; loyalty discount deferred; `get-order-status` MCP-tool completion deferred (widget poll only). Catalog images use `picsum.photos` because the widget CSP (`IMAGE_DOMAINS`) allows only `picsum.photos` + `data:`.

---

## File Structure

**New — Node module (`organizations/brewery/mcp/`):**
- `package.json` — ESM package, deps, scripts.
- `tsconfig.json` — NodeNext, strict, `--noEmit` typecheck.
- `.gitignore`, `.env.example`.
- `README.md` — run + host-add + honest caveat.
- `src/catalog.ts` — brewery `Product[]` + `reviews`.
- `src/orderStore.ts` — `MemoryOrderStore` implementing `OrderStore<Order>`.
- `src/server.ts` — `buildStore()`: `createStorefront(...)` + the `/order` read route.
- `src/main.ts` — entry point (`store.listen`).
- `test/catalog.test.ts`, `test/orderStore.test.ts`, `test/server.test.ts`.

**New — brewery frontend (`organizations/brewery/frontend/src/main/resources/resources/www/`):**
- `checkout.html` — cart checkout page (order summary + confirm).
- `checkout.js` — fetch order → POST `/checkout` → `multipazVerifyCredentials()` → mark complete.

**Modified — brewery backend (`organizations/brewery/backend/src/main/java/org/multipaz/brewery/server/`):**
- `BreweryCheckoutStatus.kt` (new) — `GET /checkout` redirect, `POST /checkout/complete`, `GET /checkout/order-status` handlers + in-memory completion map.
- `ApplicationExt.kt` — wire the three new routes.

**Modified — docs:**
- `organizations/brewery/README.md` — document the new `mcp/` sibling module.

---

## Task 1: Scaffold the Node module

**Files:**
- Create: `organizations/brewery/mcp/package.json`
- Create: `organizations/brewery/mcp/tsconfig.json`
- Create: `organizations/brewery/mcp/.gitignore`
- Create: `organizations/brewery/mcp/.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@utopia/brewery-mcp",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Utopia Brewery MCP marketplace — CredentAgent storefront with UPay/DPC checkout hand-off.",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx src/main.ts",
    "start": "tsx src/main.ts",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test test/catalog.test.ts test/orderStore.test.ts test/server.test.ts"
  },
  "dependencies": {
    "@openmobilehub/credentagent-gate": "^0.2.0",
    "@openmobilehub/credentagent-storefront": "^0.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 4: Create `.env.example`**

```
# Origin the checkout link points at — the Utopia Brewery Kotlin backend.
# Local dev default is http://localhost:8010; set to your LAN IP or public origin as needed.
BREWERY_CHECKOUT_ORIGIN=http://localhost:8010

# Port the MCP server listens on (the URL you add to Claude / ChatGPT / Goose).
MCP_PORT=3005
```

- [ ] **Step 5: Install dependencies**

Run: `cd organizations/brewery/mcp && npm install`
Expected: installs `@openmobilehub/credentagent-*`, `tsx`, `typescript`, `@types/node`; creates `node_modules/` + `package-lock.json`. No error.

- [ ] **Step 6: Commit**

```bash
git add organizations/brewery/mcp/package.json organizations/brewery/mcp/tsconfig.json organizations/brewery/mcp/.gitignore organizations/brewery/mcp/.env.example organizations/brewery/mcp/package-lock.json
git commit -m "chore(brewery-mcp): scaffold Node/TS MCP module"
```

---

## Task 2: Brewery catalog

**Files:**
- Create: `organizations/brewery/mcp/src/catalog.ts`
- Test: `organizations/brewery/mcp/test/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `organizations/brewery/mcp/test/catalog.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart, createOrder } from "@openmobilehub/credentagent-storefront";
import { catalog } from "../src/catalog.js";

test("merch-only cart is not age-restricted", () => {
  const cart = priceCart([{ productId: "tasting-glasses", quantity: 2 }], catalog);
  assert.equal(cart.hasAgeRestricted, false);
  assert.equal(cart.total, 56); // 28.00 * 2
});

test("any spirit makes the cart age-restricted (21+)", () => {
  const cart = priceCart([{ productId: "old-oak-bourbon", quantity: 1 }], catalog);
  assert.equal(cart.hasAgeRestricted, true);
  assert.equal(cart.lines[0].minimumAge, 21);
});

test("createOrder snapshots the priced total", () => {
  const order = createOrder(
    [
      { productId: "old-oak-bourbon", quantity: 1 }, // 84.00
      { productId: "highland-gin", quantity: 2 },    // 52.00 * 2
    ],
    "ORD-1",
    catalog,
  );
  assert.equal(order.total, 188);
  assert.equal(order.currency, "USD");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd organizations/brewery/mcp && node --import tsx --test test/catalog.test.ts`
Expected: FAIL — cannot find module `../src/catalog.js`.

- [ ] **Step 3: Create `src/catalog.ts`**

```ts
import type { Product, Review } from "@openmobilehub/credentagent-storefront";

// Brewery product catalog for the MCP marketplace. Spirits & beers carry
// `minimumAge: 21` (arms the UPay/DPC age check at checkout); merch items have no
// age restriction so the flow demonstrates a cart with and without an age gate.
//
// Images use picsum.photos: the storefront widget's CSP allows only picsum.photos
// + data: URIs, so the brewery's own .webp art (served from localhost) would be
// blocked inside the widget. The mock checkout page can style itself freely.
export const catalog: Product[] = [
  {
    id: "old-oak-bourbon",
    name: "Old Oak Bourbon No. 12",
    price: 84.0,
    currency: "USD",
    image: "https://picsum.photos/seed/old-oak-bourbon/400/300",
    category: "Spirits",
    description: "Straight bourbon aged twelve years in charred American white oak. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "highland-gin",
    name: "Highland Botanical Gin",
    price: 52.0,
    currency: "USD",
    image: "https://picsum.photos/seed/highland-gin/400/300",
    category: "Spirits",
    description: "Juniper-forward gin with wild Highland botanicals and citrus. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "winter-wheat-vodka",
    name: "Winter Wheat Vodka",
    price: 48.0,
    currency: "USD",
    image: "https://picsum.photos/seed/winter-wheat-vodka/400/300",
    category: "Spirits",
    description: "Triple-filtered small-batch vodka from heritage winter wheat. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "dark-port-rum",
    name: "Dark Port Spiced Rum",
    price: 65.0,
    currency: "USD",
    image: "https://picsum.photos/seed/dark-port-rum/400/300",
    category: "Spirits",
    description: "Cask-strength rum aged eight years in ex-port casks. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "heritage-rye",
    name: "Heritage Batch Rye",
    price: 72.0,
    currency: "USD",
    image: "https://picsum.photos/seed/heritage-rye/400/300",
    category: "Spirits",
    description: "Bold high-rye whiskey with peppery spice and honey. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "islay-mist-scotch",
    name: "Islay Mist Single Malt",
    price: 110.0,
    currency: "USD",
    image: "https://picsum.photos/seed/islay-mist-scotch/400/300",
    category: "Spirits",
    description: "Peated single malt aged twenty-four winters in oak. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "tasting-glasses",
    name: "Utopia Tasting Glass Set (2)",
    price: 28.0,
    currency: "USD",
    image: "https://picsum.photos/seed/tasting-glasses/400/300",
    category: "Merch",
    description: "Pair of crystal tasting glasses etched with the Utopia Brewery mark.",
  },
  {
    id: "brewery-tee",
    name: "Utopia Brewery Tee",
    price: 32.0,
    currency: "USD",
    image: "https://picsum.photos/seed/brewery-tee/400/300",
    category: "Merch",
    description: "Heavyweight cotton tee with the distillery archive print.",
  },
  {
    id: "distillery-tour",
    name: "Distillery Tour Gift Card",
    price: 75.0,
    currency: "USD",
    image: "https://picsum.photos/seed/distillery-tour/400/300",
    category: "Merch",
    description: "A guided tasting tour of the Utopia distillery for two.",
  },
];

export const reviews: Record<string, Review[]> = {
  "old-oak-bourbon": [
    { author: "Quinn R.", rating: 5, text: "Smooth and complex — the aged character really comes through." },
    { author: "Dana S.", rating: 4, text: "Generous pour of flavor. A solid nightcap." },
  ],
  "islay-mist-scotch": [
    { author: "Mara V.", rating: 5, text: "Beautifully peaty without being overwhelming. Worth the price." },
  ],
  "tasting-glasses": [
    { author: "Leo M.", rating: 5, text: "Feel premium and the etching is lovely. Great gift." },
  ],
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd organizations/brewery/mcp && node --import tsx --test test/catalog.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd organizations/brewery/mcp && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add organizations/brewery/mcp/src/catalog.ts organizations/brewery/mcp/test/catalog.test.ts
git commit -m "feat(brewery-mcp): brewery catalog + reviews"
```

---

## Task 3: In-memory order store

**Files:**
- Create: `organizations/brewery/mcp/src/orderStore.ts`
- Test: `organizations/brewery/mcp/test/orderStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `organizations/brewery/mcp/test/orderStore.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "@openmobilehub/credentagent-storefront";
import { MemoryOrderStore } from "../src/orderStore.js";
import { catalog } from "../src/catalog.js";

test("read returns null for an unknown id", async () => {
  const store = new MemoryOrderStore();
  assert.equal(await store.read("missing"), null);
});

test("write then read round-trips the order; clear removes it", async () => {
  const store = new MemoryOrderStore();
  const order = createOrder([{ productId: "highland-gin", quantity: 1 }], "ORD-9", catalog);
  await store.write("ORD-9", order);
  assert.equal((await store.read("ORD-9"))?.total, 52);
  await store.clear("ORD-9");
  assert.equal(await store.read("ORD-9"), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd organizations/brewery/mcp && node --import tsx --test test/orderStore.test.ts`
Expected: FAIL — cannot find module `../src/orderStore.js`.

- [ ] **Step 3: Create `src/orderStore.ts`**

```ts
import type { Order } from "@openmobilehub/credentagent-storefront";
import type { OrderStore } from "@openmobilehub/credentagent-storefront/server";

// Minimal in-memory OrderStore<Order>. The SDK's own MemoryOrderStore class is not
// re-exported to consumers (only the OrderStore type is), so we hold our own instance
// — createStorefront writes created orders into it, and the /order route reads them.
export class MemoryOrderStore implements OrderStore<Order> {
  private orders = new Map<string, Order>();

  async read(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async write(id: string, order: Order): Promise<void> {
    this.orders.set(id, order);
  }

  async clear(id: string): Promise<void> {
    this.orders.delete(id);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd organizations/brewery/mcp && node --import tsx --test test/orderStore.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add organizations/brewery/mcp/src/orderStore.ts organizations/brewery/mcp/test/orderStore.test.ts
git commit -m "feat(brewery-mcp): in-memory order store"
```

---

## Task 4: Server wiring + `/order` route

**Files:**
- Create: `organizations/brewery/mcp/src/server.ts`
- Create: `organizations/brewery/mcp/src/main.ts`
- Test: `organizations/brewery/mcp/test/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `organizations/brewery/mcp/test/server.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "@openmobilehub/credentagent-storefront";
import { buildStore } from "../src/server.js";
import { catalog } from "../src/catalog.js";

test("/order returns 404 for an unknown order", async () => {
  const { store } = buildStore("http://localhost:8010");
  const { port } = await store.listen(0);
  const res = await fetch(`http://localhost:${port}/order?order=nope`);
  assert.equal(res.status, 404);
});

test("/order returns a stored order as JSON", async () => {
  const { store, orders } = buildStore("http://localhost:8010");
  const order = createOrder([{ productId: "old-oak-bourbon", quantity: 1 }], "ORD-test", catalog);
  await orders.write(order.id, order);
  const { port } = await store.listen(0);
  const res = await fetch(`http://localhost:${port}/order?order=ORD-test`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { id: string; total: number; currency: string };
  assert.equal(body.id, "ORD-test");
  assert.equal(body.total, 84);
  assert.equal(body.currency, "USD");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd organizations/brewery/mcp && node --import tsx --test test/server.test.ts`
Expected: FAIL — cannot find module `../src/server.js`.

- [ ] **Step 3: Create `src/server.ts`**

```ts
import { createStorefront } from "@openmobilehub/credentagent-storefront/server";
import { catalog, reviews } from "./catalog.js";
import { MemoryOrderStore } from "./orderStore.js";

// Wire the CredentAgent storefront (MCP tools + widget + cart) around the brewery
// catalog. baseUrl points the minted checkout link at the brewery Kotlin backend,
// which runs the UPay/DPC ceremony. We inject our own createdOrderStore so the
// `/order` route can hand the order total to the brewery checkout page.
export function buildStore(baseUrl?: string) {
  const orders = new MemoryOrderStore();
  const store = createStorefront({
    catalog,
    reviews,
    createdOrderStore: orders,
    baseUrl: baseUrl ?? process.env.BREWERY_CHECKOUT_ORIGIN ?? "http://localhost:8010",
  });

  // The brewery checkout page fetches this to learn the order total. CORS-open
  // because the page is a different origin in local dev (same origin behind nginx).
  store.app.get("/order", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const order = await orders.read(String(req.query.order ?? ""));
    if (!order) {
      res.status(404).json({ error: "unknown order" });
      return;
    }
    res.json(order);
  });

  return { store, orders };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd organizations/brewery/mcp && node --import tsx --test test/server.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Create `src/main.ts`**

```ts
import { buildStore } from "./server.js";

const { store } = buildStore();
const port = Number(process.env.MCP_PORT ?? 3005);
const { url } = await store.listen(port);

console.log(`Utopia Brewery MCP marketplace → ${url}`);
console.log(`Checkout hands off to: ${process.env.BREWERY_CHECKOUT_ORIGIN ?? "http://localhost:8010 (default)"}`);
```

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `cd organizations/brewery/mcp && npm run typecheck && npm test`
Expected: no type errors; all 7 tests (catalog 3 + orderStore 2 + server 2) pass.

- [ ] **Step 7: Smoke-test the entry point**

Run: `cd organizations/brewery/mcp && (npm run dev &) ; sleep 2 ; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3005/order?order=none" ; kill %1 2>/dev/null || pkill -f "tsx src/main.ts"`
Expected: prints `404` (server started, `/order` route live). Stop the background server afterward.

- [ ] **Step 8: Commit**

```bash
git add organizations/brewery/mcp/src/server.ts organizations/brewery/mcp/src/main.ts organizations/brewery/mcp/test/server.test.ts
git commit -m "feat(brewery-mcp): storefront wiring + /order read route"
```

---

## Task 5: Node module README

**Files:**
- Create: `organizations/brewery/mcp/README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# Utopia Brewery — MCP Marketplace

An **agentic MCP marketplace** for the Utopia Brewery. One MCP server (Claude,
ChatGPT, Goose, Claude Code) browses the catalog, builds a cart, and checks out.
**Checkout hands off** to the repo's Multipaz **UPay + Digital Payment Credential
(DPC)** ceremony: the buyer proves an age credential **and** presents a
`org.multipaz.payment.sca.1` DPC in one `multipazVerifyCredentials()` presentation,
amount-bound via `transaction_data` and settled by UPay.

Built on [`@openmobilehub/credentagent`](https://github.com/openmobilehub/credentagent);
modeled on [`mcp-apps-shopping-demo`](https://github.com/openmobilehub/mcp-apps-shopping-demo),
but with the SDK's mock payment rail replaced by UPay/DPC.

## How it fits together

```
AI host ──MCP /mcp──► Node server (this module)   checkout link   Brewery Kotlin backend
                      catalog + cart + widget ───────────────────► GET /checkout (UPay/DPC)
                      GET /order?order=<id> ◄─────────fetch────────  age + DPC + UPay settle
```

- This module is the **agentic shopping layer** — it never takes payment.
- The **brewery backend** (`organizations/brewery/backend`) runs the credential +
  payment ceremony. Running checkout end-to-end therefore needs the full
  multipaz-utopia stack up (records/enrollment + UPay + brewery backend), exactly
  like the existing brewery demo.

## Run

```bash
npm install
BREWERY_CHECKOUT_ORIGIN=http://localhost:8010 npm run dev   # → http://localhost:3005/mcp
```

- `BREWERY_CHECKOUT_ORIGIN` — origin of the brewery backend the checkout link points
  at (default `http://localhost:8010`).
- `MCP_PORT` — port for the MCP server (default `3005`).

## Add to a host

- **Claude / ChatGPT:** add a custom connector at `http://localhost:3005/mcp`.
- **Claude Code:** `claude mcp add --transport http brewery http://localhost:3005/mcp`
- **Goose:** add a Remote Extension (Streamable HTTP) at the same URL.
- **Inspect:** `npx @modelcontextprotocol/inspector` → connect to the `/mcp` URL.

Then: *"Show me the brewery catalog"* → add a bottle → *"check out"* → open the
returned link → prove age + present your payment DPC → the page confirms the order.

## Test

```bash
npm test          # unit + /order integration tests
npm run typecheck
```

## Honest status

The credential ceremony here is the **Multipaz UPay/DPC** flow (real issuer trust
via the records server) — its trust properties are those of the existing
brewery/UPay demo, not the CredentAgent SDK's own `presence-only-demo` payment
rail (which this sample does not use). The mock checkout does not move real money.

## Not yet wired (future extensions)

- Loyalty discount in the DPC ceremony (age + payment only today).
- `get-order-status` MCP-tool completion (the widget poll reflects completion; the
  tool would need a brewery→Node webhook).
- x402 / on-chain settlement (UPay is the settlement rail).
````

- [ ] **Step 2: Commit**

```bash
git add organizations/brewery/mcp/README.md
git commit -m "docs(brewery-mcp): module README"
```

---

## Task 6: Brewery checkout page (frontend)

**Files:**
- Create: `organizations/brewery/frontend/src/main/resources/resources/www/checkout.html`
- Create: `organizations/brewery/frontend/src/main/resources/resources/www/checkout.js`

- [ ] **Step 1: Create `checkout.html`**

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="referrer" content="unsafe-url">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Checkout — Utopia Brewery</title>
    <link rel="stylesheet" href="brewery.css">
    <style>
        .checkout-main { max-width: 640px; margin: 3rem auto; padding: 0 1.5rem; }
        .summary-line, .summary-total { display: flex; justify-content: space-between; padding: 0.6rem 0; }
        .summary-line { border-bottom: 1px solid rgba(0,0,0,0.08); }
        .summary-total { font-weight: 700; margin-top: 0.4rem; }
        #order-summary { margin: 1.5rem 0; }
        .checkout-note { opacity: 0.7; font-size: 0.9rem; margin-top: 1rem; }
    </style>
    <script src="verify_credentials.js"></script>
    <script src="checkout.js" defer></script>
</head>
<body>
<header class="site-header">
    <div class="header-inner">
        <span class="site-logo">Utopia Brewery</span>
    </div>
</header>

<main class="checkout-main">
    <h1>Checkout</h1>
    <div id="order-summary">Loading your order…</div>
    <button id="pay-btn" class="btn-acquire" onclick="onPayClick()" disabled>
        VERIFY AGE &amp; PAY
    </button>
    <p class="checkout-note">Age &amp; payment are verified with a credential from your wallet.</p>
</main>

<!-- Result overlay -->
<div id="result-overlay" class="result-overlay hidden">
    <div id="result-box" class="result-box">
        <div id="result-content"></div>
        <button class="btn-close" onclick="closeOverlay()">Close</button>
    </div>
</div>

<!-- Loading overlay -->
<div id="loading-overlay" class="result-overlay hidden">
    <div class="result-box loading-box">
        <div class="spinner"></div>
        <p>Verifying credentials…</p>
    </div>
</div>
</body>
</html>
```

- [ ] **Step 2: Create `checkout.js`**

```js
// Origin of the Node MCP server that minted the order (holds the order total).
// Local dev default; set to "" when the brewery + MCP server share one origin
// behind a reverse proxy.
const MCP_ORIGIN = "http://localhost:3005";

window.addEventListener("DOMContentLoaded", init);

async function init() {
    const orderId = new URLSearchParams(location.search).get("order");
    if (!orderId) {
        document.getElementById("order-summary").textContent = "Missing order id.";
        return;
    }
    try {
        const resp = await fetch(MCP_ORIGIN + "/order?order=" + encodeURIComponent(orderId));
        if (!resp.ok) throw new Error("Order not found (" + resp.status + ")");
        const order = await resp.json();
        window._order = order;
        window._orderId = orderId;
        renderSummary(order);
    } catch (err) {
        document.getElementById("order-summary").textContent =
            "Could not load order: " + (err && (err.message || String(err)));
    }
}

function renderSummary(order) {
    const lines = order.lines.map(function (l) {
        return '<div class="summary-line"><span>' + escapeHtml(l.name) + " &times; " + l.quantity +
            "</span><span>$" + Number(l.lineTotal).toFixed(2) + "</span></div>";
    }).join("");
    document.getElementById("order-summary").innerHTML = lines +
        '<div class="summary-total"><span>Total</span><span>$' +
        Number(order.total).toFixed(2) + " " + escapeHtml(order.currency) + "</span></div>";
    document.getElementById("pay-btn").disabled = false;
}

async function onPayClick() {
    const order = window._order;
    if (!order) return;

    showLoading(true);
    document.getElementById("pay-btn").disabled = true;

    try {
        // Step 1: mint the DCQL + transaction_data via UPay (existing POST /checkout).
        const description = "Utopia Brewery — " + order.itemCount + " item(s)";
        const checkoutResp = await fetch("checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productName: description, price: String(order.total) })
        });
        if (!checkoutResp.ok) throw new Error("Checkout request failed (" + checkoutResp.status + ")");
        const checkoutData = await checkoutResp.json();

        // Step 2: present age + DPC via the Digital Credentials API.
        const result = await multipazVerifyCredentials(checkoutData);
        showLoading(false);

        if (result && result.approved) {
            await markComplete(order);
            showResult(true, "Purchase Approved",
                "<p>Welcome, <strong>" + escapeHtml(result.holderName) + "</strong>.</p>" +
                "<p>Your Utopia Brewery order ($" + Number(order.total).toFixed(2) +
                ") has been recorded.</p>" +
                "<p>Payment via <em>" + escapeHtml(result.issuerName) + "</em>.</p>");
        } else if (result && result.error_description) {
            showError("Verification Failed", "<p>The credential could not be verified.</p>",
                result.error_description + (result.error ? " (" + result.error + ")" : ""));
        } else if (result && result.error) {
            showError("Purchase Declined", "<p>" + escapeHtml(result.error) + "</p>", null);
        } else {
            showError("Purchase Declined", "<p>Verification could not be completed.</p>", null);
        }
    } catch (err) {
        showLoading(false);
        if (isCancellation(err)) {
            showError("Presentation Cancelled",
                "<p>The credential request was dismissed before it could be completed.</p>", null);
        } else {
            showError("Something Went Wrong",
                "<p>The purchase could not be processed due to an unexpected error.</p>",
                err && (err.message || String(err)));
        }
    } finally {
        document.getElementById("pay-btn").disabled = false;
    }
}

// Best-effort: tell the brewery backend this order completed so the widget poll
// (GET /checkout/order-status) can reflect it. Failure is non-fatal.
async function markComplete(order) {
    try {
        await fetch("checkout/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: window._orderId, amount: order.total, currency: order.currency })
        });
    } catch (_) { /* ignore — poll simply stays pending */ }
}

function isCancellation(err) {
    if (!err) return false;
    const name = err.name || "";
    const msg = (err.message || String(err)).toLowerCase();
    return name === "NotAllowedError" || name === "AbortError" ||
        msg.includes("cancel") || msg.includes("abort") || msg.includes("dismiss");
}

function showLoading(visible) {
    document.getElementById("loading-overlay").classList.toggle("hidden", !visible);
}

function showResult(approved, title, bodyHtml) {
    const icon = approved
        ? '<div class="result-icon result-icon-success" aria-hidden="true">&#10003;</div>'
        : '<div class="result-icon result-icon-error" aria-hidden="true">&#33;</div>';
    const box = document.getElementById("result-box");
    box.className = "result-box " + (approved ? "result-approved" : "result-declined");
    document.getElementById("result-content").innerHTML =
        icon + "<h2>" + escapeHtml(title) + "</h2>" + bodyHtml;
    document.getElementById("result-overlay").classList.remove("hidden");
}

function showError(title, bodyHtml, detail) {
    let html = bodyHtml;
    if (detail) html += '<div class="result-detail">' + escapeHtml(detail) + "</div>";
    showResult(false, title, html);
}

function closeOverlay() {
    document.getElementById("result-overlay").classList.add("hidden");
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
```

- [ ] **Step 3: Syntax-check `checkout.js`**

Run: `node --check organizations/brewery/frontend/src/main/resources/resources/www/checkout.js`
Expected: no output (valid syntax). (Browser globals are unresolved at runtime, not at `--check` time.)

- [ ] **Step 4: Commit**

```bash
git add organizations/brewery/frontend/src/main/resources/resources/www/checkout.html organizations/brewery/frontend/src/main/resources/resources/www/checkout.js
git commit -m "feat(brewery): cart-aware UPay/DPC checkout page"
```

---

## Task 7: Brewery backend checkout routes

**Files:**
- Create: `organizations/brewery/backend/src/main/java/org/multipaz/brewery/server/BreweryCheckoutStatus.kt`
- Modify: `organizations/brewery/backend/src/main/java/org/multipaz/brewery/server/ApplicationExt.kt`

- [ ] **Step 1: Create `BreweryCheckoutStatus.kt`**

```kotlin
package org.multipaz.brewery.server

import io.ktor.http.ContentType
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondRedirect
import io.ktor.server.response.respondText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Clock

// Page-driven completion records, keyed by the MCP order id. Not a security
// boundary — the real enforcement is the UPay commit inside the credential
// ceremony; this only lets the storefront widget's poll show "completed".
private val completedOrders = ConcurrentHashMap<String, JsonObject>()

/**
 * GET /checkout?order=<id> — the storefront mints this link. Redirect to the static
 * checkout page, preserving the order id. Relative target so it also resolves under
 * an nginx /brewery/ prefix.
 */
suspend fun breweryCheckoutPage(call: ApplicationCall) {
    val order = call.request.queryParameters["order"].orEmpty()
    call.respondRedirect("checkout.html?order=$order")
}

/** POST /checkout/complete {orderId, amount?, currency?} — record page-driven completion. */
suspend fun breweryMarkComplete(call: ApplicationCall) {
    val body = Json.parseToJsonElement(call.receiveText()).jsonObject
    val orderId = body["orderId"]?.jsonPrimitive?.contentOrNull
    if (orderId.isNullOrBlank()) {
        call.respondText("""{"ok":false}""", ContentType.Application.Json)
        return
    }
    completedOrders[orderId] = buildJsonObject {
        put("orderId", orderId)
        body["amount"]?.let { put("amount", it) }
        body["currency"]?.let { put("currency", it) }
        put("completedAt", Clock.System.now().toString())
    }
    call.respondText("""{"ok":true}""", ContentType.Application.Json)
}

/** GET /checkout/order-status?orderId=<id> — {completed, order} for the widget poll. */
suspend fun breweryOrderStatus(call: ApplicationCall) {
    val orderId = call.request.queryParameters["orderId"].orEmpty()
    val record = completedOrders[orderId]
    val payload = buildJsonObject {
        put("completed", record != null)
        if (record != null) put("order", record)
    }
    call.response.headers.append("Access-Control-Allow-Origin", "*")
    call.respondText(payload.toString(), ContentType.Application.Json)
}
```

- [ ] **Step 2: Wire the routes in `ApplicationExt.kt`**

Replace the whole `routing { ... }` block so it reads:

```kotlin
package org.multipaz.brewery.server

import io.ktor.server.application.Application
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.coroutines.Deferred
import org.multipaz.server.common.ServerEnvironment
import org.multipaz.verifier.server.configureVerifier

/**
 * Defines server endpoints for the Brewery demo.
 *
 * Mounts all standard verifier endpoints (make_request, process_response, get_result,
 * static resources including verify_credentials.js) via [configureVerifier], then adds
 * the brewery-specific checkout endpoints. `GET /checkout` serves the MCP-marketplace
 * checkout page; `POST /checkout` mints the DCQL + UPay transaction; the two
 * `/checkout/*` routes back the storefront widget's completion poll.
 */
fun Application.configureRouting(environment: Deferred<ServerEnvironment>) {
    routing {
        configureVerifier(environment)
        get("/checkout") { breweryCheckoutPage(call) }
        post("/checkout") { breweryCheckout(call) }
        post("/checkout/complete") { breweryMarkComplete(call) }
        get("/checkout/order-status") { breweryOrderStatus(call) }
    }
}
```

- [ ] **Step 3: Compile the backend**

Run: `./gradlew :organizations:brewery:backend:compileKotlin`
Expected: `BUILD SUCCESSFUL`. (First run downloads Multipaz snapshot deps — needs network. `allWarningsAsErrors` is on, so remove any unused import if the compiler flags one.)

- [ ] **Step 4: Run the existing backend tests**

Run: `./gradlew :organizations:brewery:backend:test`
Expected: `BUILD SUCCESSFUL` — `CheckAgeTest` still passes (age logic unchanged).

- [ ] **Step 5: Commit**

```bash
git add organizations/brewery/backend/src/main/java/org/multipaz/brewery/server/BreweryCheckoutStatus.kt organizations/brewery/backend/src/main/java/org/multipaz/brewery/server/ApplicationExt.kt
git commit -m "feat(brewery): checkout page route + widget completion poll"
```

---

## Task 8: Document the module in the brewery README

**Files:**
- Modify: `organizations/brewery/README.md`

- [ ] **Step 1: Add an `mcp/` section**

Under the `## Module Layout` code block in `organizations/brewery/README.md`, change the tree to add the `mcp/` line:

```
brewery/
├── backend/    # Ktor/Netty server — verifier + /checkout API + checkout page routes
├── frontend/   # Static HTML/CSS/JS storefront (+ checkout.html/js for the MCP flow)
└── mcp/        # Node/TS agentic MCP marketplace (CredentAgent) — hands off to UPay/DPC
```

Then add this subsection immediately after the `### frontend` subsection:

```markdown
### `mcp`

Standalone Node/TypeScript module (not part of the Gradle build). An agentic MCP
marketplace built on [`@openmobilehub/credentagent-storefront`](https://github.com/openmobilehub/credentagent):
an AI agent browses the catalog and builds a cart, and **checkout hands off** to
this backend's UPay + Digital Payment Credential ceremony (`GET /checkout` →
`multipazVerifyCredentials()` for age + `org.multipaz.payment.sca.1`, settled by
UPay). See [`mcp/README.md`](mcp/README.md).

Run the MCP server (needs the records/enrollment + UPay + brewery backend up):

```bash
cd mcp && npm install && BREWERY_CHECKOUT_ORIGIN=http://localhost:8010 npm run dev
# → http://localhost:3005/mcp  (add as a custom connector in Claude / ChatGPT / Goose)
```
```

- [ ] **Step 2: Commit**

```bash
git add organizations/brewery/README.md
git commit -m "docs(brewery): document the mcp/ marketplace module"
```

---

## Task 9: End-to-end verification (manual)

No code — confirm the whole flow and record the result.

- [ ] **Step 1: Start the stack**

In separate shells (per the brewery README's "Running Locally" + the deployment docs):
1. Records/enrollment server.
2. UPay backend: `./gradlew :organizations:upay:backend:run --args="-param enrollment_server_url=http://localhost:8004"`
3. Brewery backend: `./gradlew :organizations:brewery:backend:run`
4. MCP server: `cd organizations/brewery/mcp && BREWERY_CHECKOUT_ORIGIN=http://localhost:8010 npm run dev`

- [ ] **Step 2: Inspect the MCP tools**

Run: `npx @modelcontextprotocol/inspector`
Connect to `http://localhost:3005/mcp`. Confirm the tools list includes `browse-products`, `add-to-cart`, `checkout`, etc., and that `browse-products` returns the brewery catalog.

- [ ] **Step 3: Drive checkout**

Call `add-to-cart` for `old-oak-bourbon`, then `checkout`. Confirm the result's
`checkoutUrl` is `http://localhost:8010/checkout?order=ORD-...`.

- [ ] **Step 4: Complete the ceremony**

Open the `checkoutUrl` in a browser. Confirm the order summary loads (proves the
`/order` fetch works), click **VERIFY AGE & PAY**, and complete the age + DPC
presentation with a Multipaz wallet. Confirm the "Purchase Approved" result with
holder + issuer names.

- [ ] **Step 5: Confirm completion reflection**

Run: `curl -s "http://localhost:8010/checkout/order-status?orderId=<the order id>"`
Expected: `{"completed":true,"order":{...}}`.

- [ ] **Step 6: Record the outcome**

Note any deviations (e.g. widget poll URL, age threshold behavior) in the spec's
§14 open-questions list or a follow-up issue.

---

## Self-Review

**Spec coverage:**
- Node MCP module (spec §6) → Tasks 1–5. ✅
- `baseUrl`→brewery + injected `createdOrderStore` + `/order` seam (spec §5) → Task 4. ✅
- Brewery cart-aware checkout page reusing `multipazVerifyCredentials()` (spec §7) → Task 6. ✅
- Brewery backend `GET /checkout` + `/checkout/order-status` (spec §7, §8) → Task 7. ✅
- Catalog: spirits (21+) + merch (spec §6, §9 catalog) → Task 2. ✅
- Testing: pure-model unit test + integration + manual e2e (spec §11) → Tasks 2–4, 9. ✅
- Docs (spec §15) → Tasks 5, 8. ✅
- Deferred per spec §14: loyalty, `get-order-status` completion, 21+ tightening — intentionally not implemented; noted in READMEs.

**Placeholder scan:** No TBD/TODO; every code step shows complete file content.

**Type consistency:** `buildStore(baseUrl?)` returns `{ store, orders }` (Task 4) and is imported the same way in `test/server.test.ts` and `main.ts`; `MemoryOrderStore` (Task 3) implements `OrderStore<Order>` and is used in Tasks 3–4; `Review` uses `{ author, rating, text }` (matches the package's exported type); the brewery page POSTs `productName`/`price` matching the existing `breweryCheckout` fields; `orderId` field name is consistent across `checkout.js` `markComplete`, `POST /checkout/complete`, and `GET /checkout/order-status`.
