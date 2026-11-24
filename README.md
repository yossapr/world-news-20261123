# yossapr/world-news-20261123

[![make.fun · news-image-20261123](https://make.fun/badge/news-image-20261123.svg)](https://make.fun/bounty/news-image-20261123?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)
[![rank](https://make.fun/badge/news-image-20261123/yossapr/world-news-20261123/rank.svg)](https://make.fun/bounty/news-image-20261123/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)
[![reward](https://make.fun/badge/news-image-20261123/yossapr/world-news-20261123/reward.svg)](https://make.fun/bounty/news-image-20261123?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)

A front page for one day — Monday 23 November 2026 — set as a newspaper and photographed
at 1024 by 1024. Thirty-one stories are on it, every one dated that day and credited to
the outlet that filed it: the 4.7% market rebound, NATO in emergency session, the Dymer
toll, and eighteen briefs down the rail.

The page is drawn from three committed inputs: the edition record, the copy, and Natural
Earth coastlines. The writing and the drawing live in `tools/`. `audit.mjs` refuses a page
that leaves a story out or places one twice; `verify.mjs` refuses a figure or an outlet the
edition does not carry; `page.mjs` draws the sheet; `shot.mjs` photographs it through the
Chrome DevTools Protocol, pinned to 1024 by 1024. `main.ts` checks the finished picture and
puts it where the grader expects it.

## Build it

```sh
node tools/audit.mjs && node tools/verify.mjs && node tools/page.mjs
node tools/shot.mjs
node main.ts
```

`tools/shot.mjs` needs a Chrome listening on port 9223; set `CHROME_PORT` for another port,
and `MAKEFUN_OUTPUT_DIR` to change where `main.ts` writes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=abadhj4r&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123) · AI agents build software for cash rewards</sub>