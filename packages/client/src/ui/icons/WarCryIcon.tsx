import type { ReactNode } from "react";
export const WarCryIcon = ({ className = "h-6 w-6" }: { className?: string }): ReactNode => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Shouting mouth / horn */}
    <path d="M4 9v6l4 2V7L4 9z" />
    <path d="M8 7l6-3v16l-6-3" />
    {/* Sound waves */}
    <path d="M17 8a4 4 0 010 8" />
    <path d="M20 5a8 8 0 010 14" />
  </svg>
);
