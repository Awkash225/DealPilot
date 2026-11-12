"use client";

import { useEffect, useRef, useState } from "react";

type CheckoutState = "idle" | "loading" | "success" | "pending" | "cancelled" | "failed";
type PaypalCallbacks = {
  onApprove: (data: { orderId: string }) => Promise<void>;
  onCancel: () => void;
  onError: (error: unknown) => void;
};
type PaypalSdk = {
  findEligibleMethods: () => Promise<{ isEligible: (method: string) => boolean }>;
  createPayPalOneTimePaymentSession: (callbacks: PaypalCallbacks) => Promise<{
    start: (options: { presentationMode: "auto" }, createOrder: Promise<{ orderId: string }>) => Promise<void>;
  }>;
};

declare global {
  interface Window { paypal?: { createInstance: (options: { clientId: string; components: string[] }) => Promise<PaypalSdk> } }
}

export function PaypalCheckout({ checkoutToken, offerId, amount }: { checkoutToken: string | null; offerId: string; amount: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const orderCreationFailed = useRef(false);
  const [state, setState] = useState<CheckoutState>("idle");
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  useEffect(() => {
    if (!checkoutToken || !clientId || !containerRef.current) return;
    let disposed = false;
    let button: HTMLElement | null = null;
    let clickHandler: (() => void) | null = null;
    let script = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk="v6"]');
    const loadSdk = () => new Promise<void>((resolve, reject) => {
      if (window.paypal) { resolve(); return; }
      if (!script) {
        script = document.createElement("script");
        script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
        script.async = true;
        script.dataset.paypalSdk = "v6";
        document.head.append(script);
      }
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("SDK_LOAD_FAILED")), { once: true });
    });

    void (async () => {
      try {
        await loadSdk();
        if (disposed || !window.paypal || !containerRef.current) return;
        const sdk = await window.paypal.createInstance({ clientId, components: ["paypal-payments"] });
        const eligibility = await sdk.findEligibleMethods();
        if (!eligibility.isEligible("paypal")) {
          setMessage("PayPal Sandbox checkout is unavailable in this browser.");
          return;
        }
        const session = await sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => {
            setState("loading");
            try {
              const response = await fetch("/api/paypal/capture", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, checkoutToken }),
              });
              const result = await response.json() as { status?: string; captureId?: string | null; error?: string };
              if (!response.ok) throw new Error(result.error ?? "PayPal could not confirm this Sandbox payment.");
              if (result.status === "completed") {
                setState("success");
                setMessage(`Sandbox payment completed${result.captureId ? ` (capture ${result.captureId})` : ""}. No sample seller was paid.`);
              } else if (result.status === "pending") {
                setState("pending");
                setMessage("PayPal reports this Sandbox payment as pending. No sample seller was paid.");
              } else throw new Error(result.error ?? "PayPal could not confirm this Sandbox payment.");
            } catch (error) {
              setState("failed");
              setMessage(error instanceof Error ? error.message : "PayPal could not confirm this Sandbox payment.");
            }
          },
          onCancel: () => {
            if (orderCreationFailed.current) return;
            setState("cancelled");
            setMessage("PayPal Sandbox checkout was cancelled. No capture was requested.");
          },
          onError: () => { setState("failed"); setMessage("PayPal Sandbox checkout could not be completed. Please try again."); },
        });
        button = document.createElement("paypal-button");
        clickHandler = () => {
          if (!checkoutToken) return;
          orderCreationFailed.current = false;
          setState("loading");
          setMessage("");
          const createOrder = fetch("/api/paypal/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ checkoutToken, offerId }),
          }).then(async (response) => {
            const result = await response.json() as { orderId?: string; error?: string };
            if (!response.ok || !result.orderId) {
              orderCreationFailed.current = true;
              throw new Error(result.error ?? "PayPal Sandbox order creation failed. No payment was captured.");
            }
            return { orderId: result.orderId };
          });
          void session.start({ presentationMode: "auto" }, createOrder).catch((error: unknown) => {
            if (!orderCreationFailed.current) orderCreationFailed.current = true;
            setState("failed");
            setMessage(`${error instanceof Error ? error.message : "PayPal Sandbox checkout failed."} No payment was captured.`);
          });
        };
        button.addEventListener("click", clickHandler);
        containerRef.current.append(button);
        setAvailable(true);
      } catch {
        if (!disposed) { setState("failed"); setMessage("PayPal Sandbox could not load. Check the public client ID and try again."); }
      }
    })();
    return () => {
      disposed = true;
      if (button && clickHandler) button.removeEventListener("click", clickHandler);
      button?.remove();
    };
  }, [checkoutToken, clientId, offerId]);

  if (!checkoutToken) return <p className="paypal-note">PayPal Sandbox checkout is unavailable until server-side eligibility can be secured. Check the server Sandbox credentials.</p>;
  if (!clientId) return <p className="paypal-note">PayPal Sandbox is not configured. Set NEXT_PUBLIC_PAYPAL_CLIENT_ID to enable checkout.</p>;
  return <div className="paypal-checkout">
    <div className="paypal-label">PAYPAL SANDBOX CHECKOUT · {amount} USD</div>
    <div ref={containerRef} className="paypal-button-slot" aria-label="PayPal Sandbox checkout button" />
    {!available && !message && <p className="paypal-note">Loading PayPal Sandbox checkout…</p>}
    {message && <p className={`payment-message payment-${state}`} role="status">{message}</p>}
  </div>;
}
