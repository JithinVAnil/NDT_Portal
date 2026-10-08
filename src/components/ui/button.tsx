import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-navy-900 text-white hover:bg-navy-800",
        primary: "bg-brand-600 text-white hover:bg-brand-500",
        outline: "border border-line bg-white text-ink hover:bg-canvas",
        ghost: "text-ink hover:bg-canvas",
        success: "bg-ok text-white hover:bg-[#186641]",
        danger: "bg-bad text-white hover:bg-[#981d13]",
        subtle: "bg-brand-50 text-brand-600 hover:bg-brand-100",
        link: "text-brand-600 underline-offset-2 hover:underline px-0 h-auto",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-[12.5px]",
        xs: "h-7 px-2 text-xs",
        lg: "h-10 px-5",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    if (asChild) {
      return <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>{children}</Slot>;
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
