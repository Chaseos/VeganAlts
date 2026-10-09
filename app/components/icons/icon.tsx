// Line icons on a 24-unit grid. They inherit color from text, so CSS decides
// whether they read as tag yellow on kale or green on the page.
export const UI_ICONS = {
  search: "M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM20 20l-4.7-4.7",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M18 15l-6-6-6 6",
  chevronRight: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  globe:
    "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  trend: "M4 17l6-6 4 4 6-6M14 9h6v6",
  filter: "M4 6h16M7 12h10M10 18h4",
  bag: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
  clock: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2",
  package: "M6 6h12v15H6zM8 2.5h8V6H8zM9.5 16c0-4 5-5.5 5-5.5s1 5-5 5.5",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  system: "M4 5h16v11H4zM9 20h6M12 16v4",
  user: "M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM4.5 20a7.5 7.5 0 0 1 15 0",
  plus: "M12 5v14M5 12h14",
  thumbUp: "M6 15l6-6 6 6",
  thumbDown: "M6 9l6 6 6-6",
} as const;

export type UiIconName = keyof typeof UI_ICONS;

export function PathIcon({
  path,
  size = 20,
  strokeWidth = 2,
  className,
}: {
  path: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

export function Icon({
  name,
  ...props
}: {
  name: UiIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return <PathIcon path={UI_ICONS[name]} {...props} />;
}
