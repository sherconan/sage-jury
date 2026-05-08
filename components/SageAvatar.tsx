import { cn } from "@/lib/utils";

interface SageAvatarProps {
  initials: string;
  bgColor: string;
  accentColor: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: "h-10 w-10 text-sm",
  md: "h-14 w-14 text-base",
  lg: "h-20 w-20 text-xl",
  xl: "h-28 w-28 text-3xl",
};

export function SageAvatar({ initials, bgColor, accentColor, size = "md", className }: SageAvatarProps) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-serif font-bold tracking-wider text-cream-50 shadow-gavel",
        sizeMap[size],
        className,
      )}
      style={{
        background: `radial-gradient(circle at 30% 25%, ${accentColor}40, ${bgColor} 65%)`,
        border: `2px solid ${accentColor}`,
      }}
    >
      <span className="relative z-10 drop-shadow-sm">{initials}</span>
      <span
        className="pointer-events-none absolute inset-0 rounded-full opacity-30 mix-blend-overlay"
        style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0 1px, transparent 1px 4px)" }}
      />
    </div>
  );
}
