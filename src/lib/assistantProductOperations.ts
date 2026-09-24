import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
const unavailable = () => new AssistantError("ASSISTANT_SERVICE_UNAVAILABLE", 503);
export async function assertAssistantProductsReadAccess({ admin, salon, user }: Context) {
 const access = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: "products" });
 if (access.error) throw unavailable();
 if (access.data !== true) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
}

/** Operations require the same products permission as the existing order API.
 * No customer identity, contact/address, payment value or provider field is read. */
export async function readAssistantProductOperations(context: Context) {
 const { admin, salon } = context;
 await assertAssistantProductsReadAccess(context);
 const asOf = new Date().toISOString();
 const ordersRead = await admin.from("product_orders").select("id,salon_id,public_reference,fulfillment_method,fulfillment_status,reservation_status,payment_status,payment_mode,created_at,updated_at,pickup_deadline,fulfilled_at", { count: "exact" }).eq("salon_id", salon.id).order("created_at", { ascending: false }).order("id").limit(100);
 const checked = (read: { data: unknown; count: number | null; error?: unknown }, cap: number) => {
  if (read.error || !Array.isArray(read.data) || !Number.isSafeInteger(read.count) || read.count! < read.data.length || read.data.length > cap) throw unavailable();
  const rows = read.data as Row[];
  if (rows.some(row => typeof row.id !== "string" || !row.id) || new Set(rows.map(row => row.id)).size !== rows.length) throw unavailable();
  return rows;
 };
 const orders = checked(ordersRead, 100);
 const orderIds = new Set(orders.map(row => String(row.id)));
 if (orders.some(row => row.salon_id !== salon.id || typeof row.public_reference !== "string" || !row.public_reference || !Number.isFinite(Date.parse(String(row.created_at)))
  || [row.updated_at, row.pickup_deadline, row.fulfilled_at].some(at => at != null && !Number.isFinite(Date.parse(String(at)))))) throw unavailable();
 const itemsRead = orderIds.size ? await admin.from("product_order_items").select("id,order_id,product_id,product_name,quantity", { count: "exact" }).in("order_id", [...orderIds]).order("id").limit(1000) : { data: [], count: 0, error: null };
 const items = checked(itemsRead, 1000);
 if (items.some(row => !orderIds.has(String(row.order_id)) || typeof row.product_name !== "string" || !row.product_name || row.product_name.length > 500 || !Number.isSafeInteger(row.quantity) || Number(row.quantity) < 1 || Number(row.quantity) > 1000)) throw unavailable();
 // A deleted product may leave its own order snapshot. A non-null product
 // reference must still resolve inside this business, including archived stock.
 const productIds = [...new Set(items.filter(row => row.product_id != null).map(row => String(row.product_id)))];
 if (productIds.length) {
  const linked = await admin.from("salon_products").select("id,salon_id", { count: "exact" }).eq("salon_id", salon.id).in("id", productIds).limit(1000);
  const own = checked(linked, 1000);
  if (linked.count !== productIds.length || own.length !== productIds.length || own.some(row => row.salon_id !== salon.id || !productIds.includes(String(row.id)))) throw unavailable();
 }
 await assertAssistantProductsReadAccess(context);
 const itemsComplete = items.length === itemsRead.count;
 return { total: ordersRead.count, shown_count: orders.length, is_excerpt: orders.length !== ordersRead.count, as_of: asOf, period: "all_time", time_zone: salon.time_zone,
  query_applies_to_orders: false, included_payment_modes: "All stored modes; each record retains its mode. Test orders are not live customer activity.",
  orders: orders.map(row => {
   const ownItems = items.filter(item => item.order_id === row.id);
   return { id: row.id, public_reference: row.public_reference, fulfillment_method: row.fulfillment_method, fulfillment_status: row.fulfillment_status, reservation_status: row.reservation_status,
    payment_status: row.payment_status, payment_mode: row.payment_mode, created_at: row.created_at, updated_at: row.updated_at, pickup_deadline: row.pickup_deadline, fulfilled_at: row.fulfilled_at,
    items: ownItems.slice(0, 12).map(item => ({ product_name: item.product_name, quantity: item.quantity })), item_count: itemsComplete ? ownItems.length : null,
    shown_item_count: Math.min(ownItems.length, 12), items_are_excerpt: !itemsComplete || ownItems.length > 12 };
  }), href: "/salon/dashboard/products#product-orders", actions_performed: false,
  definition: "Current recorded own-business product orders, newest first. Exact all-time order total is independent of the product-name search; a page cannot establish all ready/late/status totals. Items use the order's saved name/quantity, not a current price or stock count. Incomplete item reads do not prove an order has no items. Dates use this business time zone. Status/payment mode is recorded state, not verified receipt or bank settlement. No customer, address, contact, tracking, payment secret or financial amount is included. Status-only fulfillment can be reviewed in the assistant. No notification or payment operation is included; nothing was changed or sent." };
}
