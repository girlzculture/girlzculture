const rows=[
 [
  "review",
  "Review catalog changes",
  "Vérifier les modifications du catalogue",
  "Revisar cambios del catálogo",
  "审核目录更改"
 ],
 [
  "name",
  "Name",
  "Nom",
  "Nombre",
  "名称"
 ],
 [
  "description",
  "Description",
  "Description",
  "Descripción",
  "描述"
 ],
 [
  "base_price",
  "Base price",
  "Prix de base",
  "Precio base",
  "基础价格"
 ],
 [
  "price_display_min",
  "Minimum displayed price",
  "Prix affiché minimum",
  "Precio mínimo mostrado",
  "展示最低价"
 ],
 [
  "price_display_max",
  "Maximum displayed price",
  "Prix affiché maximum",
  "Precio máximo mostrado",
  "展示最高价"
 ],
 [
  "duration_min_hours",
  "Minimum duration (hours)",
  "Durée minimum (heures)",
  "Duración mínima (horas)",
  "最短时长（小时）"
 ],
 [
  "duration_max_hours",
  "Maximum duration (hours)",
  "Durée maximum (heures)",
  "Duración máxima (horas)",
  "最长时长（小时）"
 ],
 [
  "buffer_minutes",
  "Cleanup time (minutes)",
  "Temps de nettoyage (minutes)",
  "Tiempo de limpieza (minutos)",
  "清洁时间（分钟）"
 ],
 [
  "is_draft",
  "Keep as draft",
  "Conserver en brouillon",
  "Mantener como borrador",
  "保留为草稿"
 ],
 [
  "is_featured",
  "Featured",
  "Mis en avant",
  "Destacado",
  "精选"
 ],
 [
  "bio",
  "Biography",
  "Biographie",
  "Biografía",
  "简介"
 ],
 [
  "specialties",
  "Specialties",
  "Spécialités",
  "Especialidades",
  "专长"
 ],
 [
  "years_experience",
  "Years of experience",
  "Années d’expérience",
  "Años de experiencia",
  "从业年数"
 ],
 [
  "assigned_service_ids",
  "Assigned services",
  "Prestations attribuées",
  "Servicios asignados",
  "分配的服务"
 ],
 [
  "price",
  "Price",
  "Prix",
  "Precio",
  "价格"
 ],
 [
  "sale_price",
  "Sale price",
  "Prix promotionnel",
  "Precio de oferta",
  "促销价"
 ],
 [
  "sku",
  "SKU",
  "Référence SKU",
  "SKU",
  "SKU"
 ],
 [
  "is_visible",
  "Visible to customers",
  "Visible par les clients",
  "Visible para clientes",
  "向客户展示"
 ],
 [
  "in_person_only",
  "In-person only",
  "Sur place uniquement",
  "Solo presencial",
  "仅限到店"
 ],
 [
  "product_status",
  "Product status",
  "Statut du produit",
  "Estado del producto",
  "商品状态"
 ],
 [
  "pickup_enabled",
  "Pickup enabled",
  "Retrait activé",
  "Recogida activada",
  "允许自取"
 ],
 [
  "pickup_prep_minutes",
  "Pickup preparation (minutes)",
  "Préparation du retrait (minutes)",
  "Preparación para recogida (minutos)",
  "自取备货时间（分钟）"
 ],
 [
  "shipping_enabled",
  "Shipping enabled",
  "Expédition activée",
  "Envío activado",
  "允许配送"
 ],
 [
  "shipping_price",
  "Shipping price",
  "Prix d’expédition",
  "Precio de envío",
  "配送价格"
 ],
 [
  "shipping_profile",
  "Shipping profile",
  "Profil d’expédition",
  "Perfil de envío",
  "配送档案"
 ],
 [
  "weight_ounces",
  "Weight (ounces)",
  "Poids (onces)",
  "Peso (onzas)",
  "重量（盎司）"
 ],
 [
  "max_quantity_per_order",
  "Maximum per order",
  "Maximum par commande",
  "Máximo por pedido",
  "每单最高数量"
 ],
 [
  "title",
  "Title",
  "Titre",
  "Título",
  "标题"
 ],
 [
  "public_headline",
  "Public headline",
  "Titre public",
  "Título público",
  "公开标题"
 ],
 [
  "promotion_type",
  "Offer type",
  "Type d’offre",
  "Tipo de oferta",
  "优惠类型"
 ],
 [
  "discount_value",
  "Discount value",
  "Valeur de réduction",
  "Valor del descuento",
  "折扣值"
 ],
 [
  "discount_label",
  "Discount label",
  "Libellé de réduction",
  "Etiqueta de descuento",
  "折扣标签"
 ],
 [
  "starts_at",
  "Starts",
  "Début",
  "Inicio",
  "开始"
 ],
 [
  "ends_at",
  "Ends",
  "Fin",
  "Fin",
  "结束"
 ],
 [
  "timezone",
  "Time zone",
  "Fuseau horaire",
  "Zona horaria",
  "时区"
 ],
 [
  "status",
  "Status",
  "Statut",
  "Estado",
  "状态"
 ],
 [
  "target_scope",
  "Eligible items",
  "Éléments concernés",
  "Elementos elegibles",
  "适用项目"
 ],
 [
  "target_ids",
  "Selected items",
  "Éléments sélectionnés",
  "Elementos seleccionados",
  "选定项目"
 ],
 [
  "yes",
  "Yes",
  "Oui",
  "Sí",
  "是"
 ],
 [
  "no",
  "No",
  "Non",
  "No",
  "否"
 ],
 [
  "unset",
  "Not set",
  "Non défini",
  "Sin configurar",
  "未设置"
 ],
 [
  "all",
  "All services",
  "Toutes les prestations",
  "Todos los servicios",
  "全部服务"
 ],
 [
  "none",
  "No services",
  "Aucune prestation",
  "Ningún servicio",
  "无服务"
 ],
 [
  "Draft",
  "Draft",
  "Brouillon",
  "Borrador",
  "草稿"
 ],
 [
  "Active",
  "Active",
  "Actif",
  "Activo",
  "启用"
 ],
 [
  "Archived",
  "Archived",
  "Archivé",
  "Archivado",
  "已归档"
 ],
 [
  "Paused",
  "Paused",
  "En pause",
  "Pausado",
  "已暂停"
 ],
 [
  "percentage",
  "Percentage",
  "Pourcentage",
  "Porcentaje",
  "百分比"
 ],
 [
  "fixed",
  "Fixed amount",
  "Montant fixe",
  "Importe fijo",
  "固定金额"
 ],
 [
  "descriptive",
  "Description only",
  "Description uniquement",
  "Solo descripción",
  "仅描述"
 ],
 [
  "salon",
  "Whole business",
  "Toute l’entreprise",
  "Todo el negocio",
  "整个商家"
 ],
 [
  "services",
  "Services",
  "Prestations",
  "Servicios",
  "服务"
 ],
 [
  "products",
  "Products",
  "Produits",
  "Productos",
  "商品"
 ]
,
["size_options", "Sizes", "Tailles", "Tamaños", "尺寸"],
["length_options", "Lengths", "Longueurs", "Largos", "长度"],
["addons", "Add-ons", "Suppléments", "Complementos", "附加项目"],
["included_items", "Included items", "Éléments inclus", "Elementos incluidos", "包含项目"],
["style_materials", "Materials", "Matériaux", "Materiales", "材料"],
["label", "Label", "Libellé", "Etiqueta", "名称"],
["price_add", "Additional price", "Prix supplémentaire", "Precio adicional", "附加价格"],
["longevity_weeks", "Longevity (weeks)", "Durée (semaines)", "Duración (semanas)", "维持时间（周）"],
["quality_grade", "Quality", "Qualité", "Calidad", "品质"],
["empty", "None", "Aucun", "Ninguno", "无"]
] as const;
export function assistantCatalogCopy(locale:string){const column=locale==="fr"?2:locale==="es"?3:locale==="zh-CN"?4:1;return Object.fromEntries(rows.map(row=>[row[0],row[column]])) as Record<string,string>;}
