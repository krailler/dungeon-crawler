import type { ReactNode } from "react";

type GoldPanelProps = {
  children: ReactNode;
  /** Extra classes on the outer border wrapper */
  className?: string;
  /** Extra classes on the inner content area */
  innerClassName?: string;
};

/**
 * Panel with animated conic-gradient gold border and glassmorphism inner.
 * Includes decorative corner ornaments.
 */
export const GoldPanel = ({
  children,
  className = "",
  innerClassName = "",
}: GoldPanelProps): ReactNode => (
  <div className={`lobby-panel ${className}`}>
    <div className={`lobby-panel-inner relative p-6 ${innerClassName}`}>
      <div className="lobby-ornament top-left" />
      <div className="lobby-ornament top-right" />
      <div className="lobby-ornament bottom-left" />
      <div className="lobby-ornament bottom-right" />
      {children}
    </div>
  </div>
);
