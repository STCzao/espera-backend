import { describe, expect, it } from "vitest";

import { ListReportsUseCase } from "../../../src/modules/report/application/ListReportsUseCase";
import { InMemoryReportRepo, buildReport } from "../../helpers/reportFakes";

describe("ListReportsUseCase", () => {
  it("lists all reports when no filters are given", async () => {
    const reportRepo = new InMemoryReportRepo([
      buildReport({ id: "r-1", status: "pending" }),
      buildReport({ id: "r-2", status: "resolved" }),
    ]);

    const result = await new ListReportsUseCase(reportRepo).execute({});

    expect(result).toHaveLength(2);
  });

  it("filters by status", async () => {
    const reportRepo = new InMemoryReportRepo([
      buildReport({ id: "r-1", status: "pending" }),
      buildReport({ id: "r-2", status: "resolved" }),
    ]);

    const result = await new ListReportsUseCase(reportRepo).execute({ status: "pending" });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r-1");
  });

  it("filters by reportedType", async () => {
    const reportRepo = new InMemoryReportRepo([
      buildReport({ id: "r-1", reportedType: "business" }),
      buildReport({ id: "r-2", reportedType: "user" }),
    ]);

    const result = await new ListReportsUseCase(reportRepo).execute({ reportedType: "user" });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r-2");
  });

  it("throws 400 for an invalid status", async () => {
    const useCase = new ListReportsUseCase(new InMemoryReportRepo());

    await expect(
      useCase.execute({ status: "unknown" } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
