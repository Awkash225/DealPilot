"use client";

import { FormEvent, useState } from "react";
import { demoOffers } from "@/lib/offers";
import { PaypalCheckout } from "./paypal-checkout";

type Analysis = {
  productCategory?: string | null;
  productRequirements?: string[] | null;
  essentialRequirements?: { attribute: string; value: string }[] | null;
  preferredRequirements?: string[] | null;
  extractedBudget?: number | null;
  matchingExplanation?: string | null;
  recommendedOfferId?: string | null;
  negotiationStrategy?: string | null;
  suggestedNegotiationMessage?: string | null;
  recommendationExplanation?: string | null;
};
type AnalyzeResult = {
  analysis: Analysis;
  recommendedOfferId: string | null;
  eligibleOfferIds: string[];
  matchingExplanations: { offerId: string; matches: boolean; reason: string }[];
  noMatch: boolean;
  demo: true;
  analysisSource: "gemini" | "deterministic";
  checkoutToken: string | null;
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, React.ReactNode> = {
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    sliders: <><path d="M4 7h9M17 7h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.5 11h11L21 8H6"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function money(amount: number) { return `$${amount.toFixed(2)}`; }

function uniqueText(values: unknown[], omit: string[] = []) {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const seen = new Set(omit.map(normalize));
  return values.flatMap((value) => {
    if (typeof value !== "string") return [];
    const text = value.trim().replace(/\s+/g, " ");
    const key = normalize(text);
    if (!text || !key || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

function AnalysisSummary({ result, mission, fallbackBudget, recommendedOffer }: {
  result: AnalyzeResult;
  mission: string;
  fallbackBudget: number;
  recommendedOffer: (typeof demoOffers)[number] | undefined;
}) {
  const analysis = result.analysis ?? {};
  const rawEssentials = Array.isArray(analysis.essentialRequirements) ? analysis.essentialRequirements : [];
  const essentials = rawEssentials.flatMap((requirement) => {
      if (!requirement || typeof requirement.attribute !== "string" || typeof requirement.value !== "string") return [];
      const attribute = requirement.attribute.trim();
      const value = requirement.value.trim();
      return attribute && value ? [`${attribute}: ${value}`] : [];
    });
  const essentialItems = uniqueText(essentials);
  const essentialAttributes = rawEssentials.flatMap((requirement) => typeof requirement?.attribute === "string" ? [requirement.attribute.trim().toLocaleLowerCase()] : []);
  const preferredItems = uniqueText(Array.isArray(analysis.preferredRequirements) ? analysis.preferredRequirements : [], essentialItems)
    .filter((item) => !essentialAttributes.some((attribute) => attribute && (item.toLocaleLowerCase().includes(attribute) || attribute.includes(item.toLocaleLowerCase()))));
  const productDetails = uniqueText(Array.isArray(analysis.productRequirements) ? analysis.productRequirements : [], [...essentialItems, ...preferredItems])
    .filter((item) => !essentialAttributes.some((attribute) => attribute && item.toLocaleLowerCase().includes(attribute)));
  const budget = typeof analysis.extractedBudget === "number" && Number.isFinite(analysis.extractedBudget) ? analysis.extractedBudget : fallbackBudget;
  const productCategory = typeof analysis.productCategory === "string" ? analysis.productCategory.trim() : "";
  const explanation = typeof analysis.recommendationExplanation === "string" && analysis.recommendationExplanation.trim()
    ? analysis.recommendationExplanation.trim()
    : typeof analysis.matchingExplanation === "string" && analysis.matchingExplanation.trim()
      ? analysis.matchingExplanation.trim()
      : recommendedOffer ? `${recommendedOffer.seller} is the recommended eligible sample offer.` : "No eligible sample offer was identified.";

  return <section className="ai-analysis" aria-label="Shopping mission analysis">
    <div className="analysis-summary-heading">
      <span className={`ai-badge ${result.analysisSource === "deterministic" ? "demo-analysis-badge" : ""}`}><Icon name="sparkle" size={12}/>{result.analysisSource === "gemini" ? "GEMINI ANALYSIS" : "DEMO ANALYSIS · AI TEMPORARILY UNAVAILABLE"}</span>
    </div>
    <div className="analysis-summary-grid">
      <section className="analysis-panel mission-panel">
        <h3>Product mission</h3>
        <p>{mission.trim() || "Mission details are unavailable."}</p>
        {productCategory && <div className="analysis-category">{productCategory}</div>}
        {productDetails.length > 0 && <ul>{productDetails.map((item) => <li key={item}>{item}</li>)}</ul>}
      </section>
      <section className="analysis-panel budget-panel">
        <h3>Budget</h3>
        <p className="analysis-budget-value">{money(budget)} <span>USD maximum</span></p>
      </section>
      <section className="analysis-panel essential-panel">
        <h3><span className="requirement-marker mandatory-marker"/>Essential requirements <span className="requirement-label">MANDATORY</span></h3>
        {essentialItems.length ? <ul>{essentialItems.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="analysis-empty">No mandatory requirements identified.</p>}
      </section>
      <section className="analysis-panel preferred-panel">
        <h3><span className="requirement-marker preferred-marker"/>Preferred features <span className="requirement-label">OPTIONAL</span></h3>
        {preferredItems.length ? <ul>{preferredItems.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="analysis-empty">No preferences identified.</p>}
      </section>
      <section className="analysis-panel recommendation-panel">
        <h3>{result.analysisSource === "gemini" ? "AI recommendation" : "Demo recommendation"}</h3>
        {recommendedOffer
          ? <p className="analysis-recommended-offer">{recommendedOffer.seller} <span>·</span> {recommendedOffer.productName} <strong>{money(recommendedOffer.price)}</strong></p>
          : <p className="analysis-empty">No eligible sample offer was recommended.</p>}
      </section>
      <section className="analysis-panel explanation-panel">
        <h3>Recommendation explanation</h3>
        <p>{explanation}</p>
      </section>
    </div>
  </section>;
}

export default function Home() {
  const [mission, setMission] = useState("I need a wireless mechanical keyboard under $80 with hot-swappable switches");
  const [budget, setBudget] = useState("80");
  const [loading, setLoading] = useState(false);
  const [negotiated, setNegotiated] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const recommendedOfferId = result?.recommendedOfferId ?? (result?.noMatch ? null : "seller-a");
  const selected = demoOffers.find((offer) => offer.id === recommendedOfferId);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setFeedback(""); setNegotiated(false); setResult(null);
    const amount = Number(budget);
    if (!mission.trim() || mission.trim().length > 500 || !Number.isFinite(amount) || amount <= 0) {
      setLoading(false); setFeedback("Enter a shopping mission (up to 500 characters) and a positive budget."); return;
    }
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mission: mission.trim(), budget: amount, offers: demoOffers.map(({ id }) => ({ id })) }) });
      const payload = await response.json() as AnalyzeResult | { error?: string };
      if (!response.ok || !("analysis" in payload)) throw new Error("error" in payload ? payload.error : undefined);
      setResult(payload);
      setFeedback(payload.analysisSource === "deterministic"
        ? "Demo analysis — AI temporarily unavailable"
        : payload.noMatch ? "Gemini found no sample offer that meets your essential requirements and budget." : "Gemini analyzed your mission and ranked the sample offers.");
    } catch (error) {
      setFeedback(error instanceof Error && error.message ? error.message : "We couldn't analyze that mission. Please try again.");
    } finally { setLoading(false); }
  }
  function tryExample(example: string) { setMission(example); setResult(null); setFeedback(""); }

  return <main className="site-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <a href="#discover" className="brand" aria-label="DealPilot home"><span className="brand-mark"><Icon name="sparkle" size={20}/></span><span>dealpilot<span className="brand-period">.</span></span></a>
        <nav className={`main-nav ${mobileMenu ? "is-open" : ""}`} aria-label="Main navigation">
          <a className="nav-link active" href="#discover" onClick={() => setMobileMenu(false)}>Discover</a>
          <a className="nav-link" href="#my-deals" onClick={() => setMobileMenu(false)}>My deals <span className="nav-count">1</span></a>
          <a className="nav-link" href="#how-it-works" onClick={() => setMobileMenu(false)}>How it works</a>
        </nav>
        <div className="header-actions"><span className="demo-pill"><span className="live-dot"/> Sandbox demo</span><button className="avatar" aria-label="User profile">JD</button></div>
        <button className="menu-toggle" aria-label="Toggle menu" aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}><span/><span/></button>
      </div>
    </header>

    <div className="page-content" id="discover">
      <section className="hero-section">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-icon"><Icon name="sparkle" size={14}/></span> YOUR PERSONAL SHOPPING AGENT</div>
          <h1>Find the deal.<br/><span>Not just the product.</span></h1>
          <p>Tell DealPilot what you&apos;re looking for. Your AI shopping agent compares offers, negotiates better prices, and keeps you in control of every purchase.</p>
          <div className="hero-proof"><span><span className="proof-check"><Icon name="check" size={12}/></span> Your budget, always respected</span><span><span className="proof-check"><Icon name="check" size={12}/></span> You approve every purchase</span></div>
        </div>
        <form className="mission-card" onSubmit={search}>
          <div className="mission-heading"><div className="mission-icon"><Icon name="sparkle" size={19}/></div><div><strong>What are you shopping for?</strong><span>Describe it like you&apos;d tell a friend</span></div><span className="demo-tag">DEMO</span></div>
          <label htmlFor="mission" className="sr-only">Shopping mission</label>
          <textarea id="mission" value={mission} onChange={(e) => setMission(e.target.value)} rows={3} placeholder="Tell us what you need, what matters, and what you'd like to spend..."/>
          <div className="mission-bottom"><label className="budget-control"><span className="budget-label">MAX BUDGET</span><span className="budget-input-wrap"><span>$</span><input aria-label="Maximum budget in US dollars" inputMode="decimal" type="number" min="0" step="1" value={budget} onChange={(e) => setBudget(e.target.value)}/><span className="budget-currency">USD <Icon name="chevron" size={12}/></span></span></label><button type="submit" className="primary-button search-button" disabled={loading}>{loading ? <><span className="spinner"/> Comparing...</> : <>Find my deal <Icon name="arrow" size={17}/></>}</button></div>
          <div className="suggestions"><span>Try:</span><button type="button" onClick={() => tryExample("Noise-cancelling headphones for travel under $150")}>Headphones</button><i/><button type="button" onClick={() => tryExample("Ergonomic office chair with lumbar support under $250")}>Office chair</button><i/><button type="button" onClick={() => tryExample("4K monitor for a home setup under $300")}>4K monitor</button></div>
        </form>
      </section>

      <section className="results-section" aria-labelledby="results-title" id="my-deals">
        <div className="section-topline"><div><div className="section-kicker">THE SHORTLIST</div><h2 id="results-title">Deals picked for you<span className="result-count">03</span></h2><p className="section-subtitle">Ranked by what matters to you, not just the lowest price.</p></div><button className="filter-button" type="button" onClick={() => setFeedback("Offers are ranked by your requirements, budget, and price.")}><Icon name="sliders" size={16}/> Best match <Icon name="chevron" size={13}/></button></div>
        {feedback && <div className={`feedback ${result?.noMatch ? "feedback-warning" : ""}`} role="status">{feedback}</div>}
        {result && <AnalysisSummary result={result} mission={mission} fallbackBudget={Number(budget) || 0} recommendedOffer={demoOffers.find((offer) => offer.id === result.recommendedOfferId)} />}
        <div className="offer-grid">{demoOffers.map((offer) => {
          const match = result?.matchingExplanations.find((item) => item.offerId === offer.id);
          const qualifies = match?.matches ?? offer.id === "seller-a";
          const best = qualifies && offer.id === selected?.id;
          const resultBudget = result?.analysis.extractedBudget;
          const overBudget = typeof resultBudget === "number" && Number.isFinite(resultBudget) ? offer.price > resultBudget : offer.price > 80;
          const requirementMiss = !!match && !match.matches && !overBudget;
          return <article key={offer.seller} className={`offer-card ${best ? "is-recommended" : ""} ${!qualifies ? "is-muted" : ""}`}>
            {best && <div className="recommend-ribbon"><Icon name="sparkle" size={13}/> BEST MATCH</div>}
            <div className="offer-main"><div className={`seller-logo ${offer.tone}`}>{offer.initials}</div><div className="seller-text"><span className="product-name">{offer.productName}</span><span className="seller-name">from <strong>{offer.seller}</strong></span></div><div className="price-block"><span className="price">${offer.price}</span><span className="price-caption">USD · before tax</span></div></div>
            <div className="specs"><div className={`spec ${offer.wireless ? "spec-good" : "spec-bad"}`}><span className="spec-indicator">{offer.wireless ? <Icon name="check" size={11}/> : "×"}</span><span>Wireless</span><b>{offer.wireless ? "Yes" : "No"}</b></div><div className={`spec ${offer.hotSwap ? "spec-good" : "spec-bad"}`}><span className="spec-indicator">{offer.hotSwap ? <Icon name="check" size={11}/> : "×"}</span><span>Hot-swap</span><b>{offer.hotSwap ? "Yes" : "No"}</b></div><div className="spec spec-quality"><span className="quality-star">✦</span><span>Build</span><b>{offer.quality}</b></div></div>
            <div className="offer-footer"><span className={`fit-status ${best ? "fit-best" : qualifies ? "fit-good" : "fit-no"}`}><span/>{best ? "Recommended match" : requirementMiss ? "Does not meet essentials" : overBudget ? "Over your budget" : "Matches your criteria"}</span>{!best && <span className="offer-fit-note">{match?.reason ?? (overBudget ? "$5 over limit" : "Eligible")}</span>}</div>
          </article>;
        })}</div>
        {!selected && <div className="empty-state"><span className="empty-icon"><Icon name="bag"/></span><div><strong>No offers fit this mission and budget yet.</strong><span>Try raising your budget or adjusting a requirement to see a match.</span></div></div>}
        <div className="sample-note"><span className="sample-dot"/> Sample offers for this demo · Prices and sellers are illustrative</div>
      </section>

      {selected && <section className="deal-workspace" id="how-it-works">
        <div className="negotiation-card"><div className="card-top"><div className="negotiation-icon"><Icon name="sparkle" size={19}/></div><div className="neg-title"><h3>A little room to negotiate</h3><span>YOUR NEGOTIATION STRATEGY</span></div><span className="simulated-tag">SIMULATED</span></div>
          <p className="neg-explanation">{result?.analysis.negotiationStrategy ?? `${selected.seller} matches your essential requirements and stays within your budget.`} A <strong>{money(Math.max(0, selected.price - 7))}</strong> counteroffer is a demo suggestion only.</p>
          {result?.analysis.suggestedNegotiationMessage && <blockquote className="suggested-message">“{result.analysis.suggestedNegotiationMessage}”</blockquote>}
          {result?.analysis.matchingExplanation && <p className="match-explanation">{result.analysis.matchingExplanation}</p>}
          <div className="price-comparison"><div><span>LISTED PRICE</span><strong>{money(selected.price)}</strong></div><div className="comparison-arrow">→</div><div><span>SUGGESTED OFFER</span><strong className="suggested-price">{money(Math.max(0, selected.price - 7))}</strong></div><div className="savings-chip">Save {money(7)}</div></div>
          <div className="negotiation-status"><span className="status-pulse"/><span>{negotiated ? "Demo offer prepared" : "No seller response"}</span><span className="status-divider">·</span><span className="status-demo">Demo only</span></div>
          <button className={`negotiate-button ${negotiated ? "negotiated" : ""}`} onClick={() => {setNegotiated(true); setFeedback("Demo negotiation prepared. No seller was contacted.");}} disabled={negotiated}><Icon name={negotiated ? "check" : "sparkle"} size={16}/>{negotiated ? "Demo offer prepared" : "Prepare a counteroffer"}<Icon name="arrow" size={15}/></button>
          <p className="simulation-footnote">This is a simulation. No seller has been contacted.</p>
        </div>

        <div className="approval-card"><div className="approval-head"><div><div className="section-kicker">YOUR CALL</div><h3>Ready when you are</h3></div><div className="approval-shield"><Icon name="shield" size={19}/></div></div>
          <div className="approved-product"><div className="product-thumb"><div className="keyboard-art"><span/><span/><span/><span/><span/><span/><span/><span/><span/></div></div><div><strong>{selected.productName}</strong><span>{selected.seller} · {selected.quality} build</span></div><span className="product-price">{money(selected.price)}</span></div>
          <div className="cost-lines"><div><span>Listed price</span><span>{money(selected.price)}</span></div><div><span>Suggested counteroffer <em>SIMULATED · NOT ACCEPTED</em></span><span className="cost-green">{money(Math.max(0, selected.price - 7))}</span></div><div className="final-total"><strong>PayPal Sandbox checkout amount</strong><strong>{money(selected.price)}<small> USD</small></strong></div></div>
          <p className="checkout-explanation">The suggested counteroffer is only a demo. The Sandbox checkout uses the seller&apos;s listed price because no seller has accepted a different amount.</p>
          {result?.checkoutToken && result.eligibleOfferIds.includes(selected.id)
            ? <PaypalCheckout checkoutToken={result.checkoutToken} offerId={selected.id} amount={money(selected.price)} />
            : <p className="paypal-note">Run an analysis and confirm this offer is eligible to enable checkout.</p>}
          <div className="trust-message"><Icon name="shield" size={15}/><span>You choose whether to continue in PayPal Sandbox.<br/><strong>This demo does not pay sample sellers.</strong></span></div>
          <div className="no-payment-note">Sandbox transaction only · No marketplace payout or escrow</div>
        </div>
      </section>}
      <footer className="footer"><a href="#discover" className="footer-brand">dealpilot<span>.</span></a><span>Your budget. Your rules. Your call.</span><span className="footer-demo"><span className="live-dot"/> Sandbox demo</span></footer>
    </div>
  </main>;
}
