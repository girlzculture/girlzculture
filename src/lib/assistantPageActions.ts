import type { AssistantBusinessContext } from "@/lib/assistantAppearance";

type Action = { label: string; permission: string; tool?: string; args?: Record<string, unknown>; prompt?: string };
const profile: Action = { label: "My business profile", permission: "my_page", tool: "get_business_profile" };
const services: Action = { label: "My services and prices", permission: "styles", tool: "get_services_and_prices", args: { query: "" } };
const policies: Action = { label: "My business policies", permission: "my_page", tool: "get_business_policies" };
const media: Action = { label: "Count my photos", permission: "photos", tool: "get_business_media" };
const hours: Action = { label: "Show my hours", permission: "my_page", prompt: "What are my current business hours?" };
const bookings: Action = { label: "Today's appointments", permission: "bookings", prompt: "Show my appointments for today in my business time zone." };
const gaps: Action = { label: "Find calendar gaps", permission: "availability", prompt: "Find open time in my business calendar today." };
const plan: Action = { label: "My current plan", permission: "overview", tool: "get_plan_status" };
const pages: Record<string, Action[]> = {
  overview: [bookings, gaps, { label: "This month's summary", permission: "overview", prompt: "Summarize my business activity this month with the period and basis of the figures." }, { label: "Improve my page", permission: "overview", tool: "get_profile_completion" }, profile],
  "my-page": [profile, policies, { label: "Improve my description", permission: "my_page", prompt: "Help improve my business description using my current business facts. Prepare wording for me to review." }, hours],
  photos: [media, { label: "Photo categories and captions", permission: "photos", prompt: "Summarize my saved photo categories and captions." }, { label: "Cover and logo", permission: "photos", prompt: "Do I have a saved cover photo and business logo?" }],
  styles: [services, { label: "Review service descriptions", permission: "styles", prompt: "Review my existing service descriptions and suggest improvements using only my actual services." }, { label: "Explain my service prices", permission: "styles", prompt: "Explain my listed service prices, ranges and add-ons." }],
  stylists: [{ label: "My team", permission: "stylists", tool: "get_professionals", args: { query: "" } }, { label: "Service assignments", permission: "stylists", prompt: "Show my team members and their assigned services." }, gaps],
  products: [{ label: "My product inventory", permission: "products", tool: "get_products", args: { query: "" } }, { label: "Review product stock", permission: "products", prompt: "Which of my products have low or zero stock? Use current inventory and configured thresholds, where available." }, { label: "Improve product descriptions", permission: "products", prompt: "Suggest clearer descriptions for my existing products without inventing product claims." }],
  availability: [bookings, gaps, hours],
  bookings: [bookings, { label: "Upcoming appointments", permission: "bookings", prompt: "Show my upcoming appointments for the next seven days in my business time zone." }, { label: "Add an appointment", permission: "bookings", prompt: "Help me add an appointment to my business calendar, with a preview before saving." }],
  messages: [{ label: "Draft a client reply", permission: "bookings", prompt: "Help draft a reply to one of my booking conversations. Ask which conversation if I have not selected one." }, { label: "Summarize a conversation", permission: "bookings", prompt: "Summarize one of my booking conversations. Ask which booking if needed." }, bookings],
  reviews: [{ label: "Recent reviews", permission: "reviews", prompt: "Summarize my business reviews over the last three months using actual ratings and review text." }, { label: "Draft a review reply", permission: "reviews", prompt: "Help draft a reply to one of my business reviews. Ask which review if needed." }, { label: "Common review themes", permission: "reviews", prompt: "Identify themes supported by my business reviews over the last three months." }],
  earnings: [{ label: "This month's finances", permission: "earnings", prompt: "Summarize my finances this month, distinguishing booking value, received payments, refunds and payouts." }, { label: "Explain my balances", permission: "earnings", prompt: "Explain the deposits and remaining balances in my current business finances." }, { label: "Compare financial periods", permission: "earnings", prompt: "Compare my business finances this month with last month using consistent periods and actual amounts." }],
  promotions: [{ label: "My promotions", permission: "promotions", tool: "get_promotions" }, { label: "Draft a promotion", permission: "promotions", prompt: "Help draft a promotion for my business. Use my actual services and keep the required deposit unchanged." }, services],
  subscription: [plan, { label: "Explain plan benefits", permission: "overview", prompt: "Explain the actual benefits and limits of my current Girlz Culture plan." }, { label: "Update payment method", permission: "overview", prompt: "Where can I securely update my existing subscription payment method?" }],
  settings: [plan, policies, { label: "My business settings", permission: "settings", tool: "get_business_settings" }],
};

// This controls visibility, not authority. Each action is independently
// authorized by the server against the current identity and business.
export function assistantPageActions(page: string | null, business: AssistantBusinessContext | null): Action[] {
  const available = pages[page || ""] || [profile, services, policies];
  return available.filter(action => !business || business.isOwner || business.permissions?.[action.permission] === true || action.permission === "earnings" && business.permissions?.earnings_own === true);
}
