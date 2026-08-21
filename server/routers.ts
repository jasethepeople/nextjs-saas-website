import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import { z } from "zod";
import { type TenantRole } from "../drizzle/schema";
import { clearLocalSession, createLocalSession } from "./auth";
import { createCredentialUser, createTenantForUser, getTenantContext, getTenantMemberCount, getTenantMembers, getUserByEmail, joinTenantByCode, updateMemberRole, updateTenantStripeInfo, updateUserProfile } from "./db";
import { roleCanManageBilling, roleCanManageMembership, roleCanManageWorkspace } from "./permissions";
import { PLAN_CATALOG, type PlanKey, planForPriceId, priceIdForPlan } from "./products";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_not_configured");
const appError = (message: string, code: "BAD_REQUEST" | "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" = "BAD_REQUEST") => new TRPCError({ code, message });
async function currentTenant(userId: number) {
  const context = await getTenantContext(userId);
  if (!context) throw appError("Create or join a workspace before continuing.", "NOT_FOUND");
  return context;
}
function requireMembershipRole(role: TenantRole, permitted: TenantRole[]) {
  const allowed = permitted.includes("owner") ? roleCanManageMembership(role) : permitted.includes(role);
  if (!allowed) throw appError("Your workspace role does not allow this action.", "FORBIDDEN");
}
function originFromRequest(headers: Record<string, unknown>) {
  const origin = headers.origin;
  if (typeof origin === "string" && origin.startsWith("http")) return origin;
  return `https://${typeof headers.host === "string" ? headers.host : "localhost:3000"}`;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    googleAvailable: publicProcedure.query(() => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)),
    signUp: publicProcedure.input(z.object({ name: z.string().trim().min(2).max(80), email: z.string().email(), password: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      const passwordHash = await bcrypt.hash(input.password, 12);
      try {
        const user = await createCredentialUser({ name: input.name, email: input.email, passwordHash });
        await createLocalSession(ctx.res, user.id);
        return { id: user.id, email: user.email, name: user.name };
      } catch (error) { throw appError(error instanceof Error ? error.message : "Unable to create account", "CONFLICT"); }
    }),
    signIn: publicProcedure.input(z.object({ email: z.string().email(), password: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      const user = await getUserByEmail(input.email);
      if (!user?.passwordHash) throw appError("Email address or password is incorrect.");
      const verified = await bcrypt.compare(input.password, user.passwordHash);
      if (!verified) throw appError("Email address or password is incorrect.");
      await createLocalSession(ctx.res, user.id);
      return { id: user.id, email: user.email, name: user.name };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearLocalSession(ctx.res);
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  tenant: router({
    current: protectedProcedure.query(async ({ ctx }) => {
      const result = await getTenantContext(ctx.user.id);
      if (!result) return null;
      return { ...result, memberCount: await getTenantMemberCount(result.tenant.id) };
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120) })).mutation(({ ctx, input }) => createTenantForUser(ctx.user.id, input.name)),
    join: protectedProcedure.input(z.object({ joinCode: z.string().trim().min(6).max(24) })).mutation(async ({ ctx, input }) => {
      try { return await joinTenantByCode(ctx.user.id, input.joinCode); } catch (error) { throw appError(error instanceof Error ? error.message : "Unable to join workspace", "NOT_FOUND"); }
    }),
    members: protectedProcedure.query(async ({ ctx }) => {
      const result = await currentTenant(ctx.user.id);
      const allMembers = await getTenantMembers(result.tenant.id);
      return result.membership.role === "member" ? allMembers.filter(member => member.userId === ctx.user.id) : allMembers;
    }),
    adminWorkspaceSummary: protectedProcedure.query(async ({ ctx }) => {
      const result = await currentTenant(ctx.user.id);
      if (!roleCanManageWorkspace(result.membership.role)) throw appError("Your workspace role does not allow this action.", "FORBIDDEN");
      return { memberCount: await getTenantMemberCount(result.tenant.id), subscriptionStatus: result.tenant.subscriptionStatus, canManageMembers: roleCanManageMembership(result.membership.role) };
    }),
    updateMemberRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
      const result = await currentTenant(ctx.user.id);
      requireMembershipRole(result.membership.role, ["owner"]);
      if (input.userId === ctx.user.id) throw appError("Owners cannot change their own role from this page.");
      await updateMemberRole(result.tenant.id, input.userId, input.role);
      return { success: true };
    }),
  }),
  account: router({
    updateProfile: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(80) })).mutation(({ ctx, input }) => updateUserProfile(ctx.user.id, input)),
  }),
  billing: router({
    catalog: publicProcedure.query(() => PLAN_CATALOG),
    details: protectedProcedure.query(async ({ ctx }) => {
      const result = await currentTenant(ctx.user.id);
      return { tenant: result.tenant, membership: result.membership, plan: planForPriceId(result.tenant.subscriptionPriceId), stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_STARTER_PRICE_ID && process.env.STRIPE_GROWTH_PRICE_ID) };
    }),
    createCheckout: protectedProcedure.input(z.object({ plan: z.enum(["starter", "growth"]) })).mutation(async ({ ctx, input }) => {
      const result = await currentTenant(ctx.user.id);
      if (!roleCanManageBilling(result.membership.role)) throw appError("Your workspace role does not allow this action.", "FORBIDDEN");
      const priceId = priceIdForPlan(input.plan as PlanKey);
      if (!process.env.STRIPE_SECRET_KEY || !priceId) return { status: "not_configured" as const, url: null };
      let customerId = result.tenant.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({ email: ctx.user.email ?? undefined, name: ctx.user.name ?? undefined, metadata: { tenant_id: result.tenant.id.toString(), user_id: ctx.user.id.toString() } });
        customerId = customer.id;
        await updateTenantStripeInfo({ tenantId: result.tenant.id, customerId });
      }
      const origin = originFromRequest(ctx.req.headers as Record<string, unknown>);
      const session = await stripe.checkout.sessions.create({ mode: "subscription", customer: customerId, line_items: [{ price: priceId, quantity: 1 }], allow_promotion_codes: true, client_reference_id: ctx.user.id.toString(), metadata: { tenant_id: result.tenant.id.toString(), user_id: ctx.user.id.toString(), customer_email: ctx.user.email ?? "", customer_name: ctx.user.name ?? "" }, subscription_data: { metadata: { tenant_id: result.tenant.id.toString() } }, success_url: `${origin}/app/billing?success=1`, cancel_url: `${origin}/app/billing?canceled=1` });
      return { status: "ready" as const, url: session.url };
    }),
    openPortal: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await currentTenant(ctx.user.id);
      if (!roleCanManageBilling(result.membership.role)) throw appError("Your workspace role does not allow this action.", "FORBIDDEN");
      if (!process.env.STRIPE_SECRET_KEY || !result.tenant.stripeCustomerId) return { status: "not_configured" as const, url: null };
      const portal = await stripe.billingPortal.sessions.create({ customer: result.tenant.stripeCustomerId, return_url: `${originFromRequest(ctx.req.headers as Record<string, unknown>)}/app/billing` });
      return { status: "ready" as const, url: portal.url };
    }),
    cancelAtPeriodEnd: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await currentTenant(ctx.user.id);
      if (!roleCanManageBilling(result.membership.role)) throw appError("Your workspace role does not allow this action.", "FORBIDDEN");
      if (!process.env.STRIPE_SECRET_KEY || !result.tenant.stripeSubscriptionId) return { status: "not_configured" as const };
      await stripe.subscriptions.update(result.tenant.stripeSubscriptionId, { cancel_at_period_end: true });
      return { status: "scheduled" as const };
    }),
  }),
});

export type AppRouter = typeof appRouter;
