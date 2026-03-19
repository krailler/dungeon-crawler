import type { ReactNode } from "react";

export const HamstringIcon = ({ className = "h-6 w-6" }: { className?: string }): ReactNode => (
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
    {/* Boot/leg */}
    <path d="M9 2v6l-3 4v6h3l2 2h2l2-2h3v-6l-3-4V2" />
    {/* Slash mark */}
    <path d="M6 13l12-2" strokeWidth="2.5" className="text-red-400" stroke="currentColor" />
  </svg>
);
