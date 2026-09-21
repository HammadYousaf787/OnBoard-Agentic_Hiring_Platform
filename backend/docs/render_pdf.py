"""
One-off script: renders database-schema.html to database-schema.pdf.

Not a runtime dependency of the API, so playwright isn't in requirements.txt.
To (re)run this after editing the HTML:

    pip install playwright
    playwright install chromium
    python docs/render_pdf.py
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
HTML_PATH = HERE / "database-schema.html"
PDF_PATH = HERE / "database-schema.pdf"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(HTML_PATH.as_uri())
    page.wait_for_selector(".mermaid svg", timeout=15000)
    page.pdf(
        path=str(PDF_PATH),
        format="A4",
        print_background=True,
        margin={"top": "0mm", "bottom": "0mm", "left": "0mm", "right": "0mm"},
    )
    browser.close()

print(f"Wrote {PDF_PATH}")
