# BasketballStats Premium: billing implementation plan

## Architecture findings

Reviewed on 17 November 2026 before this branch's changes.

- The website is built as a static site by `build.mjs`; the repository has no application server for page requests.
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

Paddle backend routes and webhook-backed D1 entitlements are implemented in this branch, but Paddle credentials/product IDs are not configured and checkout is unavailable until server configuration is supplied. Do not grant access from a query parameter or browser storage, or treat a client-side flag as proof of payment.

A static page can be inspected and its data/scripts downloaded. Therefore, Premium enforcement needs a trusted server boundary. Before charging users, move protected calculations/data behind authenticated Worker endpoints (or another server-side service) and enforce entitlements there. Client-side route guards can improve the experience, but are not authorization.

## Implementation status and remaining launch work

Implemented in this branch: authenticated fixed-price hosted checkout creation, authenticated hosted customer portal links, webhook signature verification with timestamp tolerance, matching-price subscription state in D1, active-only Premium status, account deletion cleanup, setup documentation, and unit tests. Checkout/API and webhook use the Paddle sandbox by default.

Still required before launch:

1. **Complete provider onboarding.** Confirm Paddle seller eligibility, terms, fee/payout details, and the digital-service product category. Use hosted checkout and a hosted customer portal; never handle card data directly.
2. **Create provider products outside the application.** Configure the €9.90 monthly price, tax presentation, cancellation behavior, and sandbox/live environments. Store the provider price identifier in server configuration, never in browser-controlled requests.
3. **Apply the D1 schema and configure secrets.** Create Paddle sandbox credentials, fixed monthly price ID, and webhook signing secret. The existing deployment workflow does not propagate Paddle secrets. The attempted workflow edit was rejected by the automatic review because it would extend a workflow that can deploy Workers and write secrets. Keep that wiring for a separately approved release; the production deployment itself still needs your approval. Keep payment details in Paddle.
4. **Complete webhook lifecycle coverage.** Current integration handles signed subscription creation/updates; before launch, test payment-failure, renewal, scheduled cancellation, deletion, retries, and event ordering against Paddle's simulator and update behavior as needed.
5. **Define remaining entitlement policy.** Current implementation grants only Paddle-confirmed active subscriptions and revokes when the provider reports a non-active state. Confirm scheduled cancellation and past-due behavior. Never trust a browser redirect as proof of payment.
6. **Protect Premium functionality.** Move sensitive data/calculations behind Worker endpoints and check the current entitlement on each request. This is not yet implemented; the static Finder, Prop Analyzer, and comparison assets remain accessible. Keep public basic pages available without login.
7. **Add account and tool UX.** Connect account UI and Premium entry points to these APIs only after server configuration and protected tool endpoints are ready.
8. **Configure and verify before release.** Add provider credentials and webhook secrets through the deployment secret store, register the webhook URL, test in provider sandbox, and only then enable production checkout. No deployment is part of this plan.

## Decisions and business choices

The owner approved Paddle and agreed to one €9.90 monthly plan without a trial or annual plan.

Still confirm before launch:

- Whether €9.90 is the consumer-facing tax-inclusive amount or the pre-tax price.
- Cancellation timing and treatment of past-due payments. Current behavior removes access when Paddle reports a non-active state.
- Paddle seller approval, final fees, and payout terms.
- Whether purchase is web-only or app-store billing is also expected.

## Verification coverage

This branch adds tests for:

- Authenticated checkout creation and rejection of unauthenticated requests.
- Fixed price selection and rejection of caller-supplied arbitrary amounts/price IDs.
- Webhook signature validation, malformed payloads, and duplicate-event idempotency.
- Subscription status transitions, cancellation, expiration, and payment failure.
- Premium endpoint access for active, inactive, and missing subscriptions.
- Free routes remaining available without an account.
- Customer-portal authorization and user/customer ownership checks.

The PR's account and billing test workflow passed on run 12. Keep provider calls mocked in unit tests; perform a separate sandbox checkout before production launch.

## Setup requirements for a future implementation

- Paddle seller account approved for the site and product.
- Monthly €9.90 product/price IDs for sandbox and production. Confirm whether the displayed €9.90 is tax-inclusive and configure localized tax display accordingly.
- Webhook signing secret stored as a Worker secret.
- Public Worker/API URL and registered webhook endpoint.
- Cloudflare D1 migration applied before Worker deployment.
- Google OAuth configuration already documented in `workers/account/README.md`; reuse it.
- Privacy/terms and support/refund information updated for paid subscriptions before launch.

This branch contains sandbox-first billing backend code. It does not configure Paddle credentials, charge users, enable live checkout, protect the static Premium tools, merge, or deploy.
