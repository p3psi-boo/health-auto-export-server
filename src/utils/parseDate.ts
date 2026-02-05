export function parseDate(input: string | undefined): Date | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const normalized = trimmed.replace(/\//g, "-");

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (dateOnlyMatch) {
    const d = new Date(`${normalized}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(normalized);
  if (dateTimeMatch) {
    const iso = `${dateTimeMatch[1]}-${dateTimeMatch[2]}-${dateTimeMatch[3]}T${dateTimeMatch[4]}:${dateTimeMatch[5]}:${dateTimeMatch[6]}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}
