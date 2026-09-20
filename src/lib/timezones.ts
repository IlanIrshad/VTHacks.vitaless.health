// Real IANA timezone list for the Account settings dropdown. Modern
// browsers expose the full tz database via Intl.supportedValuesOf — we use
// that directly rather than hand-maintaining a list. Falls back to a short
// list of common zones on older browsers where that API doesn't exist yet.

const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export function getTimezoneOptions(): string[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  try {
    if (typeof intlWithSupportedValues.supportedValuesOf === "function") {
      return intlWithSupportedValues.supportedValuesOf("timeZone");
    }
  } catch {
    // Fall through to the fallback list below.
  }
  return FALLBACK_TIMEZONES;
}

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
