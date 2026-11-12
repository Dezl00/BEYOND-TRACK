export type WhatsAppCountryCode = "+20" | "+966";

export function normalizeLocalPhone(value: string) {
  return value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[\s()-]/g, "")
    .replace(/^0(?!0)/, "");
}

export function loginPhone(value: string) {
  const number = normalizeLocalPhone(value);
  return whatsappRecipient("+20", number) || whatsappRecipient("+966", number)
    ? number
    : null;
}

// Only local mobile numbers are accepted; country prefixes belong in the selector.
export function whatsappRecipient(countryCode: string, localNumber: string) {
  const number = normalizeLocalPhone(localNumber);
  if (countryCode === "+20" && /^1[0125]\d{8}$/.test(number))
    return `${countryCode}${number}`;
  if (countryCode === "+966" && /^5\d{8}$/.test(number))
    return `${countryCode}${number}`;
  return null;
}
