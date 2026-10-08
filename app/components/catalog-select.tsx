import { useEffect, useState } from "react";
import { communityRequest, type CommunityOptions } from "../lib/community";

type Option = { id: string; name: string };
export function CatalogSelect({
  id,
  name,
  label,
  kind,
  options,
  defaultValue = "",
  required = false,
  excludeId,
}: {
  id: string;
  name: string;
  label: string;
  kind: "products" | "families";
  options: Option[];
  defaultValue?: string;
  required?: boolean;
  excludeId?: string;
}) {
  const [query, setQuery] = useState(""),
    [found, setFound] = useState(options),
    [selected, setSelected] = useState<Option | null>(
      options.find((o) => o.id === defaultValue) ??
        (defaultValue ? { id: defaultValue, name: "Current selection" } : null),
    ),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void communityRequest<CommunityOptions>(
        `community/options?q=${encodeURIComponent(query)}`,
      )
        .then((value) => {
          if (active) {
            setFound(value[kind]);
            setError("");
          }
        })
        .catch(() => {
          if (active)
            setError("Search could not load. Edit the search to retry.");
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, kind]);
  const choices = [
    ...(selected ? [selected] : []),
    ...found.filter((o) => o.id !== selected?.id && o.id !== excludeId),
  ];
  return (
    <>
      <label htmlFor={`${id}-search`}>Find {label.toLowerCase()}</label>
      <input
        id={`${id}-search`}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={80}
      />
      {error && <p role="alert">{error}</p>}
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={name}
        value={selected?.id ?? ""}
        required={required}
        onChange={(e) =>
          setSelected(choices.find((o) => o.id === e.target.value) ?? null)
        }
      >
        <option value="">
          {required ? "Choose a product" : "None selected"}
        </option>
        {choices.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </>
  );
}
