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
