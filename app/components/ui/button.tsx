import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

export type ButtonVariant = "primary" | "secondary" | "search" | "text";

function classes(variant: ButtonVariant, small?: boolean, extra?: string) {
  return [
    "button",
    variant === "primary" ? "" : variant,
    small ? "small-button" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

// Primary is the dark (light: kale, dark: mint) action, secondary is outlined,
// search is the one red button and text is a link-styled action.
export function Button({
  variant = "primary",
  small,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; small?: boolean }) {
  return (
    <button
      type={type}
      className={classes(variant, small, className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  small,
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  small?: boolean;
  children: ReactNode;
}) {
  return <Link className={classes(variant, small, className)} {...props} />;
}
