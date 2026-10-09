import { Form } from "react-router";
import { Icon } from "../icons/icon";

// The plain search form. It works without JavaScript; instant answers enhance
// it on the home page and in the header.
export function SearchForm({
  action,
  query = "",
  variant = "header",
  id = "site-search",
  label = "Search foods and products",
  placeholder = "Search a food or brand",
}: {
  action: string;
  query?: string;
  variant?: "header" | "hero" | "page";
  id?: string;
  label?: string;
  placeholder?: string;
}) {
  return (
    <Form
      method="get"
      action={action}
      role="search"
      className={`va-search va-search--${variant}`}
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Icon
        name="search"
        size={variant === "hero" ? 24 : 20}
        className="va-search__icon"
      />
      <input
        key={query}
        id={id}
        name="q"
        type="search"
        defaultValue={query}
        maxLength={80}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
      />
      <button type="submit" className="button search">
        Find swaps
      </button>
    </Form>
  );
}
