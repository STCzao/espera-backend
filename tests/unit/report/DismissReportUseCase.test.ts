import { describe, expect, it } from "vitest";

import { DismissReportUseCase } from "../../../src/modules/report/application/DismissReportUseCase";
import { InMemoryReportRepo, buildReport } from "../../helpers/reportFakes";

const REPORT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("DismissReportUseCase", () => {
  it("marks a pending report as dismissed, keeping it in history", async () => {
    const reportRepo = new InMemoryReportRepo([buildReport({ id: REPORT_ID, status: "pending" })]);

    const result = await new DismissReportUseCase(reportRepo).execute({
      reportId: REPORT_ID,
      reviewedByUserId: ADMIN_ID,
      note: "Reporte infundado, sin evidencia",
    });

    expect(result.status).toBe("dismissed");
    expect(result.internalNote).toBe("Reporte infundado, sin evidencia");
    expect(await reportRepo.findById(REPORT_ID)).not.toBeNull();
  });

  describe("errores", () => {
    it("throws 400 when no note is given", async () => {
      const reportRepo = new InMemoryReportRepo([buildReport({ id: REPORT_ID, status: "pending" })]);

      await expect(
        new DismissReportUseCase(reportRepo).execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID } as never),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 404 when the report does not exist", async () => {
      const useCase = new DismissReportUseCase(new InMemoryReportRepo());

      await expect(
        useCase.execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID, note: "x" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "REPORT_NOT_FOUND" });
    });

    it("throws 409 when the report is not pending", async () => {
      const reportRepo = new InMemoryReportRepo([buildReport({ id: REPORT_ID, status: "resolved" })]);
      const useCase = new DismissReportUseCase(reportRepo);

      await expect(
        useCase.execute({ reportId: REPORT_ID, reviewedByUserId: ADMIN_ID, note: "x" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "REPORT_NOT_PENDING" });
    });
  });
});
