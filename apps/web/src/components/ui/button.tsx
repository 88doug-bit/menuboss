import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "default" &&
          "bg-emerald-700 text-white hover:bg-emerald-800",
        variant === "outline" &&
          "border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-900",
        variant === "ghost" && "hover:bg-zinc-100 text-zinc-900",
        variant === "destructive" &&
          "bg-red-600 text-white hover:bg-red-700",
        size === "default" && "h-10 px-4 py-2",
        size === "sm" && "h-8 rounded-md px-3 text-xs",
        size === "lg" && "h-11 rounded-md px-8",
        size === "icon" && "h-9 w-9",
        className,
      )}
      {...props}
    />
  );
}
