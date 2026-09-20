export const BUSINESS_PRICE_CONTEXT_COPY_ROWS = [
 ["U.S. personal-care price context", "Évolution des prix des soins personnels aux États-Unis", "Evolución de precios del cuidado personal en EE. UU.", "美国个人护理价格背景"],
 ["National statistical reference only. This is not a local service price, a recommended price or a measure of your profit.", "Référence statistique nationale uniquement. Ce n’est ni un prix local de prestation, ni un prix conseillé, ni une mesure de votre bénéfice.", "Solo es una referencia estadística nacional. No es un precio local de un servicio, un precio recomendado ni una medida de tus ganancias.", "仅为全国统计参考，并非本地服务价格、建议定价或您的利润指标。"],
 ["U.S. city average · all urban consumers (CPI-U) · personal-care services", "Moyenne des villes américaines · ensemble des consommateurs urbains (CPI-U) · services de soins personnels", "Promedio de ciudades de EE. UU. · todos los consumidores urbanos (CPI-U) · servicios de cuidado personal", "美国城市平均值 · 所有城市消费者（CPI-U）· 个人护理服务"],
 ["Monthly index · not seasonally adjusted · 1982–1984 = 100", "Indice mensuel · non corrigé des variations saisonnières · 1982–1984 = 100", "Índice mensual · sin ajuste estacional · 1982–1984 = 100", "月度指数 · 未经季节性调整 · 1982–1984年 = 100"],
 ["Verified reference data is unavailable. No benchmark or estimated service price is shown.", "Les données de référence vérifiées sont indisponibles. Aucun indice de comparaison ni prix de prestation estimé n’est affiché.", "No hay datos de referencia verificados disponibles. No se muestra ningún indicador comparativo ni precio estimado de servicio.", "经核实的参考数据暂不可用。不显示基准值或估算服务价格。"],
 ["The saved reference is out of date. A current comparison is unavailable until the source is verified again.", "La référence enregistrée est ancienne. Une comparaison actuelle sera disponible après une nouvelle vérification de la source.", "La referencia guardada está desactualizada. No hay comparación actual hasta volver a verificar la fuente.", "已保存的参考数据已过期。重新核实来源前，无法提供当前比较。"],
 ["Official index for {month}: {value} index points", "Indice officiel pour {month} : {value} points", "Índice oficial de {month}: {value} puntos", "{month}官方指数：{value}点"],
 ["Calculated change from {from} to {to}: {value}%", "Variation calculée de {from} à {to} : {value} %", "Variación calculada de {from} a {to}: {value}%", "{from}至{to}的计算变动：{value}%"],
 ["The matching month one year earlier is missing. A 12-month change cannot be calculated.", "Le mois correspondant de l’année précédente est absent. La variation sur 12 mois ne peut pas être calculée.", "Falta el mismo mes del año anterior. No se puede calcular la variación de 12 meses.", "缺少上年同月数据，无法计算12个月变动。"],
 ["Source data is unavailable for {month}; no value is estimated.", "Les données de la source sont indisponibles pour {month} ; aucune valeur n’est estimée.", "No hay datos de la fuente para {month}; no se estima ningún valor.", "来源未提供{month}的数据；不估算缺失值。"],
 ["These published months are separate from your selected finance period and your recorded dollar prices.", "Ces mois publiés sont distincts de la période financière sélectionnée et de vos prix enregistrés en dollars.", "Estos meses publicados son independientes del período financiero seleccionado y de tus precios registrados en dólares.", "这些已发布月份与您选择的财务期间及已记录的美元价格分开显示。"],
 ["The BLS uses a weighted sample of areas, outlets and items. The number of observations for this category is not published in this series.", "Le BLS utilise un échantillon pondéré de zones, de points de vente et d’articles. Le nombre d’observations de cette catégorie n’est pas publié dans cette série.", "El BLS usa una muestra ponderada de zonas, establecimientos y artículos. Esta serie no publica el número de observaciones de esta categoría.", "BLS使用地区、经营场所和商品服务的加权样本。本系列不公布该类别的样本观测数量。"],
 ["Source: U.S. Bureau of Labor Statistics", "Source : Bureau des statistiques du travail des États-Unis", "Fuente: Oficina de Estadísticas Laborales de EE. UU.", "来源：美国劳工统计局"],
 ["Official series details", "Détails officiels de la série", "Detalles oficiales de la serie", "官方系列详情"],
 ["Sampling methodology", "Méthode d’échantillonnage", "Metodología de muestreo", "抽样方法"],
 ["Verified retrieval: {date}", "Récupération vérifiée : {date}", "Consulta verificada: {date}", "经核实的获取时间：{date}"],
 ["The source response does not provide a release timestamp. The retrieval date is not the publication date.", "La réponse de la source ne fournit pas d’horodatage de publication. La date de récupération n’est pas la date de publication.", "La respuesta de la fuente no incluye una fecha y hora de publicación. La fecha de consulta no es la fecha de publicación.", "来源响应不提供发布时间。获取日期并非发布日期。"],
] as const;
type Source = typeof BUSINESS_PRICE_CONTEXT_COPY_ROWS[number][0];
export function businessPriceContextCopy(locale: string, source: Source, values: Record<string, string> = {}) {
 const row = BUSINESS_PRICE_CONTEXT_COPY_ROWS.find(item => item[0] === source)!;
 let result: string = row[locale === "fr" ? 1 : locale === "es" ? 2 : locale === "zh-CN" ? 3 : 0];
 for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, value);
 return result;
}
