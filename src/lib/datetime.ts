// Converts between an ISO timestamp (what the server stores/returns) and
// the "YYYY-MM-DDTHH:mm" string an <input type="datetime-local"> needs.
// Both directions go through the browser's own local getters/constructor,
// so a value picked in the user's local clock round-trips back to the same
// displayed date and time regardless of which IANA zone the browser is in.

export function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
