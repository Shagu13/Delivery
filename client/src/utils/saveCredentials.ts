// Credential Management API — explicitly asks the browser's password manager to
// store the credentials that just worked, instead of waiting for its own
// "did that look like a login?" heuristics to fire.
//
// Chrome / Edge / Android only. Safari and Firefox don't implement
// PasswordCredential, so there we fall back to the heuristics, which the
// id / name / autocomplete attributes on the login form already satisfy.
// Also requires a secure context (HTTPS or localhost).

interface PasswordCredentialData {
    id: string;
    password: string;
    name?: string;
}

type PasswordCredentialCtor = new (data: PasswordCredentialData) => Credential;

/**
 * Offer the just-used credentials to the browser's password manager.
 * Never throws — a browser that can't or won't store them is not a login failure.
 */
export async function saveCredentials(username: string, password: string): Promise<void> {
    const Ctor = (window as unknown as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential;
    if (!Ctor || !navigator.credentials?.store) return;

    try {
        await navigator.credentials.store(new Ctor({ id: username, password, name: username }));
    } catch {
        /* user dismissed the prompt, or the browser refused — ignore */
    }
}
