import type { ReactNode } from "react";
export const FullscreenIcon = ({ className = "h-4 w-4" }: { className?: string }): ReactNode => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm10-1a1 1 0 100 2h2v2a1 1 0 102 0V4a1 1 0 00-1-1h-3zM4 13a1 1 0 012 0v2h2a1 1 0 110 2H5a1 1 0 01-1-1v-3zm14 0a1 1 0 10-2 0v2h-2a1 1 0 100 2h3a1 1 0 001-1v-3z" />
  </svg>
);

export const ExitFullscreenIcon = ({
  className = "h-4 w-4",
}: {
  className?: string;
}): ReactNode => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path d="M4 7a1 1 0 011-1h2V4a1 1 0 112 0v3a1 1 0 01-1 1H5a1 1 0 01-1-1zm8-3a1 1 0 112 0v2h2a1 1 0 110 2h-3a1 1 0 01-1-1V4zM5 12a1 1 0 100 2h2v2a1 1 0 102 0v-3a1 1 0 00-1-1H5zm8 0a1 1 0 00-1 1v3a1 1 0 102 0v-2h2a1 1 0 100-2h-3z" />
  </svg>
);
