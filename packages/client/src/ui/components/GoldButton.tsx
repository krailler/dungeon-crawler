import type { ReactNode, ButtonHTMLAttributes } from "react";

type GoldButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
};

/**
 * Prominent gold CTA button with animated shine sweep on hover.
 * Used for primary actions: login, reconnect, create room.
 */
export const GoldButton = ({
  children,
  loading,
  disabled,
  className = "",
  ...rest
}: GoldButtonProps): ReactNode => (
  <button
    disabled={disabled || loading}
    className={`lobby-create-btn rounded-xl px-4 py-3.5 text-sm font-bold uppercase tracking-wider text-white ${className}`}
    {...rest}
  >
    {loading ? (
      <span className="flex items-center justify-center gap-2">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        {children}
      </span>
    ) : (
      children
    )}
  </button>
);
