/**
 * Generates five template CVs (PDF) for the "AI Engineer" demo applicants.
 * Run: node presentation/make-cvs.js   (needs the `playwright` package; uses Chromium's PDF printer)
 * Output: presentation/assets/cvs/<Name>_CV.pdf
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "assets", "cvs");

const PEOPLE = [
  {
    name: "Areeba Khan", title: "Machine Learning Engineer", years: 4, city: "Lahore",
    email: "areeba.khan@example.com", phone: "+92 300 1200101",
    summary: "Machine learning engineer with 4 years of experience taking NLP and recommendation models from research notebooks to production APIs. Comfortable across data pipelines, model training, evaluation and MLOps.",
    skills: ["Python", "PyTorch", "scikit-learn", "Transformers / LLMs", "FastAPI", "Docker", "AWS SageMaker", "MLflow", "SQL", "Airflow"],
    jobs: [
      ["Senior ML Engineer", "Kalsoft Analytics", "2023 – Present", ["Built a semantic search service over 2M documents using sentence-transformer embeddings and pgvector, cutting search latency by 45%.", "Led fine-tuning of a support-ticket classifier (F1 0.91) and its rollout behind a FastAPI service handling 300 req/s.", "Set up MLflow tracking and CI checks so every model release has reproducible metrics."]],
      ["Machine Learning Engineer", "Nexus Retail Tech", "2021 – 2023", ["Shipped a product recommendation model that lifted click-through by 12% in an A/B test.", "Automated nightly feature pipelines with Airflow and Spark."]],
    ],
    edu: "BS Computer Science — FAST NUCES, Lahore (2017 – 2021)",
    projects: ["open-source: `tiny-rag` — a small retrieval-augmented generation toolkit (1.2k GitHub stars)"],
    extra: { github: "github.com/areeba-khan-ml-demo", linkedin: "linkedin.com/in/areeba-khan" },
  },
  {
    name: "Daniyal Mirza", title: "Senior AI Engineer", years: 6, city: "Karachi",
    email: "daniyal.mirza@example.com", phone: "+92 301 2300202",
    summary: "AI engineer with 6 years building LLM-powered products and internal tooling. Focused on reliable agents, evaluation harnesses and cost-aware inference.",
    skills: ["Python", "LangChain / LangGraph", "OpenAI API", "RAG", "Vector databases", "TypeScript", "Kubernetes", "Prometheus", "PostgreSQL"],
    jobs: [
      ["Lead AI Engineer", "Finlytics", "2022 – Present", ["Designed a document-understanding agent for loan files that reduced manual review time by 60%.", "Built an LLM evaluation harness with 900 golden cases, gating every prompt change in CI.", "Cut inference spend 38% by routing easy requests to smaller models."]],
      ["Software Engineer (ML)", "Arbisoft", "2018 – 2022", ["Delivered churn-prediction and forecasting models for three enterprise clients."]],
    ],
    edu: "MS Data Science — LUMS (2016 – 2018)",
    projects: ["Speaker: 'Evaluating LLM agents in production', Karachi AI Meetup 2024"],
    extra: { github: "github.com/dmirza-ai", linkedin: "linkedin.com/in/daniyal-mirza" },
  },
  {
    name: "Mahnoor Iqbal", title: "Data Scientist → AI Engineer", years: 3, city: "Islamabad",
    email: "mahnoor.iqbal@example.com", phone: "+92 302 3400303",
    summary: "Data scientist moving into applied AI engineering. 3 years of forecasting and classification work, plus recent projects with LLM tooling and vector search.",
    skills: ["Python", "Pandas", "XGBoost", "PyTorch (learning)", "SQL", "Streamlit", "LangChain", "Git"],
    jobs: [
      ["Data Scientist", "Telenor Pakistan", "2022 – Present", ["Built demand-forecasting models used for weekly planning across 40 regions.", "Prototyped an LLM assistant that answers analyst questions over internal reports."]],
      ["Junior Data Analyst", "Systems Limited", "2021 – 2022", ["Automated reporting dashboards and data-quality checks."]],
    ],
    edu: "BS Software Engineering — NUST, Islamabad (2017 – 2021)",
    projects: ["Kaggle: top 8% in a time-series forecasting competition"],
    extra: { github: "github.com/mahnoor-iqbal-ai-demo", linkedin: "linkedin.com/in/mahnoor-iqbal" },
  },
  {
    name: "Hassan Javed", title: "NLP Engineer", years: 5, city: "Lahore",
    email: "hassan.javed@example.com", phone: "+92 303 4500404",
    summary: "NLP engineer with 5 years of experience in text classification, entity extraction and multilingual (English / Urdu) language models.",
    skills: ["Python", "Hugging Face", "spaCy", "PyTorch", "Urdu NLP", "ONNX", "FastAPI", "Redis", "Docker"],
    jobs: [
      ["NLP Engineer", "Careem", "2021 – Present", ["Trained an English-Urdu intent classifier for support chat (accuracy 94%).", "Shipped an ONNX-optimised entity extractor that runs 3x faster on CPU."]],
      ["Research Assistant", "ITU Lahore", "2019 – 2021", ["Published a paper on low-resource Urdu named-entity recognition."]],
    ],
    edu: "MS Computer Science — ITU, Lahore (2019 – 2021)",
    projects: ["open-source: `urdu-tokenizers` — 600 GitHub stars"],
    extra: { github: "github.com/hassanjaved-nlp", linkedin: "linkedin.com/in/hassan-javed" },
  },
  {
    name: "Sana Farooqi", title: "Computer Vision Engineer", years: 2, city: "Rawalpindi",
    email: "sana.farooqi@example.com", phone: "+92 304 5600505",
    summary: "Computer vision engineer with 2 years of experience in object detection and edge deployment, interested in multimodal models.",
    skills: ["Python", "OpenCV", "PyTorch", "YOLO", "TensorRT", "C++", "Jetson", "Docker"],
    jobs: [
      ["Computer Vision Engineer", "Netsol Technologies", "2023 – Present", ["Trained a defect-detection model (mAP 0.87) deployed on Jetson devices in a factory line.", "Reduced inference time from 90 ms to 28 ms with TensorRT."]],
      ["ML Intern", "PITB", "2022", ["Built a license-plate recognition prototype."]],
    ],
    edu: "BS Electrical Engineering — UET Taxila (2019 – 2023)",
    projects: ["Final-year project: helmet-detection system for motorbike riders"],
    extra: { github: "github.com/sana-farooqi", linkedin: "linkedin.com/in/sana-farooqi" },
  },
];

const html = (p) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box } body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; }
  .head { background: #312e81; color: #fff; padding: 34px 44px 26px } .head h1 { margin: 0; font-size: 34px; letter-spacing: -.5px }
  .head .t { font-size: 16px; opacity: .9; margin-top: 4px } .contact { margin-top: 14px; font-size: 12.5px; opacity: .9; display: flex; gap: 22px; flex-wrap: wrap }
  .body { display: grid; grid-template-columns: 1fr 210px; gap: 30px; padding: 28px 44px }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: #4f46e5; border-bottom: 1.5px solid #e5e7eb; padding-bottom: 5px; margin: 22px 0 10px }
  h2:first-child { margin-top: 0 } p, li { font-size: 12.5px; line-height: 1.55 } ul { margin: 6px 0 0; padding-left: 18px }
  .job { margin-bottom: 14px } .job b { font-size: 13.5px } .job .m { color: #6b7280; font-size: 12px }
  .chip { display: inline-block; background: #eef2ff; color: #3730a3; border-radius: 6px; padding: 3px 9px; margin: 0 5px 6px 0; font-size: 11.5px }
</style></head><body>
  <div class="head"><h1>${p.name}</h1><div class="t">${p.title}</div>
    <div class="contact"><span>${p.email}</span><span>${p.phone}</span><span>${p.city}, Pakistan</span><span>${p.extra.github}</span><span>${p.extra.linkedin}</span></div></div>
  <div class="body"><div>
    <h2>Profile</h2><p>${p.summary}</p>
    <h2>Experience</h2>${p.jobs.map((j) => `<div class="job"><b>${j[0]}</b> — ${j[1]}<div class="m">${j[2]}</div><ul>${j[3].map((b) => `<li>${b}</li>`).join("")}</ul></div>`).join("")}
    <h2>Highlights</h2><ul>${p.projects.map((x) => `<li>${x}</li>`).join("")}</ul>
  </div><div>
    <h2>Skills</h2>${p.skills.map((s) => `<span class="chip">${s}</span>`).join("")}
    <h2>Education</h2><p>${p.edu}</p>
    <h2>Experience</h2><p>${p.years} years in applied machine learning</p>
  </div></div></body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const p of PEOPLE) {
    await page.setContent(html(p));
    const file = path.join(OUT, `${p.name.replace(" ", "_")}_CV.pdf`);
    await page.pdf({ path: file, format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
    console.log("wrote", file, fs.statSync(file).size, "bytes");
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "people.json"), JSON.stringify(PEOPLE.map(({ name, title, years, city, email, phone, extra, summary }) => ({ name, title, years, city, email, phone, github: extra.github, linkedin: extra.linkedin, summary })), null, 2));
})();
