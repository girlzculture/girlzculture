"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, PackageCheck, Plus } from "lucide-react";

type Props = {
  salonSlug: string;
  productId: string;
  promotionId?: string | null;
  maxQuantity: number;
  availableQuantity: number | null;
  pickupEnabled: boolean;
};

export default function ProductPurchaseActions(props: Props) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
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

  if (!props.pickupEnabled) {
    return (
      <p className="mt-7 rounded-xl border border-mist bg-light-gray p-4 text-sm font-semibold text-charcoal">
        This product is available to view, but the salon has not enabled
        online pickup reservations.
      </p>
    );
  }

  return (
    <div className="mt-7">
      <div className="flex items-center justify-between rounded-xl border border-mist p-2">
        <span className="pl-2 text-xs font-bold text-charcoal">Quantity</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            className="grid h-10 w-10 place-items-center rounded-lg border border-mist text-charcoal"
          >
            <Minus size={15} />
          </button>
          <b className="min-w-5 text-center text-charcoal">{quantity}</b>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() =>
              setQuantity((value) => Math.min(maximum, value + 1))
            }
            className="grid h-10 w-10 place-items-center rounded-lg border border-mist text-charcoal"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-charcoal/60">
        {soldOut
          ? "Out of stock"
          : props.availableQuantity !== null
            ? `${props.availableQuantity} currently available`
            : "Availability is confirmed before payment."}
      </p>
      <button
        type="button"
        disabled={soldOut}
        onClick={() =>
          router.push(
            `/salon/${props.salonSlug}/reserve/${props.productId}?quantity=${quantity}${props.promotionId ? `&promotion=${encodeURIComponent(props.promotionId)}` : ""}`,
          )
        }
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-6 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed gc-disabled-control"
      >
        <PackageCheck size={18} />
        Reserve for Pickup
      </button>
      <p className="mt-3 text-xs leading-5 text-charcoal/60">
        Pay a small deposit now. The remaining balance is paid directly to
        the salon when you collect the product.
      </p>
    </div>
  );
}
