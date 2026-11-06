import { useState } from "react";
import { BrandPicker } from "./add-product/brand-picker";
import { useBrandLines } from "./add-product/brand-lines";
import { t } from "../i18n";

/** A listed brand, and which of its lines the product joins. */
export function BrandChangeField({
  country,
  countryName,
  currentBrandId,
  lineName,
}: {
  country: string;
  countryName: string;
  currentBrandId: string | null;
  lineName: string;
}) {
  const [typed, setTyped] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [line, setLine] = useState("new");
  const { lines } = useBrandLines(country, brandId, () => setLine("new"));
  const other = brandId !== null && brandId !== currentBrandId;
  return (
    <>
      <BrandPicker
        id="change-brand"
        country={country}
        countryName={countryName}
        value={typed}
        chosen={brandId !== null || isNew}
        isNew={isNew}
        onType={setTyped}
        onChoose={(brand) => {
          setTyped(brand.name);
          setBrandId(brand.id);
          setIsNew(brand.id === null);
          setLine("new");
        }}
        onChange={() => {
          setBrandId(null);
          setIsNew(false);
        }}
      />
      {isNew && <p className="field-error">{t("brandChange.newBrand")}</p>}
      <input type="hidden" name="brandId" value={other ? brandId : ""} />
      {other && (
        <>
          <label htmlFor="change-brand-line">{t("brandChange.line")}</label>
          <select
            id="change-brand-line"
            name="brandLine"
            value={line}
            onChange={(e) => setLine(e.target.value)}
          >
            <option value="new">{t("brandChange.newLine")}</option>
            {lines?.map((l) => (
              <option key={l.lineId} value={l.lineId}>
                {l.name}
              </option>
            ))}
          </select>
          {line === "new" && (
            <>
              <label htmlFor="change-brand-line-name">
                {t("brandChange.newLineName")}
              </label>
              <input
                id="change-brand-line-name"
                name="newLineName"
                required
                minLength={2}
                maxLength={160}
                defaultValue={lineName}
              />
            </>
          )}
        </>
      )}
      <p className="small muted">{t("brandChange.note")}</p>
    </>
  );
}
