import type { ReactNode } from "react";
export const BackpackIcon = ({ className = "h-4 w-4" }: { className?: string }): ReactNode => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Bag body */}
    <path d="M5 10v8a2 2 0 002 2h10a2 2 0 002-2v-8" />
    {/* Bag top flap */}
    <path d="M3 10h18l-1-4H4L3 10z" />
    {/* Handle/straps */}
    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    {/* Pocket */}
    <rect x="9" y="13" width="6" height="4" rx="0.5" />
  </svg>
);
