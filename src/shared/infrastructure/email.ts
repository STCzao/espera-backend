import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

export const sendVerificationEmail = async (
  to: string,
  token: string,
): Promise<void> => {
  const url = `${process.env.APP_URL}/auth/verify-email?token=${token}`;

  await resend.emails.send({
    from: FROM,
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
  const url = `${process.env.APP_URL}/auth/reset-password?token=${token}`;

  await resend.emails.send({
    from: FROM,
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
  const dashboardUrl = `${process.env.APP_URL}/login`;

  await resend.emails.send({
    from: FROM,
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
