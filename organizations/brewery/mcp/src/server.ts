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
