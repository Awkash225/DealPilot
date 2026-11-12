import { checkoutTokenFingerprint, eligibleOfferFor, paypalRequestId, verifyCheckoutToken } from "@/lib/checkout-state";
import { isRecord, paypalAccessToken, paypalRequest, purchaseUnitAmount } from "@/lib/paypal-rest";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!isRecord(body) || Object.keys(body).some((key) => !["checkoutToken", "offerId"].includes(key)) || typeof body.checkoutToken !== "string" || typeof body.offerId !== "string" || body.offerId.length > 64) {
    return Response.json({ error: "A valid analysis and sample offer are required." }, { status: 400 });
  }
  const claims = verifyCheckoutToken(body.checkoutToken);
  if (!claims) return Response.json({ error: "Analysis eligibility expired or could not be verified. Run the analysis again." }, { status: 403 });
  const offer = eligibleOfferFor(claims, body.offerId);
  if (!offer) return Response.json({ error: "This sample offer is not eligible for the analyzed mission and budget." }, { status: 403 });

  try { await paypalAccessToken(); } catch {
    return Response.json({ error: "PayPal Sandbox is not configured or could not authenticate. Check the server Sandbox credentials." }, { status: 503 });
  }

  const fingerprint = checkoutTokenFingerprint(body.checkoutToken);
  try {
    const { response, data } = await paypalRequest("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": paypalRequestId("create", `${fingerprint}:${offer.id}`) },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: offer.id, custom_id: fingerprint, amount: { currency_code: "USD", value: offer.price.toFixed(2) } }],
      }),
    });
    if (!response.ok) return Response.json({ error: response.status >= 500 ? "PayPal could not confirm whether order creation finished. Retry checkout; the same order request will be reused." : "PayPal rejected Sandbox order creation. Check the Sandbox app configuration and try again." }, { status: 502 });
    const returnedAmount = purchaseUnitAmount(data);
    if (!isRecord(data) || typeof data.id !== "string" || data.status !== "CREATED" || !returnedAmount || returnedAmount.referenceId !== offer.id || returnedAmount.customId !== fingerprint || returnedAmount.currency !== "USD" || returnedAmount.value !== offer.price.toFixed(2)) return Response.json({ error: "PayPal returned an order that could not be matched to this eligible offer." }, { status: 502 });
    return Response.json({ orderId: data.id, amount: offer.price.toFixed(2), currency: "USD" });
  } catch {
    return Response.json({ error: "PayPal could not confirm whether order creation finished. Retry checkout; the same order request will be reused." }, { status: 502 });
  }
}
