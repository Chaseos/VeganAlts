const Z95 = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion. The lower bound ranks items
 * by confidence that their positive share is high; the upper bound detects
 * items whose share is confidently low. Both are 0..1; with no observations
 * the interval is [0, 1].
 */
export function wilsonInterval(positive: number, total: number, z = Z95) {
  if (total <= 0) return { lower: 0, upper: 1 };
  const p = positive / total,
    z2 = z * z,
    denominator = 1 + z2 / total,
    centre = p + z2 / (2 * total),
    margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return {
    lower: Math.max(0, (centre - margin) / denominator),
    upper: Math.min(1, (centre + margin) / denominator),
  };
}
