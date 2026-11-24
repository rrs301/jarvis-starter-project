export function Orb({ size = 46, glow = false, pulse = false, className = "" }: { size?: number; glow?: boolean; pulse?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`orb block shrink-0 ${glow ? "orb-glow" : ""} ${pulse ? "orb-pulse" : ""} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
