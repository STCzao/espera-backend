// Lo carga app.ts, no los scripts sueltos: sin esto DATABASE_URL no existe.
import "dotenv/config";

import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import { prisma } from "../src/shared/infrastructure/prisma";
import { todayUTC } from "../src/shared/utils/date";

/**
 * Datos de desarrollo reproducibles.
 *
 * El problema que resuelve: una base recién migrada sólo trae las categorías
 * de rubro (las inserta la migración 20260703100000), así que para poder
 * clickear cualquier cosa había que registrarse, verificar el mail a mano,
 * crear el negocio, aprobarlo desde el backoffice y armar la cola. En otra PC,
 * todo de nuevo. Esto deja ese escenario armado en segundos.
 *
 * Es idempotente: borra lo que haya creado antes (por los emails de abajo) y
 * lo vuelve a crear, así que correrlo dos veces no duplica nada y sirve para
 * volver a cero. No toca las categorías, que son de las migraciones.
 *
 * Nunca corre contra una base que no sea de desarrollo — ver assertDevDatabase.
 */

// Todas las cuentas comparten esta clave. Es data de desarrollo; el hash se
// calcula igual con el mismo coste que en producción para que el login tarde
// lo que tarda de verdad.
const DEV_PASSWORD = "Password1";

const EMAILS = {
  superAdmin: "admin@espera.dev",
  owner: "owner@espera.dev",
  employee: "employee@espera.dev",
  customer: "customer@espera.dev",
  // Va aca y no suelto abajo: si no, la limpieza no lo borra y la segunda
  // corrida del seed muere por el unique de email.
  pendingOwner: "pendiente@espera.dev",
} as const;

/**
 * El seed borra filas. Una DATABASE_URL apuntada por error a Render (o a
 * cualquier base real) tiene que fallar acá y no a mitad del borrado.
 */
const assertDevDatabase = (): void => {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("Falta DATABASE_URL.");

  const isLocal = /@(localhost|127\.0\.0\.1|postgres)[:/]/.test(url);
  if (!isLocal) {
    throw new Error(
      `El seed borra datos y solo corre contra una base local. DATABASE_URL apunta a otro host.\n` +
      `Si de verdad querés hacerlo, copiá los datos y corré las sentencias a mano.`,
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NODE_ENV=production: el seed no corre.");
  }
};

const main = async (): Promise<void> => {
  assertDevDatabase();

  const emails = Object.values(EMAILS);

  // Borrado en orden de dependencia. Turn primero porque referencia a todo lo
  // demás; Business tiene onDelete: Cascade hacia Queue y ServiceWindow, pero
  // no hacia Turn, así que esos van explícitos.
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: [...emails] } },
    select: { id: true },
  });
  const userIds = existingUsers.map((u) => u.id);

  if (userIds.length > 0) {
    const businesses = await prisma.business.findMany({
      where: { ownerUserId: { in: userIds } },
      select: { id: true, organizationId: true },
    });
    const businessIds = businesses.map((b) => b.id);
    const organizationIds = businesses.map((b) => b.organizationId);

    await prisma.turn.deleteMany({ where: { OR: [{ businessId: { in: businessIds } }, { customerId: { in: userIds } }] } });
    await prisma.businessEmployee.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.businessEmployeeInvitation.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.businessQrCode.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.businessOpeningHour.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.businessNonWorkingDay.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscription.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.refreshSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.report.deleteMany({ where: { reportedByUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  // --- cuentas ---------------------------------------------------------------
  const [superAdmin, owner, employee, customer] = await Promise.all([
    prisma.user.create({
      data: {
        email: EMAILS.superAdmin, firstName: "Ada", lastName: "Backoffice",
        passwordHash, role: "SUPER_ADMIN", approvalStatus: "APPROVED", isEmailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: EMAILS.owner, firstName: "Bruno", lastName: "Dueño",
        // approvalStatus APPROVED: el gate de cuenta en authorize() bloquea a
        // un business_admin pendiente en toda accion que no sea auth:read_self.
        passwordHash, role: "BUSINESS_ADMIN", approvalStatus: "APPROVED", isEmailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: EMAILS.employee, firstName: "Carla", lastName: "Empleada",
        passwordHash, role: "EMPLOYEE", approvalStatus: "APPROVED", isEmailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: EMAILS.customer, firstName: "Diego", lastName: "Cliente",
        passwordHash, role: "USER", approvalStatus: "APPROVED", isEmailVerified: true,
      },
    }),
  ]);

  // --- organizacion aprobada con suscripcion viva -----------------------------
  const organization = await prisma.organization.create({
    data: { name: "Organización Demo", legalId: "30-71234567-0", status: "APPROVED" },
  });

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);
  await prisma.subscription.create({
    data: { organizationId: organization.id, plan: "PRO", status: "TRIAL", trialEndsAt },
  });

  await prisma.membership.create({
    data: { userId: owner.id, organizationId: organization.id, role: "ADMIN" },
  });

  // --- negocio aprobado y operativo -------------------------------------------
  const category = await prisma.businessCategory.findFirstOrThrow({
    where: { slug: "gastronomia" },
  });

  const business = await prisma.business.create({
    data: {
      name: "Café Demo", slug: "cafe-demo", categoryId: category.id,
      ownerUserId: owner.id, organizationId: organization.id,
      status: "APPROVED", listingStatus: "PUBLISHED", operationalStatus: "NORMAL",
      approvedByUserId: superAdmin.id, approvedAt: new Date(),
      phone: "+54 9 341 555-0100", address: "San Martín 1234, Rosario",
    },
  });

  await prisma.businessEmployee.create({
    // invitedByUserId es obligatorio: todo empleado entro por una invitacion.
    data: { businessId: business.id, userId: employee.id, status: "ACTIVE", invitedByUserId: owner.id },
  });

  await prisma.businessQrCode.create({
    data: { businessId: business.id, token: randomUUID().replace(/-/g, ""), status: "ACTIVE" },
  });

  const queue = await prisma.queue.create({
    data: { businessId: business.id, name: "Caja principal", prefix: "A", isActive: true },
  });

  const [ventanilla1, ventanilla2] = await Promise.all([
    prisma.serviceWindow.create({ data: { queueId: queue.id, name: "Ventanilla 1", type: "CASHIER" } }),
    prisma.serviceWindow.create({ data: { queueId: queue.id, name: "Ventanilla 2", type: "CUSTOMER_SERVICE" } }),
  ]);

  // --- turnos en varios estados ------------------------------------------------
  // turnDate usa todayUTC() (medianoche del dia calendario argentino), que es
  // contra lo que filtran las metricas y el historial: con otra fecha, los
  // turnos existen pero no aparecen en ninguna pantalla.
  const turnDate = todayUTC();
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

  const base = { queueId: queue.id, businessId: business.id, turnDate, source: "APP" as const };

  await prisma.turn.create({
    data: {
      ...base, number: 1, displayNumber: "A-001", status: "COMPLETED", priority: "ARRIVED",
      guestName: "Elena Completada", queueJoinedAt: minutesAgo(75),
      calledAt: minutesAgo(70), startedAttentionAt: minutesAgo(68), attendedAt: minutesAgo(55),
      serviceWindowId: ventanilla1.id,
    },
  });
  await prisma.turn.create({
    data: {
      ...base, number: 2, displayNumber: "A-002", status: "NO_SHOW", priority: "REGISTERED",
      guestName: "Fabián Ausente", queueJoinedAt: minutesAgo(60),
      calledAt: minutesAgo(50), noShowAt: minutesAgo(45),
    },
  });
  await prisma.turn.create({
    data: {
      ...base, number: 3, displayNumber: "A-003", status: "ATTENDING", priority: "PHYSICAL",
      guestName: "Gloria EnCurso", queueJoinedAt: minutesAgo(30),
      calledAt: minutesAgo(12), startedAttentionAt: minutesAgo(10),
      serviceWindowId: ventanilla2.id,
    },
  });
  await prisma.turn.create({
    data: {
      ...base, number: 4, displayNumber: "A-004", status: "CALLED", priority: "ARRIVED",
      guestName: "Hugo Llamado", queueJoinedAt: minutesAgo(20), calledAt: minutesAgo(2),
      serviceWindowId: ventanilla1.id,
    },
  });
  // El turno del cliente con cuenta: es el que ve GET /queue/:id/turns/my-turn.
  await prisma.turn.create({
    data: {
      ...base, number: 5, displayNumber: "A-005", status: "WAITING", priority: "REGISTERED",
      customerId: customer.id, queueJoinedAt: minutesAgo(10),
    },
  });
  // Invitado de la web ligera (sin cuenta): su turnId es la clave de acceso.
  const guestTurn = await prisma.turn.create({
    data: {
      ...base, number: 6, displayNumber: "A-006", status: "WAITING", priority: "REGISTERED",
      guestName: "Invitada Web", source: "WEB", queueJoinedAt: minutesAgo(4),
    },
  });

  // --- negocio pendiente, para probar el backoffice ----------------------------
  const pendingOwner = await prisma.user.create({
    data: {
      email: EMAILS.pendingOwner, firstName: "Iván", lastName: "Pendiente",
      passwordHash, role: "BUSINESS_ADMIN", approvalStatus: "PENDING", isEmailVerified: true,
    },
  });
  const pendingOrg = await prisma.organization.create({
    data: { name: "Organización Pendiente", status: "PENDING" },
  });
  await prisma.subscription.create({
    data: { organizationId: pendingOrg.id, plan: "BASIC", status: "PENDING" },
  });
  await prisma.membership.create({
    data: { userId: pendingOwner.id, organizationId: pendingOrg.id, role: "ADMIN" },
  });
  await prisma.business.create({
    data: {
      name: "Peluquería Pendiente", slug: "peluqueria-pendiente",
      categoryId: (await prisma.businessCategory.findFirstOrThrow({ where: { slug: "peluqueria-y-estetica" } })).id,
      ownerUserId: pendingOwner.id, organizationId: pendingOrg.id, status: "PENDING",
    },
  });

  console.log(`
Seed listo. Clave para todas las cuentas: ${DEV_PASSWORD}

  super admin   ${EMAILS.superAdmin}
  dueño         ${EMAILS.owner}        (Café Demo, aprobado, plan PRO en trial)
  empleada      ${EMAILS.employee}
  cliente       ${EMAILS.customer}     (tiene el turno A-005 esperando)
  pendiente     ${EMAILS.pendingOwner}   (negocio sin aprobar, para el backoffice)

  queueId       ${queue.id}
  turnId guest  ${guestTurn.id}   (para GET /api/queue/guest-turns/:turnId)

  6 turnos del día: completado, no-show, en atención, llamado y 2 esperando.
`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
