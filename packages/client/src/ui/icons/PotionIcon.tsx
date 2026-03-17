import type { ReactNode } from "react";
export const PotionIcon = ({ className }: { className?: string }): ReactNode => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Bottle neck */}
    <path d="M9 3h6v3H9z" fill="currentColor" opacity={0.3} />
    {/* Bottle body */}
    <path d="M8 6l-1 4v8a2 2 0 002 2h6a2 2 0 002-2v-8l-1-4H8z" />
    {/* Liquid */}
    <path d="M8 12h8v6a2 2 0 01-2 2h-4a2 2 0 01-2-2v-6z" fill="currentColor" opacity={0.4} />
    {/* Cork */}
    <rect x="9.5" y="2" width="5" height="2" rx="0.5" fill="currentColor" opacity={0.5} />
    {/* Shine */}
    <path d="M10 13v3" strokeOpacity={0.6} />
  </svg>
);
