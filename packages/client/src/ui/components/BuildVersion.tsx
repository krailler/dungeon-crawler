import type { ReactNode } from "react";
import { PROTOCOL_VERSION } from "@dungeon/shared";

export const BuildVersion = ({ className }: { className?: string }): ReactNode => (
  <span className={`text-[10px] text-slate-600 ${className ?? ""}`}>
    Build {PROTOCOL_VERSION} · {import.meta.env.DEV ? "Dev" : "Prod"} (Early Access)
  </span>
);
