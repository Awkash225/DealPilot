# PayPal Sandbox setup

Create a Sandbox REST app in the PayPal Developer Dashboard and copy its Sandbox client ID and secret. Configure these in the local development environment or deployment secret settings:

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are used only by the server to obtain OAuth 2.0 client-credentials tokens and make Orders v2 calls.
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is the same Sandbox app client ID, exposed to the browser for the PayPal JavaScript SDK.

Use Sandbox credentials only. The server is pinned to `https://api-m.sandbox.paypal.com`, and the JavaScript SDK loads from `https://www.sandbox.paypal.com/web-sdk/v6/core`. Never configure Live credentials for this prototype.

The order amount is the selected sample offer's listed USD price. The simulated counteroffer is informational and is never sent to PayPal. Sandbox capture pays the configured PayPal Sandbox merchant account; it does not pay a sample seller, and this app implements no marketplace payout or escrow.

Payment and eligibility records are held in process memory for this single-server hackathon demo. They expire or disappear on server restart and are not shared between server instances. Do not deploy this state model to a multi-instance or production environment: durable storage and stronger buyer/order ownership checks are required there.

Checkout has not been verified with actual Sandbox credentials. After configuring credentials, use a Sandbox personal buyer account and Sandbox business merchant account to test approval, cancellation, capture success and failure.
