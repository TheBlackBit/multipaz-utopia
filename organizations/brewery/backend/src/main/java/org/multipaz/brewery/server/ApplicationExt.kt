package org.multipaz.brewery.server

import io.ktor.server.application.Application
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.coroutines.Deferred
import org.multipaz.server.common.ServerEnvironment
import org.multipaz.verifier.server.configureVerifier

/**
 * Defines server endpoints for the Brewery demo.
 *
 * Mounts all standard verifier endpoints (make_request, process_response, get_result,
 * static resources including verify_credentials.js) via [configureVerifier], then adds
 * the brewery-specific checkout endpoints. `GET /checkout` serves the MCP-marketplace
 * checkout page; `POST /checkout` mints the DCQL + UPay transaction; the
 * `/checkout/complete` and `/checkout/order-status` routes back the storefront
 * widget's completion poll.
 */
fun Application.configureRouting(environment: Deferred<ServerEnvironment>) {
    routing {
        configureVerifier(environment)
        get("/checkout") { breweryCheckoutPage(call) }
        post("/checkout") { breweryCheckout(call) }
        post("/checkout/complete") { breweryMarkComplete(call) }
        get("/checkout/order-status") { breweryOrderStatus(call) }
    }
}
