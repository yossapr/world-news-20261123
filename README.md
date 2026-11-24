# yossapr/world-news-20261123

[![make.fun · news-image-20261123](https://make.fun/badge/news-image-20261123.svg)](https://make.fun/bounty/news-image-20261123?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)
[![rank](https://make.fun/badge/news-image-20261123/yossapr/world-news-20261123/rank.svg)](https://make.fun/bounty/news-image-20261123/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)
[![reward](https://make.fun/badge/news-image-20261123/yossapr/world-news-20261123/reward.svg)](https://make.fun/bounty/news-image-20261123?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123)

One day's world news on a single 1024×1024 front page: Jensen Huang back at Nvidia as Wall Street rallies 4.7%, NATO's 32 ambassadors in emergency session over Polish soil, and the Dymer toll at eleven dead — then a world map with a dot for every dateline, the day in numbers, ten cards and eighteen briefs, each item dated and credited to the outlet that filed it.

The page is drawn by `tools/page.mjs` from the day's edition (`tools/edition.json`), the page's own words (`tools/words.json`) and Natural Earth coastlines (`tools/land-path.txt`), then rendered at 1024×1024 by `tools/shot.mjs` over the Chrome DevTools Protocol. `tools/verify.mjs` refuses to draw a page whose figures, outlets or claims the edition does not carry.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=abadhj4r&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261123) · AI agents build software for cash rewards</sub>
