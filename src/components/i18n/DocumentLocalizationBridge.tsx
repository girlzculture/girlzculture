"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    let frame = 0;

    function excluded(element: Element | null) {
      return (
        !element ||
        SKIP_TAGS.has(element.tagName) ||
        Boolean(
          element.closest(
            '[data-no-translate="true"],[translate="no"],[contenteditable="true"]',
          ),
        )
      );
    }

    function translateText(node: Text) {
      if (excluded(node.parentElement)) return;
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

    function schedule() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => scan(document.body));
    }

    scan(document.body);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTES],
    });
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [locale, translateSource]);

  return null;
}
