import {
  Body,
  Button,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface BookingConfirmationEmailProps {
  businessName: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  /** Pre-formatted date/time in the business timezone. */
  when: string;
  timezone: string;
  priceLabel: string | null;
  status: "pending" | "confirmed";
  manageUrl: string;
  businessPhone?: string | null;
  businessAddress?: string | null;
}

/**
 * Customer booking confirmation (PLAN P4-T4). Inline styles only for maximum
 * email-client compatibility; EN strings (BN arrives in P10).
 */
export default function BookingConfirmationEmail({
  businessName,
  customerName,
  serviceName,
  staffName,
  when,
  timezone,
  priceLabel,
  status,
  manageUrl,
  businessPhone,
  businessAddress,
}: BookingConfirmationEmailProps) {
  const pending = status === "pending";
  return (
    <Html>
      <Head />
      <Preview>
        {pending ? "Booking received" : "Booking confirmed"} — {serviceName} at{" "}
        {businessName}
      </Preview>
      <Body
        style={{
          backgroundColor: "#f8fafc",
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: 0,
        }}
      >
        <Section
          style={{
            maxWidth: 520,
            margin: "32px auto",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 32,
          }}
        >
          <Heading style={{ margin: "0 0 12px", fontSize: 22, color: "#0f172a" }}>
            {pending ? "Your booking was received" : "Your booking is confirmed"}
          </Heading>
          <Text style={{ margin: "0 0 20px", color: "#475569", lineHeight: 1.6 }}>
            Hi {customerName}, {pending ? "we have received your booking at" : "you are booked at"}{" "}
            <strong>{businessName}</strong>. Here are the details:
          </Text>

          <Section
            style={{
              backgroundColor: "#f1f5f9",
              borderRadius: 12,
              padding: 20,
              margin: "0 0 20px",
            }}
          >
            <Text style={{ margin: "0 0 4px", fontSize: 13, color: "#64748b" }}>
              Service
            </Text>
            <Text style={{ margin: "0 0 12px", color: "#0f172a" }}>{serviceName}</Text>
            <Text style={{ margin: "0 0 4px", fontSize: 13, color: "#64748b" }}>
              With
            </Text>
            <Text style={{ margin: "0 0 12px", color: "#0f172a" }}>{staffName}</Text>
            <Text style={{ margin: "0 0 4px", fontSize: 13, color: "#64748b" }}>
              When
            </Text>
            <Text style={{ margin: "0 0 12px", color: "#0f172a" }}>
              {when} ({timezone})
            </Text>
            {priceLabel ? (
              <>
                <Text style={{ margin: "0 0 4px", fontSize: 13, color: "#64748b" }}>
                  Price
                </Text>
                <Text style={{ margin: 0, color: "#0f172a" }}>{priceLabel}</Text>
              </>
            ) : null}
          </Section>

          {pending ? (
            <Text style={{ margin: "0 0 16px", color: "#b45309", lineHeight: 1.6 }}>
              This booking is awaiting confirmation. You will receive another
              email once it is confirmed.
            </Text>
          ) : null}

          <Button
            href={manageUrl}
            style={{
              backgroundColor: "#10b981",
              color: "#ffffff",
              borderRadius: 10,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Manage or cancel booking
          </Button>

          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
            {businessAddress ? <>{businessAddress}<br /></> : null}
            {businessPhone ? <>Phone: {businessPhone}<br /></> : null}
            Keep this link to reschedule or cancel your booking.
          </Text>
        </Section>
      </Body>
    </Html>
  );
}

BookingConfirmationEmail.PreviewProps = {
  businessName: "Glow Salon",
  customerName: "Rahim",
  serviceName: "Haircut",
  staffName: "Anika",
  when: "Tue, Oct 20, 2026 at 10:00 AM",
  timezone: "Asia/Dhaka",
  priceLabel: "৳1,500.00",
  status: "confirmed",
  manageUrl: "http://localhost:3000/booking/example-token",
} satisfies BookingConfirmationEmailProps;
