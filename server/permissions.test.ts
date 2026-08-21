import { describe, expect, it } from "vitest";
import { roleCanManageBilling, roleCanManageMembership, roleCanManageWorkspace } from "./permissions";

describe("tenant role access", () => {
  it("reserves billing and membership administration for the workspace owner", () => {
    expect(roleCanManageBilling("owner")).toBe(true);
    expect(roleCanManageBilling("admin")).toBe(false);
    expect(roleCanManageBilling("member")).toBe(false);
    expect(roleCanManageMembership("owner")).toBe(true);
    expect(roleCanManageMembership("admin")).toBe(false);
    expect(roleCanManageMembership("member")).toBe(false);
  });

  it("permits owners and admins to manage workspace-level operations", () => {
    expect(roleCanManageWorkspace("owner")).toBe(true);
    expect(roleCanManageWorkspace("admin")).toBe(true);
    expect(roleCanManageWorkspace("member")).toBe(false);
  });
});
