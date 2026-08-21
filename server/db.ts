import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import { stripeEvents, tenantMembers, tenants, type InsertUser, type SubscriptionStatus, type TenantRole, type User, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    passwordHash: user.passwordHash ?? null,
    lastSignedIn: user.lastSignedIn ?? new Date(),
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
  };
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: { name: values.name, email: values.email, loginMethod: values.loginMethod, lastSignedIn: values.lastSignedIn } });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1))[0];
}

export async function createCredentialUser(input: { email: string; name: string; passwordHash: string }): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.toLowerCase();
  if (await getUserByEmail(email)) throw new Error("An account already exists for this email address.");
  const openId = `email:${nanoid(20)}`;
  await db.insert(users).values({ openId, email, name: input.name, passwordHash: input.passwordHash, loginMethod: "credentials", lastSignedIn: new Date() });
  const created = await getUserByOpenId(openId);
  if (!created) throw new Error("Unable to create account");
  return created;
}

export async function upsertGoogleUser(input: { subject: string; email: string; name: string | null }): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) {
    await db.update(users).set({ name: input.name ?? existing.name, loginMethod: "google", lastSignedIn: new Date() }).where(eq(users.id, existing.id));
    return (await getUserById(existing.id))!;
  }
  const openId = `google:${input.subject}`;
  await db.insert(users).values({ openId, email, name: input.name, loginMethod: "google", lastSignedIn: new Date() });
  const created = await getUserByOpenId(openId);
  if (!created) throw new Error("Unable to create Google account");
  return created;
}

export async function updateUserProfile(userId: number, input: { name: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(users).set({ name: input.name.trim() }).where(eq(users.id, userId));
  return getUserById(userId);
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
}

export async function getTenantContext(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select({ tenant: tenants, membership: tenantMembers }).from(tenantMembers).innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id)).where(eq(tenantMembers.userId, userId)).orderBy(desc(tenantMembers.createdAt)).limit(1))[0];
}

export async function getTenantContextById(userId: number, tenantId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select({ tenant: tenants, membership: tenantMembers }).from(tenantMembers).innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id)).where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId))).limit(1))[0];
}

export async function createTenantForUser(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const slug = `${slugify(name)}-${nanoid(6).toLowerCase()}`;
  const result = await db.insert(tenants).values({ name: name.trim(), slug, joinCode: nanoid(10).toUpperCase() });
  const tenantId = Number(result[0].insertId);
  await db.insert(tenantMembers).values({ tenantId, userId, role: "owner" });
  return getTenantContextById(userId, tenantId);
}

export async function joinTenantByCode(userId: number, code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tenant = (await db.select().from(tenants).where(eq(tenants.joinCode, code.trim().toUpperCase())).limit(1))[0];
  if (!tenant) throw new Error("We could not find a workspace with that invitation code.");
  const current = await getTenantContextById(userId, tenant.id);
  if (!current) await db.insert(tenantMembers).values({ tenantId: tenant.id, userId, role: "member" });
  return getTenantContextById(userId, tenant.id);
}

export async function getTenantMembers(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: tenantMembers.id, userId: users.id, name: users.name, email: users.email, role: tenantMembers.role, joinedAt: tenantMembers.createdAt }).from(tenantMembers).innerJoin(users, eq(tenantMembers.userId, users.id)).where(eq(tenantMembers.tenantId, tenantId)).orderBy(desc(tenantMembers.createdAt));
}

export async function getTenantMemberCount(tenantId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
  return Number(result[0]?.count ?? 0);
}

export async function updateMemberRole(tenantId: number, userId: number, role: Exclude<TenantRole, "owner">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(tenantMembers).set({ role }).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)));
}

export async function updateTenantStripeInfo(input: { tenantId: number; customerId?: string | null; subscriptionId?: string | null; priceId?: string | null; status?: SubscriptionStatus; periodEnd?: Date | null; }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(tenants).set({ stripeCustomerId: input.customerId ?? undefined, stripeSubscriptionId: input.subscriptionId ?? undefined, subscriptionPriceId: input.priceId ?? undefined, subscriptionStatus: input.status, subscriptionPeriodEnd: input.periodEnd ?? undefined }).where(eq(tenants.id, input.tenantId));
}

export async function findTenantByStripeSubscription(subscriptionId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(tenants).where(eq(tenants.stripeSubscriptionId, subscriptionId)).limit(1))[0];
}

export async function markStripeEventProcessed(stripeEventId: string, eventType: string, tenantId?: number) {
  const db = await getDb();
  if (!db) return false;
  if ((await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.stripeEventId, stripeEventId)).limit(1)).length) return false;
  await db.insert(stripeEvents).values({ stripeEventId, eventType, tenantId: tenantId ?? null });
  return true;
}
