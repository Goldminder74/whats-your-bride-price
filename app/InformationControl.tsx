"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Native auto popover: keyboard activation, light dismissal and top-layer placement. */
export default function InformationControl({ title, children, topic }: { title: string; children: ReactNode; topic: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const toggled = () => setOpen(element.matches(":popover-open"));
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !element.matches(":popover-open")) return;
      event.preventDefault(); event.stopPropagation();
      element.hidePopover(); trigger.current?.focus();
    };
    element.addEventListener("toggle", toggled);
    document.addEventListener("keydown", escape, true);
    return () => { element.removeEventListener("toggle", toggled); document.removeEventListener("keydown", escape, true); };
  }, []);
  return <><span className="information-control">
    <button ref={trigger} className="information-trigger" type="button" popoverTarget={id}
      aria-label={`About ${title.toLowerCase()}`} aria-haspopup="dialog" aria-controls={id} aria-expanded={open}>
      <span aria-hidden="true">i</span>
    </button></span>
    <div ref={panel} id={id} popover="auto" className="information-panel" role="dialog" aria-labelledby={`${id}-title`}>
      <header><h2 id={`${id}-title`}>{title}</h2><button type="button" aria-label={`Close ${title.toLowerCase()} information`}
        onClick={() => { panel.current?.hidePopover(); trigger.current?.focus(); }}>×</button></header>
      <div>{children}</div>
      <Link href={`/faq#${topic}`}>Explore the FAQ</Link>
    </div>
  </>;
}
