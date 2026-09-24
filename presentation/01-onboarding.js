/**
 * Proposal video 1 -- Onboarding: sign-up -> pending approval -> admin approves -> first login.
 *
 * Drives the REAL app in a browser and records it (Playwright). Nothing is faked:
 * the account is created with the sign-up form and approved from the Approvals page.
 *
 * Needs: backend on :8000, frontend on :3000, the admin from the seed ("HrLead").
 * Run:   node presentation/01-onboarding.js            (records to presentation/videos)
 *        node presentation/01-onboarding.js --dry      (same run, no recording -- warms
 *                                                       up the dev server's page compiles)
 * Requires the `playwright` package resolvable from Node (e.g. NODE_PATH) and, for the
 * .mp4, ffmpeg on PATH (otherwise the .webm is kept).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DRY = process.argv.includes("--dry");
const BASE = process.env.APP_URL || "http://localhost:3000";
const OUT_DIR = path.join(__dirname, "videos");
const W = 1440;
const H = 810;

const NEW_USER = {
  name: "Hammad Yousaf",
  title: "HR Executive",
  email: "hammad.yousaf@example.com",
  password: "Demo@12345",
};
const ADMIN = { email: "hrlead@company.com", password: "HrLead@123" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Injected into every page: a visible cursor + click ripple, a caption bar, title cards,
// and hides the Next.js dev badge and the login page's demo-account shortcuts.
const OVERLAY = `
(() => {
  const css = document.createElement('style');
  css.textContent = \`
    nextjs-portal { display: none !important; }
    #__cursor { position: fixed; z-index: 2147483646; width: 22px; height: 22px; margin: -4px 0 0 -4px;
      pointer-events: none; transition: transform .08s; left: 0; top: 0; }
    #__cursor svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,.45)); }
    .__ripple { position: fixed; z-index: 2147483645; width: 34px; height: 34px; margin: -17px 0 0 -17px;
      border-radius: 50%; border: 3px solid #4f46e5; pointer-events: none; animation: __rip .55s ease-out forwards; }
    @keyframes __rip { from { transform: scale(.3); opacity: .9 } to { transform: scale(1.6); opacity: 0 } }
    #__cap { position: fixed; z-index: 2147483647; left: 50%; bottom: 26px; transform: translateX(-50%);
      max-width: 78%; padding: 12px 22px; border-radius: 14px; background: rgba(17,24,39,.92); color: #fff;
      font: 500 19px/1.35 Inter, system-ui, sans-serif; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.35);
      opacity: 0; transition: opacity .35s; pointer-events: none; }
    #__cap.on { opacity: 1 }
    #__card { position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 14px; background: linear-gradient(135deg,#312e81,#4f46e5); color: #fff;
      font-family: Inter, system-ui, sans-serif; text-align: center; opacity: 0; transition: opacity .6s; pointer-events: none; }
    #__card.on { opacity: 1 }
    #__card h1 { font-size: 44px; font-weight: 650; letter-spacing: -.02em; margin: 0 }
    #__card p { font-size: 22px; opacity: .85; margin: 0; max-width: 70% }
    #__card .brand { font-size: 20px; opacity: .8; letter-spacing: .08em; text-transform: uppercase }
  \`;
  const mount = () => {
    if (document.getElementById('__cursor')) return;
    document.head.appendChild(css);
    const cur = document.createElement('div'); cur.id = '__cursor';
    cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2 4 8-3 1-4-8-5 5z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    cur.style.transform = 'translate(-100px,-100px)';
    const cap = document.createElement('div'); cap.id = '__cap';
    const card = document.createElement('div'); card.id = '__card';
    document.body.append(cur, cap, card);
    const saved = sessionStorage.getItem('__cap'); if (saved) { cap.textContent = saved; cap.classList.add('on'); }
    const pos = sessionStorage.getItem('__pos'); if (pos) cur.style.transform = pos;
    window.addEventListener('mousemove', (e) => {
      const t = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
      cur.style.transform = t; sessionStorage.setItem('__pos', t);
    }, true);
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = '__ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 700);
    }, true);
    window.__caption = (t) => { if (t) { cap.textContent = t; cap.classList.add('on'); sessionStorage.setItem('__cap', t); }
      else { cap.classList.remove('on'); sessionStorage.removeItem('__cap'); } };
    window.__card = (title, sub, on) => { card.innerHTML = on ? '<div class="brand">OnBoard</div><h1>' + title + '</h1><p>' + (sub || '') + '</p>' : card.innerHTML;
      card.classList.toggle('on', !!on); };
    // The login page's demo-account shortcuts don't apply to a real rollout.
    const hideDemo = () => document.querySelectorAll('p').forEach((p) => {
      if (/sample account/i.test(p.textContent || '')) { const box = p.closest('div'); if (box) box.style.display = 'none'; } });
    new MutationObserver(hideDemo).observe(document.body, { childList: true, subtree: true }); hideDemo();
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
`;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmpDir = path.join(OUT_DIR, "_tmp");
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    ...(DRY ? {} : { recordVideo: { dir: tmpDir, size: { width: W, height: H } } }),
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  const started = Date.now();

  const caption = async (text) => {
    await page.evaluate((t) => window.__caption && window.__caption(t), text).catch(() => {});
    await sleep(600);
  };
  const card = async (title, sub, ms) => {
    await page.evaluate(([t, s]) => window.__card(t, s, true), [title, sub]);
    await sleep(ms);
    await page.evaluate(() => window.__card("", "", false));
    await sleep(700);
  };
  // Human-looking pointer: glide to the element, then click it.
  async function click(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y, { steps: 28 });
    await sleep(350);
    await page.mouse.click(x, y);
    await sleep(500);
  }
  async function type(locator, text, delay = 65) {
    await click(locator);
    await locator.pressSequentially(text, { delay });
    await sleep(350);
  }
  async function goto(url) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await sleep(500);
  }

  // ---------------------------------------------------------------- intro
  await goto(`${BASE}/login`);
  await card("Onboarding a new HR team member", "Sign-up  →  admin approval  →  first login", 3800);

  // ------------------------------------------------ 1. request an account
  await caption("Step 1 — A new team member asks for access from the sign-up page");
  await sleep(1500);
  await click(page.getByRole("link", { name: "Request access" }));
  await page.waitForURL("**/signup");
  await sleep(900);

  await caption("They fill in the request form");
  // Role: HR is the default; show it deliberately.
  await click(page.locator("#role"));
  await page.selectOption("#role", "hr");
  await sleep(500);
  await type(page.locator("#name"), NEW_USER.name);
  await type(page.locator("#title"), NEW_USER.title);
  await type(page.locator("#email"), NEW_USER.email);
  await type(page.locator("#password"), NEW_USER.password, 80);
  await type(page.locator("#confirmPassword"), NEW_USER.password, 80);
  await sleep(1200);
  await caption("The form warns that an administrator must approve the request first");
  await sleep(2600);
  await click(page.getByRole("button", { name: "Submit request" }));
  await page.waitForURL("**/signup/pending");

  // ------------------------------------------------ 2. pending
  await caption("Step 2 — The request is submitted, but access is not granted automatically");
  await sleep(4500);
  await click(page.getByRole("button", { name: "Back to login" }));
  await page.waitForURL("**/login");
  await sleep(700);

  // ------------------------------------------------ 3. blocked login
  await caption("Step 3 — Signing in before approval is refused");
  await type(page.locator("#email"), NEW_USER.email);
  await type(page.locator("#password"), NEW_USER.password, 80);
  await click(page.getByRole("button", { name: "Sign in" }));
  await page.waitForSelector("text=pending admin approval", { timeout: 15000 });
  await sleep(4500);

  // ------------------------------------------------ 4. admin signs in
  await caption("Step 4 — An administrator (HrLead) signs in");
  await goto(`${BASE}/login`); // fresh form: drops the previous error message
  await type(page.locator("#email"), ADMIN.email);
  await type(page.locator("#password"), ADMIN.password, 80);
  await click(page.getByRole("button", { name: "Sign in" }));
  await page.waitForURL("**/admin", { timeout: 20000 });
  await sleep(2500);

  // ------------------------------------------------ 5. approve
  await caption("Step 5 — Under Approvals, the new request is waiting for a decision");
  await click(page.getByRole("link", { name: "Approvals", exact: true }));
  await page.waitForURL("**/admin/approvals");
  await page.waitForSelector("text=Hammad Yousaf");
  await sleep(4000);
  await caption("The admin reviews the request and approves it");
  await sleep(1800);
  await click(page.getByRole("button", { name: "Approve" }).first());
  await page.waitForSelector("text=All caught up", { timeout: 15000 });
  await caption("Approved — the decision is recorded in the approval history");
  await sleep(4500);

  // ------------------------------------------------ 6. admin signs out
  await caption("Step 6 — The administrator signs out");
  await click(page.getByRole("button", { name: "Log out" }));
  await page.waitForURL("**/login");
  await sleep(900);

  // ------------------------------------------------ 7. first login
  await caption("Step 7 — The new team member signs in again");
  await type(page.locator("#email"), NEW_USER.email);
  await type(page.locator("#password"), NEW_USER.password, 80);
  await click(page.getByRole("button", { name: "Sign in" }));
  await page.waitForURL("**/hr", { timeout: 20000 });
  await page.waitForSelector("text=Welcome back, Hammad");
  await caption("Access granted — Hammad is now part of the platform");
  await sleep(5500);
  await caption("");
  await card("Onboarding complete", "Request  →  approval  →  access, with a full audit trail", 3800);

  const seconds = Math.round((Date.now() - started) / 1000);
  const video = DRY ? null : page.video();
  await context.close(); // flushes the recording
  await browser.close();

  if (DRY) {
    console.log(`Dry run finished in ${seconds}s (no video).`);
    return;
  }
  const webm = await video.path();
  const finalWebm = path.join(OUT_DIR, "01-onboarding.webm");
  fs.copyFileSync(webm, finalWebm);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  try {
    execFileSync(
      process.env.FFMPEG || "ffmpeg",
      ["-y", "-i", finalWebm, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(OUT_DIR, "01-onboarding.mp4")],
      { stdio: "ignore" }
    );
    fs.rmSync(finalWebm);
    console.log(`Recorded ${seconds}s -> ${path.join(OUT_DIR, "01-onboarding.mp4")}`);
  } catch {
    console.log(`Recorded ${seconds}s -> ${finalWebm} (ffmpeg not found, kept .webm)`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
