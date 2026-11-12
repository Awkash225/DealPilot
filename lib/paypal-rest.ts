export const PAYPAL_API = "https://api-m.sandbox.paypal.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

export function paypalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PAYPAL_NOT_CONFIGURED");
  return { clientId, clientSecret };
}

export async function paypalAccessToken() {
  const { clientId, clientSecret } = paypalCredentials();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(data) || typeof data.access_token !== "string" || typeof data.expires_in !== "number") {
    throw new Error("PAYPAL_AUTH_FAILED");
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

export async function paypalRequest(path: string, init: RequestInit = {}) {
  const token = await paypalAccessToken();
  const response = await fetch(`${PAYPAL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  return { response, data };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function purchaseUnitAmount(data: unknown) {
  if (!isRecord(data) || !Array.isArray(data.purchase_units) || data.purchase_units.length !== 1) return null;
  const unit = data.purchase_units[0];
  if (!isRecord(unit) || !isRecord(unit.amount)) return null;
  const { currency_code, value } = unit.amount;
  return typeof currency_code === "string" && typeof value === "string" ? { currency: currency_code, value, referenceId: unit.reference_id } : null;
}

export function captureAmounts(data: unknown) {
  if (!isRecord(data) || !Array.isArray(data.purchase_units) || data.purchase_units.length !== 1) return [];
  const unit = data.purchase_units[0];
  if (!isRecord(unit) || !isRecord(unit.payments) || !Array.isArray(unit.payments.captures)) return [];
  return unit.payments.captures.flatMap((capture) => {
    if (!isRecord(capture) || !isRecord(capture.amount) || typeof capture.status !== "string" || typeof capture.amount.value !== "string" || typeof capture.amount.currency_code !== "string") return [];
    return [{ id: typeof capture.id === "string" ? capture.id : undefined, status: capture.status, value: capture.amount.value, currency: capture.amount.currency_code }];
  });
}
