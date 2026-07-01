# Meeterz UI Spec

## 0. Intent

- **Product:** Meeterz — a macOS app that records meetings (Teams system audio + room microphone), transcribes locally, and organizes recordings with notes and folders.
- **Audience:** A single professional running back-to-back remote and in-person meetings. Values privacy (all local) and calm, Apple-grade tools.
- **The ONE action:** Start a recording with one click, type notes while it runs, get a speaker-separated transcript when it stops.
- **Brand constraints:** Native macOS visual language. SF Pro (system font stack), one accent color (macOS system blue `#0A7AFF`), system red only for the live-recording state. No gradients, no decorative illustration. Feels like Apple Notes had a baby with Granola.

## 1. References (Mobbin — anchor + comparators)

See `docs/MOBBIN_REFS.md`. Anchor: Notion AI meeting notes (inline, quiet recording inside a note). Comparators: Fireflies (notes ↔ transcript split with playback), Otter (folder/library structure), Apple Notes (3-pane macOS layout, not on Mobbin — native reference).

## 2. Deconstruction → spec

### Tokens (project's own — never the references' colors)

```
--bg-window:      transparent (vibrancy sidebar under)   --accent:        #0A7AFF
--bg-sidebar:     rgba(246,246,244,0.72)                 --accent-soft:   rgba(10,122,255,0.10)
--bg-list:        #F7F7F5                                --rec:           #FF3B30
--bg-content:     #FFFFFF                                --rec-soft:      rgba(255,59,48,0.08)
--ink:            #1D1D1F                                --ok:            #34C759
--ink-2:          #6E6E73                                --border:        rgba(0,0,0,0.09)
--ink-3:          #AEAEB2                                --border-strong: rgba(0,0,0,0.14)

radius: 6 (controls) / 10 (cards, list rows) / 14 (recording HUD)
shadow-1: 0 1px 2px rgba(0,0,0,0.05)
shadow-2: 0 10px 30px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)
spacing grid: 4px. Pane paddings: sidebar 12, list 12, content 40/32.
```

### Type scale (SF Pro via -apple-system)

| Element | Size/weight/line |
|---|---|
| Meeting title (detail) | 26px / 700 / 1.2, letter-spacing -0.02em |
| Pane headers ("Folders") | 11px / 600 / uppercase / ls 0.06em / ink-3 |
| List row title | 13px / 590 |
| List row meta + snippet | 12px / 400 / ink-2 |
| Notes editor body | 15px / 400 / 1.7 |
| Transcript text | 13.5px / 400 / 1.6 |
| Speaker label | 12px / 600 |
| Timer (recording) | 13px / 500 / tabular-nums |
| Buttons | 13px / 590 |

### Layout — 3-pane, Apple Notes structure

```
┌ traffic lights (hiddenInset) ──────────────────────────────────────────┐
│ SIDEBAR 224px │ LIST 288px         │ DETAIL flex (min 560)             │
│ vibrancy      │ solid #F7F7F5      │ white                             │
│               │                    │  ┌ notes column (flex) ┬ transcript│
│ + New Meeting │ search field       │  │ title, meta, editor │ rail 340px│
│ All Meetings  │ meeting rows       │  └─────────────────────┴──────────┘│
│ FOLDERS ▾     │ (10px radius,      │  recording HUD floats bottom-center│
│  • folder …   │  selected=accent-  │  when live                        │
│               │  soft bg)          │                                   │
└───────────────┴────────────────────┴───────────────────────────────────┘
```
- Window 1280×820 default, min 980×640. Traffic-light offset: titleBarStyle hiddenInset, sidebar top-padding 40px.
- Sidebar row: 28px tall, 6px radius, icon 16px + label 13px; selected = accent-soft bg + accent icon.
- List row: padding 10/12, title + relative date + 1-line snippet, selected = white card + shadow-1 + border.
- Detail: max-width 680 notes column, centered when transcript rail hidden.

### Components inventory

1. **Sidebar** = new-meeting button (accent, full-width, 8px radius) + nav item (All Meetings) + folders section header with `+` + folder rows (context: rename/delete) .
2. **MeetingList** = search input (rounded 8, bg rgba(0,0,0,0.05)) + grouped-by-day rows.
3. **MeetingDetail** = title (inline-editable h1) + meta row (date · duration · folder chip · status chip) + NotesEditor (borderless textarea-like, placeholder "Type your notes…") + TranscriptRail.
4. **TranscriptRail** = header ("Transcript" + copy button) + segment rows: speaker chip (Them=accent / You=green tint) + timestamp (11px ink-3, tabular) + text. Empty state: mic glyph + "Transcript appears after the meeting."
5. **RecordingHUD** (floating, 14px radius, shadow-2, white) = red pulsing dot + timer + live canvas waveform (2×36px bars, ink at 20%) + source pills (System ● / Mic ●, toggleable before start, indicators while live) + Stop button (rec red, white text).
6. **StatusChip**: recording (rec-soft/red), transcribing (accent-soft/accent, spinner), ready (green tint), idle none.

### States & motion

- List/folder hover: bg rgba(0,0,0,0.04); selection animates none (instant, native).
- Recording dot: 1.2s opacity pulse. Waveform: 60fps canvas, bars ease-out.
- HUD enter: translateY(12px)+fade 240ms cubic-bezier(0.32,0.72,0,1) (Apple spring-ish).
- Transcribing: indeterminate 3-dot pulse in status chip; transcript rows fade-stagger in on arrival.
- All focus states: 2px accent ring at 40% on interactive elements (keyboard only).

### Imagery

None needed — this is a productivity app; iconography via inline SF-Symbols-style SVG (16px, 1.5px stroke). No Higgsfield.

## 5. Verification checklist

- Screenshot at 1280×820: pane widths 224/288/flex; title 26px; sidebar translucent over desktop.
- Recording flow: HUD floats, waveform animates, stop → status chip → transcript fills rail.
- Measure: notes editor line-height 25.5px (15×1.7); list row height ≈ 64px.
