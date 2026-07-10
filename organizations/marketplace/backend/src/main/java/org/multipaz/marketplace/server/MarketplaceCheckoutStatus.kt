package org.multipaz.marketplace.server

import io.ktor.http.ContentType
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondRedirect
import io.ktor.server.response.respondText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Clock

// Page-driven completion records, keyed by the MCP order id. Not a security
// boundary — the real enforcement is the UPay commit inside the credential
// ceremony; this only lets the storefront widget's poll show "completed".
private val completedOrders = ConcurrentHashMap<String, JsonObject>()

// Orders whose age step (progressive disclosure) has passed, keyed by the MCP order id. Recorded by
// the page after a successful age presentation; marketplaceCheckoutOrder refuses to mint a payment
// for an age-restricted cart whose order id isn't in here. Page-driven, so a demo-level gate (the
// atomic age+payment presentation on the product page is stronger) — not a hard security boundary.
private val ageVerifiedOrders: MutableSet<String> = ConcurrentHashMap.newKeySet()

/** Records that the given order completed the age step. Called from [marketplaceAgeVerified]. */
fun recordAgeVerified(orderId: String) { ageVerifiedOrders.add(orderId) }

/** Whether the given order has completed the age step (read by marketplaceCheckoutOrder). */
fun isAgeVerified(orderId: String): Boolean = ageVerifiedOrders.contains(orderId)

/**
 * GET /checkout?order=<id> — the storefront mints this link. Redirect to the static
 * checkout page, preserving the order id. Relative target so it also resolves under
 * an nginx /marketplace/ prefix.
 */
suspend fun marketplaceCheckoutPage(call: ApplicationCall) {
    val order = call.request.queryParameters["order"].orEmpty()
    call.respondRedirect("checkout.html?order=$order")
}

/** POST /checkout/complete {orderId, amount?, currency?} — record page-driven completion. */
suspend fun marketplaceMarkComplete(call: ApplicationCall) {
    val body = Json.parseToJsonElement(call.receiveText()).jsonObject
    val orderId = body["orderId"]?.jsonPrimitive?.contentOrNull
    if (orderId.isNullOrBlank()) {
        call.respondText("""{"ok":false}""", ContentType.Application.Json)
        return
    }
    completedOrders[orderId] = buildJsonObject {
        put("orderId", orderId)
        body["amount"]?.let { put("amount", it) }
        body["currency"]?.let { put("currency", it) }
        put("completedAt", Clock.System.now().toString())
    }
    call.respondText("""{"ok":true}""", ContentType.Application.Json)
}

/** GET /checkout/order-status?orderId=<id> — {completed, order} for the widget poll. */
suspend fun marketplaceOrderStatus(call: ApplicationCall) {
    val orderId = call.request.queryParameters["orderId"].orEmpty()
    val record = completedOrders[orderId]
    val payload = buildJsonObject {
        put("completed", record != null)
        if (record != null) put("order", record)
    }
    call.response.headers.append("Access-Control-Allow-Origin", "*")
    call.respondText(payload.toString(), ContentType.Application.Json)
}

/** POST /checkout/age-verified {orderId} — record that the order passed the separate age step. */
suspend fun marketplaceAgeVerified(call: ApplicationCall) {
    val body = Json.parseToJsonElement(call.receiveText()).jsonObject
    val orderId = body["orderId"]?.jsonPrimitive?.contentOrNull
    if (orderId.isNullOrBlank()) {
        call.respondText("""{"ok":false}""", ContentType.Application.Json)
        return
    }
    recordAgeVerified(orderId)
    call.respondText("""{"ok":true}""", ContentType.Application.Json)
}
