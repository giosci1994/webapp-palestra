// ============================================
// GymMaster — Download page: platform and links
// ============================================
//
// The /scarica page (pagine/Scarica.jsx) shows the way to install the app on
// the device it is opened on: the Android app (APK), the Windows installer,
// or the web app on iPhone and iPad (Safari → Add to Home Screen).

// The Android app's package, the same as in public/.well-known/assetlinks.json
export const PACCHETTO_ANDROID = 'uk.casadm.gymmaster';

// The files attached to the latest GitHub release: these links never change,
// GitHub sends them to the newest release that has them
const ULTIMA_RELEASE = 'https://github.com/giosci1994/webapp-palestra/releases/latest/download/';
export const LINK_DOWNLOAD = {
  android: `${ULTIMA_RELEASE}gymmaster-android.apk`,
  windows: `${ULTIMA_RELEASE}gymmaster-windows-setup.exe`
};

// In the order of the page's selector; "altro" is any other system (Mac, Linux…)
export const PIATTAFORME = ['android', 'ios', 'windows', 'altro'];

/**
 * The system of this device: "android" | "ios" | "windows" | "altro".
 * navigator.userAgentData where the browser has it, the user agent otherwise.
 */
export function rilevaPiattaforma(navigatore = globalThis.navigator) {
  const sistema = navigatore?.userAgentData?.platform || '';
  const ua = navigatore?.userAgent || '';
  if (/android/i.test(sistema) || /Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  // iPadOS asks for desktop sites and presents itself as a Mac: a "Mac" with a
  // touch screen is an iPad
  if (/Macintosh/.test(ua) && navigatore?.maxTouchPoints > 1) return 'ios';
  if (/windows/i.test(sistema) || /Windows/.test(ua)) return 'windows';
  return 'altro';
}

/**
 * Is the page open inside the installed app? The web app (display-mode
 * standalone, or navigator.standalone on iPhone) or the Android app, which
 * opens the site with its package as the referrer.
 */
export function apertaNellApp(ambiente = globalThis) {
  if (ambiente.navigator?.standalone === true) return true;
  if (ambiente.matchMedia?.('(display-mode: standalone)').matches) return true;
  return String(ambiente.document?.referrer || '').startsWith(`android-app://${PACCHETTO_ANDROID}`);
}
