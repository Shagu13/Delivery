// LivoExpress white-label host. Kept in a tiny standalone module so the
// always-loaded AppLayout can import the host check without pulling in the full
// LivoHomePage component (and its CSS + tracking utils).

export const LIVO_HOST = 'livoexpress.ge';

/** True when a host (or window.location.hostname) belongs to LivoExpress. */
export function isLivoHost(host: string | undefined | null): boolean {
  const n = (host ?? '').toLowerCase().split(':')[0].replace(/^www\./, '');
  return n === LIVO_HOST;
}
