import { describe, expect, it } from "vitest";

import { ResolveReportUseCase } from "../../../src/modules/report/application/ResolveReportUseCase";
import { InMemoryReportRepo, buildReport } from "../../helpers/reportFakes";

const REPORT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("ResolveReportUseCase", () => {
  it("marks a pending report as resolved with reviewer and note", async () => {
    const reportRepo = new InMemoryReportRepo([buildReport({ id: REPORT_ID, status: "pending" })]);

    const result = await new ResolveReportUseCase(reportRepo).execute({
      reportId: REPORT_ID,
      reviewedByUserId: ADMIN_ID,
      note: "Se conversó con el negocio, no amerita suspensión",
    });

    expect(result.status).toBe("resolved");
    expect(result.reviewedByUserId).toBe(ADMIN_ID);
    expect(result.reviewedAt).toBeInstanceOf(Date);
    expect(result.internalNote).toBe("Se conversó con el negocio, no amerita suspensión");
  });

  it("allows resolving without a note", async () => {
    const reportRepo = new InMemoryReportRepo([buildReport({ id: REPORT_ID, status: "pending" })]);

    const result = await new ResolveReportUseCase(reportRepo).execute({
      reportId: REPORT_ID,
      reviewedByUserId: ADMIN_ID,
    });

    expect(result.status).toBe("resolved");
  });

  describe("errores", () => {
    it("throws 404 when the report does not exist", async () => {
      const useCase = new ResolveReportUseCase(new InMemoryReportRepo());

      await expect(
        useCase.execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "REPORT_NOT_FOUND" });
    });

    it("throws 409 when the report is not pending", async () => {
      const reportRepo = new InMemoryReportRepo([buildReport({ id: REPORT_ID, status: "dismissed" })]);
      const useCase = new ResolveReportUseCase(reportRepo);

      await expect(
        useCase.execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "REPORT_NOT_PENDING" });
    });
  });
});
