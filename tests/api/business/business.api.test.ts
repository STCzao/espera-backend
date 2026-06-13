import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app";

const businessMocks = vi.hoisted(() => ({
  configureBusinessHoursExecute: vi.fn(),
  getBusinessHoursExecute: vi.fn(),
}));

vi.mock("../../../src/modules/business/application/ConfigureBusinessHoursUseCase", () => ({
  ConfigureBusinessHoursUseCase: class {
    public execute = businessMocks.configureBusinessHoursExecute;
  },
}));

vi.mock("../../../src/modules/business/application/GetBusinessHoursUseCase", () => ({
  GetBusinessHoursUseCase: class {
    public execute = businessMocks.getBusinessHoursExecute;
  },
}));

const accessToken = jwt.sign(
  {
    email: "owner@example.com",
    role: "business_admin",
    approvalStatus: "approved",
  },
  process.env.JWT_ACCESS_SECRET ?? "test-access-secret",
  { subject: "22222222-2222-4222-8222-222222222222", expiresIn: "15m" },
);

const businessId = "11111111-1111-4111-8111-111111111111";
const hoursPayload = {
  weeklyHours: [
    {
      dayOfWeek: 1,
      opensAt: "09:00",
      closesAt: "18:00",
    },
  ],
  nonWorkingDays: [
    {
      date: "2026-12-25",
      reason: "Feriado",
    },
  ],
};

describe("business API", () => {
  beforeEach(() => {
    businessMocks.configureBusinessHoursExecute.mockReset();
    businessMocks.getBusinessHoursExecute.mockReset();
  });

  it("returns configured business hours for the owner panel", async () => {
    businessMocks.getBusinessHoursExecute.mockResolvedValue({
      businessId,
      ...hoursPayload,
    });

    const response = await request(createApp())
      .get(`/api/business/${businessId}/hours`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      businessId,
      ...hoursPayload,
    });
    expect(businessMocks.getBusinessHoursExecute).toHaveBeenCalledWith({
      businessId,
      ownerUserId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("configures business hours for the owner panel", async () => {
    businessMocks.configureBusinessHoursExecute.mockResolvedValue({
      businessId,
      ...hoursPayload,
    });

    const response = await request(createApp())
      .put(`/api/business/${businessId}/hours`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(hoursPayload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      businessId,
      ...hoursPayload,
    });
    expect(businessMocks.configureBusinessHoursExecute).toHaveBeenCalledWith({
      ...hoursPayload,
      businessId,
      ownerUserId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
