import {
  Body,
  Button,
  CodeInline,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface StaffInviteEmailProps {
  businessName: string;
  staffName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}

/**
 * Staff invitation email. Uses inline styles only (no <Tailwind>) for maximum
 * email-client compatibility.
 */
export default function StaffInviteEmail({
  businessName,
  staffName,
  email,
  tempPassword,
  loginUrl,
}: StaffInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You&apos;ve been invited to join {businessName} on BookKeep</Preview>
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
          <Heading
            style={{
              margin: "0 0 16px",
              fontSize: 22,
              color: "#0f172a",
            }}
          >
            You&apos;ve been invited to join {businessName}
          </Heading>
          <Text style={{ margin: "0 0 16px", color: "#475569", lineHeight: 1.6 }}>
            Hi {staffName}, an account has been created for you on BookKeep.
            Sign in with the credentials below to start managing your schedule.
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
              Email
            </Text>
            <Text style={{ margin: "0 0 12px", color: "#0f172a" }}>{email}</Text>
            <Text style={{ margin: "0 0 4px", fontSize: 13, color: "#64748b" }}>
              Temporary password
            </Text>
            <CodeInline
              style={{
                backgroundColor: "#e2e8f0",
                color: "#0f172a",
                padding: "4px 8px",
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              {tempPassword}
            </CodeInline>
          </Section>
          <Button
            href={loginUrl}
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
            Sign in to BookKeep
          </Button>
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
            You can change your password after signing in. If you weren&apos;t
            expecting this invite, you can ignore this email.
          </Text>
        </Section>
      </Body>
    </Html>
  );
}

StaffInviteEmail.PreviewProps = {
  businessName: "Glow Salon",
  staffName: "Anika",
  email: "anika@example.com",
  tempPassword: "aB3xY9zQ1wR",
  loginUrl: "http://localhost:3000/login",
} satisfies StaffInviteEmailProps;
