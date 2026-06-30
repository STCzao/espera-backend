import { Resend } from "resend";

import { env, getEmailConfig } from "./env";
import { logger } from "./logger";

const isPlaceholderResendKey = (value: string | undefined): boolean =>
  !value || value === "re_your_api_key" || value === "replace-with-resend-api-key";

const shouldUseResend = (): boolean =>
  env.NODE_ENV === "production" || !isPlaceholderResendKey(env.RESEND_API_KEY);

const logLocalEmail = (
  kind: "verification" | "password-reset" | "business-welcome" | "employee-invitation",
  to: string,
  url: string,
): void => {
  logger.info(
    { kind, to, url },
    "Email delivery skipped because Resend is not configured; use logged URL for local testing",
  );
};

export const sendVerificationEmail = async (
  to: string,
  token: string,
): Promise<void> => {
  const appUrl = env.APP_URL ?? "http://localhost:3000";
  const url = `${appUrl}/verify-email?token=${token}`;

  if (!shouldUseResend()) {
    logLocalEmail("verification", to, url);
    return;
  }

  const emailConfig = getEmailConfig();
  const resend = new Resend(emailConfig.resendApiKey);

  await resend.emails.send({
    from: emailConfig.fromEmail,
    to,
    subject: "Verifica tu cuenta en Espera",
    html: `
      <p>Gracias por registrarte en Espera.</p>
      <p>Hace clic en el siguiente enlace para verificar tu cuenta:</p>
      <a href="${url}">${url}</a>
      <p>El enlace expira en 24 horas.</p>
    `,
  });
};

export const sendPasswordResetEmail = async (
  to: string,
  token: string,
): Promise<void> => {
  const appUrl = env.APP_URL ?? "http://localhost:3000";
  const url = `${appUrl}/reset-password?token=${token}`;

  if (!shouldUseResend()) {
    logLocalEmail("password-reset", to, url);
    return;
  }

  const emailConfig = getEmailConfig();
  const resend = new Resend(emailConfig.resendApiKey);

  await resend.emails.send({
    from: emailConfig.fromEmail,
    to,
    subject: "Recupera tu contrasena en Espera",
    html: `
      <p>Recibimos una solicitud para restablecer tu contrasena.</p>
      <p>Hace clic en el siguiente enlace para elegir una nueva contrasena:</p>
      <a href="${url}">${url}</a>
      <p>El enlace expira en 1 hora.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este email.</p>
    `,
  });
};

export const sendBusinessWelcomeEmail = async (
  to: string,
  firstName: string,
): Promise<void> => {
  const appUrl = env.APP_URL ?? "http://localhost:3000";
  const dashboardUrl = `${appUrl}/login`;

  if (!shouldUseResend()) {
    logLocalEmail("business-welcome", to, dashboardUrl);
    return;
  }

  const emailConfig = getEmailConfig();
  const resend = new Resend(emailConfig.resendApiKey);

  await resend.emails.send({
    from: emailConfig.fromEmail,
    to,
    subject: "Your Espera business account is now approved",
    html: `
      <p>Hello ${firstName},</p>
      <p>Your business account has been approved and you can now access the Espera panel.</p>
      <p>You can sign in here:</p>
      <a href="${dashboardUrl}">${dashboardUrl}</a>
    `,
  });
};

export const sendBusinessEmployeeInvitationEmail = async (
  to: string,
  token: string,
): Promise<void> => {
  const appUrl = env.APP_URL ?? "http://localhost:3000";
  const url = `${appUrl}/business/employee-invitations/${token}`;

  if (!shouldUseResend()) {
    logLocalEmail("employee-invitation", to, url);
    return;
  }

  const emailConfig = getEmailConfig();
  const resend = new Resend(emailConfig.resendApiKey);

  await resend.emails.send({
    from: emailConfig.fromEmail,
    to,
    subject: "Te invitaron a operar un negocio en Espera",
    html: `
      <p>Recibiste una invitación para operar un panel de negocio en Espera.</p>
      <p>Hacé clic en el siguiente enlace para aceptar la invitación:</p>
      <a href="${url}">${url}</a>
      <p>El enlace expira en 7 días.</p>
    `,
  });
};
