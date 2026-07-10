// Origin of the Node MCP server that minted the order (holds the cart's line items).
// Local dev default; set to "" when the marketplace + MCP server share one origin
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
        applyGate(order);
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
}

// Progressive disclosure: if any line is age-restricted, require the age step first — show the
// "Verify age" button and keep checkout disabled until age passes. Otherwise checkout is ready.
function applyGate(order) {
    const ageRequired = order.lines.some(function (l) { return l.minimumAge != null; });
    window._ageRequired = ageRequired;
    const ageBtn = document.getElementById("verify-age-btn");
    const payBtn = document.getElementById("pay-btn");
    if (ageRequired) {
        ageBtn.hidden = false;
        ageBtn.disabled = false;
        payBtn.disabled = true;
        setHint("This order contains age-restricted items — verify your age (18+) first.");
    } else {
        ageBtn.hidden = true;
        payBtn.disabled = false;
        setHint("Payment is authorized with a credential from your wallet.");
    }
}

async function onVerifyAgeClick() {
    showLoading(true, "Verifying age…");
    document.getElementById("verify-age-btn").disabled = true;
    try {
        // Age-only request (no payment, no transaction_data).
        const resp = await fetch("checkout/age", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        if (!resp.ok) throw new Error("Age request failed (" + resp.status + ")");
        const ageData = await resp.json();

        const result = await multipazVerifyCredentials(ageData);
        showLoading(false);

        if (result && result.approved) {
            // Record the passed age step server-side, then unlock checkout.
            await fetch("checkout/age-verified", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: window._orderId })
            }).catch(function () {});
            window._ageVerified = true;
            document.getElementById("verify-age-btn").hidden = true;
            document.getElementById("pay-btn").disabled = false;
            setHint("Age verified ✓ — you can now check out.");
        } else if (result && result.error_description) {
            document.getElementById("verify-age-btn").disabled = false;
            showError("Age Verification Failed", "<p>The credential could not be verified.</p>",
                result.error_description + (result.error ? " (" + result.error + ")" : ""));
        } else if (result && result.error) {
            document.getElementById("verify-age-btn").disabled = false;
            showError("Age Verification Failed", "<p>" + escapeHtml(result.error) + "</p>", null);
        } else {
            document.getElementById("verify-age-btn").disabled = false;
            showError("Age Verification Failed", "<p>Verification could not be completed.</p>", null);
        }
    } catch (err) {
        showLoading(false);
        document.getElementById("verify-age-btn").disabled = false;
        if (isCancellation(err)) {
            showError("Presentation Cancelled",
                "<p>The age request was dismissed before it could be completed.</p>", null);
        } else {
            showError("Something Went Wrong",
                "<p>Age verification could not be processed.</p>", err && (err.message || String(err)));
        }
    }
}

async function onPayClick() {
    const order = window._order;
    if (!order) return;

    showLoading(true, "Processing checkout…");
    document.getElementById("pay-btn").disabled = true;

    try {
        // Payment-only presentation. The backend re-prices every line from its own catalog by id
        // (the amount is never trusted from here) and, for an age-restricted cart, refuses unless
        // the age step above already passed for this order.
        // MCP ids are "p<N>"; the server catalog is keyed by the integer N.
        const items = order.lines.map(function (l) {
            return { productId: Number(String(l.id).replace(/\D/g, "")), quantity: l.quantity };
        });
        const checkoutResp = await fetch("checkout/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: items, orderId: window._orderId })
        });
        if (!checkoutResp.ok) throw new Error("Checkout request failed (" + checkoutResp.status + ")");
        const checkoutData = await checkoutResp.json();

        const result = await multipazVerifyCredentials(checkoutData);
        showLoading(false);

        if (result && result.approved) {
            await markComplete(order);
            showResult(true, "Purchase Approved",
                "<p>Welcome, <strong>" + escapeHtml(result.holderName) + "</strong>.</p>" +
                "<p>Your Utopia Marketplace order ($" + Number(order.total).toFixed(2) +
                ") has been recorded.</p>" +
                "<p>Payment via <em>" + escapeHtml(result.issuerName) + "</em>.</p>");
        } else if (result && result.error_description) {
            document.getElementById("pay-btn").disabled = false;
            showError("Verification Failed", "<p>The credential could not be verified.</p>",
                result.error_description + (result.error ? " (" + result.error + ")" : ""));
        } else if (result && result.error) {
            document.getElementById("pay-btn").disabled = false;
            showError("Purchase Declined", "<p>" + escapeHtml(result.error) + "</p>", null);
        } else {
            document.getElementById("pay-btn").disabled = false;
            showError("Purchase Declined", "<p>Verification could not be completed.</p>", null);
        }
    } catch (err) {
        showLoading(false);
        document.getElementById("pay-btn").disabled = false;
        if (isCancellation(err)) {
            showError("Presentation Cancelled",
                "<p>The credential request was dismissed before it could be completed.</p>", null);
        } else {
            showError("Something Went Wrong",
                "<p>The checkout could not be processed due to an unexpected error.</p>",
                err && (err.message || String(err)));
        }
    }
}

// Best-effort completion signal. Told to two places: the marketplace backend (so the
// widget's GET /checkout/order-status poll reflects it) and the MCP server (so the SDK's
// completed-order store, read by the get-order-status tool, reflects it). Non-fatal.
async function markComplete(order) {
    const body = JSON.stringify({ orderId: window._orderId, amount: order.total, currency: order.currency });
    const headers = { "Content-Type": "application/json" };
    try { await fetch("checkout/complete", { method: "POST", headers, body }); } catch (_) { /* ignore */ }
    try { await fetch(MCP_ORIGIN + "/order/complete", { method: "POST", headers, body }); } catch (_) { /* ignore */ }
}

function setHint(text) {
    document.getElementById("checkout-hint").textContent = text;
}

function isCancellation(err) {
    if (!err) return false;
    const name = err.name || "";
    const msg = (err.message || String(err)).toLowerCase();
    return name === "NotAllowedError" || name === "AbortError" ||
        msg.includes("cancel") || msg.includes("abort") || msg.includes("dismiss");
}

function showLoading(visible, text) {
    if (visible && text) document.getElementById("loading-text").textContent = text;
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
