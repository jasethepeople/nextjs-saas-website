# Northstar

Northstar is a polished, multi-tenant SaaS workspace that pairs a premium public website with tenant-aware application experiences. It includes an email/password account flow, a Google OAuth handoff, workspace creation and joining, Owner/Admin/Member access boundaries, and a Stripe-ready billing layer that remains safe to use before payment configuration.

## What is included

| Area | Implementation |
| --- | --- |
| Marketing | Responsive landing page with product story, feature highlights, pricing, and conversion paths. |
| Authentication | Credential accounts with bcrypt password hashes and a signed, HTTP-only session cookie. Google OAuth is implemented and becomes available when credentials are configured. |
| Tenancy | Workspaces have a unique slug and invitation code; memberships carry an `owner`, `admin`, or `member` role. |
| Roles | Owners manage billing and member roles; admins retain workspace-operational context; members get a scoped workspace experience. |
| Billing | Stripe Checkout, customer portal, cancellation, and an idempotent webhook endpoint at `/api/stripe/webhook`. The UI is configuration-safe while Stripe Price IDs are absent. |
| Data | Drizzle schema and migrations for users, tenants, memberships, and processed Stripe event identifiers. |

## Local setup

Use Node.js 20+ and pnpm 10+. A MySQL-compatible database is required for the authenticated application flow.

```bash
git clone <your-repository-url> northstar
cd northstar
chmod +x setup.sh
./setup.sh
pnpm dev
```

The script copies `environment.template` to `.env`, installs packages, generates Drizzle artifacts, and applies migrations once `DATABASE_URL` is configured. The development server listens on the runtime-selected port; open the local preview URL shown in your terminal.

## Environment configuration

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | All account and workspace data | MySQL/TiDB-compatible connection string. |
| `JWT_SECRET` | Email/password sessions | Use a long, unique random string. |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | Google sign-in | Register `/api/auth/google/callback` as an authorized redirect URI. |
| `STRIPE_SECRET_KEY` | Checkout and billing portal | Keep server-only; do not expose in browser code. |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification | Signing secret for `/api/stripe/webhook`. |
| `STRIPE_STARTER_PRICE_ID` and `STRIPE_GROWTH_PRICE_ID` | Plan selection | Recurring Stripe Price IDs for the two plans. |

> The app deliberately does **not** require Stripe configuration for workspace creation, account settings, or the subscription interface. Until the two Price IDs are added, billing controls return a clear configuration state rather than attempting a purchase.

## Billing activation

When you are ready to activate payments, create the two recurring Prices in Stripe, add their IDs, and configure Stripe to send events to:

```text
https://your-domain.example/api/stripe/webhook
```

The handler verifies Stripe signatures before acting. It uses the `stripeEvents` table to prevent duplicate processing, then records only the Stripe IDs and a performance-oriented subscription-status cache needed by the dashboard. It maps `trialing`, `active`, `past_due`, `canceled`, and `unpaid` states into the tenant’s visible subscription status.

For a local webhook test, use the Stripe CLI to forward events and configure the received signing secret as `STRIPE_WEBHOOK_SECRET`. Stripe documents Checkout, webhooks, and the customer portal in its official guides. [1] [2] [3]

## Google OAuth activation

Create an OAuth 2.0 Web Client in Google Cloud, add your local and production callback URLs, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The app generates and validates a short-lived state value before exchanging the authorization code for the verified Google profile. The callback route is:

```text
/api/auth/google/callback
```

Refer to Google’s OpenID Connect guidance when registering the client and managing redirect URIs. [4]

## Data model and roles

The model is intentionally compact. `users` hold identity and password-hash information. `tenants` contain workspace metadata, invitation code, essential Stripe identifiers, and a display cache of subscription status. `tenantMembers` is the role-bearing join table. `stripeEvents` contains only event identifiers and types for idempotency; raw payment payloads and sensitive payment details are never persisted locally.

| Role | Workspace dashboard | Member role changes | Billing actions |
| --- | --- | --- | --- |
| Owner | Yes | Yes | Yes |
| Admin | Yes | No | No |
| Member | Yes | No | No |

## Validation commands

```bash
pnpm test
pnpm check
pnpm build
```

The test suite covers the role boundary policy, Stripe status mapping, and session logout behavior. Run these commands before merging or deploying changes.

## Project layout

```text
client/src/pages/        Public, auth, onboarding, and tenant application screens
client/src/components/   Reusable dashboard shell and UI components
drizzle/                 Drizzle schema and generated migrations
server/routers.ts        Typed authentication, tenancy, account, and billing procedures
server/authRoutes.ts     Google OAuth endpoints
server/stripeRoutes.ts   Signature-verified Stripe webhook endpoint
server/products.ts       Centralized Starter and Growth plan definitions
```

## References

[1] [Stripe Checkout documentation](https://docs.stripe.com/payments/checkout)

[2] [Stripe webhook signature verification](https://docs.stripe.com/webhooks/signature)

[3] [Stripe customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal)

[4] [Google OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect)
