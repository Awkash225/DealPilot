import { checkoutTokenFingerprint, eligibleOfferFor, paypalRequestId, verifyCheckoutToken } from "@/lib/checkout-state";
import { captureAmounts, isRecord, paypalRequest, purchaseUnitAmount } from "@/lib/paypal-rest";

function verifiedCapture(data: unknown, orderId: string, amount: string) {
  if (!isRecord(data) || data.id !== orderId || !["COMPLETED", "PENDING"].includes(String(data.status))) return null;
  const captures = captureAmounts(data);
  if (captures.length !== 1 || captures[0].value !== amount || captures[0].currency !== "USD") return null;
  if (captures[0].status === "COMPLETED" && data.status === "COMPLETED" && captures[0].id) return { status: "completed" as const, captureId: captures[0].id };
  if (captures[0].status === "PENDING") return { status: "pending" as const, captureId: null };
  return null;
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!isRecord(body) || Object.keys(body).some((key) => !["orderId", "checkoutToken"].includes(key)) || typeof body.orderId !== "string" || !/^[A-Z0-9]{1,36}$/.test(body.orderId) || typeof body.checkoutToken !== "string") {
    return Response.json({ error: "A valid PayPal Sandbox order ID and checkout authorization are required." }, { status: 400 });
  }
  const claims = verifyCheckoutToken(body.checkoutToken);
  if (!claims) return Response.json({ error: "Analysis eligibility expired or could not be verified. Run the analysis again." }, { status: 403 });
  const fingerprint = checkoutTokenFingerprint(body.checkoutToken);

  let verifiedOrder: unknown;
  try {
    const { response, data } = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(body.orderId)}`, { method: "GET" });
    if (!response.ok) return Response.json({ error: "PayPal could not verify this Sandbox order." }, { status: 502 });
    verifiedOrder = data;
  } catch {
    return Response.json({ error: "PayPal could not verify this Sandbox order." }, { status: 502 });
  }

  if (!isRecord(verifiedOrder) || verifiedOrder.id !== body.orderId || verifiedOrder.intent !== "CAPTURE") return Response.json({ error: "PayPal order details did not match this checkout." }, { status: 409 });
  const amount = purchaseUnitAmount(verifiedOrder);
  if (!amount || amount.customId !== fingerprint || amount.currency !== "USD") return Response.json({ error: "PayPal order authorization did not match this checkout." }, { status: 409 });
  const offer = eligibleOfferFor(claims, amount.referenceId);
  if (!offer || amount.value !== offer.price.toFixed(2)) return Response.json({ error: "This sample offer is not eligible for the analyzed mission and budget." }, { status: 403 });

  if (verifiedOrder.status === "COMPLETED") {
    const settled = verifiedCapture(verifiedOrder, body.orderId, offer.price.toFixed(2));
    if (settled) return Response.json({ ...settled, amount: offer.price.toFixed(2), currency: "USD" });
    return Response.json({ error: "PayPal shows a completed order whose capture could not be verified." }, { status: 502 });
  }
  if (verifiedOrder.status !== "APPROVED") return Response.json({ error: "PayPal has not approved this order yet." }, { status: 409 });

  try {
    const { response, data } = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(body.orderId)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": paypalRequestId("capture", body.orderId) },
      body: "{}",
    });
    if (!response.ok) {
      // A prior invocation may have captured the order; reconcile before reporting failure.
      const current = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(body.orderId)}`, { method: "GET" }).catch(() => null);
      const reconciled = current?.response.ok ? verifiedCapture(current.data, body.orderId, offer.price.toFixed(2)) : null;
      if (reconciled) return Response.json({ ...reconciled, amount: offer.price.toFixed(2), currency: "USD" });
      return Response.json({ error: response.status >= 500 ? "PayPal could not confirm whether capture completed. Retry to check the same order safely." : "PayPal declined this Sandbox capture." }, { status: 502 });
    }
    const settled = verifiedCapture(data, body.orderId, offer.price.toFixed(2));
    if (!settled) return Response.json({ error: "PayPal has not returned a verifiable capture status and amount." }, { status: 502 });
    return Response.json({ ...settled, amount: offer.price.toFixed(2), currency: "USD" }, { status: settled.status === "pending" ? 202 : 200 });
  } catch {
    const current = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(body.orderId)}`, { method: "GET" }).catch(() => null);
    const reconciled = current?.response.ok ? verifiedCapture(current.data, body.orderId, offer.price.toFixed(2)) : null;
    if (reconciled) return Response.json({ ...reconciled, amount: offer.price.toFixed(2), currency: "USD" }, { status: reconciled.status === "pending" ? 202 : 200 });
    return Response.json({ error: "PayPal could not confirm whether capture completed. Retry to check the same order safely." }, { status: 502 });
  }
}
