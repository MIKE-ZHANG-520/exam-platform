import asyncio
from playwright.async_api import async_playwright
import os

SCREENSHOT_DIR = "/workspace/projects/public/screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "http://localhost:5000"

async def take_screenshots():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        # 1. Login page
        await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
        await page.screenshot(path=f"{SCREENSHOT_DIR}/01_login.png", full_page=False)
        print("✓ Login page")

        # Login as admin
        await page.fill('#username', 'admin')
        await page.fill('#password', 'admin123')
        await page.click('button:has-text("登 录")')
        await page.wait_for_timeout(2000)

        # 2. Dashboard
        await page.goto(f"{BASE_URL}/admin/dashboard", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{SCREENSHOT_DIR}/02_dashboard.png", full_page=False)
        print("✓ Dashboard")

        # 3. Training Materials
        await page.goto(f"{BASE_URL}/admin/materials", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{SCREENSHOT_DIR}/03_materials.png", full_page=False)
        print("✓ Materials")

        # 4. Question Banks
        await page.goto(f"{BASE_URL}/admin/banks", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{SCREENSHOT_DIR}/04_banks.png", full_page=False)
        print("✓ Question Banks")

        # 5. Exams
        await page.goto(f"{BASE_URL}/admin/exams", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{SCREENSHOT_DIR}/05_exams.png", full_page=False)
        print("✓ Exams")

        # 6. Exam Records
        await page.goto(f"{BASE_URL}/admin/records", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{SCREENSHOT_DIR}/06_records.png", full_page=False)
        print("✓ Records")

        # 7. Worker Safety Management
        await page.goto(f"{BASE_URL}/admin/safety", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{SCREENSHOT_DIR}/07_safety.png", full_page=False)
        print("✓ Safety Management")

        # 8. Operation Logs
        await page.goto(f"{BASE_URL}/admin/operation-logs", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{SCREENSHOT_DIR}/08_logs.png", full_page=False)
        print("✓ Operation Logs")

        await browser.close()
        print("\nAll screenshots saved to:", SCREENSHOT_DIR)

asyncio.run(take_screenshots())
