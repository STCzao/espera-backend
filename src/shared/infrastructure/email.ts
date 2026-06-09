import { Resend } from "resend";

import { getEmailConfig } from "./env";

export const sendVerificationEmail = async (
  to: string,
  token: string,
): Promise<void> => {
  const emailConfig = getEmailConfig();
  const resend = new Resend(emailConfig.resendApiKey);
  const url = `${emailConfig.appUrl}/auth/verify-email?token=${token}`;

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
  const emailConfig = getEmailConfig();
  const resend = new Resend(emailConfig.resendApiKey);
  const url = `${emailConfig.appUrl}/auth/reset-password?token=${token}`;

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
  const emailConfig = getEmailConfig();
  const resend = new Resend(emailConfig.resendApiKey);
  const dashboardUrl = `${emailConfig.appUrl}/login`;

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
