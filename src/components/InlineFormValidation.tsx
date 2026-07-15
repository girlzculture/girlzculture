"use client";

import { useEffect } from "react";

type ValidatedControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function validationMessage(control: ValidatedControl) {
  if (control.validity.valueMissing) return control.type === "checkbox" || control.type === "radio" ? "This confirmation is required" : "This field is required";
  if (control.validity.typeMismatch || control.validity.patternMismatch) return "Enter a valid value";
  if (control.validity.tooShort && "minLength" in control) return `Enter at least ${control.minLength} characters`;
  if (control.validity.tooLong && "maxLength" in control) return `Use no more than ${control.maxLength} characters`;
  if (control.validity.rangeUnderflow && "min" in control) return `Enter ${control.min} or more`;
  if (control.validity.rangeOverflow && "max" in control) return `Enter ${control.max} or less`;
  return "Check this field and try again";
}

function errorElement(control: ValidatedControl) {
  if (!control.id) control.id = `field-${crypto.randomUUID()}`;
  const id = `${control.id}-inline-error`;
  let error = document.getElementById(id);
  if (!error) {
    error = document.createElement("span");
    error.id = id;
    error.dataset.inlineValidation = "true";
    error.className = "mt-1 block text-xs font-semibold text-red-700";
    const label = control.closest("label");
    if (label) label.insertAdjacentElement("afterend", error); else control.insertAdjacentElement("afterend", error);
  }
  control.setAttribute("aria-describedby", id);
  return error;
}

export default function InlineFormValidation() {
  useEffect(() => {
    function show(event: Event) {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
      if (control.type === "hidden" || control.closest("[hidden], .hidden")) return;
      control.setAttribute("aria-invalid", "true");
      control.classList.add("!border-red-500");
      errorElement(control).textContent = validationMessage(control);
    }
    function clear(event: Event) {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.validity.valid) return;
      control.removeAttribute("aria-invalid");
      control.classList.remove("!border-red-500");
      const error = control.id ? document.getElementById(`${control.id}-inline-error`) : null;
      error?.remove();
      control.removeAttribute("aria-describedby");
    }
    document.addEventListener("invalid", show, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => {
      document.removeEventListener("invalid", show, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("change", clear, true);
    };
  }, []);
  return null;
}
