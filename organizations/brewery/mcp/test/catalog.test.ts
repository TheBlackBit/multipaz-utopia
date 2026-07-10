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
