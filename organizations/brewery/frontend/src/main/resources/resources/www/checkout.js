// Origin of the Node MCP server that minted the order (holds the order total).
// Local dev default; set to "" when the brewery + MCP server share one origin
// behind a reverse proxy.
const MCP_ORIGIN = "http://localhost:3005";

window.addEventListener("DOMContentLoaded", init);

async function init() {
    const orderId = new URLSearchParams(location.search).get("order");
    if (!orderId) {
        document.getElementById("order-summary").textContent = "Missing order id.";
        return;
    }
    try {
        const resp = await fetch(MCP_ORIGIN + "/order?order=" + encodeURIComponent(orderId));
        if (!resp.ok) throw new Error("Order not found (" + resp.status + ")");
        const order = await resp.json();
        window._order = order;
        window._orderId = orderId;
        renderSummary(order);
    } catch (err) {
        document.getElementById("order-summary").textContent =
            "Could not load order: " + (err && (err.message || String(err)));
    }
}

function renderSummary(order) {
    const lines = order.lines.map(function (l) {
        return '<div class="summary-line"><span>' + escapeHtml(l.name) + " &times; " + l.quantity +
            "</span><span>$" + Number(l.lineTotal).toFixed(2) + "</span></div>";
    }).join("");
    document.getElementById("order-summary").innerHTML = lines +
        '<div class="summary-total"><span>Total</span><span>$' +
        Number(order.total).toFixed(2) + " " + escapeHtml(order.currency) + "</span></div>";
    document.getElementById("pay-btn").disabled = false;
}

async function onPayClick() {
    const order = window._order;
    if (!order) return;

    showLoading(true);
    document.getElementById("pay-btn").disabled = true;

    try {
        // Step 1: mint the DCQL + transaction_data via UPay (existing POST /checkout).
        const description = "Utopia Brewery — " + order.itemCount + " item(s)";
        const checkoutResp = await fetch("checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productName: description, price: String(order.total) })
        });
        if (!checkoutResp.ok) throw new Error("Checkout request failed (" + checkoutResp.status + ")");
        const checkoutData = await checkoutResp.json();

        // Step 2: present age + DPC via the Digital Credentials API.
        const result = await multipazVerifyCredentials(checkoutData);
        showLoading(false);

        if (result && result.approved) {
            await markComplete(order);
            showResult(true, "Purchase Approved",
                "<p>Welcome, <strong>" + escapeHtml(result.holderName) + "</strong>.</p>" +
                "<p>Your Utopia Brewery order ($" + Number(order.total).toFixed(2) +
                ") has been recorded.</p>" +
                "<p>Payment via <em>" + escapeHtml(result.issuerName) + "</em>.</p>");
        } else if (result && result.error_description) {
            showError("Verification Failed", "<p>The credential could not be verified.</p>",
                result.error_description + (result.error ? " (" + result.error + ")" : ""));
        } else if (result && result.error) {
            showError("Purchase Declined", "<p>" + escapeHtml(result.error) + "</p>", null);
        } else {
            showError("Purchase Declined", "<p>Verification could not be completed.</p>", null);
        }
    } catch (err) {
        showLoading(false);
        if (isCancellation(err)) {
            showError("Presentation Cancelled",
                "<p>The credential request was dismissed before it could be completed.</p>", null);
        } else {
            showError("Something Went Wrong",
                "<p>The purchase could not be processed due to an unexpected error.</p>",
                err && (err.message || String(err)));
        }
    } finally {
        document.getElementById("pay-btn").disabled = false;
    }
}

// Best-effort: tell the brewery backend this order completed so the widget poll
// (GET /checkout/order-status) can reflect it. Failure is non-fatal.
async function markComplete(order) {
    try {
        await fetch("checkout/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: window._orderId, amount: order.total, currency: order.currency })
        });
    } catch (_) { /* ignore — poll simply stays pending */ }
}

function isCancellation(err) {
    if (!err) return false;
    const name = err.name || "";
    const msg = (err.message || String(err)).toLowerCase();
    return name === "NotAllowedError" || name === "AbortError" ||
        msg.includes("cancel") || msg.includes("abort") || msg.includes("dismiss");
}

function showLoading(visible) {
    document.getElementById("loading-overlay").classList.toggle("hidden", !visible);
}

function showResult(approved, title, bodyHtml) {
    const icon = approved
        ? '<div class="result-icon result-icon-success" aria-hidden="true">&#10003;</div>'
        : '<div class="result-icon result-icon-error" aria-hidden="true">&#33;</div>';
    const box = document.getElementById("result-box");
    box.className = "result-box " + (approved ? "result-approved" : "result-declined");
    document.getElementById("result-content").innerHTML =
        icon + "<h2>" + escapeHtml(title) + "</h2>" + bodyHtml;
    document.getElementById("result-overlay").classList.remove("hidden");
}

function showError(title, bodyHtml, detail) {
    let html = bodyHtml;
    if (detail) html += '<div class="result-detail">' + escapeHtml(detail) + "</div>";
    showResult(false, title, html);
}

function closeOverlay() {
    document.getElementById("result-overlay").classList.add("hidden");
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
