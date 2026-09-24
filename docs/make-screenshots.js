/**
 * Captures the README screenshots (docs/images/*.png) from the running app.
 * Everything is real: it drives the apps with Playwright, calls the real API to prepare data, and
 * uses real OpenAI calls for the agent / AI review / AI notes / live-assistance images.
 *
 *   node docs/make-screenshots.js               all phases
 *   node docs/make-screenshots.js --only=agent   just some phases (comma separated):
 *        setup, forms, flows, dashboards, agent, calendar, review, notes, live, admin
 *
 * It CHANGES data (stage moves, interviews, an extra job); run  docs/cleanup-screenshots.py
 * afterwards (backend venv python) to put the demo data back.
 * Needs: backend :8000, frontend :3000, apply portal :3001, `playwright` (NODE_PATH), and the
 * assets from presentation/ (avatars, voice clips, CV PDFs).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const APP = "http://localhost:3000";
const PORTAL = "http://localhost:3001";
const API = "http://localhost:8000";
const IMG = path.join(__dirname, "images");
const ASSETS = path.join(__dirname, "..", "presentation", "assets");
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);
const wants = (name) => only.length === 0 || only.includes(name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN = { email: "hrlead@company.com", password: "HrLead@123" };
const SARA = { email: "sara.malik@company.com", password: "Sara@123" };
const HIDE_DEV_BADGE = `(() => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); })();`;
const STT_STUB = `
(() => {
  class FakeRecognition { constructor() { window.__rec = this; } start() { setTimeout(() => this.onstart && this.onstart(), 50); } stop() { setTimeout(() => this.onend && this.onend(), 10); } abort() {} }
  window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
  window.__sttEmit = (text) => { const r = window.__rec; if (!r || !r.onresult) return false; r.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] }); return true; };
})();`;

// ------------------------------------------------------------------ API helpers
async function api(method, url, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(form); }
  const res = await fetch(API + url, { method, headers, body });
  let data = null;
  try { data = await res.json(); } catch { /* 204 */ }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}
const login = async (u) => (await api("POST", "/auth/login", { form: { username: u.email, password: u.password } })).access_token;
const tryApi = async (...a) => { try { return await api(...a); } catch (e) { console.log("  (ignored)", e.message.slice(0, 120)); return null; } };
// A wall-clock time in Pakistan (UTC+5), `days` from today, as an ISO string.
function pkt(days, hour) {
  const now = new Date(Date.now() + 5 * 3600 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour - 5, 0, 0));
  return d.toISOString();
}

const S = { ids: {}, tokens: {} };

async function launch(extraArgs = []) {
  return chromium.launch({
    channel: "chromium",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", ...extraArgs],
  });
}
async function newPage(browser, { stt = false, width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1.5, timezoneId: "Asia/Karachi", permissions: ["camera", "microphone"],
  });
  await context.addInitScript(HIDE_DEV_BADGE);
  if (stt) await context.addInitScript(STT_STUB);
  return { context, page: await context.newPage() };
}
async function uiLogin(page, u, expectUrl) {
  await page.goto(APP + "/login");
  await page.fill("#email", u.email);
  await page.fill("#password", u.password);
  await page.click('button[type="submit"]:has-text("Sign in")');
  await page.waitForURL(expectUrl, { timeout: 20000 });
  await sleep(600);
}
const shot = async (target, name, opts = {}) => {
  await target.screenshot({ path: path.join(IMG, name), ...opts });
  console.log("  wrote", name);
};
const cardOf = (page, headingText) =>
  page.locator(`h2:has-text("${headingText}")`).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');

async function phase(name, fn) {
  if (!wants(name)) return;
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { console.log(`  !! phase "${name}" failed: ${e.message.split("\n").slice(0, 5).join(" | ")}`); }
}

// ------------------------------------------------------------------ phases
async function setup() {
  S.tokens.admin = await login(ADMIN);
  S.tokens.sara = await login(SARA);
  const me = await api("GET", "/auth/me", { token: S.tokens.sara });
  S.ids.sara = me.id;
  const jobs = await api("GET", "/jobs", { token: S.tokens.sara });
  const ai = jobs.find((j) => j.title === "AI Engineer");
  S.ids.aiJob = ai.id;
  const apps = await api("GET", `/jobs/${ai.id}/applicants`, { token: S.tokens.sara });
  for (const a of apps) S.ids[a.name] = a.id;
  const nonTech = jobs.find((j) => j.title === "HR Coordinator");
  if (nonTech) S.ids.hrJob = nonTech.id;
  console.log("  applicants:", Object.keys(S.ids).filter((k) => !["sara", "aiJob", "hrJob"].includes(k)).join(", "));
}

async function ensureNonTechnicalJob() {
  if (S.ids.hrJob) return;
  const job = await api("POST", "/jobs", {
    token: S.tokens.admin,
    json: {
      title: "HR Coordinator", department: "People Operations", location: "Lahore, Pakistan (Onsite)",
      description: "Coordinate interviews, onboarding paperwork and employee records. Be the first point of contact for new joiners and keep our HR processes organised and on time.",
      seats: 1, salary_min: 120000, salary_max: 180000, currency: "PKR", status: "open", collect_github: false, assigned_hr_id: S.ids.sara,
    },
  });
  S.ids.hrJob = job.id;
}

async function makeCoordinatorCv() {
  const file = path.join(ASSETS, "cvs", "Nimra_Aslam_CV.pdf");
  if (fs.existsSync(file)) return file;
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(`<body style="font-family:Segoe UI,Arial;margin:0"><div style="background:#312e81;color:#fff;padding:32px 44px"><h1 style="margin:0;font-size:32px">Nimra Aslam</h1><div>HR Coordinator</div><div style="font-size:12.5px;margin-top:12px;opacity:.9">nimra.aslam@example.com · +92 305 6700606 · Lahore, Pakistan</div></div>
   <div style="padding:26px 44px;font-size:13px;line-height:1.6;color:#1f2937"><h3 style="color:#4f46e5;font-size:12px;letter-spacing:.12em">PROFILE</h3><p>People-operations professional with 3 years of experience coordinating recruitment, onboarding and HR records for a 200-person company.</p>
   <h3 style="color:#4f46e5;font-size:12px;letter-spacing:.12em">EXPERIENCE</h3><p><b>HR Assistant</b> — Lahore Digital · 2023 – Present<br>Scheduled 40+ interviews a month, ran new-joiner onboarding, and kept the HR records system audit-ready.</p>
   <p><b>Administrative Officer</b> — Sitara Group · 2021 – 2023<br>Managed employee files, leave records and vendor coordination.</p>
   <h3 style="color:#4f46e5;font-size:12px;letter-spacing:.12em">EDUCATION</h3><p>BBA (Human Resource Management) — Lahore School of Economics, 2017 – 2021</p></div></body>`);
  await p.pdf({ path: file, format: "A4", printBackground: true });
  await b.close();
  return file;
}

async function fillForm(page, person, cvFile, { technical }) {
  await page.fill("#name", person.name);
  await page.fill("#email", person.email);
  await page.fill("#phone_number", person.phone);
  await page.fill("#experience_years", String(person.years));
  await page.fill("#country", "Pakistan");
  await page.fill("#city", person.city);
  await page.fill("#linkedin_url", person.linkedin);
  if (technical) await page.fill("#github_url", person.github);
  await page.fill("#cover_letter", person.cover);
  await page.setInputFiles("#cv_file", cvFile);
  await sleep(500);
}

async function forms() {
  await ensureNonTechnicalJob();
  const cv = await makeCoordinatorCv();
  const have = async (jobId, name) => (await api("GET", `/jobs/${jobId}/applicants`, { token: S.tokens.sara })).some((a) => a.name === name);
  const b = await launch();
  const { page } = await newPage(b, { width: 1200, height: 900 });
  // Technical form (GitHub field). Submitted, so the board also has one candidate still at "applied".
  await page.goto(`${PORTAL}/apply/${S.ids.aiJob}`);
  await page.waitForSelector("#name");
  await fillForm(page, {
    name: "Zain Ahmed", email: "zain.ahmed@example.com", phone: "+92 306 7800707", years: 3, city: "Lahore",
    linkedin: "linkedin.com/in/zain-ahmed-demo", github: "github.com/zain-ahmed-demo",
    cover: "I'm excited about the AI Engineer role — I've shipped two ML services to production and enjoy owning models end to end.",
  }, path.join(ASSETS, "cvs", "Mahnoor_Iqbal_CV.pdf"), { technical: true });
  await shot(page, "form-technical.png", { fullPage: true });
  if (!(await have(S.ids.aiJob, "Zain Ahmed"))) {
    await page.click('button:has-text("Submit application")');
    await page.waitForSelector("text=Application submitted", { timeout: 30000 });
  }
  // Non-technical form: no GitHub field.
  await page.goto(`${PORTAL}/apply/${S.ids.hrJob}`);
  await page.waitForSelector("#name");
  await fillForm(page, {
    name: "Nimra Aslam", email: "nimra.aslam@example.com", phone: "+92 305 6700606", years: 3, city: "Lahore",
    linkedin: "linkedin.com/in/nimra-aslam-demo",
    cover: "I'd love to help coordinate hiring and onboarding at your company — organised, reliable and people-first.",
  }, cv, { technical: false });
  await shot(page, "form-non-technical.png", { fullPage: true });
  if (!(await have(S.ids.hrJob, "Nimra Aslam"))) {
    await page.click('button:has-text("Submit application")');
    await page.waitForSelector("text=Application submitted", { timeout: 30000 });
  }
  await b.close();
  const apps = await api("GET", `/jobs/${S.ids.hrJob}/applicants`, { token: S.tokens.sara });
  S.ids["Nimra Aslam"] = apps.find((a) => a.name === "Nimra Aslam").id;
}

async function flows() {
  const b = await launch();
  const { page } = await newPage(b);
  await uiLogin(page, SARA, "**/hr");
  // Technical job: an applicant still at "applied" offers the coding assessment.
  await page.goto(`${APP}/hr/jobs/${S.ids.aiJob}/applicants/${S.ids["Daniyal Mirza"]}`);
  await page.waitForSelector("text=Forward coding assessment");
  await shot(cardOf(page, "Recruitment pipeline"), "flow-technical.png");
  // Non-technical job: the same step has no coding assessment.
  await page.goto(`${APP}/hr/jobs/${S.ids.hrJob}/applicants/${S.ids["Nimra Aslam"]}`);
  await page.waitForSelector("text=Pass to interview");
  await shot(cardOf(page, "Recruitment pipeline"), "flow-non-technical.png");
  await b.close();
}

async function prepVariety() {
  const t = S.tokens.sara;
  await tryApi("POST", `/applicants/${S.ids["Daniyal Mirza"]}/forward-coding-assessment`, { token: t });
  await tryApi("POST", `/applicants/${S.ids["Mahnoor Iqbal"]}/pass-to-interview`, { token: t });
  await tryApi("POST", `/applicants/${S.ids["Hassan Javed"]}/reject`, { token: t, json: { note: "Not enough production experience for this role", save_to_cv_bank: false } });
  await tryApi("POST", `/applicants/${S.ids["Sana Farooqi"]}/pass-to-interview`, { token: t });
  await tryApi("POST", `/applicants/${S.ids["Sana Farooqi"]}/schedule-interview`, { token: t, json: { scheduled_at: pkt(5, 10), notify_day_before: true } });
}

async function dashboards() {
  await prepVariety();
  const b = await launch();
  const { page } = await newPage(b);
  await uiLogin(page, SARA, "**/hr");
  await page.waitForSelector("text=Upcoming interviews");
  await shot(page, "dashboard-hr-home.png", { fullPage: true });
  await page.goto(`${APP}/hr/jobs/${S.ids.aiJob}`);
  await page.waitForSelector("text=Coding Assessment");
  await sleep(1200);
  await shot(page, "dashboard-applicants.png", { fullPage: true });
  await b.close();
}

async function agent() {
  const VOICE = path.join(ASSETS, "voice", "move-three.wav");
  const b = await launch([`--use-file-for-fake-audio-capture=${VOICE}%noloop`]);
  const { page } = await newPage(b, { width: 1440, height: 900 });
  await uiLogin(page, SARA, "**/hr");
  const panel = () => page.locator("aside").last();
  const input = () => page.locator("aside div.border-t input");
  await page.locator('button[aria-label="Open HR assistant"]').click();
  await page.waitForSelector("aside div.border-t input");
  const turn = async () => {
    await page.waitForFunction(() => { const i = document.querySelector("aside div.border-t input"); return i && i.disabled; }, null, { timeout: 5000 }).catch(() => {});
    await Promise.race([
      page.waitForSelector('aside button:has-text("Confirm")', { timeout: 120000 }),
      page.waitForFunction(() => { const i = document.querySelector("aside div.border-t input"); return i && !i.disabled; }, null, { timeout: 120000 }),
    ]);
    await sleep(1500);
  };
  const ask = async (text) => { await input().fill(text); await page.locator('aside button[aria-label="Send"]').click(); await turn(); };
  const fresh = async () => { await page.reload(); await page.locator('button[aria-label="Open HR assistant"]').click({ timeout: 1500 }).catch(() => {}); await page.waitForSelector("aside div.border-t input"); await sleep(500); };

  const want = (n) => !process.env.AGENT_ONLY || process.env.AGENT_ONLY.split(",").includes(n);
  // Voice first: the fake microphone plays the clip when it is first opened.
  if (want("voice")) {
  await page.locator('aside button[aria-label="Speak to the assistant"]').click();
  await page.waitForSelector('aside button[aria-label="Stop recording"]');
  await sleep(6500);
  await page.locator('aside button[aria-label="Stop recording"]').click();
  await page.waitForFunction(() => { const i = document.querySelector("aside div.border-t input"); return i && i.value.length > 10; }, null, { timeout: 30000 });
  await sleep(500);
  await shot(panel(), "agent-voice.png");
  await input().fill("");
  }

  if (want("text")) {
  await fresh();
  await ask("Give me a quick summary of where each of my applicants stands.");
  await shot(panel(), "agent-text.png");
  }

  if (want("chart")) {
  await fresh();
  await ask("Show me a bar chart of how many applicants are in each stage.");
  await sleep(1500);
  await shot(panel(), "agent-chart.png");
  }

  if (want("cv")) {
  await fresh();
  await ask("Show me Daniyal Mirza's CV.");
  await shot(panel(), "agent-cv.png");
  }

  if (want("scheduling")) {
  await fresh();
  await ask("Find a slot for Mahnoor Iqbal next Tuesday afternoon.");
  await ask("Book the 2pm one.");
  if (!(await page.locator('aside button:has-text("Confirm")').count())) await ask("Yes, go ahead and book it.");
  await shot(panel(), "agent-scheduling.png");
  await page.locator('aside button:has-text("Confirm")').first().click({ timeout: 5000 });
  await turn();
  }
  await b.close();
}

async function calendar() {
  const t = S.tokens.sara;
  const list = await api("GET", "/appointments", { token: t });
  // Extra rounds for the candidate who is already scheduled, so the calendar has several dots.
  await tryApi("POST", `/applicants/${S.ids["Sana Farooqi"]}/schedule-interview`, { token: t, json: { scheduled_at: pkt(6, 11), notify_day_before: true } });
  await tryApi("POST", `/applicants/${S.ids["Sana Farooqi"]}/schedule-interview`, { token: t, json: { scheduled_at: pkt(8, 15), notify_day_before: false } });
  const all = await api("GET", "/appointments", { token: t });
  const first = all.find((a) => a.applicant_id === S.ids["Sana Farooqi"] && a.notify_day_before === true);
  void list; void first;
  const b = await launch();
  const { page } = await newPage(b, { width: 1440, height: 900 });
  await uiLogin(page, SARA, "**/hr");
  await page.goto(`${APP}/hr/appointments`);
  await page.waitForSelector("text=Lined-up interviews");
  await sleep(1200);
  await shot(page, "calendar.png", { fullPage: true });
  await b.close();
}

async function review() {
  const b = await launch();
  const { page } = await newPage(b);
  await uiLogin(page, SARA, "**/hr");
  await page.goto(`${APP}/hr/jobs/${S.ids.aiJob}/applicants/${S.ids["Daniyal Mirza"]}`);
  await page.waitForSelector("text=AI Job Review");
  await page.getByRole("button", { name: /Run AI Job Review/i }).first().click();
  await page.waitForSelector("text=/Communication/", { timeout: 120000 });
  await sleep(2500);
  await shot(cardOf(page, "AI Job Review"), "ai-review.png");
  await b.close();
}

async function ensureRoom(applicantName, minutesFilter) {
  const t = S.tokens.sara;
  const all = await api("GET", "/appointments", { token: t });
  const mine = all.filter((a) => a.applicant_id === S.ids[applicantName] && a.room_status !== "ended").sort((x, y) => new Date(x.scheduled_at) - new Date(y.scheduled_at));
  const appt = minutesFilter ? minutesFilter(mine) : mine[0];
  if (appt.room_status === "not_setup") await tryApi("POST", "/appointments/setup-rooms", { token: t, json: { appointment_ids: [appt.id] } });
  return appt.id;
}

async function notes() {
  const apptId = await ensureRoom("Mahnoor Iqbal");
  const hr = await launch([`--use-file-for-fake-video-capture=${path.join(ASSETS, "avatars", "sara.mjpeg")}`]);
  const { page } = await newPage(hr, { stt: true });
  await uiLogin(page, SARA, "**/hr");
  await page.goto(`${APP}/hr/appointments/${apptId}/room`);
  await page.waitForSelector('textarea[aria-label="Extra instructions for the AI"]');
  const link = (await page.locator("p.break-all").first().innerText()).trim();
  await page.fill('textarea[aria-label="Interview notes"]', "Ask how she measures model quality after release. Probe the forecasting work at Telenor.");
  await page.fill('textarea[aria-label="Extra instructions for the AI"]', "Focus on NLP, evaluation and production experience.");
  await page.getByRole("button", { name: /Get interview questions|Regenerate questions/ }).click();
  await sleep(2500);
  await page.waitForSelector("text=Regenerate questions", { timeout: 120000 });
  await sleep(1500);
  const side = page.getByRole("button", { name: "Notes & questions" }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await shot(side, "ai-notes.png");

  // The interview room once the video has started (candidate in a second browser).
  await page.locator('label:has-text("Record video")').click();
  await page.getByRole("button", { name: "Start room" }).click();
  await page.waitForSelector('[data-testid="stt-status"]', { timeout: 40000 });
  const cb = await launch([`--use-file-for-fake-video-capture=${path.join(ASSETS, "avatars", "mahnoor.mjpeg")}`]);
  const cand = await newPage(cb, { stt: true, width: 1200 });
  await cand.page.goto(link);
  await cand.page.waitForSelector('button:has-text("Join interview")', { timeout: 30000 });
  await cand.page.getByRole("button", { name: "Join interview" }).click();
  await cand.page.waitForSelector('[data-testid="stt-status"]', { timeout: 40000 });
  await page.waitForSelector('[data-testid="remote-video"] video', { timeout: 40000 });
  await page.getByRole("button", { name: /Application/ }).first().click().catch(() => {});
  const say = async (p, text) => { await p.evaluate((x) => window.__sttEmit && window.__sttEmit(x), text); await sleep(1600); };
  await say(page, "Thanks for joining, Mahnoor. Could you walk me through your most recent machine learning project?");
  await say(cand.page, "Sure. At Kalsoft I built a semantic search service over two million documents using sentence embeddings, which cut search latency by forty five percent.");
  await say(page, "Nice. How did you evaluate the model before releasing it?");
  await say(cand.page, "We tracked F one on a held out set, then ran an A B test before the full rollout.");
  await sleep(2500);
  await page.getByRole("button", { name: "Notes & questions" }).first().click();
  await sleep(600);
  await shot(page, "interview-room.png");
  await cb.close();
  await hr.close();
}

async function live() {
  const apptId = await ensureRoom("Sana Farooqi");
  const hr = await launch([
    `--use-file-for-fake-video-capture=${path.join(ASSETS, "avatars", "sara.mjpeg")}`,
    `--use-file-for-fake-audio-capture=${path.join(ASSETS, "voice", "live-interviewer.wav")}%noloop`,
  ]);
  const { page } = await newPage(hr);
  await uiLogin(page, SARA, "**/hr");
  await page.goto(`${APP}/hr/appointments/${apptId}/room`);
  await page.waitForSelector("text=Live AI assistance");
  const link = (await page.locator("p.break-all").first().innerText()).trim();
  await page.locator('label:has-text("Live AI assistance")').click();
  await sleep(500);
  const startCard = page.getByRole("button", { name: "Start room" }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await shot(startCard, "live-start.png");
  await page.getByRole("button", { name: "Start room" }).click();
  await page.waitForSelector('[data-testid="stt-status"]', { timeout: 40000 });

  const cb = await launch([
    `--use-file-for-fake-video-capture=${path.join(ASSETS, "avatars", "sana.mjpeg")}`,
    `--use-file-for-fake-audio-capture=${path.join(ASSETS, "voice", "live-candidate.wav")}%noloop`,
  ]);
  const cand = await newPage(cb, { width: 1000, height: 760 });
  await cand.page.goto(link);
  await cand.page.waitForSelector('[data-testid="ai-notice"]', { timeout: 30000 });
  await sleep(500);
  await shot(cand.page, "live-candidate-warning.png");
  await cand.page.getByRole("button", { name: "Join interview" }).click();
  await cand.page.waitForSelector('[data-testid="stt-status"]', { timeout: 40000 });

  await page.getByRole("button", { name: /Live AI/ }).first().click();
  for (let i = 0; i < 25; i++) {
    await sleep(5000);
    if ((await page.locator("text=You asked").count()) >= 2) break;
  }
  await sleep(2500);
  const side = page.getByRole("button", { name: /Live AI/ }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await shot(side, "live-insights.png");
  await cb.close();
  await hr.close();
}

async function admin() {
  await tryApi("POST", "/auth/signup", { json: { username: "zoya.farhan", full_name: "Zoya Farhan", email: "zoya.farhan@example.com", password: "Zoya@12345", role: "hr", title: "Technical Sourcer", phone_number: "+92 307 8900808", country: "Pakistan", city: "Karachi" } });
  const b = await launch();
  const { page } = await newPage(b);
  await uiLogin(page, ADMIN, "**/admin");
  await page.waitForSelector("text=Active HR accounts");
  await sleep(800);
  await shot(page, "admin-dashboard.png", { fullPage: true });
  await page.goto(`${APP}/admin/approvals`);
  await page.waitForSelector("text=Zoya Farhan");
  await sleep(600);
  await shot(page, "admin-approvals.png", { fullPage: true });

  await page.goto(`${APP}/admin/jobs`);
  await page.waitForSelector("text=Job Panel");
  await page.getByRole("button", { name: "Post a job" }).first().click();
  await page.waitForSelector("#job-title");
  await page.fill("#job-title", "Senior Backend Engineer");
  await page.fill("#job-department", "Engineering");
  await page.fill("#job-location", "Lahore, Pakistan (Hybrid)");
  await page.fill("#job-description", "Design and run the APIs behind our recruitment platform. You will own services end to end: data modelling, performance, observability and on-call.");
  await page.fill("#job-seats", "2");
  await page.fill("#job-salary-min", "450000");
  await page.fill("#job-salary-max", "700000");
  await page.locator('label:has-text("Technical role")').click();
  await sleep(600);
  await shot(page, "job-create.png");
  await page.getByRole("button", { name: "Cancel" }).first().click();

  await page.goto(`${APP}/admin/jobs/${S.ids.aiJob}`);
  await page.waitForSelector("text=Assigned HR");
  await sleep(1000);
  await shot(page, "job-assign-hr.png");

  await page.locator('button[aria-label="AI usage"]').click();
  await page.waitForSelector("text=/Recent calls/");
  await sleep(1200);
  await shot(page, "admin-ai-usage.png");
  await b.close();
}

(async () => {
  fs.mkdirSync(IMG, { recursive: true });
  await setup();
  await phase("forms", forms);
  await phase("flows", flows);
  await phase("dashboards", dashboards);
  await phase("agent", agent);
  await phase("calendar", calendar);
  await phase("review", review);
  await phase("notes", notes);
  await phase("live", live);
  await phase("admin", admin);
  console.log("\ndone");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
