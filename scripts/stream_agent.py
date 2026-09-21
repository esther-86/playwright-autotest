import asyncio
import sys
import os
import json
import requests
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()
target_url = os.getenv("TARGET_URL", "https://academybugs.com/find-bugs/")
base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

async def run_live_stream_agent():
    print("=" * 60)
    print("🤖 LIVE STREAMING QA AGENT (Ollama: llama3.2 + Playwright)")
    print(f"🌐 Target: {target_url}")
    print("=" * 60 + "\n")

    print("🌐 [Browser] Launching Playwright to observe live website...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        await page.goto(target_url, wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)

        # 1. Dismiss cookie banner if present
        cookie_btn = page.locator('button:has-text("Functional"), button:has-text("Accept")').first
        if await cookie_btn.is_visible():
            print("🍪 [Browser] Dismissed cookie consent banner.")
            await cookie_btn.click()
            await page.wait_for_timeout(500)

        # 2. Extract baseline items & count
        initial_cards = await page.locator('.ec_product_li, [role="article"], tr').count()
        print(f"👀 [Observer] Discovered {initial_cards} items on initial page load.")

        # 3. Probe Per-Page Limit (View 10)
        per_page_btn = page.locator('span.ec_product_page_perpage a:has-text("10"), a:has-text("10")').first
        post_limit_count = initial_cards

        if await per_page_btn.is_visible():
            print("🧪 [Probe] Clicking 'View 10' per-page limit...")
            await per_page_btn.click()
            await page.wait_for_timeout(1500)
            post_limit_count = await page.locator('.ec_product_li, [role="article"], tr').count()
            if post_limit_count > 10:
                print(f"🚨 [Anomaly Detected] Selected 'View 10', but {post_limit_count} items are still rendered on screen!")

        # 4. Probe Price Sorting
        sort_select = page.locator('select.ec_sort_menu, select[name*="sort" i]').first
        sorting_probe_result = "No sort dropdown"
        if await sort_select.is_visible():
            print("🧪 [Probe] Selecting 'Price Low-High' sorting...")
            try:
                await sort_select.select_option(label="Price Low-High")
                await page.wait_for_timeout(1500)
                prices_text = await page.locator('.ec_price_type1, .price').all_inner_texts()
                sorting_probe_result = f"Sorted prices observed: {prices_text[:5]}"
                print(f"📊 [Observer] {sorting_probe_result}")
            except Exception as e:
                sorting_probe_result = f"Sorting selection error: {e}"

        await browser.close()

    # 5. Hand the real live observations to the LLM
    print("\n🧠 [Brain] Streaming analysis of live defect observations from llama3.2:\n" + "-" * 60)

    prompt = (
        f"You are an expert Autonomous Web QA Tester.\n"
        f"You just executed live browser probes on: {target_url}\n\n"
        f"LIVE OBSERVATIONS:\n"
        f"1. Initial visible item count: {initial_cards} items.\n"
        f"2. User clicked 'View 10' under per-page limit controls.\n"
        f"   - Expected count: <= 10 items.\n"
        f"   - Observed count: {post_limit_count} items still rendered on screen.\n"
        f"   - Invariant violated: Page Size Upper Bound Monotonicity (count must be <= limit).\n"
        f"3. Sorting probe result: {sorting_probe_result}\n\n"
        f"TASK:\n"
        f"Write a formal QA Bug Report detailing the exact defects found from these live observations.\n"
        f"Include:\n"
        f"- Bug Title & Severity\n"
        f"- Invariant Violated\n"
        f"- Exact Step-by-Step Reproduction\n"
        f"- Expected vs. Actual Result\n"
        f"- Recommended Engineering Fix"
    )

    try:
        res = requests.post(
            f"{base_url}/api/generate",
            json={"model": "llama3.2", "prompt": prompt, "stream": True},
            stream=True,
            timeout=120
        )
        for line in res.iter_lines():
            if line:
                data = json.loads(line.decode("utf-8"))
                sys.stdout.write(data.get("response", ""))
                sys.stdout.flush()
        print("\n")
    except Exception as e:
        print(f"Error connecting to Ollama: {e}")

if __name__ == "__main__":
    asyncio.run(run_live_stream_agent())
