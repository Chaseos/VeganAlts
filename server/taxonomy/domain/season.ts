const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** A food's season: two months, 1–12; it may wrap past December. */
export interface Season {
  start: number;
  end: number;
}

export function seasonOf(
  start: number | null | undefined,
  end: number | null | undefined,
): Season | null {
  return start && end ? { start, end } : null;
}

/** "Nov–Jan", or one month when the season starts and ends in it. */
export function seasonLabel(season: Season) {
  const from = MONTHS[season.start - 1]!,
    to = MONTHS[season.end - 1]!;
  return from === to ? from : `${from}–${to}`;
}

/** Whether a month (1–12) falls in the season, wrapping past December. */
export function inSeason(season: Season, month: number) {
  return season.start <= season.end
    ? month >= season.start && month <= season.end
    : month >= season.start || month <= season.end;
}
