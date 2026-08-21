export type PlanKey = "starter" | "growth";

export const PLAN_CATALOG: Record<PlanKey, {
  key: PlanKey;
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
}> = {
  starter: {
    key: "starter",
    name: "Starter",
    price: "$24",
    cadence: "per workspace / month",
    description: "A focused operating space for small teams establishing their workflow.",
    features: ["Up to 5 members", "Core workspace analytics", "Email support"],
  },
  growth: {
    key: "growth",
    name: "Growth",
    price: "$79",
    cadence: "per workspace / month",
    description: "More capacity and control for teams managing important work at scale.",
    features: ["Up to 25 members", "Advanced workspace controls", "Priority support"],
  },
};

export function priceIdForPlan(plan: PlanKey): string | null {
  const value = plan === "starter"
    ? process.env.STRIPE_STARTER_PRICE_ID
    : process.env.STRIPE_GROWTH_PRICE_ID;
  return value?.trim() || null;
}

export function planForPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) return "growth";
  return null;
}
