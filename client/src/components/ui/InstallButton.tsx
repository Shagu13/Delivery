import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import './install-button.css';

/** The `beforeinstallprompt` event (Chromium-only, not yet in lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** True when the app is already running as an installed PWA. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes this non-standard flag instead of display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** True on iPhone/iPad Safari, where install must be done manually via Share. */
function isIos(): boolean {
  const ua = window.navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac; detect via touch support.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOSDevice;
}

/**
 * "Install Dilo app" button for the PWA.
 * - Android/desktop Chromium: captures `beforeinstallprompt` and fires the
 *   native install dialog on click.
 * - iOS Safari: shows a short Share → Add to Home Screen instruction instead
 *   (Apple does not allow programmatic install).
 * - Renders nothing once the app is already installed.
 */
export function InstallButton() {
  const { t } = useLanguage();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop Chrome's mini-infobar; we drive install ourselves
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Already installed → nothing to show.
  if (installed) return null;

  const ios = isIos();

  // Non-iOS browsers that never fired the prompt (already installed elsewhere,
  // or unsupported browser) → show nothing to avoid a dead button.
  if (!ios && !promptEvent) return null;

  const handleClick = async () => {
    if (ios) {
      setShowIosHint(v => !v);
      return;
    }
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null); // prompt can only be used once
  };

  return (
    <div className="install-btn-wrap">
      <button type="button" className="install-btn" onClick={handleClick}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {t.installApp}
      </button>

      {ios && showIosHint && (
        <div className="install-ios-hint" role="status">
          <strong>{t.installIosTitle}</strong>
          <span>{t.installIosHint}</span>
        </div>
      )}
    </div>
  );
}
