"use client";

import { useEffect } from "react";

function isComposing(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229;
}

export default function NativeSearchKeyboardBridge() {
  useEffect(() => {
    function submitFromKeyboard(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        isComposing(event) ||
        (event.key !== "Enter" && event.code !== "NumpadEnter")
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const form = target.form;
      if (!form) return;
      const searchIntent =
        form.getAttribute("role") === "search" ||
        target.enterKeyHint === "search" ||
        target.type === "search";
      if (!searchIntent) return;
      event.preventDefault();
      form.requestSubmit();
    }

    document.addEventListener("keydown", submitFromKeyboard);
    return () => document.removeEventListener("keydown", submitFromKeyboard);
  }, []);

  return null;
}
