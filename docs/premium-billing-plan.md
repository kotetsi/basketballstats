# BasketballStats Premium: billing implementation plan

## Current state

Reviewed on 17 November 2026.

- The website is built as a static site by `build.mjs`; the repository has no application server for page requests.
- User accounts already exist in `workers/account/worker.js`, backed by Cloudflare D1. Google and Facebook sign-in create user records and bearer sessions.
- The account schema currently has no customer, subscription, entitlement, invoice, or webhook-event records.
- No checkout provider, payment SDK, billing portal, or payment webhook is configured.
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

## Launch blocker

There is no safe payment integration today. Do not display a working-looking checkout button, grant access from a query parameter or browser storage, or treat a client-side flag as proof of payment.

A static page can be inspected and its data/scripts downloaded. Therefore, Premium enforcement needs a trusted server boundary. Before charging users, move protected calculations/data behind authenticated Worker endpoints (or another server-side service) and enforce entitlements there. Client-side route guards can improve the experience, but are not authorization.

## Recommended implementation sequence

1. **Choose the payment provider and merchant model.** Evaluate Stripe Billing versus a merchant-of-record provider for Greece/EU tax handling, recurring payments, refunds, and customer support. Use hosted checkout and a hosted customer portal; never handle card data directly.
2. **Create provider products outside the application.** Configure the €9.90 monthly price, currency, tax treatment, cancellation behavior, and production/test environments. Store provider price identifiers as deployment secrets/configuration, not hard-coded checkout amounts.
3. **Extend the account Worker and D1 schema.** Add provider customer ID, subscription ID, status, current-period end, cancellation state, and audit timestamps. Associate provider objects only with the authenticated internal user ID. Keep payment details in the provider.
4. **Add trusted billing endpoints.** Require the existing authenticated session for checkout and portal creation. Accept only the configured price ID. Validate webhook signatures against the raw request body, reject invalid signatures, and process event IDs idempotently. Handle checkout completion, invoice payment success/failure, subscription updates, and deletion.
5. **Define entitlement semantics.** Grant Premium only for provider-confirmed active or explicitly approved grace-period states. Revoke it on expiration/cancellation according to the chosen policy. Never trust a browser redirect as proof of payment.
6. **Protect Premium functionality.** Move sensitive data/calculations behind Worker endpoints and check the current entitlement on each request. Keep public basic pages available without login.
7. **Add account UX.** Show plan/status, checkout, and manage/cancel links only after the backend is ready. Provide clear sign-in, payment-failure, and cancellation states.
8. **Configure and verify before release.** Add provider credentials and webhook secrets through the deployment secret store, register the webhook URL, test in provider sandbox, and only then enable production checkout. No deployment is part of this plan.

## Decisions required before implementation

The monthly price and initial feature direction are recorded above. Confirm these remaining product/provider choices before enabling billing:

- Payment provider: Stripe Billing or a merchant-of-record provider.
- Whether a 7-day trial is included (previous discussion mentioned it, but it was not part of the final €9.90 launch summary).
- Whether an annual plan is included at launch (previous discussion mentioned an approximate 20% discount, also not in the final launch summary).
- Cancellation policy: immediate loss of Premium or access through the paid period.
- Payment-failure grace period, if any.
- Tax display/pricing policy and whether €9.90 is tax-inclusive.
- Whether Facebook login remains supported for Premium or Google-only is acceptable.
- Whether purchase is limited to web, or app-store billing is also expected.

## Required verification coverage

The implementation PR should add tests for:

- Authenticated checkout creation and rejection of unauthenticated requests.
- Fixed price selection and rejection of caller-supplied arbitrary amounts/price IDs.
- Webhook signature validation, malformed payloads, and duplicate-event idempotency.
- Subscription status transitions, cancellation, expiration, and payment failure.
- Premium endpoint access for active, inactive, and missing subscriptions.
- Free routes remaining available without an account.
- Customer-portal authorization and user/customer ownership checks.

Also run the existing account-worker tests and site build. Keep provider calls mocked in unit tests; perform a separate sandbox checkout before production launch.

## Setup requirements for a future implementation

- Provider account with test and production API credentials.
- Monthly €9.90 product/price IDs for each environment.
- Webhook signing secret stored as a deployment secret.
- Public Worker/API URL and registered webhook endpoint.
- Cloudflare D1 migration applied before Worker deployment.
- Google OAuth configuration already documented in `workers/account/README.md`; reuse it.
- Privacy/terms and support/refund information updated for paid subscriptions before launch.

This document records the safe next step. It does not add checkout, charge users, or grant Premium access.
