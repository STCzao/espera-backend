import { describe, expect, it } from "vitest";

import { CreateReportUseCase } from "../../../src/modules/report/application/CreateReportUseCase";
import { InMemoryBusinessRepo, InMemoryUserRepo, buildBusiness, buildUser } from "../../helpers/authFakes";
import { InMemoryReportRepo } from "../../helpers/reportFakes";

const REPORTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORTED_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUSINESS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const buildUseCase = (options: {
  reportRepo?: InMemoryReportRepo;
  userRepo?: InMemoryUserRepo;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const reportRepo = options.reportRepo ?? new InMemoryReportRepo();
  const userRepo = options.userRepo ?? new InMemoryUserRepo([
    buildUser({ id: REPORTER_ID }),
    buildUser({ id: REPORTED_USER_ID }),
  ]);
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID }),
  ]);
  return { reportRepo, useCase: new CreateReportUseCase(reportRepo, userRepo, businessRepo) };
};

describe("CreateReportUseCase", () => {
  it("files a report against a business", async () => {
    const { useCase, reportRepo } = buildUseCase();

    const result = await useCase.execute({
      reportedType: "business",
      reportedId: BUSINESS_ID,
      reason: "Cobra por turnos que no llega a atender",
      reportedByUserId: REPORTER_ID,
    });

    expect(result.status).toBe("pending");
    expect(result.reportedType).toBe("business");
    expect((await reportRepo.findAll())).toHaveLength(1);
  });

  it("files a report against a user", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({
      reportedType: "user",
      reportedId: REPORTED_USER_ID,
      reason: "Comportamiento agresivo en el local",
      reportedByUserId: REPORTER_ID,
    });

    expect(result.reportedType).toBe("user");
    expect(result.reportedId).toBe(REPORTED_USER_ID);
  });

  describe("errores", () => {
    it("throws 400 when reporting yourself", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({
          reportedType: "user",
          reportedId: REPORTER_ID,
          reason: "x",
          reportedByUserId: REPORTER_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "CANNOT_REPORT_SELF" });
    });

    it("throws 404 when the reported user does not exist", async () => {
      const { useCase } = buildUseCase({ userRepo: new InMemoryUserRepo([buildUser({ id: REPORTER_ID })]) });

      await expect(
        useCase.execute({
          reportedType: "user",
          reportedId: REPORTED_USER_ID,
          reason: "x",
          reportedByUserId: REPORTER_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: "REPORTED_USER_NOT_FOUND" });
    });

    it("throws 404 when the reported business does not exist", async () => {
      const { useCase } = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

      await expect(
        useCase.execute({
          reportedType: "business",
          reportedId: BUSINESS_ID,
          reason: "x",
          reportedByUserId: REPORTER_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: "REPORTED_BUSINESS_NOT_FOUND" });
    });

    it("throws 400 for an empty reason", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({
          reportedType: "business",
          reportedId: BUSINESS_ID,
          reason: "",
          reportedByUserId: REPORTER_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
