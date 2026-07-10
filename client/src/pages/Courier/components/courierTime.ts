/** Formats an assignment timestamp for a courier card — e.g. "10 Jul, 14:32" — so the
 *  courier can compare two cards and tell which job is older. Shared by DeliveriesPanel
 *  and PickupsPanel (return-pickup section). */
export function fmtAssignedAt(iso: string, lang: string): string {
    return new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
}
