import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { AcceptBusinessEmployeeInvitationUseCase } from "../application/AcceptBusinessEmployeeInvitationUseCase";
import { CancelBusinessEmployeeInvitationUseCase } from "../application/CancelBusinessEmployeeInvitationUseCase";
import { InviteBusinessEmployeeUseCase } from "../application/InviteBusinessEmployeeUseCase";
import { ListBusinessEmployeesUseCase } from "../application/ListBusinessEmployeesUseCase";
import { ListPendingBusinessEmployeeInvitationsUseCase } from "../application/ListPendingBusinessEmployeeInvitationsUseCase";
import { RevokeBusinessEmployeeUseCase } from "../application/RevokeBusinessEmployeeUseCase";

/**
 * Employee and employee-invitation management for a Business — split out
 * of BusinessController, which had grown to cover profile, employees, and
 * admin concerns in one 397-line/28-method file.
 */
export class BusinessEmployeeController {
  public constructor(
    private readonly inviteBusinessEmployeeUseCase = new InviteBusinessEmployeeUseCase(),
    private readonly listBusinessEmployeesUseCase = new ListBusinessEmployeesUseCase(),
    private readonly listPendingBusinessEmployeeInvitationsUseCase = new ListPendingBusinessEmployeeInvitationsUseCase(),
    private readonly cancelBusinessEmployeeInvitationUseCase = new CancelBusinessEmployeeInvitationUseCase(),
    private readonly acceptBusinessEmployeeInvitationUseCase = new AcceptBusinessEmployeeInvitationUseCase(),
    private readonly revokeBusinessEmployeeUseCase = new RevokeBusinessEmployeeUseCase(),
  ) {}

  public inviteEmployee = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.inviteBusinessEmployeeUseCase.execute({
      ...request.body,
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info(
      { businessId: result.businessId, email: result.email },
      "Business employee invited"
    );
    response.status(201).json(result);
  };

  public listEmployees = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.listBusinessEmployeesUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    response.status(200).json(result);
  };

  public listPendingEmployeeInvitations = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.listPendingBusinessEmployeeInvitationsUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    response.status(200).json(result);
  };

  public cancelEmployeeInvitation = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.cancelBusinessEmployeeInvitationUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
      invitationId: String(request.params.invitationId),
    });
    logger.info(
      { businessId: result.businessId, invitationId: result.invitationId },
      "Business employee invitation cancelled"
    );
    response.status(200).json(result);
  };

  public acceptEmployeeInvitation = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.acceptBusinessEmployeeInvitationUseCase.execute({
      ...request.body,
      token: String(request.params.token),
    });
    response.status(200).json(result);
  };

  public revokeEmployee = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.revokeBusinessEmployeeUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
      userId: String(request.params.userId),
    });
    logger.info(
      { businessId: result.businessId, userId: result.userId },
      "Business employee revoked"
    );
    response.status(200).json(result);
  };
}
