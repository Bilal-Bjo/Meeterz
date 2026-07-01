import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { execFile } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// End-to-end: real Electron app, real system-audio loopback capture, real
// on-device Whisper transcription. Each "meeting" is macOS `say` speaking a
// known phrase through the speakers while Meeterz records system audio —
// English, French and Dutch, transcribed with language auto-detection.

interface LanguageCase {
  name: string
  sayArgs: string[]
  phrase: string
  expectWords: string[]
}

const CASES: LanguageCase[] = [
  {
    name: 'English',
    sayArgs: ['-r', '170'],
    phrase: 'The quarterly budget review is scheduled for Friday afternoon',
    expectWords: ['budget', 'friday']
  },
  {
    name: 'French',
    sayArgs: ['-v', 'Amélie', '-r', '165'],
    phrase: 'Le budget trimestriel sera présenté vendredi après-midi à toute l’équipe',
    expectWords: ['budget', 'vendredi']
  },
  {
    name: 'Dutch',
    sayArgs: ['-v', 'Ellen', '-r', '165'],
    phrase: 'De vergadering over het jaarverslag is volgende week donderdag in Amsterdam',
    expectWords: ['vergadering', 'donderdag']
  }
]

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'meeterz-test-'))
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, MEETERZ_USERDATA: userDataDir }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
})

test('app boots with library layout', async () => {
  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.meeting-list')).toBeVisible()
  await expect(page.getByText('No meeting selected')).toBeVisible()
  await page.screenshot({ path: 'tests/screenshots/01-empty-library.png' })
})

test('folders can be created and selected', async () => {
  await page.locator('.section-header .icon-btn').click()
  await page.locator('.folder-input').fill('Client Projects')
  await page.locator('.folder-input').press('Enter')
  const folderRow = page.locator('.nav-row', { hasText: 'Client Projects' })
  await expect(folderRow).toBeVisible()
  await folderRow.click()
  await expect(page.locator('.nav-row-wrap.selected')).toContainText('Client Projects')
})

test('new meeting with notes persists', async () => {
  await page.getByRole('button', { name: 'New Meeting' }).first().click()
  await expect(page.locator('.detail-title')).toBeVisible()
  await expect(page.locator('.start-card')).toBeVisible()

  await page.locator('.detail-title').fill('Kickoff with Acme')
  await page.locator('.detail-title').press('Enter')
  await page.locator('.notes-editor').fill('Discussed scope. Next step: send proposal.')
  await page.waitForTimeout(800) // debounce save

  await expect(page.locator('.meeting-row.selected .row-title')).toHaveText('Kickoff with Acme')
  await page.screenshot({ path: 'tests/screenshots/02-meeting-notes.png' })

  // switch away and back — notes must persist
  await page.locator('.nav-row', { hasText: 'All Meetings' }).click()
  await page.locator('.meeting-row', { hasText: 'Kickoff with Acme' }).click()
  await expect(page.locator('.notes-editor')).toHaveValue(
    'Discussed scope. Next step: send proposal.'
  )
})

for (const [i, c] of CASES.entries()) {
  test(`records and transcribes system audio — ${c.name}`, async () => {
    test.setTimeout(300_000)

    await page.locator('.nav-row', { hasText: 'All Meetings' }).click()
    await page.getByRole('button', { name: 'New Meeting' }).first().click()
    await expect(page.locator('.start-card')).toBeVisible()

    // Mic off — CI-safe: only the system-audio (loopback) channel is captured.
    await page.locator('.toggle-pill', { hasText: 'Mic' }).click()
    await page.locator('.record-btn', { hasText: 'Record' }).click()

    await expect(page.locator('.recording-hud')).toBeVisible({ timeout: 15_000 })
    if (i === 0) await page.screenshot({ path: 'tests/screenshots/03-recording.png' })

    // Speak the phrase through the system output while recording.
    await new Promise<void>((resolve, reject) => {
      execFile('say', [...c.sayArgs, c.phrase], (err) => (err ? reject(err) : resolve()))
    })
    await page.waitForTimeout(1200)

    await page.locator('.stop-btn').click()
    await expect(page.locator('.recording-hud')).toBeHidden()

    // On-device whisper.cpp runs after stop; wait straight for the segments.
    await expect(page.locator('.transcript-rail .segment').first()).toBeVisible({
      timeout: 180_000
    })

    const transcript = (await page.locator('.rail-scroll').innerText()).toLowerCase()
    for (const word of c.expectWords) {
      expect(transcript, `${c.name} transcript should contain "${word}"`).toContain(word)
    }
    await expect(page.locator('.speaker-chip').first()).toHaveText('Them')

    if (i === 0) await page.screenshot({ path: 'tests/screenshots/04-transcript.png' })
  })
}

test('dark mode renders with readable tokens', async () => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(300)
  const bg = await page
    .locator('.detail')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).toBe('rgb(28, 28, 30)') // --bg-content dark
  const ink = await page
    .locator('.detail-title')
    .evaluate((el) => getComputedStyle(el).color)
  expect(ink).toBe('rgb(245, 245, 247)') // --ink dark
  await page.screenshot({ path: 'tests/screenshots/05-dark-mode.png' })
  await page.emulateMedia({ colorScheme: 'light' })
})

test('narrow window stacks the transcript rail (responsive)', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1000, 700)
  })
  await page.waitForTimeout(400)
  const direction = await page
    .locator('.detail-body')
    .evaluate((el) => getComputedStyle(el).flexDirection)
  expect(direction).toBe('column')
  await page.screenshot({ path: 'tests/screenshots/06-narrow.png' })
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1280, 820)
  })
})
