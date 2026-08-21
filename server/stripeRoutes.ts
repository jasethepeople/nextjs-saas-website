import type { Express } from "express";
import express from "express";
import Stripe from "stripe";
import { findTenantByStripeSubscription, markStripeEventProcessed, updateTenantStripeInfo } from "./db";
import type { SubscriptionStatus } from "../drizzle/schema";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_not_configured");

export function statusFromStripe(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "unpaid") return "unpaid";
  return "inactive";
}

async function saveSubscription(subscription: Stripe.Subscription, eventId: string, eventType: string) {
  const metadataTenantId = Number(subscription.metadata.tenant_id);
  const resolvedTenant = Number.isFinite(metadataTenantId) && metadataTenantId > 0
    ? { id: metadataTenantId }
    : await findTenantByStripeSubscription(subscription.id);
  if (!resolvedTenant) return;
  const shouldProcess = await markStripeEventProcessed(eventId, eventType, resolvedTenant.id);
  if (!shouldProcess) return;
  const item = subscription.items.data[0];
  await updateTenantStripeInfo({
    tenantId: resolvedTenant.id,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    subscriptionId: subscription.id,
    priceId: item?.price.id ?? null,
    status: statusFromStripe(subscription.status),
    periodEnd: new Date(((subscription as unknown as { current_period_end?: number }).current_period_end ?? Math.floor(Date.now() / 1000)) * 1000),
  });
}

export function registerStripeWebhookRoute(app: Express) {
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];
    if (!secret || !signature || Array.isArray(signature)) return res.status(501).json({ error: "Stripe webhook is not configured" });
    try {
      const event = stripe.webhooks.constructEvent(req.body, signature, secret);
      if (event.id.startsWith("evt_test_")) return res.json({ verified: true });
      if (event.type.startsWith("customer.subscription.")) {
        await saveSubscription(event.data.object as Stripe.Subscription, event.id, event.type);
      }
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await saveSubscription(subscription, event.id, event.type);
        }
      }
      return res.json({ received: true });
    } catch (error) {
      console.error("[Stripe Webhook]", error);
      return res.status(400).json({ error: "Unable to verify webhook" });
    }
  });
}
