import { Resend } from "resend";
import { render } from "@react-email/render";
import StaffInviteEmail from "@/emails/staff-invite";
import BookingConfirmationEmail from "@/emails/booking-confirmation";
import BookingReminderEmail from "@/emails/booking-reminder";
import BookingCancelledEmail from "@/emails/booking-cancelled";
import InvoiceEmail from "@/emails/invoice";
import { formatDateTimeInTz } from "@/lib/time";
import { formatMoney } from "@/lib/money";

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

/**
 * Customer booking confirmation email (PLAN P4-T2/T4).
 */
export async function sendBookingConfirmationEmail(input: {
  to: string;
  customerName: string;
  businessName: string;
  serviceName: string;
  staffName: string;
  startAt: Date | string;
  timezone: string;
  price: number;
  currency: string;
  status: "pending" | "confirmed";
  manageUrl: string;
  businessPhone?: string | null;
  businessAddress?: string | null;
}): Promise<SendEmailResult> {
  const html = await render(
    BookingConfirmationEmail({
      businessName: input.businessName,
      customerName: input.customerName,
      serviceName: input.serviceName,
      staffName: input.staffName,
      when: formatDateTimeInTz(input.startAt, input.timezone),
      timezone: input.timezone,
      priceLabel: formatMoney(input.price, input.currency),
      status: input.status,
      manageUrl: input.manageUrl,
      businessPhone: input.businessPhone,
      businessAddress: input.businessAddress,
    })
  );

  return sendEmail({
    to: input.to,
    subject:
      input.status === "pending"
        ? `Booking received — ${input.serviceName} at ${input.businessName}`
        : `Booking confirmed — ${input.serviceName} at ${input.businessName}`,
    html,
  });
}

/**
 * Upcoming-booking reminder email (PLAN P4-T4; dispatched by the P7 cron).
 */
export async function sendBookingReminderEmail(input: {
  to: string;
  customerName: string;
  businessName: string;
  serviceName: string;
  staffName: string;
  startAt: Date | string;
  timezone: string;
  manageUrl: string;
}): Promise<SendEmailResult> {
  const html = await render(
    BookingReminderEmail({
      businessName: input.businessName,
      customerName: input.customerName,
      serviceName: input.serviceName,
      staffName: input.staffName,
      when: formatDateTimeInTz(input.startAt, input.timezone),
      timezone: input.timezone,
      manageUrl: input.manageUrl,
    })
  );

  return sendEmail({
    to: input.to,
    subject: `Reminder: ${input.serviceName} at ${input.businessName}`,
    html,
  });
}

/**
 * Booking cancellation email (PLAN P4-T4).
 */
export async function sendBookingCancelledEmail(input: {
  to: string;
  customerName: string;
  businessName: string;
  serviceName: string;
  startAt: Date | string;
  timezone: string;
  rebookUrl: string;
}): Promise<SendEmailResult> {
  const html = await render(
    BookingCancelledEmail({
      businessName: input.businessName,
      customerName: input.customerName,
      serviceName: input.serviceName,
      when: formatDateTimeInTz(input.startAt, input.timezone),
      timezone: input.timezone,
      rebookUrl: input.rebookUrl,
    })
  );

  return sendEmail({
    to: input.to,
    subject: `Your booking at ${input.businessName} was cancelled`,
    html,
  });
}

/**
 * Invoice email with the public pay link (PLAN P6-T2).
 */
export async function sendInvoiceEmail(input: {
  to: string;
  customerName: string;
  businessName: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  publicUrl: string;
}): Promise<SendEmailResult> {
  const html = await render(
    InvoiceEmail({
      businessName: input.businessName,
      customerName: input.customerName,
      invoiceNumber: input.invoiceNumber,
      totalLabel: formatMoney(input.total, input.currency),
      publicUrl: input.publicUrl,
    })
  );

  return sendEmail({
    to: input.to,
    subject: `Invoice ${input.invoiceNumber} from ${input.businessName}`,
    html,
  });
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
