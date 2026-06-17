// Recipient name is optional on an order. When it's blank we store an empty string in
// the DB and localize the placeholder at display time, so the same record reads
// "Unknown" in English and "უცნობი" in Georgian (and on the Georgian-only label).
export function recipientDisplayName(
    name: string | null | undefined,
    unknownText: string,
): string {
    return name && name.trim() ? name : unknownText;
}
