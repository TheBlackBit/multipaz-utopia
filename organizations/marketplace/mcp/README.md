# Utopia Marketplace — MCP Storefront (UPay + DPC checkout)

An **agentic MCP storefront** for the Utopia Marketplace. One MCP server lets an AI
agent (Claude, ChatGPT, Goose, Claude Code) browse a grocery catalog, build a cart,
and check out — and **checkout hands off** to the repo's Multipaz **UPay + Digital
Payment Credential (DPC)** ceremony. Payment is authorized with a
`org.multipaz.payment.sca.1` DPC from the phone wallet (amount-bound via
`transaction_data`, settled by UPay). Age-restricted carts (Beer, Wine & Spirits)
add an identity/age credential step (18+) — presented **before** payment
(progressive disclosure), so the checkout DPC step shows payment only.

Built on [`@openmobilehub/credentagent`](https://github.com/openmobilehub/credentagent).

```
AI host ──MCP /mcp──► Node MCP server (this module)   checkout link   Marketplace backend (in the stack)
                      catalog + cart + widget ───────────────────────► GET /checkout (UPay/DPC ceremony)
                      GET /order?order=<id> ◄──────────── fetch ───────  POST /checkout/order (re-prices)
```

- This module is the **agentic shopping layer** — it never takes payment.
- The **stack** (records/enrollment + UPay + issuers + marketplace backend) runs the
  credential ceremony and **re-prices the cart server-side** by product id.

---

## Prerequisites

- **Node ≥ 20** and **npm**
- **Podman** (or Docker) — for the Utopia stack container. macOS: `brew install podman && podman machine init && podman machine start`
- **Multipaz Wallet** on an Android phone (dev build):
  <https://apps.multipaz.org/multipaz-wallet-dev/multipaz-wallet-dev-2026.W29.1-29-git-095a0bf.apk>
- Run all commands from the repo root unless noted.

---

## 1. Run the Utopia stack (UPay + the DPC / payment credentials)

The whole stack — the records/enrollment server, **UPay** payment processor, the
credential issuers (Bank of Utopia, DMV), and the marketplace backend — is one
container image. It serves everything through nginx on port **8100** (the
marketplace lives at `/marketplace/`).

```bash
# Build the image (first build downloads Multipaz snapshot deps)
./gradlew :deployment:buildDockerImage

# Run it. -v mounts a persistent data dir so the trust root + issued credentials
# survive restarts (otherwise every run regenerates them and you must re-issue).
podman run --rm -p 8100:8100 \
  -e BASE_URL=http://localhost:8100 \
  -e ADMIN_PASS=multipaz \
  -v "$HOME/utopia-data:/app/data:z" \
  localhost/multipaz-utopia/server-bundle:latest
```

- Marketplace: `http://localhost:8100/marketplace/` · Bank of Utopia:
  `http://localhost:8100/bank_of_utopia/` · DMV: `http://localhost:8100/dmv/`
- **Do not run the marketplace backend standalone** (`gradlew …backend:run`) — it
  won't have `payee_account` / the records server, and checkout will 500. Use the
  container.
- **Phone testing:** the wallet must reach the stack over public HTTPS, and
  OpenID4VP is origin-bound, so set `BASE_URL` to a public tunnel origin instead of
  `localhost` (see [Remote / phone testing](#remote--phone-testing)).

---

## 2. Run the marketplace MCP server (this module)

```bash
cd organizations/marketplace/mcp
npm install
MARKETPLACE_CHECKOUT_ORIGIN=http://localhost:8100/marketplace npm run dev
#   → http://localhost:3005/mcp
```

- `MARKETPLACE_CHECKOUT_ORIGIN` — where the `checkout` tool points the hand-off link.
  For the container it is **`http://localhost:8100/marketplace`** (not `:8010`, which
  is internal to the container).
- `MCP_PORT` — the MCP server port (default `3005`).
- The MCP catalog mirrors the server catalog (`MarketplaceCatalog.kt` / `catalog.js`)
  — same ids (`p1`…`p16`), prices, and age flags. The backend re-prices at checkout.

---

## 3. Issue credentials with the Multipaz Wallet

Trust is **per stack instance** — the payment processor only trusts credentials
issued by *this* running stack (and they reset if you wipe the data volume). So
issue them from the instance you started in step 1.

1. Install the Multipaz Wallet dev APK on your phone:
   <https://apps.multipaz.org/multipaz-wallet-dev/multipaz-wallet-dev-2026.W29.1-29-git-095a0bf.apk>
2. Open the stack's issuance pages and follow the flow to add credentials to the
   wallet (use the tunnel origin from step 1 if testing cross-device):
   - **Payment card (DPC)** — required for *every* checkout: `…/bank_of_utopia/`
   - **mDL / age credential** — only for age-restricted items: `…/dmv/`
3. Re-issue after any container run **without** the persistent volume (the trust
   root changed). With the `-v …:/app/data` volume, issue once and it sticks.

> If checkout later fails with *"Payment instrument is not issued by a trusted
> issuer,"* the card came from a different instance — re-issue from this one.

---

## 4. Add the custom connector in Claude

- **Claude Code (terminal):**
  ```bash
  claude mcp add --transport http marketplace http://localhost:3005/mcp
  ```
- **Claude desktop / mobile app:** Settings → **Connectors** → **Add custom
  connector** → paste the `/mcp` URL. The app requires **HTTPS**, so tunnel the MCP
  server first (see below) and use the tunnel's `/mcp` URL.

Then shop **from chat** (most reliable across hosts):

> *"Show me the marketplace catalog"* → *"Add 2 apples and a ground coffee"* →
> *"What's in my cart?"* → *"Check out"* → open the link → (age step for alcohol) → pay.

The SDK's inline product-card buttons can be flaky depending on the host's widget
bridge; if a card view shows non-grocery items, that's the SDK widget's built-in
sample fallback — ignore it and just tell the agent what to add.

---

## Remote / phone testing

For a phone wallet the stack **and** the MCP server must be reachable over HTTPS,
and the checkout page (served by the stack) must reach the MCP server for the order.
Expose both with a tunnel (e.g. [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)):

```bash
cloudflared tunnel --url http://localhost:8100   # → STACK_URL
cloudflared tunnel --url http://localhost:3005   # → MCP_URL
```

Then:

- Run the container with `BASE_URL=$STACK_URL` (origin-bound OpenID4VP).
- Run the MCP server with `MARKETPLACE_CHECKOUT_ORIGIN=$STACK_URL/marketplace`.
- Point the checkout page at the MCP server: set `MCP_ORIGIN` at the top of
  `organizations/marketplace/frontend/.../www/checkout.js` to `$MCP_URL`, then
  rebuild the image (`:deployment:buildDockerImage`) and re-run the container.
- Add `$MCP_URL/mcp` as the connector; issue credentials from `$STACK_URL/bank_of_utopia/`.

(One origin behind a reverse proxy avoids the two-tunnel dance — set `MCP_ORIGIN=""`
and serve `/mcp` and `/marketplace` from the same host.)

---

## Test

```bash
npm test          # unit + /order integration tests
npm run typecheck
```

## Honest status

The credential ceremony is the **Multipaz UPay/DPC** flow (real issuer trust via the
records server), not the CredentAgent SDK's own `presence-only-demo` payment rail.
The mock checkout does not move real money. The split age/payment flow makes the age
gate **page-driven** (weaker than the product page's single atomic presentation) in
exchange for the progressive-disclosure UX.

## Not yet wired (future extensions)

- Loyalty discount in the DPC ceremony.
- x402 / on-chain settlement (UPay is the settlement rail).

> On completion, the checkout page reports the sale to both the marketplace backend
> (for the widget's completion poll) and the MCP server's `POST /order/complete` (so
> the `get-order-status` tool reflects it).
