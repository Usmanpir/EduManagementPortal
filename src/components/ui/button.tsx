import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"
import { Loader2Icon } from "lucide-react"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/16%),var(--elevation-xs)] hover:bg-[color-mix(in_oklch,var(--primary),black_8%)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]",
        outline:
          "border-border-strong bg-card text-foreground shadow-xs hover:bg-muted aria-expanded:bg-muted dark:bg-input/20 dark:hover:bg-input/40",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted dark:hover:bg-muted/70",
        subtle: "bg-primary-subtle text-primary-subtle-foreground hover:bg-[color-mix(in_oklch,var(--primary-subtle),var(--primary)_10%)]",
        destructive:
          "bg-danger text-on-danger shadow-[inset_0_1px_0_0_oklch(1_0_0/14%),var(--elevation-xs)] hover:bg-[color-mix(in_oklch,var(--danger),black_8%)] focus-visible:ring-danger/40",
        "destructive-subtle": "bg-danger-subtle text-danger-foreground hover:bg-[color-mix(in_oklch,var(--danger-subtle),var(--danger)_10%)]",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        xs: "h-7 gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 px-3 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-4",
        xl: "h-12 rounded-lg px-5 text-[0.9375rem] [&_svg:not([class*='size-'])]:size-5",
        icon: "size-9",
        "icon-xs": "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows a spinner, disables the button and announces the busy state. */
    loading?: boolean
  }

function Button({ className, variant = "default", size = "default", asChild = false, loading = false, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2Icon className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
