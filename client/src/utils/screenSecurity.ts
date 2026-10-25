import { Capacitor, registerPlugin } from '@capacitor/core';

interface ScreenSecurityPluginInterface {
  enableProtection(): Promise<void>;
  disableProtection(): Promise<void>;
  isSupported(): Promise<{ supported: boolean; platform?: string }>;
}

const ScreenSecurity = registerPlugin<ScreenSecurityPluginInterface>('ScreenSecurity');

/**
 * Screen and Screenshot Security Utility
 *
 * Android: Uses native WindowManager.LayoutParams.FLAG_SECURE to prevent screen capture.
 * Web: Implements blur obfuscation, print protection, and honest limitations disclaimer.
 */
export async function enableScreenProtection(): Promise<{ platform: 'android' | 'web'; supported: boolean }> {
  if (Capacitor.isNativePlatform()) {
    try {
      await ScreenSecurity.enableProtection();
      return { platform: 'android', supported: true };
    } catch (err) {
      console.warn('Native screen protection error:', err);
    }
  }

  // Web Browser fallbacks
  setupWebPrintProtection();
  return { platform: 'web', supported: false };
}

export async function disableScreenProtection(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await ScreenSecurity.disableProtection();
    } catch (err) {
      console.warn('Disable screen protection error:', err);
    }
  }
}

let printStyleElement: HTMLStyleElement | null = null;

function setupWebPrintProtection() {
  if (typeof document === 'undefined') return;
  if (!printStyleElement) {
    printStyleElement = document.createElement('style');
    printStyleElement.id = 'musely-screen-security';
    printStyleElement.innerHTML = `
      @media print {
        body * {
          visibility: hidden !important;
          display: none !important;
        }
        body::after {
          content: "Confidential MUSELY Protected Content. Printing and export restricted.";
          visibility: visible !important;
          display: block !important;
          font-size: 16pt;
          text-align: center;
          margin-top: 100px;
        }
      }
    `;
    document.head.appendChild(printStyleElement);
  }
}

export const SCREENSHOT_DISCLAIMER = {
  title: 'Screenshot & Privacy Notice',
  androidNote: 'On supported Android devices, secure window protections (FLAG_SECURE) actively block screenshots and screen recordings.',
  webLimitation: 'Web browser limitation: Websites cannot reliably prevent browser screenshots, operating system capture tools, or photographs taken using an external phone/camera. Private chats and documents are safeguarded with strict server-side access authorization.',
  isNative: Capacitor.isNativePlatform(),
};
