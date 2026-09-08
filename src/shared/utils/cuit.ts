const CHECK_DIGIT_MULTIPLIERS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Validates an Argentine CUIT (11 digits, dashes optional) including its
 * verification digit — not just the shape. Format-only checks let through
 * numbers that can't be a real CUIT (e.g. any transposition of the digits),
 * which defeats the point of collecting a legal tax id.
 */
export function isValidCuit(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;

  const nums = digits.split("").map(Number);
  const sum = CHECK_DIGIT_MULTIPLIERS.reduce((acc, multiplier, i) => acc + multiplier * nums[i], 0);
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;

  if (checkDigit === 10) return false;
  return checkDigit === nums[10];
}
