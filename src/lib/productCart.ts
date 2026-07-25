export type ProductCartItem = {
  salonId: string;
  salonSlug: string;
  salonName: string;
  productId: string;
  name: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  promotionId?: string | null;
  promotionLabel?: string | null;
  estimatedUnitPrice?: number | null;
};

export type ProductCart = {
  salonId: string;
  salonSlug: string;
  salonName: string;
  items: ProductCartItem[];
  promotionId?: string | null;
  promotionLabel?: string | null;
  fulfillmentMethod?: "Pickup" | "Shipping";
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  updatedAt: string;
};

const CART_KEY = "girlz-culture-product-cart-v1";
export const PRODUCT_CART_EVENT = "girlz-culture-cart-updated";

function safeCart(value: unknown): ProductCart | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ProductCart>;
  if (
    !raw.salonId ||
    !raw.salonSlug ||
    !raw.salonName ||
    !Array.isArray(raw.items)
  )
    return null;
  const items = raw.items
    .map((item) => ({
      salonId: String(item?.salonId || ""),
      salonSlug: String(item?.salonSlug || ""),
      salonName: String(item?.salonName || ""),
      productId: String(item?.productId || ""),
      name: String(item?.name || ""),
      imageUrl: item?.imageUrl ? String(item.imageUrl) : null,
      unitPrice: Number(item?.unitPrice || 0),
      quantity: Math.max(1, Math.min(1000, Math.floor(Number(item?.quantity || 1)))),
      promotionId: item?.promotionId ? String(item.promotionId) : null,
      promotionLabel: item?.promotionLabel
        ? String(item.promotionLabel)
        : null,
      estimatedUnitPrice:
        item?.estimatedUnitPrice === null ||
        item?.estimatedUnitPrice === undefined
          ? null
          : Number(item.estimatedUnitPrice),
    }))
    .filter(
      (item) =>
        item.salonId === raw.salonId &&
        item.productId &&
        item.name &&
        Number.isFinite(item.unitPrice),
    );
  return {
    salonId: String(raw.salonId),
    salonSlug: String(raw.salonSlug),
    salonName: String(raw.salonName),
    items,
    promotionId: raw.promotionId ? String(raw.promotionId) : null,
    promotionLabel: raw.promotionLabel
      ? String(raw.promotionLabel)
      : null,
    fulfillmentMethod:
      raw.fulfillmentMethod === "Shipping" ? "Shipping" : "Pickup",
    shippingAddress:
      raw.shippingAddress && typeof raw.shippingAddress === "object"
        ? {
            line1: String(raw.shippingAddress.line1 || ""),
            line2: String(raw.shippingAddress.line2 || ""),
            city: String(raw.shippingAddress.city || ""),
            state: String(raw.shippingAddress.state || ""),
            postal_code: String(raw.shippingAddress.postal_code || ""),
          }
        : undefined,
    updatedAt: String(raw.updatedAt || new Date(0).toISOString()),
  };
}

export function readProductCart(): ProductCart | null {
  if (typeof window === "undefined") return null;
  try {
    return safeCart(JSON.parse(window.localStorage.getItem(CART_KEY) || "null"));
  } catch {
    return null;
  }
}

export function writeProductCart(cart: ProductCart | null) {
  if (typeof window === "undefined") return;
  if (cart?.items.length) {
    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({ ...cart, updatedAt: new Date().toISOString() }),
    );
  } else {
    window.localStorage.removeItem(CART_KEY);
  }
  window.dispatchEvent(new CustomEvent(PRODUCT_CART_EVENT));
}

export function addProductToCart(
  item: Omit<ProductCartItem, "quantity">,
  quantity: number,
) {
  const current = readProductCart();
  if (current && current.salonId !== item.salonId) {
    return {
      ok: false as const,
      error:
        "Your cart contains products from another salon. Complete or clear that cart first.",
    };
  }
  const safeQuantity = Math.max(1, Math.min(1000, Math.floor(quantity)));
  const items = [...(current?.items || [])];
  const existing = items.find((entry) => entry.productId === item.productId);
  if (existing) existing.quantity = Math.min(1000, existing.quantity + safeQuantity);
  else items.push({ ...item, quantity: safeQuantity });
  const cart: ProductCart = {
    salonId: item.salonId,
    salonSlug: item.salonSlug,
    salonName: item.salonName,
    items,
    promotionId:
      current?.promotionId || item.promotionId || null,
    promotionLabel:
      current?.promotionLabel || item.promotionLabel || null,
    fulfillmentMethod: current?.fulfillmentMethod || "Pickup",
    shippingAddress: current?.shippingAddress,
    updatedAt: new Date().toISOString(),
  };
  writeProductCart(cart);
  return { ok: true as const, cart };
}

export function updateProductCartQuantity(productId: string, quantity: number) {
  const current = readProductCart();
  if (!current) return null;
  const items =
    quantity <= 0
      ? current.items.filter((item) => item.productId !== productId)
      : current.items.map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(1, Math.min(1000, Math.floor(quantity))) }
            : item,
        );
  const next = items.length ? { ...current, items } : null;
  writeProductCart(next);
  return next;
}

export function clearProductCart() {
  writeProductCart(null);
}
