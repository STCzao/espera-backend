import { describe, expect, it } from "vitest";

import { BlockUserUseCase } from "../../../src/modules/auth/application/BlockUserUseCase";
import { SuspendBusinessUseCase } from "../../../src/modules/business/application/SuspendBusinessUseCase";
import { SuspendReportedUseCase } from "../../../src/modules/report/application/SuspendReportedUseCase";
import {
  InMemoryBusinessEmployeeRepo,
  InMemoryBusinessRepo,
  InMemoryRefreshSessionRepo,
  InMemoryUserRepo,
  buildBusiness,
  buildUser,
} from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryTurnRepo } from "../../helpers/queueFakes";
import { InMemoryReportRepo, buildReport } from "../../helpers/reportFakes";

const REPORT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUSINESS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REPORTED_USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("SuspendReportedUseCase — reporte sobre un negocio", () => {
  it("suspends the reported business and closes the report", async () => {
    const reportRepo = new InMemoryReportRepo([
      buildReport({ id: REPORT_ID, reportedType: "business", reportedId: BUSINESS_ID, status: "pending" }),
    ]);
    const businessRepo = new InMemoryBusinessRepo([buildBusiness({ id: BUSINESS_ID, status: "approved" })]);
    const suspendBusinessUseCase = new SuspendBusinessUseCase(
      businessRepo,
      new InMemoryBusinessEmployeeRepo(),
      new InMemoryRefreshSessionRepo(),
      new InMemoryQueueRepo(),
      new InMemoryTurnRepo(),
      null,
    );
    const useCase = new SuspendReportedUseCase(reportRepo, suspendBusinessUseCase, new BlockUserUseCase());

    const result = await useCase.execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID, note: "Reincidente" });

    expect(result.status).toBe("suspended");
    expect(businessRepo.all()[0].status).toBe("suspended");
  });

  it("propagates the error when the business cannot be suspended", async () => {
    const reportRepo = new InMemoryReportRepo([
      buildReport({ id: REPORT_ID, reportedType: "business", reportedId: BUSINESS_ID, status: "pending" }),
    ]);
    const businessRepo = new InMemoryBusinessRepo([buildBusiness({ id: BUSINESS_ID, status: "pending" })]);
    const suspendBusinessUseCase = new SuspendBusinessUseCase(
      businessRepo,
      new InMemoryBusinessEmployeeRepo(),
      new InMemoryRefreshSessionRepo(),
      new InMemoryQueueRepo(),
      new InMemoryTurnRepo(),
      null,
    );
    const useCase = new SuspendReportedUseCase(reportRepo, suspendBusinessUseCase, new BlockUserUseCase());

    await expect(
      useCase.execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_CANNOT_BE_SUSPENDED" });

    expect((await reportRepo.findById(REPORT_ID))?.status).toBe("pending");
  });
});

describe("SuspendReportedUseCase — reporte sobre un usuario", () => {
  it("blocks the reported user and closes the report", async () => {
    const reportRepo = new InMemoryReportRepo([
      buildReport({ id: REPORT_ID, reportedType: "user", reportedId: REPORTED_USER_ID, status: "pending" }),
    ]);
    const userRepo = new InMemoryUserRepo([buildUser({ id: REPORTED_USER_ID })]);
    const blockUserUseCase = new BlockUserUseCase(userRepo, new InMemoryRefreshSessionRepo());
    const useCase = new SuspendReportedUseCase(reportRepo, new SuspendBusinessUseCase(), blockUserUseCase);

    const result = await useCase.execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID });

    expect(result.status).toBe("suspended");
    expect(userRepo.all()[0].isBlocked).toBe(true);
  });
});

describe("SuspendReportedUseCase — errores", () => {
  it("throws 404 when the report does not exist", async () => {
    const useCase = new SuspendReportedUseCase(new InMemoryReportRepo(), new SuspendBusinessUseCase(), new BlockUserUseCase());

    await expect(
      useCase.execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "REPORT_NOT_FOUND" });
  });

  it("throws 409 when the report is not pending", async () => {
    const reportRepo = new InMemoryReportRepo([buildReport({ id: REPORT_ID, status: "resolved" })]);
    const useCase = new SuspendReportedUseCase(reportRepo, new SuspendBusinessUseCase(), new BlockUserUseCase());

    await expect(
      useCase.execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "REPORT_NOT_PENDING" });
  });
});
