/** Four-language marketing copy. Placeholders contain only scoped business facts. */
export const BUSINESS_MARKETING_DRAFT_MESSAGES = {
  en: {
    service: "{service} at {business}.",
    portfolio: "Explore the portfolio at {business}.",
    price: "Service price: {price}. Final options and price are confirmed before booking.",
    discount: "Offer: up to {offer} off eligible services. The required deposit stays unchanged. Eligibility and offer terms apply.",
    offer: "An eligible service offer is available. The required deposit stays unchanged. Review its terms before booking.",
    cta: "View services and book through our business page.",
  },
  fr: {
    service: "{service} chez {business}.",
    portfolio: "Découvrez le portfolio de {business}.",
    price: "Prix du service : {price}. Les options et le prix final sont confirmés avant la réservation.",
    discount: "Offre : jusqu’à {offer} de réduction sur les services admissibles. L’acompte requis reste inchangé. Les conditions de l’offre s’appliquent.",
    offer: "Une offre est disponible pour les services admissibles. L’acompte requis reste inchangé. Consultez les conditions avant de réserver.",
    cta: "Consultez nos services et réservez sur notre page professionnelle.",
  },
  es: {
    service: "{service} en {business}.",
    portfolio: "Descubre el portafolio de {business}.",
    price: "Precio del servicio: {price}. Las opciones y el precio final se confirman antes de reservar.",
    discount: "Oferta: hasta {offer} de descuento en servicios elegibles. El depósito requerido no cambia. Se aplican las condiciones de la oferta.",
    offer: "Hay una oferta para servicios elegibles. El depósito requerido no cambia. Revisa las condiciones antes de reservar.",
    cta: "Consulta los servicios y reserva en nuestra página del negocio.",
  },
  "zh-CN": {
    service: "{business} 的 {service}。",
    portfolio: "查看 {business} 的作品集。",
    price: "服务价格：{price}。选项及最终价格将在预约前确认。",
    discount: "优惠：符合条件的服务最多可减免 {offer}。所需定金保持不变。须符合优惠条件。",
    offer: "符合条件的服务可享优惠。所需定金保持不变。预约前请查看优惠条款。",
    cta: "查看服务并通过商家页面预约。",
  },
} as const;
