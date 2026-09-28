import { describe, expect, it } from "vitest";

import { computeCommercialState } from "../../../src/modules/organization/domain/CommercialState";
import type { SubscriptionPlan } from "../../../src/modules/organization/domain/Subscription";

const PLANS: SubscriptionPlan[] = ["basic", "pro", "premium"];

describe("computeCommercialState", () => {
  it("maps pending to pending_approval regardless of plan", () => {
    for (const plan of PLANS) {
      expect(computeCommercialState({ plan, status: "pending" })).toBe("pending_approval");
    }
  });

  it("maps trial to trialing_<plan>", () => {
    expect(computeCommercialState({ plan: "basic", status: "trial" })).toBe("trialing_basic");
    expect(computeCommercialState({ plan: "pro", status: "trial" })).toBe("trialing_pro");
    expect(computeCommercialState({ plan: "premium", status: "trial" })).toBe("trialing_premium");
  });

  it("maps active to paying_<plan>", () => {
    expect(computeCommercialState({ plan: "basic", status: "active" })).toBe("paying_basic");
    expect(computeCommercialState({ plan: "pro", status: "active" })).toBe("paying_pro");
    expect(computeCommercialState({ plan: "premium", status: "active" })).toBe("paying_premium");
  });

  it("maps expired to expired regardless of plan", () => {
    for (const plan of PLANS) {
      expect(computeCommercialState({ plan, status: "expired" })).toBe("expired");
    }
  });

  it("maps cancelled to cancelled regardless of plan", () => {
    for (const plan of PLANS) {
      expect(computeCommercialState({ plan, status: "cancelled" })).toBe("cancelled");
    }
  });
});
