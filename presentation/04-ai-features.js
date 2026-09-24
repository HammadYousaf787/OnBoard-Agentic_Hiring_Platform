/**
 * Proposal video 4 -- AI features. Order: (1) the HR agent (chatbot) -- most of the time --
 * (2) live interview assistance (what it does + the candidate warning; not shown running),
 * (3) AI job review of a candidate, (4) AI interview notes / questions.
 *
 * Everything is real: the agent calls OpenAI with the app's tools, the AI review and question
 * generation are the real features. Speech for the voice command is a pre-generated clip fed
 * to Chromium's fake microphone. HR + one candidate browser; pieces are cut/fast-forwarded and
 * joined with ffmpeg (waiting for AI replies is sped up).
 *
 *   node presentation/04-ai-features.js         record -> presentation/videos/04-ai-features.mp4
 *   node presentation/04-ai-features.js --dry   run without recording
 * Re-take:  <backend venv python> presentation/reset-video4.py   first.
 * Precondition: state after video 2/3 (job "AI Engineer", applicants Daniyal Mirza, Mahnoor Iqbal,
 * Hassan Javed at stage "applied"). Needs OPENAI_API_KEY in backend/.env.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { OVERLAY, sleep, helpers, Timeline } = require("./lib");

const DRY = process.argv.includes("--dry");
const APP = process.env.APP_URL || "http://localhost:3000";
const OUT = path.join(__dirname, "videos");
const TMP = path.join(OUT, "_tmp04");
const AVATARS = path.join(__dirname, "assets", "avatars");
const VOICE = path.join(__dirname, "assets", "voice", "move-three.wav");
const W = 1440;
const H = 810;
const TARGET_SECONDS = Number(process.env.TARGET_SECONDS || 120);

const HR = { email: "sara.malik@company.com", password: "Sara@123" };

const STT_STUB = `
(() => {
  class FakeRecognition { start() {} stop() {} abort() {} }
  window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
})();
`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(TMP, { recursive: true, force: true });
  const tl = new Timeline();

  // HR browser: avatar camera + the voice clip as the microphone (plays once, when first opened).
  const hrBrowser = await chromium.launch({
    channel: "chromium",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${path.join(AVATARS, "sara.mjpeg")}`,
      `--use-file-for-fake-audio-capture=${VOICE}%noloop`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const candBrowser = await chromium.launch({
    channel: "chromium",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${path.join(AVATARS, "areeba.mjpeg")}`,
    ],
  });
  const mkCtx = async (browser, record) => {
    const context = await browser.newContext({
      viewport: { width: W, height: H },
      timezoneId: "Asia/Karachi",
      permissions: ["camera", "microphone"],
      ...(record ? { recordVideo: { dir: TMP, size: { width: W, height: H } } } : {}),
    });
    await context.addInitScript(OVERLAY);
    await context.addInitScript(STT_STUB);
    return context;
  };

  const hrCtx = await mkCtx(hrBrowser, !DRY);
  const page = await hrCtx.newPage();
  const HT = tl.track("H");
  const h = helpers(page, APP);
  let speed = 1;
  const piece = async (s, track = HT) => {
    speed = s;
    tl.begin(track, s);
    await h.ff(s > 1.3);
  };
  const note = async (text, shown = 2.4) => {
    await h.caption(text);
    await sleep(Math.max(0, shown * speed * 1000 - 450));
  };
  const card = async (title, sub, ms = 2800) => {
    await piece(1);
    await h.ff(false);
    await h.card(title, sub, ms);
  };

  // --------------------------------------------------------------- chat helpers
  const input = () => page.locator("aside div.border-t input");
  async function waitTurn() {
    // A turn ends when the input is usable again, or a confirmation card is waiting.
    await page.waitForFunction(() => {
      const i = document.querySelector("aside div.border-t input");
      return i && i.disabled;
    }, null, { timeout: 5000 }).catch(() => {});
    await Promise.race([
      page.waitForSelector('aside button:has-text("Confirm")', { timeout: 120000 }),
      page.waitForFunction(() => {
        const i = document.querySelector("aside div.border-t input");
        return i && !i.disabled;
      }, null, { timeout: 120000 }),
    ]);
    await sleep(900);
  }
  async function ask(text) {
    await piece(2.6);
    await h.type(input(), text, 22);
    await h.click(page.locator('aside button[aria-label="Send"]'));
    await piece(4.5); // waiting for the model
    await waitTurn();
    await piece(1);
  }
  async function confirmCard() {
    // Safety net: if the model answered in words instead of raising the card, say "yes".
    if (!(await page.locator('aside button:has-text("Confirm")').count())) {
      await ask("Yes, go ahead.");
    }
    await h.click(page.locator('aside button:has-text("Confirm")').first());
    await piece(4.5);
    await waitTurn();
    await piece(1);
  }

  // --------------------------------------------------------------- intro + sign in
  await h.goto("/login");
  await card("AI across the recruitment workflow", "An HR agent  ·  live interview assistance  ·  AI candidate review  ·  AI interview prep", 3400);
  await piece(3);
  await h.type(page.locator("#email"), HR.email, 18);
  await h.type(page.locator("#password"), HR.password, 18);
  await h.click(page.getByRole("button", { name: "Sign in" }));
  await page.waitForURL("**/hr", { timeout: 20000 });
  await sleep(700);

  // =============================================================== 1. THE HR AGENT
  await piece(1);
  await note("Meet the HR agent: an AI assistant that can do what an HR can do", 3);
  await h.click(page.locator('button[aria-label="Open HR assistant"]'));
  await page.waitForSelector("aside div.border-t input");
  await note("It works with the HR's own data, through the same rules as the app", 3);

  await note("Ask it anything: it looks the data up and can draw charts", 2.6);
  await ask("How many applicants do I have at each stage? Show it as a chart.");
  await note("Real numbers from the database, plus a chart", 3);

  await note("Commands can be spoken as well as typed", 2.4);
  await h.click(page.locator('aside button[aria-label="Speak to the assistant"]'));
  await page.waitForSelector('aside button[aria-label="Stop recording"]');
  await note("Listening… (transcribed by OpenAI, so it works in any browser)", 5.4);
  await h.click(page.locator('aside button[aria-label="Stop recording"]'));
  await page.waitForFunction(() => {
    const i = document.querySelector("aside div.border-t input");
    return i && i.value.length > 10;
  }, null, { timeout: 30000 });
  await note("The transcript lands in the message box, ready to check and send", 3);
  await h.click(page.locator('aside button[aria-label="Send"]'));
  await piece(4.5);
  await waitTurn();
  await piece(1);
  await note("Moving candidates needs a confirmation: one card for the whole batch", 3.4);
  await confirmCard();
  await note("Confirmed — three candidates moved to Interview Pending", 2.6);

  await ask("Schedule interviews for all three next Monday morning.");
  await note("It checks the calendar and proposes free slots first", 3);
  await ask("Yes, book them.");
  await note("Booking three interviews needs one approval, not three", 3.2);
  await confirmCard();
  await note("All three booked", 2.2);

  await ask("Set up the interview rooms for all three.");
  await note("Rooms and candidate links, set up in one step", 2.8);
  await ask("Show me Daniyal Mirza's CV.");
  await note("Files come back as files, not as pasted text", 3.2);

  // collapse the panel for the rest of the video
  await h.click(page.locator('button[aria-label="Collapse HR assistant"]'));
  await sleep(600);

  // =============================================================== 2. LIVE INTERVIEW ASSISTANCE
  await card("Live interview assistance", "AI that listens to the interview and helps the interviewer dig deeper");
  await piece(2.2);
  await h.click(page.getByRole("link", { name: "Appointments", exact: true }));
  await page.waitForURL("**/hr/appointments");
  await page.waitForSelector("text=Lined-up interviews");
  await h.click(page.locator('li:has-text("Daniyal Mirza")').getByRole("link", { name: "Interviewer room", exact: true }).last());
  await page.waitForURL(/\/room$/);
  await page.waitForSelector("text=Live AI assistance");
  await piece(1.2);
  const joinUrl = (await page.locator("p.break-all").first().innerText()).trim();
  await h.click(page.locator('label:has-text("Live AI assistance")'));
  await note("It is optional and chosen before the call starts", 3);
  await note("Both voices are transcribed; every question the interviewer asks and the candidate answers gets evaluated", 4.6);
  await note("The candidate is told first, and it can't be switched on after the interview begins", 4);
  await h.click(page.getByRole("button", { name: "Start room" }));
  await page.waitForSelector('[data-testid="stt-status"]', { timeout: 40000 });
  await h.click(page.getByRole("button", { name: /Live AI/ }).first());
  await sleep(700);
  await note("During the call, each answer is judged: shallow, adequate or strong", 3.4);
  await note("…with follow-up questions when it is worth going deeper", 3.2);
  // The candidate's warning (own browser).
  tl.end();
  const candCtx = await mkCtx(candBrowser, !DRY);
  const cand = await candCtx.newPage();
  const CT = tl.track("C");
  const c = helpers(cand, "");
  tl.begin(CT, 1.15);
  await c.goto(joinUrl);
  await cand.waitForSelector('[data-testid="ai-notice"]', { timeout: 30000 });
  await c.caption("What the candidate sees before joining: a clear notice that AI is used");
  await sleep(4800);
  await c.caption("");
  tl.end();

  // =============================================================== 3. AI CANDIDATE REVIEW
  await card("AI candidate review", "A scored, explained recommendation for every applicant");
  await piece(2.4);
  await h.click(page.getByRole("link", { name: "My Jobs" }).first());
  await page.waitForURL("**/hr/jobs");
  await h.click(page.getByRole("link", { name: "AI Engineer" }).first());
  await page.waitForSelector("text=Hassan Javed", { timeout: 20000 });
  await h.click(page.getByRole("link", { name: "Hassan Javed" }).first());
  await page.waitForURL(/\/applicants\/[0-9a-f-]{36}$/);
  await page.waitForSelector("text=AI Job Review");
  await piece(1.2);
  await note("One click runs the AI job review on the CV, cover letter, GitHub and LinkedIn", 3.4);
  await h.click(page.getByRole("button", { name: /Run AI Job Review/i }).first());
  await piece(4.5);
  await page.waitForSelector("text=/reasoning|Communication/i", { timeout: 120000 });
  await sleep(2500);
  await piece(1.2);
  await note("Scores for communication, job fit, GitHub and LinkedIn — each with written reasoning", 4);
  await page.mouse.wheel(0, 420);
  await note("It is a recommendation only: the decision stays with HR", 3.2);

  // =============================================================== 4. AI INTERVIEW NOTES / QUESTIONS
  await card("AI interview preparation", "Tailored questions and notes, ready before the call");
  await piece(2.2);
  await h.click(page.getByRole("link", { name: "Appointments", exact: true }));
  await page.waitForURL("**/hr/appointments");
  await page.waitForSelector("text=Lined-up interviews");
  await h.click(page.locator('li:has-text("Mahnoor Iqbal")').getByRole("link", { name: "Interviewer room", exact: true }).last());
  await page.waitForURL(/\/room$/);
  await page.waitForSelector('textarea[aria-label="Extra instructions for the AI"]');
  await piece(1.2);
  await note("In the interview room, the interviewer prepares with AI", 2.6);
  await h.type(page.locator('textarea[aria-label="Interview notes"]'), "Ask how she measures model quality after release.", 20);
  await h.type(page.locator('textarea[aria-label="Extra instructions for the AI"]'), "Focus on NLP, evaluation and production experience.", 20);
  await h.click(page.getByRole("button", { name: "Get interview questions" }));
  await piece(4.5);
  await page.waitForSelector("text=Regenerate questions", { timeout: 60000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(OUT, "_fail_questions.png") });
    console.log("QUESTIONS NOT SHOWN. Page text tail:", (await page.locator("body").innerText()).slice(-700));
    throw e;
  });
  await sleep(1500);
  await piece(1.2);
  await note("Questions built from the CV, the job description and the candidate's profiles", 3.6);
  await page.locator('aside, main').first().evaluate(() => {});
  const panel = page.locator("div.overflow-y-auto").last();
  await panel.evaluate((el) => el.scrollBy({ top: 420, behavior: "smooth" })).catch(() => {});
  await note("Notes are saved with the interview", 3);
  await piece(1);
  await h.ff(false);
  await h.card("AI that assists, and people who decide", "Agent · live assistance · candidate review · interview prep", 3400);
  tl.end();

  const hVideo = DRY ? null : page.video();
  const cVideo = DRY ? null : cand.video();
  await hrCtx.close();
  await candCtx.close();
  await hrBrowser.close();
  await candBrowser.close();
  if (DRY) {
    console.log("Dry run finished (no video).");
    return;
  }
  tl.stitch({
    files: { H: await hVideo.path(), C: await cVideo.path() },
    output: path.join(OUT, "04-ai-features.mp4"),
    size: { w: W, h: H },
    targetSeconds: TARGET_SECONDS,
    ffmpeg: process.env.FFMPEG || "ffmpeg",
  });
  fs.rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
