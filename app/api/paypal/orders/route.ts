import { demoOffers, meetsRequirement } from "@/lib/offers";
import { createOrderClaim, getAnalysis, removeOrderClaim } from "@/lib/checkout-state";
import { isRecord, paypalAccessToken, paypalRequest } from "@/lib/paypal-rest";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!isRecord(body) || Object.keys(body).some((key) => !["analysisId", "offerId"].includes(key)) || typeof body.analysisId !== "string" || body.analysisId.length > 64 || typeof body.offerId !== "string" || body.offerId.length > 64) {
    return Response.json({ error: "A valid analysis and sample offer are required." }, { status: 400 });
  }
  const analysis = getAnalysis(body.analysisId);
  const offer = demoOffers.find((item) => item.id === body.offerId);
  if (!analysis || !offer || !analysis.eligibleOfferIds.includes(offer.id) || offer.price > analysis.budget || !analysis.requirements.every((requirement) => meetsRequirement(offer, requirement))) {
    return Response.json({ error: "This sample offer is not eligible for the analyzed mission and budget." }, { status: 403 });
  }

  // Acquire credentials before making the local claim; an auth failure did not reach the order API.
  try { await paypalAccessToken(); } catch {
    return Response.json({ error: "PayPal Sandbox is not configured or could not authenticate." }, { status: 503 });
  }
  const claim = createOrderClaim({
    paypalOrderId: null,
    offerId: offer.id,
    amount: offer.price.toFixed(2),
    analysisId: body.analysisId,
    createRequestId: crypto.randomUUID(),
    captureRequestId: crypto.randomUUID(),
    status: "creating",
  });
  if (!claim.created) {
    const existing = claim.order;
    if (existing.status === "created" && existing.paypalOrderId) return Response.json({ orderId: existing.paypalOrderId, amount: existing.amount, currency: "USD" });
    return Response.json({ error: "A checkout for this offer is already in progress or needs reconciliation." }, { status: 409 });
  }

  try {
    const { response, data } = await paypalRequest("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": claim.order.createRequestId },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: offer.id, amount: { currency_code: "USD", value: claim.order.amount } }],
      }),
    });
    if (!response.ok) {
      if (response.status >= 500) claim.order.status = "unknown";
      else removeOrderClaim(claim.order.checkoutId);
      return Response.json({ error: response.status >= 500 ? "PayPal could not confirm whether the order was created. Please contact support before retrying." : "PayPal could not create this Sandbox order." }, { status: 502 });
    }
    if (!isRecord(data) || typeof data.id !== "string" || data.status !== "CREATED") {
      claim.order.status = "unknown";
      return Response.json({ error: "PayPal returned an unreadable order response. Please contact support before retrying." }, { status: 502 });
    }
    claim.order.paypalOrderId = data.id;
    claim.order.status = "created";
    return Response.json({ orderId: data.id, amount: claim.order.amount, currency: "USD" });
  } catch {
    claim.order.status = "unknown";
    return Response.json({ error: "PayPal could not confirm whether the order was created. Please contact support before retrying." }, { status: 502 });
  }
}
