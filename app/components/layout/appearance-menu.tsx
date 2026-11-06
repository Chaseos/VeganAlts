import { Icon } from "../icons/icon";
import { Popover } from "../ui/popover";
import { SegmentedControl } from "../ui/navigation";
import { themeOptions, useTheme, type ThemeChoice } from "../../lib/theme";
import { t } from "../../i18n";

const ICON = { system: "system", light: "sun", dark: "moon" } as const;

export function AppearanceControl({ name }: { name: string }) {
  const [theme, setTheme] = useTheme();
  return (
    <SegmentedControl<ThemeChoice>
      legend={t("appearance.label")}
      name={name}
      value={theme}
      options={themeOptions()}
      onChange={setTheme}
    />
  );
}

export function AppearanceMenu() {
  const [theme] = useTheme();
  const label = themeOptions().find((option) => option.value === theme)!.label;
  return (
    <Popover
      align="end"
      tone="kale"
      className="va-appearance-menu"
      summaryLabel={t("appearance.current", { theme: label })}
      panelLabel={t("appearance.label")}
      summary={<Icon name={ICON[theme]} size={18} />}
    >
      {() => <AppearanceControl name="appearance-desktop" />}
    </Popover>
  );
}
