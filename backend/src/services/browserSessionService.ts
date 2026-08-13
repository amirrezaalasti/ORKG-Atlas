/**
 * Headless Chromium sessions for live ORKG / ORKG Ask browsing in chat.
 * Requires ENABLE_LIVE_BROWSER=true and `npx playwright install chromium`.
 * Not available on typical serverless hosts (use API summary preview instead).
 */

import { randomBytes } from 'crypto';
import type { Browser, Page } from 'playwright';

const VIEWPORT = { width: 1280, height: 720 };
const ALLOWED_HOST_SUFFIXES = ['orkg.org'] as const;
const SESSION_TTL_MS = 30 * 60 * 1000;

export interface BrowserFrame {
  sessionId: string;
  url: string;
  title: string;
  screenshot: string;
  viewport: { width: number; height: number };
}

interface BrowserSession {
  id: string;
  page: Page;
  userId?: string;
  lastActive: number;
}

let browser: Browser | null = null;
let browserLaunching: Promise<Browser> | null = null;
const sessions = new Map<string, BrowserSession>();

export function isLiveBrowserConfigured(): boolean {
  return process.env.ENABLE_LIVE_BROWSER === 'true';
}

export async function isLiveBrowserAvailable(): Promise<boolean> {
  if (!isLiveBrowserConfigured()) return false;
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
}

function assertAllowedUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  const host = parsed.hostname.toLowerCase();
  const ok = ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (!ok) {
    throw new Error(
      `Navigation restricted to ORKG hosts (*.orkg.org). Got: ${host}`
    );
  }
  return parsed;
}

async function getBrowser(): Promise<Browser> {
  if (browser) return browser;
  if (browserLaunching) return browserLaunching;
  browserLaunching = (async () => {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    return browser;
  })();
  return browserLaunching;
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastActive > SESSION_TTL_MS) {
      void s.page
        .context()
        .close()
        .catch(() => undefined);
      sessions.delete(id);
    }
  }
}

async function captureFrame(session: BrowserSession): Promise<BrowserFrame> {
  session.lastActive = Date.now();
  const buffer = await session.page.screenshot({
    type: 'jpeg',
    quality: 78,
    fullPage: false,
  });
  return {
    sessionId: session.id,
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: buffer.toString('base64'),
    viewport: { ...VIEWPORT },
  };
}

function getSessionForUser(sessionId: string, userId?: string): BrowserSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Browser session not found or expired');
  if (userId && session.userId && session.userId !== userId) {
    throw new Error('Browser session access denied');
  }
  return session;
}

export async function createBrowserSession(
  url: string,
  userId?: string
): Promise<BrowserFrame> {
  if (!(await isLiveBrowserAvailable())) {
    throw new Error(
      'Live browser is not enabled. Set ENABLE_LIVE_BROWSER=true and install Playwright (npx playwright install chromium).'
    );
  }
  pruneSessions();
  assertAllowedUrl(url);
  const b = await getBrowser();
  const context = await b.newContext({
    viewport: VIEWPORT,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const id = `bs_${randomBytes(8).toString('hex')}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const session: BrowserSession = { id, page, userId, lastActive: Date.now() };
  sessions.set(id, session);
  return captureFrame(session);
}

export async function getBrowserFrame(
  sessionId: string,
  userId?: string
): Promise<BrowserFrame> {
  const session = getSessionForUser(sessionId, userId);
  return captureFrame(session);
}

export async function navigateBrowserSession(
  sessionId: string,
  url: string,
  userId?: string
): Promise<BrowserFrame> {
  const session = getSessionForUser(sessionId, userId);
  assertAllowedUrl(url);
  await session.page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  return captureFrame(session);
}

export async function clickBrowserSession(
  sessionId: string,
  x: number,
  y: number,
  userId?: string
): Promise<BrowserFrame> {
  const session = getSessionForUser(sessionId, userId);
  const clampedX = Math.max(0, Math.min(VIEWPORT.width, x));
  const clampedY = Math.max(0, Math.min(VIEWPORT.height, y));
  await session.page.mouse.click(clampedX, clampedY);
  await session.page.waitForTimeout(400);
  return captureFrame(session);
}

export async function browserSessionBack(
  sessionId: string,
  userId?: string
): Promise<BrowserFrame> {
  const session = getSessionForUser(sessionId, userId);
  await session.page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  return captureFrame(session);
}

export async function browserSessionForward(
  sessionId: string,
  userId?: string
): Promise<BrowserFrame> {
  const session = getSessionForUser(sessionId, userId);
  await session.page.goForward({
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  return captureFrame(session);
}

export async function closeBrowserSession(
  sessionId: string,
  userId?: string
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (userId && session.userId && session.userId !== userId) return;
  await session.page
    .context()
    .close()
    .catch(() => undefined);
  sessions.delete(sessionId);
}
