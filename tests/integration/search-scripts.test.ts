import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { searchExpression } from "../../server/catalog/application/service";
import { SEARCH_INDEX_STATEMENTS } from "../../server/catalog/infrastructure/search-index";

const COUNTRY = "ZZ";
// Real names from the plan's search table, indexed through the real statements.
const FOODS: [string, string[]][] = [
  ["唐揚げ", ["から揚げ", "からあげ", "karaage"]],
  ["大豆ミートの唐揚げ", []],
  ["豆腐", []],
  ["絹ごし豆腐", []],
  ["牛乳", []],
  ["豆乳", []],
  ["オーツミルク", []],
  ["納豆", []],
  ["餃子", ["ぎょうざ"]],
  ["ベジタリアン ハンバーグ", []],
  ["Bœuf haché", []],
  ["Œufs", []],
  ["Crème glacée", []],
  ["두부", []],
  ["식물성 우유", []],
  ["땅콩버터", []],
  ["오이", []],
  ["오렌지 주스", []],
  ["豆漿", []],
  ["燕麥奶", []],
  ["純素起司片", []],
  ["ข้าวเหนียว", []],
];

async function index() {
  const tag = crypto.randomUUID().slice(0, 8);
  const country = `country-${tag}`;
  await env.DB.prepare("DELETE FROM search_index").run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO countries(id,iso2,name,created_at,updated_at) VALUES(?,?,'Test',1,1)",
  )
    .bind(country, COUNTRY)
    .run();
  const root = (await env.DB.prepare("SELECT id FROM countries WHERE iso2=?")
    .bind(COUNTRY)
    .first("id")) as string;
  const parent = `aisle-${tag}`;
  await env.DB.prepare(
    "INSERT INTO categories(id,parent_id,slug,name,is_rankable,created_at,updated_at) VALUES(?,NULL,?,'Aisle',0,1,1)",
  )
    .bind(parent, parent)
    .run();
  for (const [i, [name, aliases]] of FOODS.entries()) {
    const food = `food-${tag}-${i}`;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO categories(id,parent_id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,?,1,1,1)",
      ).bind(food, parent, `food-${tag}-${i}`, name),
      env.DB.prepare(
        "INSERT INTO category_countries(category_id,country_id,source,created_at) VALUES(?,?,'launch',1)",
      ).bind(food, root),
      ...aliases.map((alias) =>
        env.DB.prepare(
          "INSERT INTO category_aliases(id,category_id,alias,created_at) VALUES(?,?,?,1)",
        ).bind(crypto.randomUUID(), food, alias),
      ),
    ]);
  }
  await env.DB.batch(SEARCH_INDEX_STATEMENTS.map((sql) => env.DB.prepare(sql)));
}
const found = async (query: string) =>
  (
    await env.DB.prepare(
      "SELECT title FROM search_index WHERE search_index MATCH ? AND country_code=?",
    )
      .bind(searchExpression(query).expression, COUNTRY)
      .all<{ title: string }>()
  ).results
    .map((row) => row.title)
    .sort();

beforeAll(index);

it("finds Japanese, Korean, Thai and French words inside longer names", async () => {
  // Neither unicode61 nor trigram alone finds all of these.
  expect(await found("揚げ")).toEqual(["唐揚げ", "大豆ミートの唐揚げ"].sort());
  expect(await found("ごし豆腐")).toEqual(["絹ごし豆腐"]);
  expect(await found("豆腐")).toEqual(["絹ごし豆腐", "豆腐"].sort());
  expect(await found("牛乳")).toEqual(["牛乳"]);
  expect(await found("餃子")).toEqual(["餃子"]);
  expect(await found("ミルク")).toEqual(["オーツミルク"]);
  expect(await found("ミート")).toEqual(["大豆ミートの唐揚げ"]);
  expect(await found("唐揚げ")).toEqual(
    ["唐揚げ", "大豆ミートの唐揚げ"].sort(),
  );
  // Katakana and half-width spellings reach a hiragana alias.
  expect(await found("カラアゲ")).toEqual(["唐揚げ"]);
  expect(await found("ｶﾗｱｹﾞ")).toEqual(["唐揚げ"]);
  expect(await found("ギョウザ")).toEqual(["餃子"]);
  // Words in order: 揚唐 is not 唐揚.
  expect(await found("揚唐")).toEqual([]);
  expect(await found("두부")).toEqual(["두부"]);
  expect(await found("เหนียว")).toEqual(["ข้าวเหนียว"]);
  expect(await found("creme")).toEqual(["Crème glacée"]);
  expect(await found("glacee")).toEqual(["Crème glacée"]);
  expect(await found("oeufs")).toEqual(["Œufs"]);
  expect(await found("bœuf")).toEqual(["Bœuf haché"]);
  // Mixed text must match every part.
  expect(await found("karaage 唐揚げ")).toEqual(["唐揚げ"]);
});

it("finds Traditional Chinese and Korean as shoppers type them", async () => {
  expect(await found("豆漿")).toEqual(["豆漿"]);
  expect(await found("起司")).toEqual(["純素起司片"]);
  expect(await found("麥奶")).toEqual(["燕麥奶"]);
  expect(await found("우유")).toEqual(["식물성 우유"]);
  // Korean spacing varies between a name and what's typed.
  expect(await found("식물성우유")).toEqual(["식물성 우유"]);
  expect(await found("땅콩 버터")).toEqual(["땅콩버터"]);
  // A particle on the end of a word.
  expect(await found("우유를")).toEqual(["식물성 우유"]);
  expect(await found("식물성 우유는")).toEqual(["식물성 우유"]);
  expect(await found("두부와")).toEqual(["두부"]);
  // A word that ends like a particle stays whole.
  expect(await found("오이")).toEqual(["오이"]);
});

it("indexes only the names a country's languages use", async () => {
  // "ZZ" has English only. Other languages' names would lengthen every food's
  // document and lower exact matches.
  const food = await env.DB.prepare(
    "SELECT id FROM categories WHERE name='豆乳'",
  ).first("id");
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO category_aliases(id,category_id,alias,language,created_at) VALUES(?,?,'Sojadrink','de',1)",
    ).bind(crypto.randomUUID(), food),
    env.DB.prepare(
      "INSERT INTO category_aliases(id,category_id,alias,language,created_at) VALUES(?,?,'soymilk','en',1)",
    ).bind(crypto.randomUUID(), food),
  ]);
  await env.DB.batch(SEARCH_INDEX_STATEMENTS.map((sql) => env.DB.prepare(sql)));
  expect(await found("soymilk")).toEqual(["豆乳"]);
  expect(await found("Sojadrink")).toEqual([]);
});
