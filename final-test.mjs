import { _electron as electron } from '@playwright/test'
import { homedir } from 'os'; import { join } from 'path'
const U = join(homedir(), 'Library/Application Support/meeterz')
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MEETERZ_USERDATA: U } })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
// start a loopback recording, then play 8s of meeting 4's system channel
await page.getByRole('button', { name: 'New Meeting' }).first().click()
await page.locator('.toggle-pill', { hasText: 'Mic' }).click()
await page.locator('.record-btn', { hasText: 'Record' }).click()
await page.locator('.recording-hud').waitFor({ timeout: 15000 })
const r = await page.evaluate(() => new Promise((resolve) => {
  const a = new Audio('meeterz-audio://recordings/4/system.m4a')
  a.addEventListener('loadedmetadata', () => {
    a.currentTime = 60 // 1 minute in — real conversation
    a.play().then(() => setTimeout(() => { a.pause(); resolve({ dur: +a.duration.toFixed(1), reached: +a.currentTime.toFixed(1) }) }, 8000)).catch((e) => resolve('play fail: ' + e))
  })
  setTimeout(() => resolve('timeout'), 12000)
}))
console.log('playback:', JSON.stringify(r))
await page.locator('.stop-btn').click()
await page.waitForTimeout(1500)
await app.close()
// find the loopback capture (highest new meeting id)
import { readdirSync } from 'fs'
const dirs = readdirSync(join(U, 'recordings')).map(Number).filter((n)=>!isNaN(n)).sort((a,b)=>b-a)
console.log('LOOPBACK_DIR=' + dirs[0])
