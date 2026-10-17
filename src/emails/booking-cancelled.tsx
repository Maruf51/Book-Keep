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

interface BookingCancelledEmailProps {
  businessName: string;
  customerName: string;
  serviceName: string;
  /** Pre-formatted date/time in the business timezone. */
  when: string;
  timezone: string;
  /** Public business page to start a new booking. */
  rebookUrl: string;
}

/**
 * Booking cancellation notice (PLAN P4-T4). Inline styles only; EN strings.
 */
export default function BookingCancelledEmail({
  businessName,
  customerName,
  serviceName,
  when,
  timezone,
  rebookUrl,
}: BookingCancelledEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your booking at {businessName} was cancelled</Preview>
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
            Your booking was cancelled
          </Heading>
          <Text style={{ margin: "0 0 20px", color: "#475569", lineHeight: 1.6 }}>
            Hi {customerName}, your booking at <strong>{businessName}</strong> has
            been cancelled. If this was a mistake, you can book again anytime.
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
              Was scheduled for
            </Text>
            <Text style={{ margin: 0, color: "#0f172a" }}>
              {when} ({timezone})
            </Text>
          </Section>

          <Button
            href={rebookUrl}
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
            Book again
          </Button>

          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
            This is an automated message from {businessName}.
          </Text>
        </Section>
      </Body>
    </Html>
  );
}

BookingCancelledEmail.PreviewProps = {
  businessName: "Glow Salon",
  customerName: "Rahim",
  serviceName: "Haircut",
  when: "Tue, Oct 20, 2026 at 10:00 AM",
  timezone: "Asia/Dhaka",
  rebookUrl: "http://localhost:3000/b/glow-salon",
} satisfies BookingCancelledEmailProps;
