/** Shared helpers for the proposal-video scripts (Playwright). */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Injected into every page: a visible cursor + click ripple, a caption bar, title cards,
// a "fast-forward" badge, and hides the Next.js dev badge and the login demo shortcuts.
const OVERLAY = `
(() => {
  if (window.top !== window) return; // not inside iframes (e.g. the CV preview)
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
    #__ff { position: fixed; z-index: 2147483647; top: 14px; right: 16px; padding: 6px 12px; border-radius: 999px;
      background: rgba(17,24,39,.85); color: #fff; font: 600 13px Inter, system-ui, sans-serif; letter-spacing: .04em;
      opacity: 0; transition: opacity .3s; pointer-events: none; }
    #__ff.on { opacity: 1 }
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
    const ff = document.createElement('div'); ff.id = '__ff'; ff.textContent = '\\u25B6\\u25B6 Fast-forward';
    document.body.append(cur, cap, card, ff);
    if (sessionStorage.getItem('__ffon')) ff.classList.add('on');
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
    window.__ff = (on) => { ff.classList.toggle('on', !!on); if (on) sessionStorage.setItem('__ffon', '1'); else sessionStorage.removeItem('__ffon'); };
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

/** Human-looking helpers bound to a page. */
function helpers(page, base) {
  const h = {};
  h.caption = async (text) => {
    await page.evaluate((t) => window.__caption && window.__caption(t), text).catch(() => {});
    await sleep(450);
  };
  h.ff = (on) => page.evaluate((v) => window.__ff && window.__ff(v), on).catch(() => {});
  h.card = async (title, sub, ms) => {
    await page.evaluate(([t, s]) => window.__card(t, s, true), [title, sub]);
    await sleep(ms);
    await page.evaluate(() => window.__card("", "", false));
    await sleep(600);
  };
  h.click = async (locator, glide = 22) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y, { steps: glide });
    await sleep(200);
    await page.mouse.click(x, y);
    await sleep(350);
  };
  h.type = async (locator, text, delay = 35) => {
    await h.click(locator);
    await locator.pressSequentially(text, { delay });
    await sleep(200);
  };
  h.goto = async (url) => {
    await page.goto(url.startsWith("http") ? url : base + url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await sleep(400);
  };
  return h;
}

/**
 * Cuts continuously recorded browser sessions into "pieces" (each with its own playback speed)
 * and joins them into one mp4. Tracks = one per recorded browser context.
 */
class Timeline {
  constructor() {
    this.tracks = {};
    this.pieces = [];
    this.open = null;
  }
  track(name) {
    const t = { name, t0: Date.now(), now() { return (Date.now() - this.t0) / 1000; } };
    this.tracks[name] = t;
    return t;
  }
  end() {
    if (this.open) this.pieces.push({ ...this.open, to: this.open.track.now() });
    this.open = null;
  }
  begin(track, speed) {
    this.end();
    this.open = { track, from: track.now(), speed };
  }
  /** files: { trackName: path-to-webm } */
  stitch({ files, output, size, targetSeconds, ffmpeg = "ffmpeg" }) {
    const { execFileSync } = require("child_process");
    const probe = (f) => {
      try {
        execFileSync(ffmpeg, ["-i", f], { stdio: ["ignore", "pipe", "pipe"] });
      } catch (e) {
        const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(e.stderr));
        return +m[1] * 3600 + +m[2] * 60 + +m[3];
      }
    };
    const usable = this.pieces.filter((p) => p.to - p.from > 0.3);
    const total = usable.reduce((s, p) => s + (p.to - p.from) / p.speed, 0);
    const extra = Math.max(1, total / targetSeconds);
    console.log(`pieces=${usable.length}, ${Math.round(total)}s before cap, extra speed ${extra.toFixed(2)}x`);
    const names = Object.keys(files);
    const filters = usable
      .map((p, i) => {
        const s = p.speed === 1 ? 1 : p.speed * extra;
        return `[${names.indexOf(p.track.name)}:v]trim=start=${p.from.toFixed(2)}:end=${p.to.toFixed(2)},setpts=(PTS-STARTPTS)/${s.toFixed(3)},fps=30,scale=${size.w}:${size.h},setsar=1[v${i}]`;
      })
      .join(";");
    const concat = usable.map((_, i) => `[v${i}]`).join("") + `concat=n=${usable.length}:v=1:a=0[out]`;
    execFileSync(
      ffmpeg,
      ["-y", ...names.flatMap((n) => ["-i", files[n]]), "-filter_complex", `${filters};${concat}`, "-map", "[out]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output],
      { stdio: "ignore" }
    );
    console.log("wrote", output, `(${Math.round(probe(output))}s)`);
  }
}

module.exports = { OVERLAY, sleep, helpers, Timeline };
