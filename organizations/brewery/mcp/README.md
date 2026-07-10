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
