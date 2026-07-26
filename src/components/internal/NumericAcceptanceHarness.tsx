"use client";

import { FormEvent, useState } from "react";
import NumericInput from "@/components/forms/NumericInput";
import { parseNumericDraft } from "@/lib/numericInput";

export default function NumericAcceptanceHarness() {
  const [integer, setInteger] = useState("12345");
  const [decimal, setDecimal] = useState("10.50");
  const [message, setMessage] = useState("");

  function validate(event: FormEvent) {
    event.preventDefault();
    try {
      parseNumericDraft(integer, {
        label: "Quantity",
        minimum: 1,
        maximum: 100,
        integer: true,
      });
      parseNumericDraft(decimal, {
        label: "Price",
        minimum: 0,
        maximum: 1000,
      });
      setMessage("Valid");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl bg-white p-8 text-charcoal">
      <h1 className="font-serif text-3xl">Numeric keyboard acceptance</h1>
      <form onSubmit={validate} className="mt-6 space-y-5">
        <label className="block text-sm font-bold">
          Quantity
          <NumericInput
            aria-label="Quantity"
            integer
            min={1}
            max={100}
            value={integer}
            onValueChange={setInteger}
            className="mt-2 min-h-12 w-full rounded-lg border border-mist px-4"
          />
        </label>
        <label className="block text-sm font-bold">
          Price
          <NumericInput
            aria-label="Price"
            min={0}
            max={1000}
            decimalPlaces={2}
            value={decimal}
            onValueChange={setDecimal}
            className="mt-2 min-h-12 w-full rounded-lg border border-mist px-4"
          />
        </label>
        <button className="min-h-12 w-full rounded-lg bg-teal font-bold text-white">
          Validate
        </button>
        <p role="status">{message}</p>
      </form>
    </main>
  );
}
