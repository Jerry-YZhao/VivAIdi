"use client";

export function AuditoriumFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative min-h-[100dvh] hall ${className}`}>
      <div className="hall-canopy" aria-hidden />
      <div className="grain" />
      {children}
    </div>
  );
}

export function Stage({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`stage-frame relative overflow-hidden bg-wood/10 ${className}`}>
      <div className="pit-glow" />
      {children}
    </div>
  );
}

export function ProgrammeCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="hall-signage text-center text-xs md:text-sm">{children}</p>
  );
}
