# Ingest fixtures

Verbatim excerpts of live responses, captured **2026-08-23**, used by
`scripts/feeds.test.ts` and `scripts/render.test.ts` to test the two Phase A
ingest paths (`scripts/lib/feeds.ts`, `scripts/lib/render.ts`) without network
access.

## Feeds

| File | Source | Why it's here |
|---|---|---|
| `goheels.ics` | `https://goheels.com/calendar.ashx/calendar.ics` | 7 of 226 VEVENTs. Covers the escaped-comma (`Chapel Hill\, N.C., Venue`) and unescaped-comma (`Chapel Hill, Karen Shelton Stadium`) location styles, plus four out-of-metro games — Memphis, Dublin, Fayetteville (Ark.) and Winston-Salem. Two of those four are listed as **"vs"**, which is why the radius filter reads `LOCATION`, never the title. |
| `duke-calendar.ics` | `https://calendar.duke.edu/index.ics` | 4 of 40 VEVENTs, with the full VTIMEZONE prologue. Bedework style: folded `LOCATION`, `DURATION` instead of `DTEND`, `DTSTART;VALUE=DATE`, and the literal string `None` where there is no location. |
| `dncr-localist.json` | `https://events.dncr.nc.gov/api/2/events?days=7&pp=100` | 6 of 100 events. An all-day instance, a timed one, a long `ticket_cost` string that contradicts `free: true`, two statewide entries the radius filter must drop (Elk Knob in Todd, Chimney Rock in Lake Lure), and one with no `geo` and no `location_name`. |
| `wordpress-blog.rss` | `https://raleighlittletheatre.org/feed/` | The trap. A venue's advertised `<link rel="alternate">` feed, which turns out to be its blog: auditions, a cast list, and "Job Opening – Marketing Manager". It must yield **zero** events. |

## Rendered pages

These are pages, not feeds: what a browser produced after the page's scripts
ran, for the two sources that declare `"ingest": { "mode": "render" }`. Each file
carries a header comment saying exactly what was trimmed.

| File | Source | Why it's here |
|---|---|---|
| `bandsintown-chapel-of-bones.html` | `https://www.bandsintown.com/v/10409371-chapel-of-bones` | The **JSON-LD** case, and the reason `@type` matching is a substring test: every event is a `MusicEvent`, never an `Event`. 5 of 30 events, plus the page's `MusicVenue`, `Review` and `FAQPage` blocks, which must all be filtered out. `startDate` is naive venue-local time and `endDate` is a bare DATE that parses *earlier* than the start — pass it through and `validate.ts` reports "end is before start" on every event. |
| `lenovo-center-events.html` | `https://www.lenovocenter.com/events` | The **rendered-text** case. The page's only `ld+json` block is an `Organization`, so a JSON-LD-only extractor yields zero here. 4 of 24 rows, keeping the traps verbatim: the date split across three `<span>`s, `alt`/`title` attributes repeating the event name, an icon `<svg>` between title and time, and a staffing event the extractor deliberately does not editorialize away. |

Excerpts keep the upstream bytes exactly — line folding, escaping, HTML-escaped
`&amp;` in URLs — so a parser change that breaks on real-world formatting fails
here. Only whole records were removed; nothing inside one was edited.

To refresh one, re-fetch the endpoint (or re-render the page — a real browser
for Bandsintown, `scripts/render_source.ts` for Lenovo Center) and splice out the
same kinds of record.
Expected values in the tests are anchored to the capture date, so a refresh means
updating those too.
