import { Icon } from "../icons/icon";
import { Popover } from "../ui/popover";
import { SegmentedControl } from "../ui/navigation";
import { THEME_OPTIONS, useTheme, type ThemeChoice } from "../../lib/theme";

const ICON = { system: "system", light: "sun", dark: "moon" } as const;

export function AppearanceControl({ name }: { name: string }) {
  const [theme, setTheme] = useTheme();
  return (
    <SegmentedControl<ThemeChoice>
      legend="Appearance"
      name={name}
      value={theme}
      options={THEME_OPTIONS}
      onChange={setTheme}
    />
  );
}

export function AppearanceMenu() {
  const [theme] = useTheme();
  const label = THEME_OPTIONS.find((option) => option.value === theme)!.label;
  return (
    <Popover
      align="end"
      tone="kale"
      className="va-appearance-menu"
      summaryLabel={`Appearance: ${label}`}
      panelLabel="Appearance"
      summary={<Icon name={ICON[theme]} size={18} />}
    >
      {() => <AppearanceControl name="appearance-desktop" />}
    </Popover>
  );
}
