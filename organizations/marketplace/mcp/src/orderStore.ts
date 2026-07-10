import type { Order } from "@openmobilehub/credentagent-storefront";
import type { OrderStore } from "@openmobilehub/credentagent-storefront/server";

// Minimal in-memory OrderStore. The SDK's own MemoryOrderStore class is not re-exported to
// consumers (only the OrderStore type is), so we hold our own instances — one for created orders
// (createStorefront writes them; the /order route reads them) and one for completed orders (the
// checkout page marks them via /order/complete; the get-order-status tool reads them).
export class MemoryOrderStore<T = Order> implements OrderStore<T> {
  private orders = new Map<string, T>();

  async read(id: string): Promise<T | null> {
    return this.orders.get(id) ?? null;
  }

  async write(id: string, order: T): Promise<void> {
    this.orders.set(id, order);
  }

  async clear(id: string): Promise<void> {
    this.orders.delete(id);
  }
}
