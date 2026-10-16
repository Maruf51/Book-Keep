import { Resend } from "resend";
import { render } from "@react-email/render";
import StaffInviteEmail from "@/emails/staff-invite";

const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "BookKeep <onboarding@resend.dev>";

export type SendEmailResult = { ok: boolean; stub: boolean; error?: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Graceful degradation: console transport when no key is configured.
    console.info(`[email:stub] to=${input.to} subject=${input.subject}`);
    console.info(`[email:stub] body=${stripHtml(input.html).slice(0, 400)}`);
    return { ok: true, stub: true };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    if (result.error) {
      console.error(`[email:error] ${result.error.message}`);
      return { ok: false, stub: false, error: result.error.message };
    }

    return { ok: true, stub: false };
  } catch (error) {
    console.error("[email:error]", error);
    return { ok: false, stub: false, error: "Failed to send email." };
  }
}

/**
 * Send the staff-invitation email using the React Email template in
 * `src/emails/staff-invite.tsx`.
 */
export async function sendStaffInviteEmail(input: {
  to: string;
  businessName: string;
  staffName: string;
  tempPassword: string;
  loginUrl: string;
}): Promise<SendEmailResult> {
  const html = await render(
    StaffInviteEmail({
      businessName: input.businessName,
      staffName: input.staffName,
      email: input.to,
      tempPassword: input.tempPassword,
      loginUrl: input.loginUrl,
    })
  );

  return sendEmail({
    to: input.to,
    subject: `You've been invited to join ${input.businessName}`,
    html,
  });
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
