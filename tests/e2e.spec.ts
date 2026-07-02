import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { execFile } from 'child_process'
import { appendFileSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// End-to-end: real Electron app, real system-audio loopback capture, real
// on-device Whisper transcription. Each "meeting" is macOS `say` speaking a
// known phrase through the speakers while Meeterz records system audio.

function say(args: string[], phrase: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('say', [...args, phrase], (err) => (err ? reject(err) : resolve()))
  })
}

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
  writeFileSync(join(__dirname, 'main-stderr.log'), '')
  const userDataDir = mkdtempSync(join(tmpdir(), 'meeterz-test-'))
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MEETERZ_USERDATA: userDataDir,
      // Small windows so the mixed-language test re-detects language quickly.
      MEETERZ_CHUNK_SEC: '6',
      MEETERZ_IMPORT_FILE: join(__dirname, 'fixtures', 'teams-transcript.vtt'),
      MEETERZ_SKIP_CONFIRM: '1'
    }
  })
  app.process().stderr?.on('data', (d: Buffer) => {
    appendFileSync(join(__dirname, 'main-stderr.log'), d)
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
})

async function startRecordingSystemOnly(): Promise<void> {
  await page.locator('.nav-row', { hasText: 'All Meetings' }).click()
  await page.getByRole('button', { name: 'New Meeting' }).first().click()
  await expect(page.locator('.start-card')).toBeVisible()
  await page.locator('.toggle-pill', { hasText: 'Mic' }).click()
  await page.locator('.record-btn', { hasText: 'Record' }).click()
  await expect(page.locator('.recording-hud')).toBeVisible({ timeout: 15_000 })
}

async function stopAndAwaitTranscript(timeout = 180_000): Promise<string> {
  await page.locator('.stop-btn').click()
  await expect(page.locator('.recording-hud')).toBeHidden()
  await expect(page.locator('.transcript-rail .segment').first()).toBeVisible({ timeout })
  return (await page.locator('.rail-scroll').innerText()).toLowerCase()
}

test('app boots with library layout', async () => {
  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.meeting-list')).toBeVisible()
  await expect(page.getByText('No meeting selected')).toBeVisible()
  await page.screenshot({ path: 'tests/screenshots/01-empty-library.png' })
})

test('folders: create, rename, select', async () => {
  await page.locator('.section-header .icon-btn').click()
  await page.locator('.folder-input').fill('Client Projects')
  await page.locator('.folder-input').press('Enter')
  const folderRow = page.locator('.nav-row', { hasText: 'Client Projects' })
  await expect(folderRow).toBeVisible()

  // rename via double-click
  await folderRow.dblclick()
  await page.locator('.folder-input').fill('Clients')
  await page.locator('.folder-input').press('Enter')
  await expect(page.locator('.nav-row', { hasText: 'Clients' })).toBeVisible()

  await page.locator('.nav-row', { hasText: 'Clients' }).click()
  await expect(page.locator('.nav-row-wrap.selected')).toContainText('Clients')
})

test('new meeting with notes persists (Tiptap)', async () => {
  await page.getByRole('button', { name: 'New Meeting' }).first().click()
  await expect(page.locator('.detail-title')).toBeVisible()
  await expect(page.locator('.start-card')).toBeVisible()

  // template pills show on an empty note
  await expect(page.locator('.template-pill', { hasText: 'Client call' })).toBeVisible()

  await page.locator('.detail-title').fill('Kickoff with Acme')
  await page.locator('.detail-title').press('Enter')
  await page.locator('.notes-editor .tiptap').click()
  await page.keyboard.type('Discussed scope. Next step: send proposal.')
  await page.waitForTimeout(800) // debounce save

  await expect(page.locator('.meeting-row.selected .row-title')).toHaveText('Kickoff with Acme')
  await page.screenshot({ path: 'tests/screenshots/02-meeting-notes.png' })

  // switch away and back — notes must persist
  await page.locator('.nav-row', { hasText: 'All Meetings' }).click()
  await page.locator('.meeting-row', { hasText: 'Kickoff with Acme' }).click()
  await expect(page.locator('.notes-editor .tiptap')).toContainText(
    'Discussed scope. Next step: send proposal.'
  )
})

for (const [i, c] of CASES.entries()) {
  test(`records and transcribes system audio — ${c.name}`, async () => {
    test.setTimeout(300_000)
    await startRecordingSystemOnly()
    if (i === 0) await page.screenshot({ path: 'tests/screenshots/03-recording.png' })
    await say(c.sayArgs, c.phrase)
    await page.waitForTimeout(1200)
    const transcript = await stopAndAwaitTranscript()
    for (const word of c.expectWords) {
      expect(transcript, `${c.name} transcript should contain "${word}"`).toContain(word)
    }
    await expect(page.locator('.speaker-chip').first()).toContainText('Them')

    if (i === 0) {
      // Waveform player: canvas rendered, search match shows a timeline pin,
      // clicking the pin starts playback at that moment.
      await expect(page.locator('.player-bar canvas')).toBeVisible()
      await page.locator('.rail-search input').fill('budget')
      await expect(page.locator('.wf-pin')).toHaveCount(1)
      await page.locator('.wf-pin').click()
      await expect
        .poll(async () => page.locator('.player-bar audio').first().evaluate((el: HTMLAudioElement) => el.currentTime))
        .toBeGreaterThan(0)
      await page.locator('.wf-play').click() // pause
      await page.locator('.rail-search input').press('Escape')
      await page.screenshot({ path: 'tests/screenshots/04-transcript.png' })
    }
  })
}

test('mixed-language meeting: Dutch and French in one recording', async () => {
  test.setTimeout(300_000)
  await startRecordingSystemOnly()

  // Two languages in the same recording, separated by a natural pause
  // (6 s windows → language re-detected per window, like a Belgian meeting
  // switching between Dutch and French).
  await say(['-v', 'Ellen', '-r', '170'], 'Goedemorgen allemaal, de vergadering begint over vijf minuten')
  await page.waitForTimeout(900)
  await say(['-v', 'Amélie', '-r', '170'], 'Merci beaucoup, le rapport sera disponible vendredi matin')
  await page.waitForTimeout(1200)

  const transcript = await stopAndAwaitTranscript()
  expect(transcript, 'Dutch part should be transcribed').toContain('vergadering')
  expect(transcript, 'French part should be transcribed').toContain('vendredi')
  await page.screenshot({ path: 'tests/screenshots/07-mixed-language.png' })
})

test('pause and resume recording', async () => {
  test.setTimeout(120_000)
  await startRecordingSystemOnly()
  await page.locator('.pause-btn').click()
  await expect(page.locator('.rec-timer')).toHaveText('Paused')
  await page.locator('.pause-btn').click()
  await expect(page.locator('.rec-timer')).not.toHaveText('Paused')
  await say(['-r', '170'], 'Testing pause and resume functionality today')
  await page.waitForTimeout(1200)
  const transcript = await stopAndAwaitTranscript()
  expect(transcript).toContain('resume')
})

test('imports a Teams .vtt transcript with speaker names', async () => {
  await page.locator('.nav-row', { hasText: 'Import transcript' }).click()
  await expect(page.locator('.detail-title')).toHaveValue('teams-transcript', { timeout: 10_000 })
  await expect(page.locator('.status-chip.import')).toBeVisible()

  const rail = page.locator('.rail-scroll')
  await expect(rail).toContainText('Jan Peeters')
  await expect(rail).toContainText('Marie Dubois')
  await expect(rail).toContainText('kwartaaloverzicht')
  await expect(rail).toContainText('budget marketing')
  await page.screenshot({ path: 'tests/screenshots/08-imported-vtt.png' })
})

test('find-in-transcript: highlights, counts and cycles matches', async () => {
  // Self-contained: import a fresh transcript to search within.
  await page.locator('.nav-row', { hasText: 'Import transcript' }).click()
  await expect(page.locator('.rail-search')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(400) // let the post-import remount settle

  await page.locator('.rail-search input').fill('vrijdag')
  await expect(page.locator('.rail-search input')).toHaveValue('vrijdag')
  await expect(page.locator('.segment-text mark').first()).toHaveText(/vrijdag/i)
  await expect(page.locator('.rail-search-count')).toHaveText('1/1')
  await expect(page.locator('.segment.search-current')).toContainText('deadline')

  // multiple matches cycle with Enter
  await page.locator('.rail-search input').fill('le')
  const count = await page.locator('.rail-search-count').textContent()
  expect(count).toMatch(/^1\/\d+$/)
  await page.locator('.rail-search input').press('Enter')
  await expect(page.locator('.rail-search-count')).toHaveText(/^2\//)

  // Esc clears
  await page.locator('.rail-search input').press('Escape')
  await expect(page.locator('.segment-text mark')).toHaveCount(0)

  // Cmd+F focuses the search field
  await page.keyboard.press('Meta+f')
  await expect(page.locator('.rail-search input')).toBeFocused()
})

test('full-text search finds transcript content', async () => {
  await page.locator('.list-search input').fill('kwartaaloverzicht')
  // Only imported fixtures contain this word; the recordings must be filtered out.
  await expect(page.locator('.meeting-row').first()).toContainText('teams-transcript', {
    timeout: 5_000
  })
  await expect(page.locator('.meeting-row', { hasText: 'budget review' })).toHaveCount(0)
  await page.locator('.list-search input').fill('')
  await expect(page.locator('.meeting-row', { hasText: 'Kickoff' })).toBeVisible()
})

test('copy meeting as Markdown', async () => {
  await page.locator('.meeting-row', { hasText: 'teams-transcript' }).first().click()
  await page.locator('.export-wrap .icon-btn').click()
  await page.locator('.export-menu button', { hasText: 'Copy as Markdown' }).click()
  await expect(page.locator('.toast')).toContainText('Copied')
  const text = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(text).toContain('# teams-transcript')
  expect(text).toContain('Jan Peeters')
})

test('rename meeting via title (double-click from list)', async () => {
  await page.locator('.meeting-row', { hasText: 'teams-transcript' }).first().dblclick()
  await expect(page.locator('.detail-title')).toBeFocused()
  await page.locator('.detail-title').fill('Renamed Sync')
  await page.locator('.detail-title').press('Enter')
  await expect(page.locator('.meeting-row.selected .row-title')).toHaveText('Renamed Sync')
})

test('theme setting forces dark mode from Settings', async () => {
  // Playwright pins prefers-color-scheme to 'light' by default; clear it so
  // the app's nativeTheme switch can reach the page.
  await page.emulateMedia({ colorScheme: null })
  await page.locator('.nav-row', { hasText: 'Settings' }).click()
  await page.locator('.theme-row .toggle-pill', { hasText: 'Dark' }).click()
  await page.waitForTimeout(400)
  const bg = await page.locator('.detail').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).toBe('rgb(28, 28, 30)')
  await page.locator('.theme-row .toggle-pill', { hasText: 'System' }).click()
  await page.locator('.modal .record-btn', { hasText: 'Done' }).click()
})

test('delete → Recently Deleted → restore → delete forever', async () => {
  // Soft delete from the detail toolbar
  await page.locator('.nav-row', { hasText: 'All Meetings' }).click()
  await page.locator('.meeting-row', { hasText: 'Renamed Sync' }).first().click()
  await page.locator('.icon-btn[title="Move to Recently Deleted"]').click()
  await expect(page.locator('.toast')).toContainText('Recently Deleted')

  // Gone from All Meetings, present in Recently Deleted
  await expect(page.locator('.meeting-row', { hasText: 'Renamed Sync' })).toHaveCount(0)
  await page.locator('.nav-row', { hasText: 'Recently Deleted' }).click()
  await expect(page.locator('.trash-banner')).toBeVisible()
  await page.locator('.meeting-row', { hasText: 'Renamed Sync' }).click()
  await expect(page.locator('.deleted-banner')).toContainText('permanently erased in 30 days')

  // Restore brings it back
  await page.locator('.deleted-banner .record-btn', { hasText: 'Restore' }).click()
  await expect(page.locator('.toast')).toContainText('restored')
  await expect(page.locator('.meeting-row', { hasText: 'Renamed Sync' })).toBeVisible()

  // Delete again, then delete forever (confirm bypassed via env)
  await page.locator('.meeting-row', { hasText: 'Renamed Sync' }).click()
  await page.locator('.icon-btn[title="Move to Recently Deleted"]').click()
  await page.locator('.nav-row', { hasText: 'Recently Deleted' }).click()
  await page.locator('.meeting-row', { hasText: 'Renamed Sync' }).click()
  await page.locator('.icon-btn[title="Delete forever"]').click()
  await expect(page.locator('.meeting-row', { hasText: 'Renamed Sync' })).toHaveCount(0)
  await page.locator('.nav-row', { hasText: 'All Meetings' }).click()
})

test('sidebar and transcript rail collapse and restore', async () => {
  // Self-contained: create a meeting so the detail view (and its rail) exists.
  await page.getByRole('button', { name: 'New Meeting' }).first().click()
  await expect(page.locator('.transcript-rail')).toBeVisible()

  await page.locator('.panel-toggle.left').click()
  await expect(page.locator('.sidebar')).toHaveCount(0)

  await page.locator('.icon-btn[title="Hide transcript"]').click()
  await expect(page.locator('.transcript-rail')).toHaveCount(0)
  await page.screenshot({ path: 'tests/screenshots/09-collapsed.png' })

  await page.locator('.icon-btn[title="Show transcript"]').click()
  await expect(page.locator('.transcript-rail')).toBeVisible()
  await page.locator('.panel-toggle.left').click()
  await expect(page.locator('.sidebar')).toBeVisible()
})

test('dark mode renders with readable tokens', async () => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(300)
  const bg = await page.locator('.detail').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).toBe('rgb(28, 28, 30)')
  await page.screenshot({ path: 'tests/screenshots/05-dark-mode.png' })
  // Clear the emulation entirely — pinning 'light' would block the native
  // theme switch exercised by the Settings theme test.
  await page.emulateMedia({ colorScheme: null })
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
