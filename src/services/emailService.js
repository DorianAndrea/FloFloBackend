const { Resend } = require("resend");

const getEmailFrom = () => {
  return process.env.EMAIL_FROM || "FloFlo <onboarding@resend.dev>";
};

const escapeHtml = (value) => {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

const getResendClient = () => {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY no está configurada");
    }

    return null;
  }

  return new Resend(resendApiKey);
};

const sendPasswordResetEmail = async ({ to, firstName, resetUrl }) => {
  const resend = getResendClient();

  if (!resend) {
    console.log("[emailService] RESEND_API_KEY no configurada.");
    console.log("[emailService] Link de recuperación local:", resetUrl);

    return {
      skipped: true,
      reason: "RESEND_API_KEY no configurada",
    };
  }

  const displayName = escapeHtml(firstName || "familia FloFlo");
  const safeResetUrl = escapeHtml(resetUrl);

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
              href="${safeResetUrl}"
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
    text: `Hola ${firstName || "familia FloFlo"}. Para recuperar tu contraseña de FloFlo, abre este enlace: ${resetUrl}. El enlace estará disponible por 30 minutos.`,
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

const getRelationshipLabel = (relationshipKey) => {
  const labels = {
    caregiver: "Cuidador/a",
    family: "Familiar",
    occupational_therapist: "Terapeuta ocupacional",
    psychologist: "Psicólogo/a",
    speech_therapist: "Fonoaudiólogo/a",
    teacher: "Profesor/a",
    other_professional: "Otro profesional",
  };

  return labels[relationshipKey] || "Integrante del equipo";
};

const sendSupportTeamInvitationEmail = async ({
  to,
  childFirstName,
  childLastName,
  inviterFirstName,
  inviterLastName,
  relationshipKey,
  message,
  invitationUrl,
  expiresInDays,
}) => {
  const resend = getResendClient();

  if (!resend) {
    console.log("[emailService] RESEND_API_KEY no configurada.");
    console.log(
      "[emailService] Link de invitación local:",
      invitationUrl,
    );

    return {
      skipped: true,
      reason: "RESEND_API_KEY no configurada",
    };
  }

  const safeChildName = escapeHtml(
    `${childFirstName || ""} ${childLastName || ""}`.trim() ||
      "un niño/a",
  );

  const safeInviterName = escapeHtml(
    `${inviterFirstName || ""} ${inviterLastName || ""}`.trim() ||
      "una persona cuidadora",
  );

  const safeRelationshipLabel = escapeHtml(
    getRelationshipLabel(relationshipKey),
  );

  const safeMessage = escapeHtml(message || "");
  const safeInvitationUrl = escapeHtml(invitationUrl);

  const optionalMessage = safeMessage
    ? `
      <div style="background-color: #F8F5FF; border-left: 4px solid #9B7BE8; border-radius: 12px; padding: 16px; margin: 24px 0;">
        <p style="color: #4B367C; font-size: 14px; font-weight: bold; margin: 0 0 8px;">
          Mensaje de ${safeInviterName}
        </p>

        <p style="color: #4B5563; font-size: 15px; line-height: 1.5; margin: 0;">
          ${safeMessage}
        </p>
      </div>
    `
    : "";

  const { data, error } = await resend.emails.send({
    from: getEmailFrom(),
    to,
    subject: `${safeInviterName} te invitó al Equipo FloFlo de ${safeChildName}`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #F3ECFF; padding: 32px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 32px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 54px;">🤝</div>

            <h1 style="color: #4B367C; margin: 12px 0 8px;">
              Te invitaron al Equipo FloFlo
            </h1>

            <p style="color: #6B5A95; font-size: 16px; margin: 0;">
              Acompañar también es estar presente.
            </p>
          </div>

          <p style="color: #4B5563; font-size: 16px; line-height: 1.5;">
            Hola,
          </p>

          <p style="color: #4B5563; font-size: 16px; line-height: 1.5;">
            <strong>${safeInviterName}</strong> quiere que formes parte del
            <strong>Equipo FloFlo de ${safeChildName}</strong>.
          </p>

          <p style="color: #4B5563; font-size: 16px; line-height: 1.5;">
            Tu rol dentro del equipo será:
          </p>

          <div style="background-color: #FFF3C4; border-radius: 16px; padding: 16px; text-align: center; margin: 20px 0;">
            <strong style="color: #5C4A00; font-size: 18px;">
              ${safeRelationshipLabel}
            </strong>
          </div>

          <p style="color: #4B5563; font-size: 16px; line-height: 1.5;">
            Al aceptar podrás acompañar sus avances desde FloFlo según los permisos de tu perfil.
          </p>

          ${optionalMessage}

          <div style="text-align: center; margin: 32px 0;">
            <a
              href="${safeInvitationUrl}"
              style="background-color: #9B7BE8; color: #ffffff; text-decoration: none; padding: 16px 26px; border-radius: 16px; font-weight: bold; display: inline-block;"
            >
              Quiero acompañar a ${safeChildName}
            </a>
          </div>

          <p style="color: #6B7280; font-size: 14px; line-height: 1.5;">
            Esta invitación estará disponible durante
            ${Number(expiresInDays) || 7} días.
          </p>

          <p style="color: #6B7280; font-size: 14px; line-height: 1.5;">
            Debes aceptar la invitación usando el mismo correo electrónico que la recibió.
          </p>

          <p style="color: #6B7280; font-size: 14px; line-height: 1.5;">
            Si no esperabas esta invitación, puedes ignorar este correo.
          </p>

          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />

          <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
            FloFlo · Acompañando el aprendizaje paso a paso.
          </p>
        </div>
      </div>
    `,
    text: `${inviterFirstName || "Una persona cuidadora"} te invitó a formar parte del Equipo FloFlo de ${childFirstName || "un niño/a"} como ${getRelationshipLabel(relationshipKey)}. Acepta la invitación aquí: ${invitationUrl}. La invitación estará disponible durante ${Number(expiresInDays) || 7} días.`,
  });

  if (error) {
    console.error(
      "[emailService] Error enviando invitación Equipo FloFlo:",
      error,
    );

    throw new Error(
      "No fue posible enviar la invitación al Equipo FloFlo",
    );
  }

  console.log("[emailService] Invitación Equipo FloFlo enviada:", {
    to,
    id: data?.id,
  });

  return data;
};

module.exports = {
  sendPasswordResetEmail,
  sendSupportTeamInvitationEmail,
};