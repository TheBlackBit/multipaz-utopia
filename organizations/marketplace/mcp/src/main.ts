import { buildStore } from "./server.js";

const { store } = buildStore();
const port = Number(process.env.MCP_PORT ?? 3005);
await store.listen(port);

// store.listen() reports its `url` from baseUrl, which we point at the marketplace
// backend — so derive the actual MCP endpoint from the port we listen on instead.
const checkoutOrigin = process.env.MARKETPLACE_CHECKOUT_ORIGIN ?? "http://localhost:8010";
console.log(`Utopia Marketplace MCP storefront → http://localhost:${port}/mcp`);
console.log(`Checkout hands off to: ${checkoutOrigin}`);
