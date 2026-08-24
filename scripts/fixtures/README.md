# Feed fixtures

Verbatim excerpts of live responses, captured **2026-08-23**, used by
`scripts/feeds.test.ts` to test `scripts/lib/feeds.ts` without network access.

| File | Source | Why it's here |
|---|---|---|
| `goheels.ics` | `https://goheels.com/calendar.ashx/calendar.ics` | 7 of 226 VEVENTs. Covers the escaped-comma (`Chapel Hill\, N.C., Venue`) and unescaped-comma (`Chapel Hill, Karen Shelton Stadium`) location styles, plus four out-of-metro games — Memphis, Dublin, Fayetteville (Ark.) and Winston-Salem. Two of those four are listed as **"vs"**, which is why the radius filter reads `LOCATION`, never the title. |
| `duke-calendar.ics` | `https://calendar.duke.edu/index.ics` | 4 of 40 VEVENTs, with the full VTIMEZONE prologue. Bedework style: folded `LOCATION`, `DURATION` instead of `DTEND`, `DTSTART;VALUE=DATE`, and the literal string `None` where there is no location. |
| `dncr-localist.json` | `https://events.dncr.nc.gov/api/2/events?days=7&pp=100` | 6 of 100 events. An all-day instance, a timed one, a long `ticket_cost` string that contradicts `free: true`, two statewide entries the radius filter must drop (Elk Knob in Todd, Chimney Rock in Lake Lure), and one with no `geo` and no `location_name`. |
| `wordpress-blog.rss` | `https://raleighlittletheatre.org/feed/` | The trap. A venue's advertised `<link rel="alternate">` feed, which turns out to be its blog: auditions, a cast list, and "Job Opening – Marketing Manager". It must yield **zero** events. |

Excerpts keep the upstream bytes exactly — line folding, escaping, HTML-escaped
`&amp;` in URLs — so a parser change that breaks on real-world formatting fails
here. Only whole records were removed; nothing inside one was edited.

To refresh one, re-fetch the endpoint and splice out the same kinds of record.
Expected values in the tests are anchored to the capture date, so a refresh means
updating those too.
