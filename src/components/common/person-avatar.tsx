import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Stable hue per name so the same person always gets the same tint. */
function hueOf(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hues = [272, 235, 185, 155, 75, 40, 15, 320];
  return hues[hash % hues.length]!;
}

const SIZES = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-caption",
  md: "size-9 text-small",
  lg: "size-12 text-body",
  xl: "size-16 text-h2",
  "2xl": "size-20 text-h1",
};

export function PersonAvatar({
  name,
  src,
  size = "sm",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Avatar className={cn(SIZES[size], className)}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback
        style={{ "--h": hueOf(name) } as React.CSSProperties}
        className="bg-[oklch(0.94_0.035_var(--h))] font-semibold text-[oklch(0.42_0.1_var(--h))] dark:bg-[oklch(0.32_0.05_var(--h))] dark:text-[oklch(0.88_0.06_var(--h))]"
      >
        <span aria-hidden>{initialsOf(name)}</span>
        <span className="sr-only">{name}</span>
      </AvatarFallback>
    </Avatar>
  );
}
