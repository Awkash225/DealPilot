import { demoOffers, meetsRequirement } from "@/lib/offers";
import { getAnalysis, getOrderByPaypalId } from "@/lib/checkout-state";
import { captureAmounts, isRecord, paypalRequest, purchaseUnitAmount } from "@/lib/paypal-rest";

function responseFor(order: NonNullable<ReturnType<typeof getOrderByPaypalId>>) {
  if (order.status === "completed") return Response.json({ status: "completed", amount: order.amount, currency: "USD", captureId: order.captureId ?? null });
  if (order.status === "pending") return Response.json({ status: "pending", amount: order.amount, currency: "USD" }, { status: 202 });
  return null;
}

function settleFromPayPal(order: NonNullable<ReturnType<typeof getOrderByPaypalId>>, data: unknown) {
  if (!isRecord(data) || data.id !== order.paypalOrderId || data.status !== "COMPLETED") return false;
  const captures = captureAmounts(data);
  if (captures.length !== 1 || captures[0].value !== order.amount || captures[0].currency !== "USD") return false;
  if (captures[0].status === "COMPLETED") {
    order.status = "completed";
    order.captureId = captures[0].id;
    return true;
  }
  if (captures[0].status === "PENDING") {
    order.status = "pending";
    return true;
  }
  return false;
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!isRecord(body) || Object.keys(body).some((key) => key !== "orderId") || typeof body.orderId !== "string" || !/^[A-Z0-9]{1,36}$/.test(body.orderId)) {
    return Response.json({ error: "A valid PayPal Sandbox order ID is required." }, { status: 400 });
  }
  const order = getOrderByPaypalId(body.orderId);
  if (!order || order.status === "creating" || !order.paypalOrderId) return Response.json({ error: "This PayPal order is not available for capture." }, { status: 404 });
  const previous = responseFor(order);
  if (previous) return previous;
  if (order.status === "capturing") return Response.json({ error: "Payment capture is already in progress." }, { status: 409 });
  if (order.status === "failed") return Response.json({ error: "This payment attempt cannot be repeated." }, { status: 409 });

  const analysis = getAnalysis(order.analysisId);
  const offer = demoOffers.find((item) => item.id === order.offerId);
  if (!analysis || !offer || !analysis.eligibleOfferIds.includes(offer.id) || offer.price > analysis.budget || !analysis.requirements.every((requirement) => meetsRequirement(offer, requirement)) || order.amount !== offer.price.toFixed(2)) {
    order.status = "failed";
    return Response.json({ error: "The stored offer is no longer eligible for this checkout." }, { status: 409 });
  }

  let verifiedOrder: unknown;
  try {
    const { response, data } = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(order.paypalOrderId)}`, { method: "GET" });
    if (!response.ok) return Response.json({ error: "PayPal could not verify this order." }, { status: 502 });
    verifiedOrder = data;
  } catch {
    return Response.json({ error: "PayPal could not verify this order." }, { status: 502 });
  }

  if (!isRecord(verifiedOrder) || verifiedOrder.id !== order.paypalOrderId || verifiedOrder.intent !== "CAPTURE") return Response.json({ error: "PayPal order details did not match this checkout." }, { status: 409 });
  const verifiedAmount = purchaseUnitAmount(verifiedOrder);
  if (!verifiedAmount || verifiedAmount.referenceId !== offer.id || verifiedAmount.currency !== "USD" || verifiedAmount.value !== order.amount) return Response.json({ error: "PayPal order amount or offer did not match this checkout." }, { status: 409 });

  if (verifiedOrder.status === "COMPLETED") {
    if (settleFromPayPal(order, verifiedOrder)) return responseFor(order)!;
    order.status = "unknown";
    return Response.json({ error: "PayPal shows a completed order whose capture could not be verified." }, { status: 502 });
  }
  if (order.status === "unknown") return Response.json({ status: "pending", amount: order.amount, currency: "USD", message: "The earlier capture outcome is not confirmed. No second capture was sent." }, { status: 202 });
  if (verifiedOrder.status !== "APPROVED") return Response.json({ error: "PayPal has not approved this order yet." }, { status: 409 });
  if (order.status !== "created") {
    const settled = responseFor(order);
    return settled ?? Response.json({ error: "Payment capture is already in progress." }, { status: 409 });
  }

  // Claim synchronously before awaiting PayPal so concurrent requests cannot both capture.
  order.status = "capturing";
  try {
    const { response, data } = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(order.paypalOrderId)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": order.captureRequestId },
      body: "{}",
    });
    if (!response.ok) {
      try {
        const current = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(order.paypalOrderId)}`, { method: "GET" });
        if (current.response.ok && settleFromPayPal(order, current.data)) return responseFor(order)!;
      } catch { /* Keep the attempt unresolved when PayPal's outcome cannot be checked. */ }
      order.status = response.status < 500 ? "failed" : "unknown";
      return Response.json({ error: order.status === "unknown" ? "PayPal could not confirm whether capture completed." : "PayPal declined this Sandbox capture." }, { status: 502 });
    }
    if (!isRecord(data) || data.id !== order.paypalOrderId || !["COMPLETED", "PENDING"].includes(String(data.status))) {
      order.status = "unknown";
      return Response.json({ error: "PayPal returned an unreadable capture response." }, { status: 502 });
    }
    const captures = captureAmounts(data);
    if (captures.length !== 1 || captures[0].value !== order.amount || captures[0].currency !== "USD") {
      order.status = "unknown";
      return Response.json({ error: "The returned capture amount could not be verified." }, { status: 502 });
    }
    if (captures[0].status === "COMPLETED" && data.status === "COMPLETED") {
      order.status = "completed";
      order.captureId = captures[0].id;
      return responseFor(order)!;
    }
    if (captures[0].status === "PENDING") {
      order.status = "pending";
      return responseFor(order)!;
    }
    order.status = "unknown";
    return Response.json({ error: "PayPal has not confirmed the capture." }, { status: 502 });
  } catch {
    // A timeout after the POST may have an unknown outcome. Re-read before telling the buyer.
    try {
      const current = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(order.paypalOrderId)}`, { method: "GET" });
      if (current.response.ok && settleFromPayPal(order, current.data)) return responseFor(order)!;
    } catch { /* Keep the attempt unresolved when PayPal's outcome cannot be checked. */ }
    order.status = "unknown";
    return Response.json({ error: "PayPal could not confirm whether capture completed." }, { status: 502 });
  }
}
