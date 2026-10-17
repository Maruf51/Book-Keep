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

interface InvoiceEmailProps {
  businessName: string;
  customerName: string;
  invoiceNumber: string;
  /** Pre-formatted total in the business currency. */
  totalLabel: string;
  publicUrl: string;
}

/**
 * Customer invoice email (PLAN P6-T2). Inline styles only for maximum
 * email-client compatibility; EN strings (BN arrives in P10).
 */
export default function InvoiceEmail({
  businessName,
  customerName,
  invoiceNumber,
  totalLabel,
  publicUrl,
}: InvoiceEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Invoice {invoiceNumber} from {businessName}
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
          <Text
            style={{
              margin: "0 0 4px",
              fontSize: 12,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#10b981",
            }}
          >
            {businessName}
          </Text>
          <Heading style={{ margin: "0 0 16px", fontSize: 22, color: "#0f172a" }}>
            Invoice {invoiceNumber}
          </Heading>
          <Text
            style={{ margin: "0 0 16px", color: "#475569", lineHeight: 1.6 }}
          >
            Hi {customerName}, please find your invoice below. You can view the
            full breakdown and pay online from the link.
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
              Amount due
            </Text>
            <Text style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>
              {totalLabel}
            </Text>
          </Section>
          <Button
            href={publicUrl}
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
            View invoice
          </Button>
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
            If you have any questions about this invoice, reply to this email to
            reach {businessName}.
          </Text>
        </Section>
      </Body>
    </Html>
  );
}

InvoiceEmail.PreviewProps = {
  businessName: "Glow Salon",
  customerName: "Anika Rahman",
  invoiceNumber: "INV-00001",
  totalLabel: "BDT 1,500.00",
  publicUrl: "http://localhost:3000/invoice/example-token",
} satisfies InvoiceEmailProps;
