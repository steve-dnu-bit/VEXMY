import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { getShopBranding, type ShopBranding } from "./branding.ts";
import { formatShopMoney } from "./shop-currency.ts";

export type PosReceiptLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PosReceiptPdfParams = {
  receiptNumber: string;
  clientName: string;
  clientEmail: string | null;
  artistName: string;
  paidAtText: string;
  currency: string;
  taxLabel: string;
  items: PosReceiptLineItem[];
  subtotal: number;
  taxAmount: number;
  gratuityAmount: number;
  sessionTotal: number;
  depositCreditAmount: number;
  amountPaid: number;
  paymentMethodLabel: string;
  brand?: ShopBranding;
};

export async function buildPosReceiptPdf(params: PosReceiptPdfParams): Promise<string> {
  const brand = params.brand ?? getShopBranding();
  const fmt = (n: number) => formatShopMoney(Number(n), params.currency);
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 800;

  const draw = (text: string, size = 11, bold = false, color = rgb(0.15, 0.15, 0.15), x = 50) => {
    page.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
    y -= size + 6;
  };

  page.drawRectangle({
    x: 0,
    y: 795,
    width: 595,
    height: 47,
    color: rgb(0.08, 0.08, 0.08),
  });
  y = 812;
  draw(brand.shopName.toUpperCase(), 18, true, rgb(0.95, 0.76, 0.27), 50);
  draw("RECEIPT", 10, true, rgb(0.85, 0.85, 0.85), 490);
  y = 760;
  draw(`Receipt #: ${params.receiptNumber}`, 12, true);
  draw(`Date: ${params.paidAtText}`, 10, false, rgb(0.35, 0.35, 0.35));
  draw(`Artist: ${params.artistName}`, 10, false, rgb(0.35, 0.35, 0.35));
  draw(`Payment: ${params.paymentMethodLabel}`, 10, false, rgb(0.35, 0.35, 0.35));
  if (brand.address) draw(brand.address, 10, false, rgb(0.35, 0.35, 0.35));
  y -= 6;

  page.drawRectangle({
    x: 50,
    y: y - 56,
    width: 495,
    height: 56,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.88, 0.88, 0.88),
    borderWidth: 1,
  });
  draw("Client", 10, true, rgb(0.25, 0.25, 0.25), 58);
  draw(params.clientName || "Guest", 11, true, rgb(0.1, 0.1, 0.1), 58);
  if (params.clientEmail) draw(params.clientEmail, 10, false, rgb(0.4, 0.4, 0.4), 58);
  y -= 10;

  draw("Items", 12, true);
  draw("Description                                         Qty     Unit price       Line total", 9, true, rgb(0.4, 0.4, 0.4));
  for (const item of params.items) {
    const description = item.name.length > 44 ? `${item.name.slice(0, 41)}...` : item.name;
    const qty = String(item.quantity).padStart(2, " ");
    const unit = fmt(item.unitPrice).padStart(9, " ");
    const lineTotal = fmt(item.lineTotal).padStart(9, " ");
    draw(`${description.padEnd(50, " ")}${qty}     ${unit}       ${lineTotal}`, 10);
    if (y < 120) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
  }

  y -= 6;
  page.drawRectangle({
    x: 330,
    y: y - 118,
    width: 215,
    height: 118,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.88, 0.88, 0.88),
    borderWidth: 1,
  });
  draw(`Subtotal: ${fmt(params.subtotal)}`, 10, false, rgb(0.25, 0.25, 0.25), 342);
  if (params.taxAmount > 0) {
    draw(`${params.taxLabel}: ${fmt(params.taxAmount)}`, 10, false, rgb(0.25, 0.25, 0.25), 342);
  }
  if (params.gratuityAmount > 0) {
    draw(`Gratuity: ${fmt(params.gratuityAmount)}`, 10, false, rgb(0.25, 0.25, 0.25), 342);
  }
  draw(`Session total: ${fmt(params.sessionTotal)}`, 10, false, rgb(0.25, 0.25, 0.25), 342);
  if (params.depositCreditAmount > 0) {
    draw(`Deposit credit: -${fmt(params.depositCreditAmount)}`, 10, false, rgb(0.25, 0.25, 0.25), 342);
  }
  draw(`Amount paid: ${fmt(params.amountPaid)}`, 12, true, rgb(0.06, 0.06, 0.06), 342);

  y -= 12;
  draw(`Thank you for visiting ${brand.shopName}.`, 10, true);
  if (brand.supportEmail) draw(`Questions? ${brand.supportEmail}`, 9, false, rgb(0.35, 0.35, 0.35));

  const bytes = await pdf.save();
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
