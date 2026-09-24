/**
 * Proposal video 3 -- From applicant to hire: coding assessment -> interview stage -> schedule
 * -> set up room -> the candidate joins (recorded call) -> HR leaves notes -> interview record
 * -> candidate accepted.
 *
 * Drives the REAL apps (frontend :3000, apply portal :3001, backend :8000). Two browsers run
 * at the same time (HR + candidate) with fake cameras (avatar tiles) and a stubbed browser
 * speech recognizer that the script feeds with the scripted interview lines -- those lines go
 * through the real transcript pipeline (API -> DB -> live transcript -> saved transcript).
 *
 * The HR session is recorded continuously and the candidate session separately; the video is
 * then cut into pieces (some fast-forwarded) and joined with ffmpeg.
 *
 *   node presentation/03-interview-process.js          record -> presentation/videos/03-interview-process.mp4
 *   node presentation/03-interview-process.js --dry    run the whole flow without recording
 * Before a re-take run:  <backend venv python> presentation/reset-video3.py
 *
 * Needs `playwright` (NODE_PATH), FFMPEG=path, and the assets from make-avatars.js.
 * Precondition: the "AI Engineer" job from video 2 with applicant Areeba Khan at stage "applied".
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { OVERLAY, sleep, helpers } = require("./lib");

const DRY = process.argv.includes("--dry");
const APP = process.env.APP_URL || "http://localhost:3000";
const OUT = path.join(__dirname, "videos");
const TMP = path.join(OUT, "_tmp03");
const AVATARS = path.join(__dirname, "assets", "avatars");
const W = 1440;
const H = 810;
const TARGET_SECONDS = Number(process.env.TARGET_SECONDS || 140);

const HR = { name: "Sara Malik", email: "sara.malik@company.com", password: "Sara@123" };
const CANDIDATE = "Areeba Khan";

// Stand-in for the browser's speech recognizer (headless Chromium has none); the script calls
// window.__sttEmit(text) to "say" a line, which flows through the app's real transcript code.
const STT_STUB = `
(() => {
  class FakeRecognition {
    constructor() { window.__rec = this; }
    start() { setTimeout(() => this.onstart && this.onstart(), 50); }
    stop() { setTimeout(() => this.onend && this.onend(), 10); }
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  window.__sttEmit = (text) => {
    const r = window.__rec;
    if (!r || !r.onresult) return false;
    r.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
    return true;
  };
})();
`;

const EXCHANGE = [
  ["hr", "Thanks for joining, Areeba. Could you walk me through your most recent machine learning project?"],
  ["cand", "Sure. At Kalsoft I built a semantic search service over two million documents using sentence embeddings, which cut search latency by forty five percent."],
  ["hr", "Nice. How did you evaluate the model before releasing it?"],
  ["cand", "We tracked F one on a held out set, then ran an A B test before the full rollout."],
  ["hr", "Great. Do you have any questions for us?"],
  ["cand", "Yes. How does the team measure model quality in production?"],
];

const REVIEW =
  "Strong technical background. Clear examples of shipping ML to production, good communication and sensible evaluation habits. " +
  "Would like to explore system-design depth in a second round, but recommending we make an offer.";

// ----------------------------------------------------------------------------- pieces
const pieces = []; // narrative-ordered { track, from, to, speed }
let open = null;
const tracks = {};
function makeTrack(name) {
  tracks[name] = { name, t0: Date.now(), now() { return (Date.now() - this.t0) / 1000; } };
  return tracks[name];
}
function endPiece() {
  if (open) pieces.push({ ...open, to: open.track.now() });
  open = null;
}
function beginPiece(track, speed) {
  endPiece();
  open = { track, from: track.now(), speed };
}

async function launch(avatar) {
  return chromium.launch({
    channel: "chromium",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${path.join(AVATARS, avatar + ".mjpeg")}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
}

async function open2(browser, name, record) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    permissions: ["camera", "microphone"],
    ...(record ? { recordVideo: { dir: TMP, size: { width: W, height: H } } } : {}),
  });
  await context.addInitScript(OVERLAY);
  await context.addInitScript(STT_STUB);
  const page = await context.newPage();
  const track = makeTrack(name);
  return { context, page, track };
}

function localDatetime(daysAhead, hour) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(TMP, { recursive: true, force: true });
  const hrBrowser = await launch("sara");
  const candBrowser = await launch("areeba");

  const hrS = await open2(hrBrowser, "H", !DRY);
  const page = hrS.page;
  const h = helpers(page, APP);
  let speed = 1;
  const piece = async (track, s) => {
    speed = s;
    beginPiece(track, s);
    await h.ff(s > 1.3);
  };
  // Show a caption for ~`shown` seconds of VIDEO time (raw wait scales with the fast-forward).
  const note = async (text, shown = 2.4) => {
    await h.caption(text);
    await sleep(Math.max(0, shown * speed * 1000 - 450));
  };
  const skipCard = async (title, sub) => {
    await piece(hrS.track, 1);
    await h.ff(false);
    await h.card(title, sub, 2600);
  };

  // ------------------------------------------------------------ intro + navigation to the applicant
  await h.goto("/login");
  await piece(hrS.track, 1);
  await h.card("From applicant to hire", "Coding assessment  →  interview  →  recorded call  →  decision", 3000);
  await piece(hrS.track, 2.6);
  await note("Sara, the HR for the AI Engineer job, signs in", 2);
  await h.type(page.locator("#email"), HR.email, 20);
  await h.type(page.locator("#password"), HR.password, 20);
  await h.click(page.getByRole("button", { name: "Sign in" }));
  await page.waitForURL("**/hr", { timeout: 20000 });
  await h.click(page.getByRole("link", { name: "My Jobs" }).first());
  await page.waitForURL("**/hr/jobs");
  await h.click(page.getByRole("link", { name: "AI Engineer" }).first());
  await page.waitForSelector(`text=${CANDIDATE}`, { timeout: 20000 });
  await sleep(700);
  await h.click(page.getByRole("link", { name: CANDIDATE }).first());
  await page.waitForURL(/\/applicants\/[0-9a-f-]{36}$/);
  await page.waitForSelector("text=Forward coding assessment");

  // ------------------------------------------------------------ 1. coding assessment
  await piece(hrS.track, 1.3);
  await note(`${CANDIDATE} is at the first review. This is a technical role, so HR can forward a coding assessment`, 3.4);
  await h.click(page.getByRole("button", { name: "Forward coding assessment" }));
  await page.waitForSelector("text=forwarded the coding assessment", { timeout: 15000 });
  await note("Stage: Coding Assessment", 2.4);

  await skipCard("The candidate completes the assignment", "Results are in — HR moves them forward");
  await piece(hrS.track, 1.4);
  await h.click(page.getByRole("button", { name: "Pass to interview", exact: true }));
  await page.waitForSelector("text=pending an interview", { timeout: 15000 });
  await note("Assessment done: passed to Interview Pending", 2.4);

  // ------------------------------------------------------------ 2. schedule the interview
  await piece(hrS.track, 2.0);
  await h.click(page.getByRole("button", { name: "Schedule interview", exact: true }));
  await page.waitForSelector("#appt-datetime");
  await note("Choosing the interview slot", 1.8);
  await h.click(page.locator("#appt-datetime"));
  await page.locator("#appt-datetime").fill(localDatetime(1, 11));
  await sleep(600);
  await h.click(page.locator('form button[type="submit"]:has-text("Schedule interview")'));
  await page.waitForSelector("text=scheduled for", { timeout: 15000 });
  await piece(hrS.track, 1.4);
  await note("Interview scheduled — the candidate moves to Interview Scheduled", 2.6);

  // ------------------------------------------------------------ 3. set up the room
  await piece(hrS.track, 2.0);
  await h.click(page.getByRole("link", { name: "Appointments", exact: true }));
  await page.waitForURL("**/hr/appointments");
  await page.waitForSelector("text=Lined-up interviews");
  await note("Appointments: setting up the video room for the interview", 2.4);
  await h.click(page.getByRole("button", { name: `Set up video room for ${CANDIDATE}` }).last());
  await page.waitForSelector("text=Room ready", { timeout: 15000 });
  await sleep(700);
  await h.click(page.getByRole("link", { name: "Interviewer room", exact: true }).first());
  await page.waitForURL(/\/room$/);
  await page.waitForSelector("text=Candidate link");
  await piece(hrS.track, 1.3);
  const link = (await page.locator("p.break-all").first().innerText()).trim();
  await note("Every interview gets a private link for the candidate", 2.8);
  await h.click(page.getByRole("button", { name: "Copy link" }));
  await sleep(600);
  await note("Recording is switched on — the candidate is told about it", 2.4);
  await h.click(page.locator('label:has-text("Record video")'));
  await sleep(500);
  await h.click(page.getByRole("button", { name: "Start room" }));
  await page.waitForSelector('[data-testid="stt-status"]', { timeout: 40000 });
  await note("The room is live — waiting for the candidate to join", 2.4);

  // ------------------------------------------------------------ 4. the candidate joins (own browser)
  endPiece(); // HR waits while the candidate side runs; that stretch is cut from the video
  const candS = await open2(candBrowser, "C", !DRY);
  const cand = candS.page;
  const c = helpers(cand, "");
  beginPiece(candS.track, 1.25);
  await c.ff(false);
  await c.goto(link);
  await c.caption("The candidate opens the private link from their email");
  await cand.waitForSelector('button:has-text("Join interview")', { timeout: 30000 });
  await sleep(3200);
  await c.caption("They see that the interview is being recorded before joining");
  await sleep(3600);
  await c.click(cand.getByRole("button", { name: "Join interview" }));
  await cand.waitForSelector('[data-testid="stt-status"]', { timeout: 40000 });
  await c.caption("They're in the call with the interviewer");
  await sleep(4200);
  await c.caption("");
  endPiece();

  // ------------------------------------------------------------ 5. the interview (fast-forwarded)
  await page.waitForSelector('[data-testid="remote-video"] video', { timeout: 40000 });
  await sleep(1200);
  await piece(hrS.track, 1.3);
  await note("The candidate appears in the room", 2.2);
  await piece(hrS.track, 2.4);
  await note("The interview takes place; speech is transcribed live", 2.6);
  for (const [who, text] of EXCHANGE) {
    const p = who === "hr" ? page : cand;
    await sleep(1200);
    await p.evaluate((t) => window.__sttEmit && window.__sttEmit(t), text);
    await sleep(1800);
  }
  await sleep(2500);

  await skipCard("30 minutes later…", "The interview comes to an end");
  await piece(hrS.track, 1.6);
  await h.click(page.getByRole("button", { name: "End interview" }).first());
  await page.waitForSelector("#interview-review");
  await note("HR leaves notes about the candidate", 2.2);
  await h.type(page.locator("#interview-review"), REVIEW, 8);
  await sleep(500);
  await h.click(page.getByRole("button", { name: "End interview" }).last());
  await page.waitForURL("**/hr/appointments", { timeout: 60000 });
  await note("The recording and notes are saved with the interview", 2.6);

  // ------------------------------------------------------------ 6. back to the applicant, view the interview again
  await piece(hrS.track, 2.0);
  await page.waitForSelector("text=Completed interviews (1)");
  await sleep(800);
  await h.click(page.getByRole("link", { name: "My Jobs" }).first());
  await page.waitForURL("**/hr/jobs");
  await h.click(page.getByRole("link", { name: "AI Engineer" }).first());
  await page.waitForSelector(`text=${CANDIDATE}`, { timeout: 20000 });
  await sleep(500);
  await h.click(page.getByRole("link", { name: CANDIDATE }).first());
  await page.waitForURL(/\/applicants\/[0-9a-f-]{36}$/);
  await page.waitForSelector("text=Accept candidate");
  await piece(hrS.track, 1.3);
  await note("Back on the applicant's page, the interview can be opened again any time", 3);
  await h.click(page.getByRole("button", { name: /^Interviews \(1\)/ }));
  await sleep(700);
  await h.click(page.getByRole("menuitem").first());
  await page.waitForSelector('[data-testid="recording-player"]', { timeout: 30000 });
  await note("The full record: HR notes, transcript and the video recording", 3.2);
  await page.mouse.wheel(0, 380);
  await sleep(1200);
  await h.click(page.locator('[data-testid="recording-player"]'));
  await sleep(2800);
  await page.mouse.wheel(0, 500);
  await sleep(2200);

  // ------------------------------------------------------------ 7. accept
  await piece(hrS.track, 1.8);
  await page.goBack();
  await page.waitForSelector("text=Accept candidate");
  await piece(hrS.track, 1.3);
  await note("Decision time — the candidate is accepted", 2.4);
  await h.click(page.getByRole("button", { name: "Accept candidate", exact: true }));
  await page.waitForSelector("text=marked as hired");
  await sleep(500);
  await h.click(page.getByRole("button", { name: "Accept candidate", exact: true }).last());
  await page.waitForSelector("text=has been accepted", { timeout: 15000 });
  await note("Accepted — one seat on the AI Engineer job is filled", 3.2);
  await piece(hrS.track, 1);
  await h.ff(false);
  await h.card("Applicant to hire, tracked end to end", "Assessment, interview, recording, notes and decision — all in one place", 3200);
  endPiece();

  const hVideo = DRY ? null : page.video();
  const cVideo = DRY ? null : cand.video();
  await hrS.context.close();
  await candS.context.close();
  await hrBrowser.close();
  await candBrowser.close();
  if (DRY) {
    console.log("Dry run finished (no video).");
    return;
  }

  // ------------------------------------------------------------ stitch
  const files = { H: await hVideo.path(), C: await cVideo.path() };
  const ffmpeg = process.env.FFMPEG || "ffmpeg";
  const probe = (f) => {
    try {
      execFileSync(ffmpeg, ["-i", f], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(e.stderr));
      return +m[1] * 3600 + +m[2] * 60 + +m[3];
    }
  };
  const usable = pieces.filter((p) => p.to - p.from > 0.3);
  const total = usable.reduce((s, p) => s + (p.to - p.from) / p.speed, 0);
  const extra = Math.max(1, total / TARGET_SECONDS);
  console.log(`pieces=${usable.length}, ${Math.round(total)}s before cap, extra speed ${extra.toFixed(2)}x`);
  const inputs = ["H", "C"];
  const filters = usable
    .map((p, i) => {
      const s = p.speed === 1 ? 1 : p.speed * extra;
      return `[${inputs.indexOf(p.track.name)}:v]trim=start=${p.from.toFixed(2)}:end=${p.to.toFixed(2)},setpts=(PTS-STARTPTS)/${s.toFixed(3)},fps=30,scale=${W}:${H},setsar=1[v${i}]`;
    })
    .join(";");
  const concat = usable.map((_, i) => `[v${i}]`).join("") + `concat=n=${usable.length}:v=1:a=0[out]`;
  const output = path.join(OUT, "03-interview-process.mp4");
  execFileSync(
    ffmpeg,
    ["-y", "-i", files.H, "-i", files.C, "-filter_complex", `${filters};${concat}`, "-map", "[out]",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output],
    { stdio: "ignore" }
  );
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("wrote", output, `(${Math.round(probe(output))}s)`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
