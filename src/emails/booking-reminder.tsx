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

interface BookingReminderEmailProps {
  businessName: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  /** Pre-formatted date/time in the business timezone. */
  when: string;
  timezone: string;
  manageUrl: string;
}

/**
 * Upcoming-booking reminder (PLAN P4-T4, dispatched by the P7 reminder cron).
 * Inline styles only; EN strings.
 */
export default function BookingReminderEmail({
  businessName,
  customerName,
  serviceName,
  staffName,
  when,
  timezone,
  manageUrl,
}: BookingReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Reminder: {serviceName} at {businessName} — {when}
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
            Your appointment is coming up
          </Heading>
          <Text style={{ margin: "0 0 20px", color: "#475569", lineHeight: 1.6 }}>
            Hi {customerName}, this is a reminder of your upcoming appointment at{" "}
            <strong>{businessName}</strong>.
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
            <Text style={{ margin: 0, color: "#0f172a" }}>
              {when} ({timezone})
            </Text>
          </Section>

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
            View booking
          </Button>

          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
            Need to change something? Use the link above to reschedule or cancel.
          </Text>
        </Section>
      </Body>
    </Html>
  );
}

BookingReminderEmail.PreviewProps = {
  businessName: "Glow Salon",
  customerName: "Rahim",
  serviceName: "Haircut",
  staffName: "Anika",
  when: "Tue, Oct 20, 2026 at 10:00 AM",
  timezone: "Asia/Dhaka",
  manageUrl: "http://localhost:3000/booking/example-token",
} satisfies BookingReminderEmailProps;
