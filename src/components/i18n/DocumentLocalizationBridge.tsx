"use client";

import { useLayoutEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"]);
const ATTRIBUTES = ["placeholder", "aria-label", "title"] as const;
type TranslationState = { original: string; rendered: string };

export default function DocumentLocalizationBridge() {
  const { locale, translateSource } = useI18n();
  const textStates = useRef(new WeakMap<Text, TranslationState>());
  const attributeStates = useRef(
    new WeakMap<Element, Map<string, TranslationState>>(),
  );

  // Register/update the observer in the commit phase. A passive effect can run
  // after the first paint of the translated React headings, leaving newly
  // mounted legacy panels under the old locale (or with no observer) for a frame.
  useLayoutEffect(() => {
    function excluded(element: Element | null) {
      return (
        !element ||
        SKIP_TAGS.has(element.tagName) ||
        Boolean(
          element.closest(
            '[data-no-translate],[translate="no"],[contenteditable="true"]',
          ),
        )
      );
    }

    function translateText(node: Text) {
      if (excluded(node.parentElement)) return;
      // Textarea child text is its original/default value, not interface copy.
      if (node.parentElement?.closest("textarea, input")) return;
      const current = node.nodeValue || "";
      let state = textStates.current.get(node);
      if (!state || current !== state.rendered) {
        state = { original: current, rendered: current };
      }
      const leading = state.original.match(/^\s*/)?.[0] || "";
      const trailing = state.original.match(/\s*$/)?.[0] || "";
      const core = state.original.trim().replace(/\s+/g, " ");
      if (!core) return;
      const translated = locale === "en" ? core : translateSource(core);
      const next = `${leading}${translated}${trailing}`;
      state.rendered = next;
      textStates.current.set(node, state);
      if (current !== next) node.nodeValue = next;
    }

    function translateElement(element: Element) {
      if (excluded(element)) return;
      let states = attributeStates.current.get(element);
      if (!states) {
        states = new Map();
        attributeStates.current.set(element, states);
      }
      for (const attribute of ATTRIBUTES) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        let state = states.get(attribute);
        if (!state || current !== state.rendered) {
          state = { original: current, rendered: current };
        }
        const translated =
          locale === "en" ? state.original : translateSource(state.original);
        state.rendered = translated;
        states.set(attribute, state);
        if (current !== translated) element.setAttribute(attribute, translated);
      }
    }

    function scan(root: Node) {
      if (root.nodeType === Node.TEXT_NODE) translateText(root as Text);
      else if (
        root.nodeType === Node.ELEMENT_NODE ||
        root.nodeType === Node.DOCUMENT_NODE
      ) {
        if (root.nodeType === Node.ELEMENT_NODE)
          translateElement(root as Element);
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        );
        let node = walker.nextNode();
        while (node) {
          if (node.nodeType === Node.TEXT_NODE) translateText(node as Text);
          else translateElement(node as Element);
          node = walker.nextNode();
        }
      }
    }

    scan(document.body);
    // Native browser validation follows the browser's own UI language, which
    // can differ from an owner's account language. Keep the validity rules and
    // localize their presentation only within the owner workspace.
    const validationMessages = new Map<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, string>();
    function invalid(event: Event) {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || !field.closest('[data-owner-workspace]')) return;
      const validity = field.validity;
      const source = validationMessages.get(field) || (validity.customError ? field.validationMessage : "");
      validationMessages.set(field, source);
      const message = source || (validity.valueMissing ? "Complete this required field." : validity.typeMismatch ? "Enter a valid email address or URL." : validity.rangeOverflow || validity.rangeUnderflow ? "Enter a value within the allowed range." : validity.stepMismatch || validity.badInput ? "Enter a valid number." : validity.tooLong || validity.tooShort ? "Check the length of this entry." : "Use the required format for this field.");
      field.setCustomValidity(translateSource(message));
    }
    function clearValidation(event: Event) {
      const field = event.target as HTMLInputElement;
      if (!validationMessages.has(field)) return;
      field.setCustomValidity(""); validationMessages.delete(field);
    }
    document.body.addEventListener("invalid", invalid, true);
    document.body.addEventListener("input", clearValidation, true);
    document.body.addEventListener("change", clearValidation, true);
    // Translate each committed subtree in the mutation microtask, before paint.
    // Deferring a whole-document scan to requestAnimationFrame left newly loaded
    // legacy panels in English for a frame; later mutations could postpone it
    // again. Our own writes settle because translations only write changed values.
    const observer = new MutationObserver((records) => {
      const roots = new Set<Node>();
      for (const record of records) {
        if (record.type === "childList") {
          for (const node of record.addedNodes) roots.add(node);
        } else roots.add(record.target);
      }
      for (const root of roots) if (root.isConnected) {
        if (root.nodeType === Node.ELEMENT_NODE && records.some(record => record.type === "attributes" && record.target === root)) translateElement(root as Element);
        else scan(root);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTES],
    });
    return () => {
      document.body.removeEventListener("invalid", invalid, true);
      document.body.removeEventListener("input", clearValidation, true);
      document.body.removeEventListener("change", clearValidation, true);
      for (const [field, original] of validationMessages) field.setCustomValidity(original);
      observer.disconnect();
    };
  }, [locale, translateSource]);

  return null;
}
