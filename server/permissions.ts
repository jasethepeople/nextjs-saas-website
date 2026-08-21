import type { TenantRole } from "../drizzle/schema";

export function roleCanManageBilling(role: TenantRole) {
  return role === "owner";
}

export function roleCanManageMembership(role: TenantRole) {
  return role === "owner";
}

export function roleCanManageWorkspace(role: TenantRole) {
  return role === "owner" || role === "admin";
}
