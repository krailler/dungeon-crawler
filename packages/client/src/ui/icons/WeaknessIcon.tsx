import type { ReactNode } from "react";
export const WeaknessIcon = ({ className = "h-6 w-6" }: { className?: string }): ReactNode => (
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
    {/* Broken sword blade */}
    <path d="M14.5 17.5L3 6V3h3l6.5 6.5" />
    <path d="M12 12l-2 2" />
    {/* Down arrow indicating reduced power */}
    <path d="M18 10v8" />
    <path d="M15 15l3 3 3-3" />
  </svg>
);
