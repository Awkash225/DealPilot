export type DemoOffer = {
  id: string;
  productName: string;
  seller: string;
  price: number;
  wireless: boolean;
  hotSwap: boolean;
  quality: "Good" | "Excellent";
  initials: string;
  tone: "mint" | "lavender" | "peach";
};

// This catalog is the trusted source of demo prices and specifications.
export const demoOffers: DemoOffer[] = [
  { id: "seller-a", productName: "Wireless mechanical keyboard", seller: "Seller A", price: 75, wireless: true, hotSwap: true, quality: "Good", initials: "N", tone: "mint" },
  { id: "seller-b", productName: "Mechanical keyboard", seller: "Seller B", price: 65, wireless: false, hotSwap: true, quality: "Good", initials: "K", tone: "lavender" },
  { id: "seller-c", productName: "Wireless mechanical keyboard", seller: "Seller C", price: 85, wireless: true, hotSwap: true, quality: "Excellent", initials: "M", tone: "peach" },
];

export type Requirement = { attribute: string; value: string };

export function explicitRequirements(mission: string): Requirement[] {
  const requirements: Requirement[] = [];
  if (/\bwireless\b|\bbluetooth\b|\bcordless\b/i.test(mission)) requirements.push({ attribute: "wireless", value: "yes" });
  if (/hot[ -]?swappable|hot[ -]?swap|swappable/i.test(mission)) requirements.push({ attribute: "hotSwap", value: "yes" });
  return requirements;
}

export function meetsRequirement(offer: DemoOffer, requirement: Requirement): boolean {
  const attribute = requirement.attribute.toLowerCase().replace(/[^a-z]/g, "");
  const value = requirement.value.toLowerCase().trim();
  const expectsTrue = /^(yes|true|required|wireless|bluetooth|hot.?swapp?able|swappable)$/.test(value);
  const expectsFalse = /^(no|false|wired|not required)$/.test(value);
  if (attribute.includes("wireless") || attribute.includes("bluetooth") || attribute === "connectivity") {
    if (expectsTrue) return offer.wireless;
    if (expectsFalse) return !offer.wireless;
    return String(offer.wireless) === value;
  }
  if (attribute.includes("hotswap") || attribute.includes("swappable") || attribute.includes("switches")) {
    if (expectsTrue) return offer.hotSwap;
    if (expectsFalse) return !offer.hotSwap;
    return String(offer.hotSwap) === value;
  }
  if (attribute.includes("buildquality") || attribute === "quality") return offer.quality.toLowerCase() === value;
  // Unknown essential attributes cannot be verified from our sample catalog.
  return false;
}
