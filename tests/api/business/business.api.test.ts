import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app";

const businessMocks = vi.hoisted(() => ({
  configureBusinessHoursExecute: vi.fn(),
  configureBusinessServiceWindowsExecute: vi.fn(),
  generateBusinessQrPngExecute: vi.fn(),
  getBusinessQrCodeExecute: vi.fn(),
  getBusinessHoursExecute: vi.fn(),
  regenerateBusinessQrCodeExecute: vi.fn(),
  resolveBusinessQrCodeExecute: vi.fn(),
}));

vi.mock("../../../src/modules/business/application/ConfigureBusinessHoursUseCase", () => ({
  ConfigureBusinessHoursUseCase: class {
    public execute = businessMocks.configureBusinessHoursExecute;
  },
}));

vi.mock("../../../src/modules/business/application/ConfigureBusinessServiceWindowsUseCase", () => ({
  ConfigureBusinessServiceWindowsUseCase: class {
    public execute = businessMocks.configureBusinessServiceWindowsExecute;
  },
}));

vi.mock("../../../src/modules/business/application/GenerateBusinessQrPngUseCase", () => ({
  GenerateBusinessQrPngUseCase: class {
    public execute = businessMocks.generateBusinessQrPngExecute;
  },
}));

vi.mock("../../../src/modules/business/application/GetBusinessQrCodeUseCase", () => ({
  GetBusinessQrCodeUseCase: class {
    public execute = businessMocks.getBusinessQrCodeExecute;
  },
}));

vi.mock("../../../src/modules/business/application/GetBusinessHoursUseCase", () => ({
  GetBusinessHoursUseCase: class {
    public execute = businessMocks.getBusinessHoursExecute;
  },
}));

vi.mock("../../../src/modules/business/application/RegenerateBusinessQrCodeUseCase", () => ({
  RegenerateBusinessQrCodeUseCase: class {
    public execute = businessMocks.regenerateBusinessQrCodeExecute;
  },
}));

vi.mock("../../../src/modules/business/application/ResolveBusinessQrCodeUseCase", () => ({
  ResolveBusinessQrCodeUseCase: class {
    public execute = businessMocks.resolveBusinessQrCodeExecute;
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
    businessMocks.configureBusinessServiceWindowsExecute.mockReset();
    businessMocks.generateBusinessQrPngExecute.mockReset();
    businessMocks.getBusinessQrCodeExecute.mockReset();
    businessMocks.getBusinessHoursExecute.mockReset();
    businessMocks.regenerateBusinessQrCodeExecute.mockReset();
    businessMocks.resolveBusinessQrCodeExecute.mockReset();
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

  it("configures active service windows for the owner panel", async () => {
    businessMocks.configureBusinessServiceWindowsExecute.mockResolvedValue({
      businessId,
      activeServiceWindows: 2,
      attentionAvailable: true,
    });

    const response = await request(createApp())
      .put(`/api/business/${businessId}/service-windows`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ activeServiceWindows: 2 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      businessId,
      activeServiceWindows: 2,
      attentionAvailable: true,
    });
    expect(businessMocks.configureBusinessServiceWindowsExecute).toHaveBeenCalledWith({
      businessId,
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      activeServiceWindows: 2,
    });
  });

  it("returns the current business QR for the owner panel", async () => {
    businessMocks.getBusinessQrCodeExecute.mockResolvedValue({
      businessId,
      token: "qr-token-1234567890",
      qrUrl: "http://localhost:3000/q/qr-token-1234567890",
      downloadUrl: `/api/business/${businessId}/qr.png`,
      status: "active",
    });

    const response = await request(createApp())
      .get(`/api/business/${businessId}/qr`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      businessId,
      token: "qr-token-1234567890",
      qrUrl: "http://localhost:3000/q/qr-token-1234567890",
      downloadUrl: `/api/business/${businessId}/qr.png`,
      status: "active",
    });
    expect(businessMocks.getBusinessQrCodeExecute).toHaveBeenCalledWith({
      businessId,
      ownerUserId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("regenerates the business QR for the owner panel", async () => {
    businessMocks.regenerateBusinessQrCodeExecute.mockResolvedValue({
      businessId,
      token: "new-token-1234567890",
      qrUrl: "http://localhost:3000/q/new-token-1234567890",
      downloadUrl: `/api/business/${businessId}/qr.png`,
      status: "active",
      previousQrValidUntil: "2026-06-17T16:30:00.000Z",
    });

    const response = await request(createApp())
      .post(`/api/business/${businessId}/qr/regenerate`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      businessId,
      token: "new-token-1234567890",
      qrUrl: "http://localhost:3000/q/new-token-1234567890",
      downloadUrl: `/api/business/${businessId}/qr.png`,
      status: "active",
      previousQrValidUntil: "2026-06-17T16:30:00.000Z",
    });
    expect(businessMocks.regenerateBusinessQrCodeExecute).toHaveBeenCalledWith({
      businessId,
      ownerUserId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("downloads the printable business QR PNG for the owner panel", async () => {
    businessMocks.generateBusinessQrPngExecute.mockResolvedValue({
      fileName: `espera-business-${businessId}-qr.png`,
      contentType: "image/png",
      buffer: Buffer.from("png"),
    });

    const response = await request(createApp())
      .get(`/api/business/${businessId}/qr.png`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="espera-business-${businessId}-qr.png"`,
    );
    expect(response.body).toEqual(Buffer.from("png"));
    expect(businessMocks.generateBusinessQrPngExecute).toHaveBeenCalledWith({
      businessId,
      ownerUserId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("resolves public QR tokens to the business turn flow contract", async () => {
    businessMocks.resolveBusinessQrCodeExecute.mockResolvedValue({
      token: "qr-token-1234567890",
      qrUrl: "http://localhost:3000/q/qr-token-1234567890",
      qrStatus: "active",
      action: "OPEN_BUSINESS_TURN_FLOW",
      appPath: `/business/${businessId}/turns/new`,
      business: {
        id: businessId,
        name: "Cafe Espera",
        slug: "cafe-espera",
        categoryId: "33333333-3333-4333-8333-333333333333",
        address: "Av. Siempre Viva 123",
        listingStatus: "published",
        activeServiceWindows: 2,
      },
    });

    const response = await request(createApp()).get("/api/qr/qr-token-1234567890");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      token: "qr-token-1234567890",
      qrUrl: "http://localhost:3000/q/qr-token-1234567890",
      qrStatus: "active",
      action: "OPEN_BUSINESS_TURN_FLOW",
      appPath: `/business/${businessId}/turns/new`,
      business: {
        id: businessId,
        name: "Cafe Espera",
        slug: "cafe-espera",
        categoryId: "33333333-3333-4333-8333-333333333333",
        address: "Av. Siempre Viva 123",
        listingStatus: "published",
        activeServiceWindows: 2,
      },
    });
    expect(businessMocks.resolveBusinessQrCodeExecute).toHaveBeenCalledWith({
      token: "qr-token-1234567890",
    });
  });
});
