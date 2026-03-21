import { useMemo } from "react";
import type { ReactNode } from "react";

const PARTICLE_COUNT = 40;

/** Floating golden particles background used by login and lobby screens */
export const ParticleBackground = (): ReactNode => {
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 20,
        duration: 12 + Math.random() * 18,
        size: 1.5 + Math.random() * 3,
        opacity: 0.15 + Math.random() * 0.35,
        drift: -30 + Math.random() * 60,
      })),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(120,80,20,0.08)_0%,transparent_70%)]" />
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={
            {
              left: `${p.left}%`,
              bottom: "-5%",
              width: p.size,
              height: p.size,
              background: `radial-gradient(circle, rgba(255,200,80,${p.opacity}) 0%, rgba(255,150,30,0) 70%)`,
              boxShadow: `0 0 ${p.size * 2}px rgba(255,180,50,${p.opacity * 0.5})`,
              "--drift": `${p.drift}px`,
              animation: `loginParticleRise ${p.duration}s ${p.delay}s linear infinite`,
            } as React.CSSProperties
          }
        />
      ))}
      <style>{`
        @keyframes loginParticleRise {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-110vh) translateX(var(--drift, 0px)); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
