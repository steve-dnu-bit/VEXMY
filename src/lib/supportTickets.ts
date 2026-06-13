export type SupportTicketCategory = "general" | "booking" | "deposit" | "design" | "aftercare";
export type SupportTicketStatus = "open" | "closed";

export type SupportTicketRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  assigned_artist_id: string | null;
  booking_id: string | null;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type SupportTicketMessageRow = {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  message_type?: "text" | "media";
  created_at: string;
};

export const TICKET_CATEGORIES: SupportTicketCategory[] = [
  "general",
  "booking",
  "deposit",
  "design",
  "aftercare",
];

export function ticketCategoryLabelKey(category: string): string {
  return `tickets.category.${category}`;
}
