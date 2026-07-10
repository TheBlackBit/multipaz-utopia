package org.multipaz.brewery.server

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

/**
 * GET /checkout?order=<id> — the storefront mints this link. Redirect to the static
 * checkout page, preserving the order id. Relative target so it also resolves under
 * an nginx /brewery/ prefix.
 */
suspend fun breweryCheckoutPage(call: ApplicationCall) {
    val order = call.request.queryParameters["order"].orEmpty()
    call.respondRedirect("checkout.html?order=$order")
}

/** POST /checkout/complete {orderId, amount?, currency?} — record page-driven completion. */
suspend fun breweryMarkComplete(call: ApplicationCall) {
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
suspend fun breweryOrderStatus(call: ApplicationCall) {
    val orderId = call.request.queryParameters["orderId"].orEmpty()
    val record = completedOrders[orderId]
    val payload = buildJsonObject {
        put("completed", record != null)
        if (record != null) put("order", record)
    }
    call.response.headers.append("Access-Control-Allow-Origin", "*")
    call.respondText(payload.toString(), ContentType.Application.Json)
}
