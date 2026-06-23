const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const getEmailFrom = () => {
  return process.env.EMAIL_FROM || "FloFlo <onboarding@resend.dev>";
};

const sendPasswordResetEmail = async ({ to, firstName, resetUrl }) => {
  console.log("[emailService] Intentando enviar correo de recuperación a:", to);
  console.log("[emailService] EMAIL_FROM:", getEmailFrom());
  console.log(
    "[emailService] RESEND_API_KEY configurada:",
    Boolean(process.env.RESEND_API_KEY),
  );

  if (!process.env.RESEND_API_KEY) {
    console.log("[emailService] RESEND_API_KEY no configurada. Link:", resetUrl);

    return {
      skipped: true,
      reason: "RESEND_API_KEY no configurada",
    };
  }

  const displayName = firstName || "familia FloFlo";

  const { data, error } = await resend.emails.send({
    from: getEmailFrom(),
    to,
    subject: "Recupera tu contraseña de FloFlo",
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #F3ECFF; padding: 32px;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 32px;">
          <h1 style="color: #4B367C; margin-bottom: 12px;">Recuperar contraseña</h1>

          <p style="color: #4B5563; font-size: 16px;">
            Hola ${displayName},
          </p>

          <p style="color: #4B5563; font-size: 16px; line-height: 1.5;">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta en FloFlo.
          </p>

          <p style="color: #4B5563; font-size: 16px; line-height: 1.5;">
            Haz clic en el siguiente botón para crear una nueva contraseña:
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a
              href="${resetUrl}"
              style="background-color: #9B7BE8; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 16px; font-weight: bold; display: inline-block;"
            >
              Crear nueva contraseña
            </a>
          </div>

          <p style="color: #6B7280; font-size: 14px; line-height: 1.5;">
            Este enlace estará disponible por 30 minutos.
          </p>

          <p style="color: #6B7280; font-size: 14px; line-height: 1.5;">
            Si no solicitaste este cambio, puedes ignorar este correo.
          </p>

          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />

          <p style="color: #9CA3AF; font-size: 12px;">
            FloFlo · Acompañando el aprendizaje paso a paso.
          </p>
        </div>
      </div>
    `,
    text: `Hola ${displayName}. Para recuperar tu contraseña de FloFlo, abre este enlace: ${resetUrl}. El enlace estará disponible por 30 minutos.`,
  });

  if (error) {
    console.error("[emailService] Error enviando correo Resend:", error);
    throw new Error("No fue posible enviar el correo de recuperación");
  }

  console.log("[emailService] Correo de recuperación enviado:", {
    to,
    id: data?.id,
  });

  return data;
};

module.exports = {
  sendPasswordResetEmail,
};