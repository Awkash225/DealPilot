# PayPal Sandbox setup

Create a Sandbox REST app in the PayPal Developer Dashboard and copy its Sandbox client ID and secret. Configure these in the local development environment or deployment secret settings:

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are used only by the server to obtain OAuth 2.0 client-credentials tokens and make Orders v2 calls.
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is the same Sandbox app client ID, exposed to the browser for the PayPal JavaScript SDK.

Use Sandbox credentials only. The server is pinned to `https://api-m.sandbox.paypal.com`, and the JavaScript SDK loads from `https://www.sandbox.paypal.com/web-sdk/v6/core`. Never configure Live credentials for this prototype.

The order amount is the selected sample offer's listed USD price. The simulated counteroffer is informational and is never sent to PayPal. Sandbox capture pays the configured PayPal Sandbox merchant account; it does not pay a sample seller, and this app implements no marketplace payout or escrow.

Checkout eligibility is carried in a short-lived (two-hour) HMAC-signed token created by the analysis API and verified again by each checkout API request. The signature uses the existing server-only `PAYPAL_CLIENT_SECRET`; no new environment variable or database is required. Each request recomputes eligibility against the trusted offer catalog and budget. PayPal order creation and capture use deterministic `PayPal-Request-Id` values so retries from separate Vercel function instances reuse the same provider request.

This prototype does not keep a durable application-side order ledger or buyer identity. PayPal remains the source of order and capture status, and capture is reconciled by reading the PayPal order. The signed token expires after two hours; the buyer must rerun analysis if it expires. Keep the same Sandbox app secret configured for every deployment instance. These measures make the checkout flow compatible with stateless serverless requests, but do not make this hackathon prototype a production marketplace payment system.

Checkout has not been verified with actual Sandbox credentials. After configuring credentials, use a Sandbox personal buyer account and Sandbox business merchant account to test approval, cancellation, capture success and failure.
