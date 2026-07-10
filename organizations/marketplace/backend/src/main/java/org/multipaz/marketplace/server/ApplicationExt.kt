package org.multipaz.marketplace.server

import io.ktor.server.application.Application
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.coroutines.Deferred
import org.multipaz.server.common.ServerEnvironment
import org.multipaz.verifier.server.configureVerifier

/**
 * Defines server endpoints for the Marketplace demo.
 *
 * Mounts all standard verifier endpoints (make_request, process_response, get_result,
 * static resources including verify_credentials.js) via [configureVerifier], then adds
 * the marketplace checkout endpoints:
 *  - `POST /checkout` — single-product checkout (the storefront product page).
 *  - `POST /checkout/order` — cart checkout for the MCP storefront (server-priced total).
 *  - `GET /checkout` — the MCP checkout page; `POST /checkout/complete` +
 *    `GET /checkout/order-status` back the storefront widget's completion poll.
 */
fun Application.configureRouting(environment: Deferred<ServerEnvironment>) {
    routing {
        configureVerifier(environment)
        get("/checkout") { marketplaceCheckoutPage(call) }
        post("/checkout") { marketplaceCheckout(call) }
        post("/checkout/age") { marketplaceAgeRequest(call) }
        post("/checkout/age-verified") { marketplaceAgeVerified(call) }
        post("/checkout/order") { marketplaceCheckoutOrder(call) }
        post("/checkout/complete") { marketplaceMarkComplete(call) }
        get("/checkout/order-status") { marketplaceOrderStatus(call) }
    }
}
