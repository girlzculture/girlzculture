/** Reviewed vocabulary for generic explanations, never a record-text replacement.
 * This module has no provider, record reader, or automatic translation hook.
 * DeepL context is deliberately separate from assistant instructions. */
export const BUSINESS_TERMINOLOGY_VERSION = "2026-09-19.1";
export const BUSINESS_TERMINOLOGY_LOCALES = Object.freeze(["en", "fr", "es", "zh-CN"] as const);
export const BUSINESS_TERMINOLOGY_DOMAINS = Object.freeze(["finance", "bookings", "services", "products"] as const);
export type BusinessTerminologyLocale = typeof BUSINESS_TERMINOLOGY_LOCALES[number];
export type BusinessTerminologyDomain = typeof BUSINESS_TERMINOLOGY_DOMAINS[number];
type Labels = Readonly<Record<BusinessTerminologyLocale, string>>;
type Catalog = "finance" | "owner" | "products" | "deposit";
export type BusinessTerminologyEntry = Readonly<{
  id: string;
  domains: readonly BusinessTerminologyDomain[];
  labels: Labels;
  meaning: string;
  source: Readonly<{ catalog: Catalog; key: string; contextual_form?: string }>;
}>;

function entry(id: string, domains: BusinessTerminologyDomain[], labels: [string, string, string, string], meaning: string, catalog: Catalog, contextualForm?: string): BusinessTerminologyEntry {
  return Object.freeze({ id, domains: Object.freeze(domains), labels: Object.freeze({ en: labels[0], fr: labels[1], es: labels[2], "zh-CN": labels[3] }), meaning,
    source: Object.freeze({ catalog, key: labels[0], ...(contextualForm ? { contextual_form: contextualForm } : {}) }) });
}

// Catalog values are pinned here rather than importing the whole UI catalogs.
// Tests compare each reviewed form to its named catalog source. Changes require review.
export const BUSINESS_TERMINOLOGY: readonly BusinessTerminologyEntry[] = Object.freeze([
  entry("deposit", ["finance", "bookings"], ["Deposit", "Acompte", "Depósito", "订金"], "An advance payment toward an agreed amount. A deposit requirement is not proof of receipt, a separate fee, or a non-refundable payment; use the recorded payment and applicable agreed policy.", "finance"),
  entry("remaining_balance", ["finance", "bookings"], ["Remaining balance", "Solde restant", "Saldo pendiente", "剩余款项"], "The outstanding amount reported by the authorized records, distinct from money already received. A pending appointment's expected balance is not completed-service debt.", "owner"),
  entry("payments_received", ["finance"], ["Payments received", "Paiements reçus", "Pagos recibidos", "已收款"], "Recorded receipts with their supplied verification and date basis. Collected money is not automatically service sales, profit, compensation paid, or a bank payout; unverified evidence stays unverified.", "finance"),
  entry("balance_payments", ["finance"], ["Balance payments", "Paiements du solde", "Pagos de saldo", "尾款付款"], "Payments applied to a remaining balance, distinct from the balance still outstanding. Preserve the supplied payment state and receipt date.", "finance"),
  entry("service_sales", ["finance"], ["Service sales", "Ventes de services", "Ventas de servicios", "服务销售额"], "The reported service sales value on its stated record and completion basis. It is not a claim that all of that money was received, nor a profit measure.", "finance"),
  entry("recorded_profit", ["finance"], ["Recorded profit", "Bénéfice enregistré", "Beneficio registrado", "已记录利润"], "The canonical reported result using recorded sales, rent, costs and compensation on its stated basis. Missing costs stay disclosed; this is not guaranteed net profit, cash received, tax liability or a new calculation from partial facts.", "finance"),
  entry("refund", ["finance", "bookings"], ["Refund", "Remboursement", "Reembolso", "退款"], "Money returned, with the exact recorded status and amount. A cancellation or refund request alone does not establish that a refund was issued.", "finance"),
  entry("payout", ["finance"], ["Payout", "Versement", "Desembolso", "结算款"], "A provider or account payout, with the supplied recipient and status. Distinct from a customer's payment received and from staff compensation paid; pending does not mean paid.", "owner", "Spanish Desembolso derives from the existing Payout status / Estado del desembolso label; generic Cobro is ambiguous with customer receipts."),
  entry("commission_earned", ["finance"], ["Commission earned", "Commission acquise", "Comisión ganada", "已赚取佣金"], "Accrued commission under the recorded agreement, distinct from compensation already paid. Preserve the supplied calculation basis; do not infer payout or legal employment status.", "finance"),
  entry("wages_due", ["finance"], ["Wages due", "Salaires dus", "Salarios adeudados", "应付工资"], "The recorded wage obligation, not proof of a completed wage payment.", "finance"),
  entry("compensation_paid", ["finance"], ["Compensation paid", "Rémunération payée", "Remuneración pagada", "已付薪酬"], "Recorded compensation payments to a professional, distinct from accrued wages or commission and from provider payouts.", "finance"),
  entry("booth_rent_due", ["finance"], ["Booth rent due", "Loyer de poste dû", "Alquiler de puesto adeudado", "应收工位租金"], "Recorded chair or booth rent owed under the agreement. It is not rent already received or the professional's service revenue.", "finance"),
  entry("appointment", ["bookings"], ["Appointment", "Rendez-vous", "Cita", "到店预约"], "A scheduled service visit. Preserve its actual status, date, time, timezone, professional and agreed amounts; scheduling does not prove completion or payment.", "owner"),
  entry("no_show", ["bookings"], ["No-show", "Absence", "Inasistencia", "爽约"], "An appointment explicitly recorded as a no-show. Distinct from a cancellation, reschedule or still-pending visit; it does not itself authorize a charge or imply lost revenue.", "deposit"),
  entry("customer", ["bookings", "services"], ["Customer", "Client", "Cliente", "顾客"], "A generic role label. Preserve each original person's name and any permitted identity distinctions; never merge people because translated names resemble each other.", "owner"),
  entry("service", ["services"], ["Service", "Prestation", "Servicio", "服务"], "A generic beauty service, not a replacement for its saved name. A listed base price is not a final quote when required choices, materials or other recorded conditions remain unresolved.", "owner"),
  entry("stylist", ["services", "bookings"], ["Stylist", "Professionnel", "Profesional", "造型师"], "The generic professional role. Preserve the assigned person's original name and actual role or work agreement; the label does not establish employee status.", "finance"),
  entry("braids", ["services"], ["Braids", "Tresses", "Trenzas", "辫子"], "A generic hairstyle category. A saved business, service or person name containing this wording stays exactly as recorded; category wording does not establish a price or duration.", "owner"),
  entry("knotless_braids", ["services"], ["Knotless Braids", "Tresses sans nœuds", "Trenzas sin nudos", "无结辫"], "A generic hairstyle term. It does not equate separate catalog services or authorize rewriting a saved service name, option, technique, duration or price.", "owner"),
  entry("product", ["products"], ["Product", "Produit", "Producto", "商品"], "A generic catalog item. Preserve the original product name and variant; stock availability, fulfillment and payment status are separate facts.", "finance"),
  entry("reserved_for_pickup", ["products"], ["Reserved for pickup", "Réservé pour le retrait", "Reservado para recoger", "已预订自提"], "An item reserved for collection. This does not establish that it is ready, collected, or fully paid.", "products"),
  entry("ready_for_pickup", ["products"], ["Ready for pickup", "Prêt à retirer", "Listo para recoger", "可到店自取"], "The recorded readiness of goods for collection, distinct from already collected goods or a payment received.", "products"),
  entry("picked_up", ["products"], ["Picked up", "Retiré par le client", "Recogido por el cliente", "客户已取货"], "Goods handed over to the customer. The pickup state Collected means this physical handover, not money collected or income received; payment facts remain separate.", "products"),
  entry("not_picked_up", ["products"], ["Not picked up", "Non retiré", "No recogido", "未取货"], "Goods not collected. This alone does not establish cancellation, a refund, a missed service appointment or an additional charge.", "products"),
  entry("low_stock", ["products"], ["Low stock", "Stock faible", "Pocas existencias", "库存不足"], "The reported low-stock state for a tracked item. It is not the same as no stock, untracked stock or unavailable stock evidence; do not invent quantities.", "products"),
  entry("out_of_stock", ["products"], ["Out of stock", "Épuisé", "Agotado", "缺货"], "The recorded out-of-stock state. Missing or untracked stock data does not establish this state.", "products"),
]);

const TRANSLATION_CONTEXT: Readonly<Record<BusinessTerminologyLocale, Readonly<Record<BusinessTerminologyDomain, string>>>> = Object.freeze({
  en: Object.freeze({
    finance: "In a beauty business, deposits are advance payments toward an agreed amount. A remaining balance is distinct from payments received. Service sales and recorded profit are different measures. Commission earned and wages due are distinct from compensation paid. A provider payout is a transfer of funds; a refund returns money. Each has its own recorded status and date basis.",
    bookings: "A beauty appointment has a customer, an assigned professional, a date, a time and a timezone. A deposit can count toward the agreed amount, with a remaining balance. Cancellation, rescheduling and a recorded no-show are different appointment outcomes. Appointment status and payment status are separate.",
    services: "A beauty service is performed by a professional. Braids and knotless braids are hairstyle terms. Individual catalog services have their own names, lengths, sizes, materials, prices and durations. A base price and a final price with selected options can differ.",
    products: "A beauty product can be reserved for pickup, ready for pickup, picked up or not picked up. Collection of goods is distinct from collection of a payment. Catalog products and variants have names. Low stock, out of stock, untracked stock and unavailable stock data are different states.",
  }),
  fr: Object.freeze({
    finance: "Dans un établissement de beauté, un acompte est un paiement anticipé sur un montant convenu. Le solde restant se distingue des paiements reçus. Les ventes de services et le bénéfice enregistré sont des mesures différentes. La commission acquise et les salaires dus se distinguent de la rémunération payée. Un versement du prestataire transfère des fonds ; un remboursement rend de l’argent. Chaque opération a son statut et sa période de référence.",
    bookings: "Un rendez-vous de beauté associe un client, un professionnel, une date, une heure et un fuseau horaire. Un acompte peut contribuer au montant convenu, avec un solde restant. Une annulation, un report et une absence enregistrée sont des résultats différents. Le statut du rendez-vous et celui du paiement sont distincts.",
    services: "Une prestation de beauté est réalisée par un professionnel. Les tresses et les tresses sans nœuds sont des types de coiffure. Les prestations du catalogue ont leurs propres noms, longueurs, tailles, matériaux, prix et durées. Le prix de base peut différer du prix final avec les options choisies.",
    products: "Un produit de beauté peut être réservé pour le retrait, prêt à retirer, retiré par le client ou non retiré. Le retrait d’un produit se distingue de l’encaissement d’un paiement. Les produits et variantes du catalogue portent un nom. Stock faible, stock épuisé, stock non suivi et données de stock indisponibles sont des états différents.",
  }),
  es: Object.freeze({
    finance: "En un negocio de belleza, un depósito es un pago anticipado de un importe acordado. El saldo pendiente se distingue de los pagos recibidos. Las ventas de servicios y el beneficio registrado son medidas diferentes. La comisión ganada y los salarios adeudados se distinguen de la remuneración pagada. Un desembolso del proveedor transfiere fondos; un reembolso devuelve dinero. Cada operación tiene su estado y período de referencia.",
    bookings: "Una cita de belleza tiene un cliente, un profesional asignado, una fecha, una hora y una zona horaria. Un depósito puede contar para el importe acordado, con un saldo pendiente. Cancelar, cambiar la fecha y registrar una inasistencia son resultados distintos. El estado de la cita y el del pago son independientes.",
    services: "Un servicio de belleza lo realiza un profesional. Las trenzas y las trenzas sin nudos son tipos de peinado. Los servicios del catálogo tienen sus propios nombres, largos, tamaños, materiales, precios y duraciones. El precio base puede ser distinto del precio final con las opciones elegidas.",
    products: "Un producto de belleza puede estar reservado para recoger, listo para recoger, recogido por el cliente o no recogido. La recogida de un producto se distingue del cobro de un pago. Los productos y variantes del catálogo tienen nombres. Pocas existencias, agotado, stock sin seguimiento y datos de stock no disponibles son estados distintos.",
  }),
  "zh-CN": Object.freeze({
    finance: "在美容业务中，订金是约定金额的一部分预付款。剩余款项与已收款不同，服务销售额与已记录利润也不同。已赚取佣金和应付工资不等于已付薪酬。服务提供方的结算款属于资金划转，退款则是返还款项。每笔记录都有各自的状态和日期依据。",
    bookings: "美容到店预约包含顾客、指定造型师、日期、时间和时区。订金可以抵扣约定金额，其余为剩余款项。取消、改期和已记录的爽约是不同结果。预约状态与付款状态分别记录。",
    services: "美容服务由专业人员提供。辫子和无结辫是发型术语。目录中的每项服务都有自己的名称、长度、尺寸、材质、价格和时长。基础价格可能与选择附加选项后的最终价格不同。",
    products: "美容商品的自提状态包括已预订自提、可到店自取、客户已取货和未取货。商品取货与收款是不同事项。目录中的商品及其款式有各自的名称。库存不足、缺货、未跟踪库存和库存数据不可用是不同状态。",
  }),
});

function supported(locale: string, domain: string): locale is BusinessTerminologyLocale {
  return (BUSINESS_TERMINOLOGY_LOCALES as readonly string[]).includes(locale) && (BUSINESS_TERMINOLOGY_DOMAINS as readonly string[]).includes(domain);
}

/** Static vocabulary only. Unsupported locales/domains have no implied coverage. */
export function businessTerminology(locale: string, domain: string): readonly BusinessTerminologyEntry[] | null {
  if (!supported(locale, domain)) return null;
  return Object.freeze(BUSINESS_TERMINOLOGY.filter(term => term.domains.includes(domain as BusinessTerminologyDomain)));
}

/** Advisory assistant instructions, NOT the DeepL context parameter. No user facts enter here. */
export function assistantBusinessTerminologyGuidance(locale: string, domain: string): string | null {
  const terms = businessTerminology(locale, domain);
  if (!terms || !supported(locale, domain)) return null;
  return [
    `Reviewed business terminology ${BUSINESS_TERMINOLOGY_VERSION}; generic ${domain} explanations in ${locale}.`,
    "Original business, service, product, option and person names, quotations and record labels always take precedence over glossary wording, even when they match a term. Preserve them exactly; never find-and-replace record text or map separate records by translated names.",
    "Use only authorized supplied facts. Preserve amounts, currencies, signs, dates, times, timezones, statuses, verification, counts, samples, periods and missing-evidence limits. Terminology adds no facts, calculation, permission, payment or policy. No model should infer a final quote, actual receipt, payout, refund or profit from a label alone.",
    ...terms.map(term => `${term.labels.en} → ${term.labels[locale]}: ${term.meaning}`),
  ].join("\n");
}

/** Natural surrounding domain prose in the KNOWN SOURCE language, not commands
 * or guaranteed term enforcement. A caller must supply a trusted domain and
 * known supported source locale; do not guess either from customer text. */
export function businessTranslationContext(sourceLocale: string, domain: string): string | null {
  if (!supported(sourceLocale, domain)) return null;
  return TRANSLATION_CONTEXT[sourceLocale][domain as BusinessTerminologyDomain];
}
