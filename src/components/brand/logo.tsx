import { cn } from "cn";

/** EduAttend mark: an open page whose fold doubles as a check — attendance, done. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M8 10.5c2.6-1.1 5.3-1.1 8 .4 2.7-1.5 5.4-1.5 8-.4v11c-2.6-1.1-5.3-1.1-8 .4-2.7-1.5-5.4-1.5-8-.4z"
        fill="none"
        stroke="white"
        strokeOpacity=".35"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11.5 16.4l3.1 3.1 6-6.6" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {showText && <span className="text-[1.0625rem] font-semibold tracking-tight text-foreground">EduAttend</span>}
    </span>
  );
}
