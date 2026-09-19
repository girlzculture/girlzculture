const rows: readonly (readonly [string, string, string, string])[] = [
 ["Subscription payment method", "Moyen de paiement de l’abonnement", "Método de pago de la suscripción", "订阅付款方式"],
 ["Securely replace the method used for this subscription. This action does not create a purchase, upgrade or charge. Existing invoices and scheduled billing still apply.", "Remplacez en toute sécurité le moyen de paiement de cet abonnement. Cette action ne crée aucun achat, surclassement ni débit. Les factures existantes et les échéances restent applicables.", "Cambia de forma segura el método de pago de esta suscripción. Esta acción no crea una compra, mejora ni cargo. Las facturas existentes y la facturación programada siguen vigentes.", "安全更换此订阅的付款方式。此操作不会创建购买、升级或扣款。现有账单与预定计费仍然有效。"],
 ["Refresh payment status", "Actualiser le paiement", "Actualizar estado del pago", "刷新付款状态"],
 ["Checking secure payment settings…", "Vérification des paramètres de paiement…", "Verificando la configuración de pago…", "正在验证付款设置…"],
 ["Current subscription default", "Moyen par défaut de l’abonnement", "Método predeterminado actual", "当前订阅默认方式"],
 ["No saved default payment method.", "Aucun moyen de paiement par défaut enregistré.", "No hay un método de pago predeterminado guardado.", "尚未保存默认付款方式。"],
 ["Payment method details are currently unavailable.", "Les détails du moyen de paiement sont indisponibles.", "Los detalles del método de pago no están disponibles.", "付款方式详情暂不可用。"],
 ["A payment method update is in progress. You can resume it below.", "Une mise à jour est en cours. Vous pouvez la reprendre ci-dessous.", "Hay una actualización en curso. Puedes continuarla a continuación.", "付款方式更新正在进行，可在下方继续。"],
 ["Stripe test mode", "Mode test Stripe", "Modo de prueba de Stripe", "Stripe 测试模式"],
 ["Stripe returned an invalid payment settings link.", "Stripe a renvoyé un lien de paiement invalide.", "Stripe devolvió un enlace de pago no válido.", "Stripe 返回了无效的付款设置链接。"],
 ["The payment settings return link is invalid.", "Le lien de retour des paramètres de paiement est invalide.", "El enlace de regreso de los ajustes de pago no es válido.", "付款设置返回链接无效。"],
 ["Your subscription payment method was saved and verified.", "Le moyen de paiement de votre abonnement a été enregistré et vérifié.", "El método de pago de tu suscripción se guardó y verificó.", "订阅付款方式已保存并验证。"],
 ["The payment method update is still being verified. Refresh its status.", "La mise à jour est encore en cours de vérification. Actualisez son statut.", "La actualización del método de pago sigue en verificación. Actualiza su estado.", "付款方式更新仍在验证中，请刷新状态。"],
 ["Payment method update cancelled. Your existing method is unchanged.", "Mise à jour annulée. Votre moyen de paiement existant reste inchangé.", "Actualización cancelada. Tu método de pago existente no ha cambiado.", "更新已取消，原付款方式未改变。"],
 ["Stripe has already completed this update. Refresh its status.", "Stripe a déjà terminé cette mise à jour. Actualisez son statut.", "Stripe ya completó esta actualización. Actualiza su estado.", "Stripe 已完成此更新，请刷新状态。"],
 ["Payment settings could not be verified.", "Les paramètres de paiement n’ont pas pu être vérifiés.", "No se pudo verificar la configuración de pago.", "无法验证付款设置。"],
 ["A scheduled plan change requires billing support review before updating this payment method.", "Un changement de formule programmé nécessite une vérification par l’assistance facturation avant cette mise à jour.", "Un cambio de plan programado requiere una revisión de soporte de facturación antes de actualizar este método de pago.", "已安排套餐变更，更新付款方式前需由账单支持审核。"],
 ["Payment method update expired. Start a new update to change your method.", "La mise à jour du moyen de paiement a expiré. Commencez une nouvelle mise à jour pour le modifier.", "La actualización del método de pago ha caducado. Inicia una nueva actualización para cambiarlo.", "付款方式更新已过期，请重新开始更新以更改付款方式。"],
];
export const SUBSCRIPTION_PAYMENT_SOURCE_MESSAGES: Record<string, Record<string, string>> = Object.fromEntries(
 ["fr", "es", "zh-CN"].map((locale, index) => [locale, Object.fromEntries(rows.map(row => [row[0], row[index + 1]]))]),
);
