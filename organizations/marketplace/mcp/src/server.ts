import { createStorefront } from "@openmobilehub/credentagent-storefront/server";
import type { CartStore, CompletedOrderRecord } from "@openmobilehub/credentagent-storefront/server";
import { catalog, reviews } from "./catalog.js";
import { MemoryOrderStore } from "./orderStore.js";

// A single cart shared across all MCP sessions. The SDK keys carts per mcp-session-id, but
// some hosts (e.g. Claude's remote connector) use a fresh session per tool call — so each
// add-to-cart would land in a new, empty cart and "get-cart" would come back empty. A global
// cart keeps the cart stable across sessions. Fine for this single-user demo (it's what the
// reference demo calls a "demo-global" cart); a multi-user deployment would key per user instead.
class GlobalCartStore implements CartStore {
  private cart = new Map<string, number>();
  async read(_sessionId: string): Promise<Map<string, number>> {
    return new Map(this.cart);
  }
  async write(_sessionId: string, cart: Map<string, number>): Promise<void> {
    this.cart = new Map(cart);
  }
}

// Wire the CredentAgent storefront (MCP tools + widget + cart) around the marketplace
// catalog. baseUrl points the minted checkout link at the marketplace Kotlin backend,
// which runs the UPay/DPC ceremony. We inject our own createdOrderStore so the
// `/order` route can hand the order's line items to the marketplace checkout page,
// which re-prices them server-side from its own catalog.
export function buildStore(baseUrl?: string) {
  const orders = new MemoryOrderStore();
  const completed = new MemoryOrderStore<CompletedOrderRecord>();
  const store = createStorefront({
    catalog,
    reviews,
    createdOrderStore: orders,
    orderStore: completed,
    cartStore: new GlobalCartStore(),
    baseUrl: baseUrl ?? process.env.MARKETPLACE_CHECKOUT_ORIGIN ?? "http://localhost:8010",
  });

  // The marketplace checkout page fetches this to learn the cart's line items (it
  // re-prices them from the server catalog). CORS-open because the page is a
  // different origin in local dev (same origin behind nginx).
  store.app.get("/order", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const order = await orders.read(String(req.query.order ?? ""));
    if (!order) {
      res.status(404).json({ error: "unknown order" });
      return;
    }
    res.json(order);
  });

  // The checkout page calls this after the UPay/DPC ceremony approves, so the SDK's
  // completed-order store — and therefore the get-order-status tool — reflects the sale
  // (the ceremony itself runs on the Kotlin side, which the SDK never sees otherwise).
  store.app.post("/order/complete", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const body = (req.body ?? {}) as { orderId?: string; amount?: number; currency?: string };
    const orderId = String(body.orderId ?? "");
    if (!orderId) {
      res.status(400).json({ error: "orderId required" });
      return;
    }
    const created = await orders.read(orderId);
    await completed.write(orderId, {
      orderId,
      amount: Number(body.amount ?? created?.total ?? 0),
      currency: String(body.currency ?? created?.currency ?? "USD"),
      method: "upay-dpc",
      completedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  });

  return { store, orders, completed };
}
