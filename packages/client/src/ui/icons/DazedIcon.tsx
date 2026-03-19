import type { ReactNode } from "react";

export const DazedIcon = ({ className = "h-6 w-6" }: { className?: string }): ReactNode => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Dizzy stars circling around */}
    <path d="M12 3l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L9 5.5 11 5z" />
    <path d="M18 8l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L15 10.5 17 10z" opacity="0.7" />
    <path d="M6 8l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L3 10.5 5 10z" opacity="0.7" />
    {/* Dazed face */}
    <circle cx="12" cy="17" r="4" />
    <path d="M10 16.5l1 1-1 1M14 16.5l-1 1 1 1" strokeWidth="1.5" />
  </svg>
);
