/**
 * Proposal video 2 -- Admin posts an "AI Engineer" job and assigns an HR; five candidates apply
 * through the public application form (only the first is shown); the HR signs in, opens the job
 * and views an applicant's CV.
 *
 * Drives the REAL apps (frontend :3000, apply portal :3001, backend :8000) with Playwright.
 * Three segments are recorded separately, sped up, and joined with ffmpeg so the result stays
 * under ~90 s; the other four applications are submitted off-camera through the same form.
 *
 *   node presentation/02-job-and-applicants.js           record -> presentation/videos/02-job-and-applicants.mp4
 *   node presentation/02-job-and-applicants.js --dry     run everything without recording (warm-up / test)
 *
 * Needs `playwright` resolvable from Node (NODE_PATH) and FFMPEG=path-to-ffmpeg for the .mp4.
 * Run `node presentation/make-cvs.js` first (creates the template CV PDFs).
 * Afterwards delete the created job with `--cleanup` (removes it and its applicants via the API).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { OVERLAY, sleep, helpers } = require("./lib");

const DRY = process.argv.includes("--dry");
const CLEANUP = process.argv.includes("--cleanup");
const APP = process.env.APP_URL || "http://localhost:3000";
const PORTAL = process.env.PORTAL_URL || "http://localhost:3001";
const API = process.env.API_URL || "http://localhost:8000";
const OUT = path.join(__dirname, "videos");
const CVS = path.join(__dirname, "assets", "cvs");
const TMP = path.join(OUT, "_tmp02");
const W = 1440;
const H = 810;
const TARGET_SECONDS = 88;

const ADMIN = { email: "hrlead@company.com", password: "HrLead@123" };
const HR = { name: "Sara Malik", email: "sara.malik@company.com", password: "Sara@123" };
const JOB = {
  title: "AI Engineer",
  department: "Engineering",
  location: "Lahore, Pakistan (Hybrid)",
  description:
    "Design, build and ship machine-learning and LLM-powered features. You will own models from experiment to production, work with product teams, and set up evaluation and monitoring.",
  seats: "2",
  min: "400000",
  max: "700000",
};
const PEOPLE = JSON.parse(fs.readFileSync(path.join(CVS, "people.json"), "utf8"));

async function newPage(browser, record) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    ...(record ? { recordVideo: { dir: TMP, size: { width: W, height: H } } } : {}),
  });
  await context.addInitScript(OVERLAY);
  return { context, page: await context.newPage() };
}

async function fillApplication(page, h, person, { human }) {
  const put = async (sel, value, delay = 22) => (human ? h.type(page.locator(sel), value, delay) : page.locator(sel).fill(value));
  await put("#name", person.name);
  await put("#email", person.email);
  await put("#phone_number", person.phone);
  await put("#experience_years", String(person.years));
  await put("#country", "Pakistan");
  await put("#city", person.city);
  await put("#linkedin_url", person.linkedin);
  await put("#github_url", person.github);
  await put(
    "#cover_letter",
    `Hi team — I'm excited about the AI Engineer role. ${person.summary.split(". ")[0]}.`,
    8
  );
  if (human) await h.click(page.locator("#cv_file"));
  await page.setInputFiles("#cv_file", path.join(CVS, `${person.name.replace(" ", "_")}_CV.pdf`));
  await sleep(human ? 900 : 200);
}

async function finishRecording(context, page) {
  const video = page.video();
  await context.close();
  return video ? video.path() : null;
}

async function cleanup() {
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: ADMIN.email, password: ADMIN.password }),
  });
  const token = (await login.json()).access_token;
  const auth = { Authorization: `Bearer ${token}` };
  const jobs = await (await fetch(`${API}/jobs`, { headers: auth })).json();
  for (const j of jobs.filter((x) => x.title === JOB.title)) {
    const r = await fetch(`${API}/jobs/${j.id}`, { method: "DELETE", headers: auth });
    console.log(`deleted job ${j.id} (${j.title}) -> ${r.status}`);
  }
}

async function main() {
  if (CLEANUP) return cleanup();
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(TMP, { recursive: true, force: true });
  // channel "chromium" = Chromium's new headless mode, which (unlike the default headless shell)
  // includes the PDF viewer, so the CV preview renders in the recording.
  const browser = await chromium.launch({ channel: "chromium" });
  const clips = []; // [{ file, speed }]

  // ============================== Segment A: admin creates the job and assigns HR
  {
    const { context, page } = await newPage(browser, !DRY);
    const h = helpers(page, APP);
    await h.goto("/login");
    await h.card("Posting a job and receiving applications", "Admin creates the role  →  candidates apply  →  HR reviews", 3000);
    await h.ff(true);

    await h.caption("The administrator signs in");
    await h.type(page.locator("#email"), ADMIN.email, 25);
    await h.type(page.locator("#password"), ADMIN.password, 25);
    await h.click(page.getByRole("button", { name: "Sign in" }));
    await page.waitForURL("**/admin", { timeout: 20000 });
    await sleep(900);

    await h.caption("Posting a new job: AI Engineer");
    await h.click(page.getByRole("link", { name: "Jobs", exact: true }));
    await page.waitForURL("**/admin/jobs");
    await h.click(page.getByRole("button", { name: "Post a job" }).first());
    await page.waitForSelector("#job-title");
    await h.type(page.locator("#job-title"), JOB.title, 30);
    await h.type(page.locator("#job-department"), JOB.department, 25);
    await h.type(page.locator("#job-location"), JOB.location, 20);
    await h.type(page.locator("#job-description"), JOB.description, 6);
    await page.locator("#job-seats").fill("");
    await h.type(page.locator("#job-seats"), JOB.seats, 30);
    await h.type(page.locator("#job-salary-min"), JOB.min, 30);
    await h.type(page.locator("#job-salary-max"), JOB.max, 30);
    await h.click(page.locator('label:has-text("Technical role")'));
    await sleep(600);
    await h.click(page.getByRole("button", { name: "Post job" }));
    await page.waitForSelector(`a:has-text("${JOB.title}")`, { timeout: 15000 });
    await sleep(900);

    await h.caption("Opening the job to assign an HR owner");
    await h.click(page.getByRole("link", { name: JOB.title }).first());
    await page.waitForURL(/\/admin\/jobs\/[0-9a-f-]{36}$/);
    await page.waitForSelector("text=Assigned HR");
    await sleep(800);
    await h.caption(`Assigning ${HR.name} to the AI Engineer job`);
    const select = page.locator('select:has(option:text("Unassigned"))');
    await h.click(select);
    await select.selectOption({ label: HR.name });
    await sleep(1600);
    await h.caption("The job has its own public application link");
    await h.click(page.locator("text=Application form").first());
    await sleep(2200);

    const file = await finishRecording(context, page);
    if (file) clips.push({ file, speed: 1.55 });
  }

  // ============================== Segment B: the first candidate applies (on camera)
  {
    const { context, page } = await newPage(browser, !DRY);
    const h = helpers(page, PORTAL);
    await h.goto("/");
    await h.ff(true);
    await h.caption("A candidate finds the role on the careers page");
    await sleep(1200);
    await h.click(page.getByRole("link", { name: /AI Engineer/ }).first());
    await page.waitForSelector("#name");
    await h.caption("…and fills in the application form with their CV");
    await fillApplication(page, h, PEOPLE[0], { human: true });
    await h.click(page.getByRole("button", { name: "Submit application" }));
    await page.waitForSelector("text=Application submitted", { timeout: 30000 });
    await h.ff(false);
    await h.caption("Application received");
    await sleep(2200);
    const file = await finishRecording(context, page);
    if (file) clips.push({ file, speed: 1.6 });
  }

  // ============================== Off camera: four more candidates apply through the same form
  for (const person of PEOPLE.slice(1)) {
    const { context, page } = await newPage(browser, false);
    const h = helpers(page, PORTAL);
    await h.goto("/");
    await page.getByRole("link", { name: /AI Engineer/ }).first().click();
    await page.waitForSelector("#name");
    await fillApplication(page, h, person, { human: false });
    await page.getByRole("button", { name: "Submit application" }).click();
    await page.waitForSelector("text=Application submitted", { timeout: 30000 });
    console.log("applied (off camera):", person.name);
    await context.close();
  }

  // ============================== Segment C: HR reviews (on camera)
  {
    const { context, page } = await newPage(browser, !DRY);
    const h = helpers(page, APP);
    await h.goto("/login");
    await h.card("4 more candidates applied the same way", "Now the assigned HR reviews the applications", 2600);
    await h.caption(`${HR.name}, the assigned HR, signs in`);
    await h.type(page.locator("#email"), HR.email, 25);
    await h.type(page.locator("#password"), HR.password, 25);
    await h.click(page.getByRole("button", { name: "Sign in" }));
    await page.waitForURL("**/hr", { timeout: 20000 });
    await page.waitForSelector("text=Welcome back");
    await h.caption("The new job appears under her assigned jobs");
    await sleep(2200);
    await h.click(page.getByRole("link", { name: "My Jobs" }).first());
    await page.waitForURL("**/hr/jobs");
    await sleep(700);
    await h.click(page.getByRole("link", { name: JOB.title }).first());
    await page.waitForURL(/\/hr\/jobs\/[0-9a-f-]{36}$/);
    await page.waitForSelector(`text=${PEOPLE[4].name}`, { timeout: 20000 });
    await h.caption("All five applicants are here, ready to review");
    await sleep(3200);
    await h.caption("Opening one applicant's CV");
    await h.click(page.getByRole("button", { name: `View CV of ${PEOPLE[0].name}` }));
    await page.waitForSelector("iframe", { timeout: 20000 });
    await sleep(4500);
    if (DRY) await page.screenshot({ path: path.join(OUT, "_dry_cv.png") });
    await h.card("From job posting to reviewed applicants", "Every step is tracked in one place", 2800);
    const file = await finishRecording(context, page);
    if (file) clips.push({ file, speed: 1.05 });
  }

  await browser.close();
  if (DRY) {
    console.log("Dry run finished (no video).");
    return;
  }

  // ------------------------------- stitch: speed up each clip, join, cap the total length
  const ffmpeg = process.env.FFMPEG || "ffmpeg";
  const dur = (f) => {
    const out = execFileSync(ffmpeg, ["-i", f], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).toString();
    return out;
  };
  const probe = (f) => {
    try {
      execFileSync(ffmpeg, ["-i", f], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(e.stderr));
      return +m[1] * 3600 + +m[2] * 60 + +m[3];
    }
  };
  void dur;
  let total = clips.reduce((s, c) => s + probe(c.file) / c.speed, 0);
  const extra = Math.max(1, total / TARGET_SECONDS);
  console.log(`raw ${clips.map((c) => Math.round(probe(c.file))).join("+")}s, after speed-ups ${Math.round(total)}s, extra factor ${extra.toFixed(2)}`);
  const filters = clips
    .map((c, i) => `[${i}:v]setpts=PTS/${(c.speed * extra).toFixed(3)},fps=30,scale=${W}:${H},setsar=1[v${i}]`)
    .join(";");
  const concat = clips.map((_, i) => `[v${i}]`).join("") + `concat=n=${clips.length}:v=1:a=0[out]`;
  const output = path.join(OUT, "02-job-and-applicants.mp4");
  execFileSync(
    ffmpeg,
    [
      "-y", ...clips.flatMap((c) => ["-i", c.file]),
      "-filter_complex", `${filters};${concat}`, "-map", "[out]",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output,
    ],
    { stdio: "ignore" }
  );
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("wrote", output, `(${Math.round(probe(output))}s)`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
