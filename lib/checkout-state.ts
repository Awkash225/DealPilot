import { randomUUID } from "node:crypto";
import type { Requirement } from "@/lib/offers";

export type CheckoutOrder = {
  checkoutId: string;
  paypalOrderId: string | null;
  offerId: string;
  amount: string;
  analysisId: string;
  createRequestId: string;
  captureRequestId: string;
  status: "creating" | "created" | "capturing" | "pending" | "completed" | "failed" | "unknown";
  captureId?: string;
  createdAt: number;
};

type CheckoutState = {
  analyses: Map<string, { mission: string; budget: number; requirements: Requirement[]; eligibleOfferIds: string[]; createdAt: number }>;
  orders: Map<string, CheckoutOrder>;
  orderClaims: Map<string, string>;
};

declare global {
  // Prototype state only: lost on restart and not shared across server instances.
  var dealPilotCheckoutState: CheckoutState | undefined;
}

const state = globalThis.dealPilotCheckoutState ??= {
  analyses: new Map<string, { mission: string; budget: number; requirements: Requirement[]; eligibleOfferIds: string[]; createdAt: number }>(),
  orders: new Map<string, CheckoutOrder>(),
  orderClaims: new Map<string, string>(),
};
const { analyses, orders, orderClaims } = state;

export function rememberAnalysis(input: { mission: string; budget: number; requirements: Requirement[]; eligibleOfferIds: string[] }) {
  const now = Date.now();
  for (const [id, record] of analyses) if (now - record.createdAt > 30 * 60_000) analyses.delete(id);
  while (analyses.size >= 500) analyses.delete(analyses.keys().next().value!);
  const id = randomUUID();
  analyses.set(id, { ...input, createdAt: now });
  return id;
}

export function getAnalysis(id: string) { return analyses.get(id); }
export function getOrderByCheckoutId(id: string) { return orders.get(id); }
export function getOrderByPaypalId(id: string) { return [...orders.values()].find((order) => order.paypalOrderId === id); }
export function createOrderClaim(input: Omit<CheckoutOrder, "checkoutId" | "createdAt">) {
  const key = `${input.analysisId}:${input.offerId}`;
  const existingId = orderClaims.get(key);
  if (existingId) return { order: orders.get(existingId)!, created: false };
  const checkoutId = randomUUID();
  const order: CheckoutOrder = { ...input, checkoutId, createdAt: Date.now() };
  orders.set(checkoutId, order);
  orderClaims.set(key, checkoutId);
  return { order, created: true };
}
export function removeOrderClaim(checkoutId: string) {
  const order = orders.get(checkoutId);
  if (order) orderClaims.delete(`${order.analysisId}:${order.offerId}`);
  orders.delete(checkoutId);
}
