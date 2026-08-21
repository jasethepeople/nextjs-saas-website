import { describe, expect, it } from "vitest";
import { statusFromStripe } from "./stripeRoutes";

describe("Stripe subscription state mapping", () => {
  it("maps the required trial, active, past-due, and canceled states", () => {
    expect(statusFromStripe("trialing")).toBe("trialing");
    expect(statusFromStripe("active")).toBe("active");
    expect(statusFromStripe("past_due")).toBe("past_due");
    expect(statusFromStripe("canceled")).toBe("canceled");
  });

  it("maps unpaid subscriptions and unrecognized interim states safely", () => {
    expect(statusFromStripe("unpaid")).toBe("unpaid");
    expect(statusFromStripe("incomplete")).toBe("inactive");
  });
});
