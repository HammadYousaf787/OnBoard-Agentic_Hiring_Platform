/**
 * Renders docs/images/architecture.png (the diagram at the top of the README) from HTML/SVG.
 * Run: node docs/make-architecture.js   (needs the `playwright` package)
 */
const { chromium } = require("playwright");
const path = require("path");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0 }
  body { width: 1600px; height: 1040px; background: #f5f6fb; font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #111827; position: relative; overflow: hidden }
  .title { position: absolute; left: 0; right: 0; top: 26px; text-align: center; font-size: 30px; font-weight: 700; letter-spacing: -.02em }
  .title span { color: #4f46e5 } .sub { position: absolute; left: 0; right: 0; top: 68px; text-align: center; color: #6b7280; font-size: 15px }
  .box { position: absolute; border-radius: 16px; background: #fff; border: 1.5px solid #dfe3ee; box-shadow: 0 6px 20px rgba(49,46,129,.07); padding: 16px 18px }
  .box h3 { font-size: 15px; letter-spacing: .02em; margin-bottom: 6px } .box p, .box li { font-size: 12.5px; color: #4b5563; line-height: 1.5 } .box ul { padding-left: 16px }
  .tag { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef2ff; color: #3730a3; margin: 4px 4px 0 0 }
  .actor { background: #312e81; color: #fff; border: none; text-align: center; padding-top: 18px } .actor h3 { font-size: 17px } .actor p { color: #c7d2fe }
  .front { border-top: 5px solid #4f46e5 } .back { border-top: 5px solid #0f766e } .data { border-top: 5px solid #b45309 } .ext { border-top: 5px solid #be185d } .plan { border: 2px dashed #9ca3af; background: #fafafa; box-shadow: none }
  .lane { position: absolute; left: 30px; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #9ca3af; transform-origin: left top; transform: rotate(-90deg) }
  svg { position: absolute; inset: 0; pointer-events: none }
  .mod { display: inline-block; font-size: 11.5px; padding: 4px 9px; border-radius: 8px; margin: 3px 3px 0 0; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0 }
  .mod.ai { background: #fdf2f8; color: #9d174d; border-color: #fbcfe8 }
</style></head><body>
<div class="title">On<span>Board</span> · system architecture</div>
<div class="sub">Post jobs · evaluate applications · conduct interviews — with an AI agent and live assistance built in</div>

<!-- actors -->
<div class="box actor" style="left:150px;top:110px;width:230px;height:74px"><h3>Admin</h3><p>approvals · jobs · AI usage</p></div>
<div class="box actor" style="left:445px;top:110px;width:230px;height:74px"><h3>HR</h3><p>applicants · interviews · agent</p></div>
<div class="box actor" style="left:990px;top:110px;width:230px;height:74px"><h3>Candidate</h3><p>applies · joins the interview</p></div>

<!-- frontends -->
<div class="box front" style="left:150px;top:250px;width:525px;height:150px"><h3>OnBoard Console <span style="color:#6b7280;font-weight:400">· :3000</span></h3>
  <p>Admin and HR dashboards, applicant board, calendar, interview rooms, HR agent panel</p>
  <span class="tag">Next.js 16</span><span class="tag">React 19</span><span class="tag">TypeScript</span><span class="tag">Tailwind 4</span><span class="tag">Agora Web SDK</span></div>
<div class="box front" style="left:890px;top:250px;width:430px;height:150px"><h3>Careers &amp; Interview Portal <span style="color:#6b7280;font-weight:400">· :3001</span></h3>
  <p>Public job list, application forms (technical / non-technical), candidate interview room</p>
  <span class="tag">Next.js 16</span><span class="tag">React 19</span><span class="tag">Agora Web SDK</span></div>

<!-- backend -->
<div class="box back" style="left:150px;top:490px;width:1170px;height:270px"><h3>FastAPI backend <span style="color:#6b7280;font-weight:400">· :8000 · Python 3.10 · async SQLAlchemy · JWT roles (admin / hr)</span></h3>
  <div style="margin-top:6px">
    <span class="mod">Auth &amp; approvals</span><span class="mod">Jobs &amp; assignment</span><span class="mod">Applicants &amp; pipeline</span><span class="mod">Scheduling &amp; calendar</span><span class="mod">Interview rooms &amp; records</span><span class="mod">CV bank</span>
  </div>
  <div style="margin-top:12px;font-size:12px;font-weight:700;letter-spacing:.1em;color:#9d174d">AI LAYER</div>
  <div>
    <span class="mod ai">HR agent — LangGraph · 38 tools · human-in-the-loop confirmations</span><span class="mod ai">AI candidate review</span><span class="mod ai">AI interview questions</span>
  </div>
  <div style="margin-top:4px">
    <span class="mod ai">Live interview pipeline: audio → transcript → per-question insights (async worker)</span><span class="mod ai">Voice commands (speech-to-text)</span>
  </div>
  <div style="margin-top:14px;font-size:12px;font-weight:700;letter-spacing:.1em;color:#6b7280">CROSS-CUTTING</div>
  <div><span class="mod" style="background:#f3f4f6;color:#374151;border-color:#e5e7eb">Same business rules for UI and agent (agent calls the API's own functions)</span><span class="mod" style="background:#f3f4f6;color:#374151;border-color:#e5e7eb">AI usage logging</span><span class="mod" style="background:#f3f4f6;color:#374151;border-color:#e5e7eb">Alembic migrations</span></div>
</div>

<!-- data -->
<div class="box data" style="left:150px;top:850px;width:525px;height:130px"><h3>PostgreSQL</h3><p>Users, jobs, applicants, appointments, insights, AI-usage log, and the agent's conversation checkpoints (LangGraph)</p></div>
<div class="box data" style="left:795px;top:850px;width:525px;height:130px"><h3>MinIO (S3-compatible object storage)</h3><p>CV files, interview recordings, saved transcripts, agent charts — only pointers live in Postgres</p></div>

<!-- external -->
<div class="box ext" style="left:1390px;top:235px;width:190px;height:130px"><h3>Agora</h3><p>Real-time video. Backend mints tokens; Console and Portal join the same room</p></div>
<div class="box ext" style="left:1390px;top:395px;width:190px;height:110px"><h3>OpenAI</h3><p>Chat models (agent, review, prep, insights) and speech-to-text</p></div>
<div class="box ext" style="left:1390px;top:545px;width:190px;height:110px"><h3>GitHub API</h3><p>Public profile signals for the AI review</p></div>
<div class="box ext" style="left:1390px;top:685px;width:190px;height:80px"><h3>LinkedIn</h3><p>via Bright Data (optional)</p></div>
<div class="box plan" style="left:1390px;top:810px;width:190px;height:100px"><h3 style="color:#6b7280">Email · planned</h3><p>Business-domain email for reminders &amp; offers</p></div>

<svg width="1600" height="1040" viewBox="0 0 1600 1040">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#6b7280"/></marker></defs>
  <g stroke="#6b7280" stroke-width="2" fill="none" marker-end="url(#a)">
    <path d="M265 184V250"/><path d="M560 184V250"/><path d="M1105 184V250"/>
    <path d="M412 400V490"/><path d="M1105 400V490"/>
    <path d="M412 760V850"/><path d="M1057 760V850"/>
    <path d="M1355 300H1390"/><path d="M1355 450H1390"/><path d="M1355 600H1390"/><path d="M1355 725H1390"/>
  </g>
  <g stroke="#6b7280" stroke-width="2" fill="none"><path d="M1320 625H1355"/><path d="M1355 300V725"/></g>
  <path d="M1355 725V850H1390" stroke="#9ca3af" stroke-width="2" fill="none" stroke-dasharray="6 6" marker-end="url(#a)"/>
  <text x="430" y="452" font-size="12" fill="#6b7280">REST + JWT</text>
  <text x="1120" y="452" font-size="12" fill="#6b7280">REST</text>
</svg>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1040 }, deviceScaleFactor: 1.5 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(__dirname, "images", "architecture.png") });
  await browser.close();
  console.log("wrote docs/images/architecture.png");
})();
