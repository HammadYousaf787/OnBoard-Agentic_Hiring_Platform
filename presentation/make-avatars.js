/**
 * Makes two "camera" clips for the interview video: an avatar tile per participant, so the
 * call doesn't show Chromium's default green test pattern. Chromium's fake camera
 * (--use-file-for-fake-video-capture) plays these MJPEG files on a loop.
 * Run: FFMPEG=<path> node presentation/make-avatars.js   (needs playwright + ffmpeg)
 */
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "assets", "avatars");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const PEOPLE = [
  { file: "sara", name: "Sara Malik", role: "Interviewer", initials: "SM", from: "#312e81", to: "#4f46e5" },
  { file: "areeba", name: "Areeba Khan", role: "Candidate", initials: "AK", from: "#0f766e", to: "#14b8a6" },
  { file: "mahnoor", name: "Mahnoor Iqbal", role: "Candidate", initials: "MI", from: "#9a3412", to: "#f97316" },
  { file: "sana", name: "Sana Farooqi", role: "Candidate", initials: "SF", from: "#155e75", to: "#06b6d4" },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  for (const p of PEOPLE) {
    await page.setContent(`<body style="margin:0;width:640px;height:480px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:linear-gradient(135deg,${p.from},${p.to});font-family:Segoe UI,Arial,sans-serif;color:#fff">
      <div style="width:190px;height:190px;border-radius:50%;background:rgba(255,255,255,.18);border:4px solid rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;font-size:76px;font-weight:600">${p.initials}</div>
      <div style="font-size:34px;font-weight:600">${p.name}</div><div style="font-size:20px;opacity:.8;letter-spacing:.08em;text-transform:uppercase">${p.role}</div></body>`);
    const png = path.join(OUT, `${p.file}.png`);
    await page.screenshot({ path: png });
    // A gentle "breathing" zoom so the tile reads as a live camera, not a frozen frame.
    execFileSync(FFMPEG, [
      "-y", "-loop", "1", "-framerate", "25", "-i", png,
      "-vf", "zoompan=z='1.03+0.02*sin(on/12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=640x480:fps=25",
      "-t", "8", "-pix_fmt", "yuvj420p", "-c:v", "mjpeg", "-q:v", "4", "-f", "mjpeg", path.join(OUT, `${p.file}.mjpeg`),
    ], { stdio: "ignore" });
    console.log("wrote", p.file);
  }
  await browser.close();
})();
