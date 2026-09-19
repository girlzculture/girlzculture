const rows = [
  ["Record received payment", "Enregistrer le paiement reçu", "Registrar el pago recibido", "记录已收款"],
  ["This records payment you already received in Finances. Girlz Culture will not charge the client, send a receipt or create an appointment.", "Cette action enregistre dans Finances un paiement que vous avez déjà reçu. Girlz Culture ne facturera pas le client, n’enverra aucun reçu et ne créera aucun rendez-vous.", "Esto registra en Finanzas un pago que ya recibiste. Girlz Culture no cobrará al cliente, no enviará un recibo ni creará una cita.", "此操作会在财务中记录您已收到的款项。Girlz Culture 不会向客户扣款、发送收据或创建预约。"],
  ["The received payment was recorded and verified in Finances. No customer charge was made.", "Le paiement reçu a été enregistré et vérifié dans Finances. Aucun paiement n’a été prélevé auprès du client.", "El pago recibido se registró y verificó en Finanzas. No se realizó ningún cobro al cliente.", "已收款已记录在财务中并核实。未向客户扣款。"],
  ["Received amount", "Montant reçu", "Importe recibido", "已收金额"],
  ["Received at", "Reçu le", "Fecha de recepción", "收款时间"],
  ["Client name (optional)", "Nom du client (facultatif)", "Nombre del cliente (opcional)", "客户姓名（可选）"],
  ["I found the services and professionals you can use for a received-payment draft. Confirm the service, professional, amount and payment method.", "J’ai trouvé les services et professionnels disponibles pour préparer l’enregistrement d’un paiement reçu. Confirmez le service, le professionnel, le montant et le mode de paiement.", "Encontré los servicios y profesionales disponibles para preparar el registro de un pago recibido. Confirma el servicio, el profesional, el importe y el método de pago.", "已找到可用于准备已收款记录的服务和专业人员。请确认服务、专业人员、金额和付款方式。"],
] as const;
export const ASSISTANT_MANUAL_SALE_SOURCE_MESSAGES: Record<string, Record<string, string>> = Object.fromEntries(["fr", "es", "zh-CN"].map((locale, index) => [locale, Object.fromEntries(rows.map(row => [row[0], row[index + 1]]))]));
export function manualSaleText(source: string, locale: string) { return ASSISTANT_MANUAL_SALE_SOURCE_MESSAGES[locale]?.[source] || source; }
