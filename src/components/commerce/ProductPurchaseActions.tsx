"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { addProductToCart } from "@/lib/productCart";

type Props = {
  salonId: string;
  salonSlug: string;
  salonName: string;
  productId: string;
  productName: string;
  imageUrl?: string | null;
  unitPrice: number;
  promotionId?: string | null;
  promotionLabel?: string | null;
  estimatedUnitPrice?: number | null;
  maxQuantity: number;
  availableQuantity: number | null;
  pickupEnabled: boolean;
  shippingEnabled: boolean;
};

export default function ProductPurchaseActions(props: Props) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const soldOut =
    props.availableQuantity !== null && props.availableQuantity < 1;
  const maximum = Math.max(
    1,
    Math.min(
      props.maxQuantity,
      props.availableQuantity === null
        ? props.maxQuantity
        : props.availableQuantity,
    ),
  );

  function add(goToCheckout: boolean) {
    setMessage("");
    const result = addProductToCart(
      {
        salonId: props.salonId,
        salonSlug: props.salonSlug,
        salonName: props.salonName,
        productId: props.productId,
        name: props.productName,
        imageUrl: props.imageUrl,
        unitPrice: props.unitPrice,
        promotionId: props.promotionId,
        promotionLabel: props.promotionLabel,
        estimatedUnitPrice: props.estimatedUnitPrice,
      },
      quantity,
    );
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (goToCheckout) {
      router.push(`/salon/${props.salonSlug}/checkout`);
      return;
    }
    setMessage("Added to your cart.");
  }

  if (!props.pickupEnabled && !props.shippingEnabled) {
    return (
      <p className="mt-7 rounded-[13px] border border-amber/30 bg-[#fff7e9] p-4 text-[12px] font-semibold text-ink">
        This product is currently available to view, but the salon has not
        enabled online pickup or shipping.
      </p>
    );
  }

  return (
    <div className="mt-7">
      <div className="flex items-center justify-between rounded-[11px] border border-plum/15 p-2">
        <span className="pl-2 text-xs font-bold">Quantity</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            className="grid h-9 w-9 place-items-center rounded-lg border border-plum/15"
          >
            <Minus size={15} />
          </button>
          <b className="min-w-5 text-center">{quantity}</b>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() =>
              setQuantity((value) => Math.min(maximum, value + 1))
            }
            className="grid h-9 w-9 place-items-center rounded-lg border border-plum/15"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      {props.availableQuantity !== null ? (
        <p className="mt-2 text-[11px] text-ink/55">
          {soldOut
            ? "Out of stock"
            : `${props.availableQuantity} currently available`}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-ink/55">
          Availability is confirmed during checkout.
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={soldOut}
          onClick={() => add(false)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-magenta px-6 text-[13px] font-bold text-magenta disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ShoppingBag size={17} />
          Add to Cart
        </button>
        <button
          type="button"
          disabled={soldOut}
          onClick={() => add(true)}
          className="min-h-12 rounded-[10px] bg-magenta px-6 text-[13px] font-bold text-white shadow-[0_10px_28px_rgba(214,24,107,0.2)] hover:bg-[#bb145d] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Buy Now
        </button>
      </div>
      {message ? (
        <p
          role="status"
          className={`mt-3 rounded-lg p-3 text-xs ${message.startsWith("Added") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
