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
  const order = createOrder([{ productId: "p15", quantity: 1 }], "ORD-9", catalog); // Reserve Red Wine 18.00
  await store.write("ORD-9", order);
  assert.equal((await store.read("ORD-9"))?.total, 18);
  await store.clear("ORD-9");
  assert.equal(await store.read("ORD-9"), null);
});
