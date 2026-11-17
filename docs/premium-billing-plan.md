# BasketballStats Premium: billing implementation plan

## Architecture findings

Reviewed on 17 November 2026 before this branch's changes.

- The website is a static site built by `build.mjs` and hosted on GitHub Pages; it has no request-time server or route middleware.
- User accounts already exist in `workers/account/worker.js`, backed by Cloudflare D1. Google and Facebook sign-in create user records and bearer sessions.
- The main branch has no billing records, provider integration, billing portal, or payment webhook. This branch adds Paddle subscription/event records and backend routes.
- Advanced Player Finder, Prop Analyzer, and comparison experiences are static-site tools. Hiding links in the browser would not secure their source or data.

## Agreed product direction

One initial paid tier: **BasketballStats Premium, €9.90/month**.

Keep scores, schedule, standings, and basic statistics free. Premium is intended to include:

- Advanced Player Finder
- Prop Analyzer
- Advanced player comparisons
- Historical statistics and form analysis
- Related advanced tools

The account login already present should be reused. Do not create a second account system.

## Provider recommendation

Recommend **Paddle** for the first release, subject to the owner completing Paddle's seller onboarding and approving its terms and fees. Paddle acts as Merchant of Record and states it handles VAT/tax collection and remittance; its published supported-country list includes Greece, and its tax table lists Greek VAT handling. This reduces the initial tax operations burden compared with using Stripe Billing/Tax, where the business remains responsible for its own tax obligations and filings. Paddle currently publishes a fee of 5% + $0.50 per checkout transaction; confirm the applicable currency-converted fee and payout terms in the seller account before launch.

Use Paddle hosted checkout and customer portal. Provider API calls are isolated in `workers/account/billing.mjs`.

## Launch blocker

Paddle backend routes and webhook-backed D1 entitlements are implemented in this branch. The account UI and browser gate are convenience features only; they do not authorize access to private data. Paddle credentials/product IDs are not configured and checkout is unavailable until server configuration is supplied. Do not grant access from a query parameter or browser storage, or treat a client-side flag as proof of payment.

GitHub Pages cannot check a subscription before serving a static Premium page. A page-level JavaScript check is only a user-experience gate: its scripts and data remain downloadable, and GitHub Pages itself remains a bypass. Before charging users, move Premium interactions and their required datasets behind authenticated Worker endpoints and keep those datasets out of the public build artifacts.

Recommended least-disruptive hosting layout: keep free pages on GitHub Pages and serve the Premium app on `premium.basketballstats.eu`. The owner confirmed the domain's DNS zone is in Cloudflare. Extend the existing account Worker to authorize Premium API requests using the Paddle-backed D1 entitlement. Adding the subdomain route and deploying it still require separate approval.

## Implementation status and remaining launch work

Implemented in this branch: authenticated fixed-price hosted checkout creation, authenticated hosted customer portal links, webhook signature verification with timestamp tolerance, matching-price subscription state in D1, active-only Premium status, account deletion cleanup, setup documentation, and unit tests. Checkout/API and webhook use the Paddle sandbox by default.

Still required before launch:

1. **Complete provider onboarding.** Confirm Paddle seller eligibility, terms, fee/payout details, and the digital-service product category. Use hosted checkout and a hosted customer portal; never handle card data directly.
2. **Create provider products outside the application.** Configure the €9.90 monthly price, tax presentation, cancellation behavior, and sandbox/live environments. Store the provider price identifier in server configuration, never in browser-controlled requests.
3. **Apply the D1 schema and configure secrets.** Create Paddle sandbox credentials, fixed monthly price ID, and webhook signing secret. The existing deployment workflow does not propagate Paddle secrets. The attempted workflow edit was rejected by the automatic review because it would extend a workflow that can deploy Workers and write secrets. Keep that wiring for a separately approved release; the production deployment itself still needs your approval. Keep payment details in Paddle.
4. **Complete webhook lifecycle coverage.** Current integration handles signed subscription creation/updates; before launch, test payment-failure, renewal, scheduled cancellation, deletion, retries, and event ordering against Paddle's simulator and update behavior as needed.
5. **Define remaining entitlement policy.** The owner confirmed that a failed payment removes access to paid Premium features immediately; free pages remain available. The implementation grants access only while Paddle reports `active`, so `past_due`, paused, trialing, and canceled states have no Premium entitlement. Never trust a browser redirect as proof of payment.
6. **Protect Premium functionality and hosting.** This is the next engineering milestone and is not implemented. Keep free pages on GitHub Pages and use the confirmed Cloudflare zone for the proposed `premium.basketballstats.eu` app. Existing account Worker should authorize every Premium API request with the existing bearer session plus D1 status `active`; return `401/403` without any protected payload, including when Paddle is unconfigured. Store Premium datasets in a private Cloudflare R2 bucket (no public domain). The Worker can read that bucket through a binding only after the entitlement check.
   - Current Prop Analyzer fetches `CTX.data` from a static `assets/props/data.json` URL and runs the analysis in browser code.
   - Current comparisons fetch `cfg.api` static `/api/compare/*.json` files and calculate metrics in the browser.
   - The site build workflow publishes the entire `dist` directory to GitHub Pages nightly. The next change must stop copying these Premium datasets into `dist`; otherwise the API gate is bypassable.
   - Publish refreshed private data to R2 from a **separate, narrowly scoped data-sync workflow** using a bucket-write-only credential. Do not reuse the account deployment workflow credential or pass Paddle secrets through GitHub Actions. Add a build check that fails if protected files appear in the public artifact.
   - Add authenticated Worker endpoints for the Prop and comparison datasets; only after their API requests succeed should the browser load and calculate. Keep raw/derived datasets out of page HTML and public API responses.
   - Test no session, free/past_due/canceled account, active account, unknown object key/path traversal, missing R2 object, and public-build exclusion. Add the Finder to this same pattern once draft PR #14 is integrated.
   - Release prerequisites: create the private R2 bucket and a bucket-scoped sync token, register the Worker route/subdomain, and approve the Worker deployment separately. DNS is confirmed available in Cloudflare; no DNS change or deployment is part of this PR.
7. **Finish account and tool UX.** The account modal, checkout/manage actions, and browser-level access gate are present as convenience UX. Advanced Player Finder remains in draft PR #14; integrate it and connect it to the protected data API before describing it as a delivered paid feature.
8. **Configure and verify before release.** Add provider credentials and webhook secrets through the deployment secret store, register the webhook URL, test in provider sandbox, and only then enable production checkout. No DNS change or deployment is part of this plan.

## Decisions and business choices

The owner approved Paddle and agreed to one €9.90 monthly plan without a trial or annual plan.

Still confirm before launch:

- Whether €9.90 is the consumer-facing tax-inclusive amount or the pre-tax price.
- Cancellation timing for subscriptions canceled before the next renewal. Paddle's current status determines access; the account UI should explain whether access continues through the already-paid period.
- Paddle seller approval, final fees, and payout terms.
- Whether purchase is web-only or app-store billing is also expected.
- Which login and profile states the Premium subdomain should offer (existing Google/Facebook account system is available).

## Verification coverage

This branch adds tests for:

- Authenticated checkout creation and rejection of unauthenticated requests.
- Fixed price selection and rejection of caller-supplied arbitrary amounts/price IDs.
- Webhook signature validation, malformed payloads, and duplicate-event idempotency (including a conflicting duplicate replay).
- Subscription status transitions, cancellation, expiration, and payment failure.
- Premium endpoint access for active, inactive, and missing subscriptions.
- Free routes remaining available without an account.
- Customer-portal authorization and user/customer ownership checks.

The PR's account and billing test workflow passed on run 33, including immediate entitlement removal for `past_due` and a replayed event ID with a conflicting state. Keep provider calls mocked in unit tests; perform a separate sandbox checkout before production launch.

## Setup requirements for a future implementation

- Paddle seller account approved for the site and product.
- Monthly €9.90 product/price IDs for sandbox and production. Confirm whether the displayed €9.90 is tax-inclusive and configure localized tax display accordingly.
- Webhook signing secret stored as a Worker secret.
- Public Worker/API URL and registered webhook endpoint.
- Cloudflare D1 migration applied before Worker deployment.
- Google OAuth configuration already documented in `workers/account/README.md`; reuse it.
- Privacy/terms and support/refund information updated for paid subscriptions before launch.

This draft PR contains sandbox-first billing backend code and client-side convenience gates. It does not configure Paddle credentials, charge users, enable live checkout, protect the static Premium data, change hosting/DNS, merge, or deploy. The public static assets remain accessible until the R2/Worker and build-artifact work above is completed.
