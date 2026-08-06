import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { AttendTurnUseCase } from "../application/AttendTurnUseCase";
import { CallNextUseCase } from "../application/CallNextUseCase";
import { CancelTurnByEmployeeUseCase } from "../application/CancelTurnByEmployeeUseCase";
import { CancelTurnUseCase } from "../application/CancelTurnUseCase";
import { ConfirmTurnStatusUseCase } from "../application/ConfirmTurnStatusUseCase";
import { CreateManualTurnUseCase } from "../application/CreateManualTurnUseCase";
import { CreateServiceWindowUseCase } from "../application/CreateServiceWindowUseCase";
import { CreateTurnUseCase } from "../application/CreateTurnUseCase";
import { DeleteServiceWindowUseCase } from "../application/DeleteServiceWindowUseCase";
import { GetMyTurnUseCase } from "../application/GetMyTurnUseCase";
import { GetQueueListUseCase } from "../application/GetQueueListUseCase";
import { GetQueueMetricsUseCase } from "../application/GetQueueMetricsUseCase";
import { GetQueueStatusUseCase } from "../application/GetQueueStatusUseCase";
import { GetTurnHistoryUseCase } from "../application/GetTurnHistoryUseCase";
import { ListServiceWindowsUseCase } from "../application/ListServiceWindowsUseCase";
import { RedirectTurnUseCase } from "../application/RedirectTurnUseCase";
import { ToggleServiceWindowUseCase } from "../application/ToggleServiceWindowUseCase";
import { UpdateServiceWindowUseCase } from "../application/UpdateServiceWindowUseCase";

export class QueueController {
  public constructor(
    private readonly createTurnUseCase = new CreateTurnUseCase(),
    private readonly getMyTurnUseCase = new GetMyTurnUseCase(),
    private readonly callNextUseCase = new CallNextUseCase(),
    private readonly cancelTurnUseCase = new CancelTurnUseCase(),
    private readonly confirmTurnStatusUseCase = new ConfirmTurnStatusUseCase(),
    private readonly getQueueListUseCase = new GetQueueListUseCase(),
    private readonly createManualTurnUseCase = new CreateManualTurnUseCase(),
    private readonly cancelTurnByEmployeeUseCase = new CancelTurnByEmployeeUseCase(),
    private readonly attendTurnUseCase = new AttendTurnUseCase(),
    private readonly getQueueStatusUseCase = new GetQueueStatusUseCase(),
    private readonly getTurnHistoryUseCase = new GetTurnHistoryUseCase(),
    private readonly getQueueMetricsUseCase = new GetQueueMetricsUseCase(),
    private readonly listServiceWindowsUseCase = new ListServiceWindowsUseCase(),
    private readonly createServiceWindowUseCase = new CreateServiceWindowUseCase(),
    private readonly toggleServiceWindowUseCase = new ToggleServiceWindowUseCase(),
    private readonly updateServiceWindowUseCase = new UpdateServiceWindowUseCase(),
    private readonly deleteServiceWindowUseCase = new DeleteServiceWindowUseCase(),
    private readonly redirectTurnUseCase = new RedirectTurnUseCase(),
  ) {}

  public createTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.createTurnUseCase.execute({
      queueId: String(request.params.queueId),
      customerId: request.user?.id,
    });
    logger.info({ turnId: result.turnId, queueId: result.queueId }, "Turn created");
    response.status(201).json(result);
  };

  public getMyTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getMyTurnUseCase.execute({
      queueId: String(request.params.queueId),
      customerId: String(request.user?.id),
    });
    response.status(200).json(result);
  };

  public getQueueList = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getQueueListUseCase.execute({
      queueId: String(request.params.queueId),
    });
    response.status(200).json(result);
  };

  public createManualTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.createManualTurnUseCase.execute({
      queueId:   String(request.params.queueId),
      guestName: String(request.body.guestName),
    });
    logger.info({ turnId: result.turnId, queueId: result.queueId }, "Manual turn created");
    response.status(201).json(result);
  };

  public confirmTransit = async (request: Request, response: Response): Promise<void> => {
    const result = await this.confirmTurnStatusUseCase.execute({
      queueId:    String(request.params.queueId),
      customerId: String(request.user?.id),
      action:     "in_transit",
    });
    response.status(200).json(result);
  };

  public confirmArrival = async (request: Request, response: Response): Promise<void> => {
    const result = await this.confirmTurnStatusUseCase.execute({
      queueId:    String(request.params.queueId),
      customerId: String(request.user?.id),
      action:     "arrived",
    });
    response.status(200).json(result);
  };

  public callNext = async (request: Request, response: Response): Promise<void> => {
    const result = await this.callNextUseCase.execute({
      queueId: String(request.body.queueId),
    });
    logger.info({ turnId: result.turnId, queueId: result.queueId }, "Next turn called");
    response.status(200).json(result);
  };

  public attendTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.attendTurnUseCase.execute({
      turnId:          String(request.params.turnId),
      serviceWindowId: request.body.serviceWindowId ? String(request.body.serviceWindowId) : undefined,
    });
    logger.info({ turnId: result.turnId }, "Turn marked as attended");
    response.status(200).json(result);
  };

  public listServiceWindows = async (request: Request, response: Response): Promise<void> => {
    const result = await this.listServiceWindowsUseCase.execute({
      queueId: String(request.params.queueId),
    });
    response.status(200).json(result);
  };

  public createServiceWindow = async (request: Request, response: Response): Promise<void> => {
    const result = await this.createServiceWindowUseCase.execute({
      queueId:     String(request.params.queueId),
      ownerUserId: request.user?.id ?? "",
      name:        String(request.body.name),
      type:        request.body.type,
    });
    logger.info({ windowId: result.id, queueId: result.queueId }, "Service window created");
    response.status(201).json(result);
  };

  public toggleServiceWindow = async (request: Request, response: Response): Promise<void> => {
    const result = await this.toggleServiceWindowUseCase.execute({
      windowId:    String(request.params.windowId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info({ windowId: result.id, isActive: result.isActive }, "Service window toggled");
    response.status(200).json(result);
  };

  public updateServiceWindow = async (request: Request, response: Response): Promise<void> => {
    const result = await this.updateServiceWindowUseCase.execute({
      windowId:    String(request.params.windowId),
      ownerUserId: request.user?.id ?? "",
      name:        request.body.name,
      type:        request.body.type,
    });
    logger.info({ windowId: result.id }, "Service window updated");
    response.status(200).json(result);
  };

  public deleteServiceWindow = async (request: Request, response: Response): Promise<void> => {
    const result = await this.deleteServiceWindowUseCase.execute({
      windowId:    String(request.params.windowId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info({ windowId: result.windowId }, "Service window deleted");
    response.status(200).json(result);
  };

  public redirectTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.redirectTurnUseCase.execute({
      turnId:                String(request.params.turnId),
      targetServiceWindowId: String(request.body.targetServiceWindowId),
    });
    logger.info({ turnId: result.turnId, serviceWindowId: result.serviceWindowId }, "Turn redirected to another service window");
    response.status(200).json(result);
  };

  public cancelTurnByEmployee = async (request: Request, response: Response): Promise<void> => {
    const result = await this.cancelTurnByEmployeeUseCase.execute({
      turnId: String(request.params.turnId),
    });
    logger.info({ turnId: result.turnId }, "Turn cancelled by employee");
    response.status(200).json(result);
  };

  public getQueueMetrics = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getQueueMetricsUseCase.execute({
      queueId: String(request.params.queueId),
      date:    request.query.date ? String(request.query.date) : undefined,
    });
    response.status(200).json(result);
  };

  public getTurnHistory = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getTurnHistoryUseCase.execute({
      queueId: String(request.params.queueId),
      date:    request.query.date ? String(request.query.date) : undefined,
    });
    response.status(200).json(result);
  };

  public getQueueStatus = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getQueueStatusUseCase.execute({
      queueId: String(request.params.queueId),
    });
    response.status(200).json(result);
  };

  public cancelTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.cancelTurnUseCase.execute({
      turnId: String(request.body.turnId),
      customerId: String(request.user?.id),
    });
    logger.info({ turnId: result.turnId }, "Turn cancelled");
    response.status(200).json(result);
  };
}
