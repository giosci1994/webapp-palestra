import { describe, it, expect } from 'vitest';
import { rilevaPiattaforma, apertaNellApp, LINK_DOWNLOAD, PACCHETTO_ANDROID } from './scarica.js';

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadComeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
};

describe('rilevaPiattaforma', () => {
  it('recognises Android, iPhone and Windows from the user agent', () => {
    expect(rilevaPiattaforma({ userAgent: UA.android })).toBe('android');
    expect(rilevaPiattaforma({ userAgent: UA.iphone })).toBe('ios');
    expect(rilevaPiattaforma({ userAgent: UA.windows })).toBe('windows');
  });

  it('takes an iPad that presents itself as a Mac for an iPad, from the touch screen', () => {
    expect(rilevaPiattaforma({ userAgent: UA.ipadComeMac, maxTouchPoints: 5 })).toBe('ios');
    expect(rilevaPiattaforma({ userAgent: UA.ipadComeMac, maxTouchPoints: 0 })).toBe('altro');
  });

  it('prefers userAgentData when the browser has it', () => {
    expect(rilevaPiattaforma({ userAgent: UA.linux, userAgentData: { platform: 'Android' } })).toBe('android');
    expect(rilevaPiattaforma({ userAgent: UA.linux, userAgentData: { platform: 'Windows' } })).toBe('windows');
  });

  it('answers "altro" for other systems and without a navigator', () => {
    expect(rilevaPiattaforma({ userAgent: UA.linux })).toBe('altro');
    expect(rilevaPiattaforma(undefined)).toBe('altro');
  });
});

describe('apertaNellApp', () => {
  const nessunaApp = { matchMedia: () => ({ matches: false }), navigator: {}, document: { referrer: '' } };

  it('is false in a browser tab', () => {
    expect(apertaNellApp(nessunaApp)).toBe(false);
    expect(apertaNellApp({})).toBe(false);
  });

  it('is true in the installed web app', () => {
    expect(apertaNellApp({ ...nessunaApp, matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(apertaNellApp({ ...nessunaApp, navigator: { standalone: true } })).toBe(true);
  });

  it('is true in the Android app, which opens the site with its package as referrer', () => {
    expect(apertaNellApp({ ...nessunaApp, document: { referrer: `android-app://${PACCHETTO_ANDROID}/` } })).toBe(true);
    expect(apertaNellApp({ ...nessunaApp, document: { referrer: 'android-app://com.altra.app/' } })).toBe(false);
  });
});

describe('LINK_DOWNLOAD', () => {
  it('points at the files of the latest GitHub release', () => {
    for (const link of Object.values(LINK_DOWNLOAD)) {
      expect(link).toMatch(/^https:\/\/github\.com\/giosci1994\/webapp-palestra\/releases\/latest\/download\/[\w.-]+$/);
    }
  });
});
