import type { ReactNode } from "react";

type GameLogoProps = {
  size?: "sm" | "md" | "lg";
  glow?: boolean;
  className?: string;
};

const sizeClass = {
  sm: "h-12",
  md: "h-16",
  lg: "h-20",
} as const;

export const GameLogo = ({ size = "md", glow, className = "" }: GameLogoProps): ReactNode => (
  <img
    src="/textures/logo.png"
    alt="KrawlHero"
    className={`w-auto object-contain drop-shadow-[0_0_20px_rgba(255,180,50,0.3)] ${sizeClass[size]} ${className}`}
    style={glow ? { animation: "lobby-title-glow 4s ease-in-out infinite" } : undefined}
  />
);
