import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createOrder } from "@openmobilehub/credentagent-storefront";
import { buildStore } from "../src/server.js";
import { catalog } from "../src/catalog.js";

// Bind the storefront's Express app to an ephemeral port ourselves so we get the
// REAL assigned port (the SDK's store.listen(0) returns the argument, not the OS
// port) and can close the server cleanly after each test.
async function listenApp(app: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, port };
}

test("/order returns 404 for an unknown order", async () => {
  const { store } = buildStore("http://localhost:8010");
  const { server, port } = await listenApp(store.app as unknown as http.RequestListener);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/order?order=nope`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("/order returns a stored order as JSON", async () => {
  const { store, orders } = buildStore("http://localhost:8010");
  const order = createOrder([{ productId: "p16", quantity: 1 }], "ORD-test", catalog); // Old Oak Bourbon 42.00
  await orders.write(order.id, order);
  const { server, port } = await listenApp(store.app as unknown as http.RequestListener);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/order?order=ORD-test`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { id: string; total: number; currency: string };
    assert.equal(body.id, "ORD-test");
    assert.equal(body.total, 42);
    assert.equal(body.currency, "USD");
  } finally {
    server.close();
  }
});

test("/order/complete records the sale in the store get-order-status reads", async () => {
  const { store, orders, completed } = buildStore("http://localhost:8010");
  const order = createOrder([{ productId: "p16", quantity: 1 }], "ORD-done", catalog); // 42.00
  await orders.write(order.id, order);
  const { server, port } = await listenApp(store.app as unknown as http.RequestListener);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/order/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "ORD-done" }),
    });
    assert.equal(res.status, 200);
    const record = await completed.read("ORD-done"); // what get-order-status returns
    assert.equal(record?.orderId, "ORD-done");
    assert.equal(record?.amount, 42); // re-derived from the created order
    assert.equal(record?.method, "upay-dpc");
  } finally {
    server.close();
  }
});
