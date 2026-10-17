import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatDateTimeInTz } from "@/lib/time";
import type { InvoicePdfData } from "@/lib/types";

/**
 * Invoice PDF (spec §10, PLAN P6-T3). Rendered server-side with
 * @react-pdf/renderer, which needs no browser and returns a Buffer.
 *
 * Money is printed as `<CODE> 1234.56` rather than via Intl currency symbols:
 * the built-in Helvetica font has no glyph for e.g. the BDT sign.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 16,
    marginBottom: 24,
  },
  businessName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  muted: { color: "#64748b" },
  invoiceLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
  invoiceNumber: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  columns: { flexDirection: "row", marginBottom: 24 },
  column: { flex: 1 },
  label: {
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#94a3b8",
    marginBottom: 4,
  },
  value: { fontSize: 10, marginBottom: 2 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
    paddingBottom: 6,
    marginBottom: 6,
  },
  th: { fontSize: 8, textTransform: "uppercase", letterSpacing: 1 },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  colDescription: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colUnit: { flex: 2, textAlign: "right" },
  colAmount: { flex: 2, textAlign: "right" },
  totals: { marginTop: 16, alignSelf: "flex-end", width: 220 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLabel: { color: "#64748b" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#0f172a",
  },
  grandTotal: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
  },
  status: {
    marginTop: 4,
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});

function money(amount: number, currency: string): string {
  return `${currency} ${(amount / 100).toFixed(2)}`;
}

export function InvoiceDocument({ invoice }: { invoice: InvoicePdfData }) {
  const created = invoice.createdAt
    ? formatDateTimeInTz(invoice.createdAt, invoice.timezone)
    : "—";
  const paid = invoice.paidAt
    ? formatDateTimeInTz(invoice.paidAt, invoice.timezone)
    : null;

  return (
    <Document
      title={`Invoice ${invoice.number}`}
      author={invoice.business.name}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.businessName}>{invoice.business.name}</Text>
            {invoice.business.address ? (
              <Text style={[styles.muted, { marginTop: 4 }]}>
                {invoice.business.address}
              </Text>
            ) : null}
            {invoice.business.phone ? (
              <Text style={styles.muted}>{invoice.business.phone}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoice.number}</Text>
            <Text style={styles.status}>{invoice.status}</Text>
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.label}>Billed to</Text>
            <Text style={styles.value}>
              {invoice.customer?.name ?? "Customer"}
            </Text>
            {invoice.customer?.email ? (
              <Text style={styles.muted}>{invoice.customer.email}</Text>
            ) : null}
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>Issued</Text>
            <Text style={styles.value}>{created}</Text>
            {invoice.booking ? (
              <>
                <Text style={[styles.label, { marginTop: 8 }]}>
                  Booking
                </Text>
                <Text style={styles.value}>
                  {invoice.booking.serviceName ?? "Service"}
                </Text>
                <Text style={styles.muted}>
                  {formatDateTimeInTz(
                    invoice.booking.startAt,
                    invoice.timezone
                  )}
                </Text>
              </>
            ) : null}
          </View>
          <View style={styles.column}>
            {paid ? (
              <>
                <Text style={styles.label}>Paid</Text>
                <Text style={styles.value}>{paid}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.colDescription]}>
            Description
          </Text>
          <Text style={[styles.th, styles.colQty]}>Qty</Text>
          <Text style={[styles.th, styles.colUnit]}>Unit price</Text>
          <Text style={[styles.th, styles.colAmount]}>Amount</Text>
        </View>

        {invoice.lineItems.map((item, index) => (
          <View style={styles.row} key={index}>
            <Text style={styles.colDescription}>{item.description}</Text>
            <Text style={styles.colQty}>{item.qty}</Text>
            <Text style={styles.colUnit}>
              {money(item.unitPrice, invoice.currency)}
            </Text>
            <Text style={styles.colAmount}>
              {money(item.qty * item.unitPrice, invoice.currency)}
            </Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text>{money(invoice.subtotal, invoice.currency)}</Text>
          </View>
          {invoice.tax > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text>{money(invoice.tax, invoice.currency)}</Text>
            </View>
          ) : null}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotal}>Total</Text>
            <Text style={styles.grandTotal}>
              {money(invoice.total, invoice.currency)}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Generated by BookKeep · {invoice.number}
        </Text>
      </Page>
    </Document>
  );
}

/** Render an invoice to a PDF Buffer for streaming (P6-T2 `.../pdf`). */
export async function renderInvoicePdf(
  invoice: InvoicePdfData
): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument invoice={invoice} />);
}
