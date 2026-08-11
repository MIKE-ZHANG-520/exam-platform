import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        
        # Login
        await page.goto("http://localhost:5000/login", wait_until="networkidle")
        await page.fill('input[placeholder="请输入账号"]', "admin")
        await page.fill('input[placeholder="请输入密码"]', "admin123")
        await page.click('button:has-text("登 录")')
        await page.wait_for_timeout(3000)
        
        screenshots = [
            ("dashboard", "http://localhost:5000/admin/dashboard", 3000),
            ("materials", "http://localhost:5000/admin/materials", 2000),
            ("banks", "http://localhost:5000/admin/banks", 2000),
            ("exams", "http://localhost:5000/admin/exams", 2000),
            ("records", "http://localhost:5000/admin/records", 2000),
            ("safety", "http://localhost:5000/admin/safety", 2000),
            ("operation_logs", "http://localhost:5000/admin/operation-logs", 2000),
        ]
        
        for name, url, wait in screenshots:
            try:
                await page.goto(url, wait_until="networkidle")
                await page.wait_for_timeout(wait)
                await page.screenshot(path=f"public/report_{name}.png", full_page=False)
                print(f"✅ {name}")
            except Exception as e:
                print(f"❌ {name}: {e}")
        
        await browser.close()
        print("Done!")

asyncio.run(main())
