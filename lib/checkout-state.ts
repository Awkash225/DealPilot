import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { demoOffers, meetsRequirement, type Requirement } from "@/lib/offers";

const tokenLifetimeSeconds = 2 * 60 * 60;

export type CheckoutClaims = {
  budget: number;
  requirements: Requirement[];
  eligibleOfferIds: string[];
  issuedAt: number;
  expiresAt: number;
};

function signingSecret() {
  return process.env.PAYPAL_CLIENT_SECRET;
}

export function createCheckoutToken(input: { budget: number; requirements: Requirement[] }) {
  const secret = signingSecret();
  if (!secret) return null;
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: CheckoutClaims = {
    ...input,
    eligibleOfferIds: demoOffers.filter((offer) => offer.price <= input.budget && input.requirements.every((requirement) => meetsRequirement(offer, requirement))).map((offer) => offer.id),
    issuedAt,
    expiresAt: issuedAt + tokenLifetimeSeconds,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyCheckoutToken(token: unknown): CheckoutClaims | null {
  const secret = signingSecret();
  if (!secret || typeof token !== "string" || token.length > 8192) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(suppliedSignature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const claims = value as Partial<CheckoutClaims>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.budget !== "number" || !Number.isFinite(claims.budget) || claims.budget <= 0 || claims.budget > 1_000_000 || !Number.isInteger(claims.issuedAt) || !Number.isInteger(claims.expiresAt) || claims.issuedAt! > now + 60 || claims.expiresAt! <= now || claims.expiresAt! - claims.issuedAt! > tokenLifetimeSeconds || !Array.isArray(claims.requirements) || claims.requirements.length > 24 || !claims.requirements.every((item) => item && typeof item.attribute === "string" && item.attribute.length <= 60 && typeof item.value === "string" && item.value.length <= 60) || !Array.isArray(claims.eligibleOfferIds) || !claims.eligibleOfferIds.every((id) => typeof id === "string" && demoOffers.some((offer) => offer.id === id))) return null;
    return claims as CheckoutClaims;
  } catch { return null; }
}

export function eligibleOfferFor(claims: CheckoutClaims, offerId: unknown) {
  if (typeof offerId !== "string" || !claims.eligibleOfferIds.includes(offerId)) return null;
  const offer = demoOffers.find((item) => item.id === offerId);
  if (!offer || offer.price > claims.budget || !claims.requirements.every((requirement) => meetsRequirement(offer, requirement))) return null;
  return offer;
}

export function checkoutTokenFingerprint(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function paypalRequestId(action: "create" | "capture", value: string) {
  const secret = signingSecret();
  if (!secret) throw new Error("PAYPAL_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(`dealpilot:${action}:${value}`).digest("hex");
}
