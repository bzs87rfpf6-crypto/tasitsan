import React from "react";

export function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div
        className={`flex items-center gap-2 text-[11px] uppercase tracking-wider ${
          accent ?? "text-muted-foreground"
        }`}
      >
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-3xl text-gold">{value}</div>
    </div>
  );
}
