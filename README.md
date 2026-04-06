# WP-EventPilot

Automatically pulls family-friendly events from **Eventbrite**, **Meetup**, and **DC Government** open data sources, scores them for editorial relevance, and submits approved events to the Washington Parent **CitySpark** calendar.

---

## Architecture

```
Sources                    Pipeline                     Output
────────                   ────────                     ──────
Eventbrite ─┐
            ├─→ fetch → score → stage → review → CitySpark
Meetup ─────┤                              ↑
            │                        Editor approves
DC Gov/NPS ─┘                        (or auto-submit
Smithsonian ─                         high-confidence)
```

### Scoring System

Each event is scored 0–100 for Washington Parent editorial fit:

| Signal | Points |
|--------|--------|
| Family keywords in title/description | up to +40 |
| Free event | +10 |
| DMV location confirmed | +10 |
| Trusted source (NPS, Smithsonian, DC Gov) | +10 |
| Has image | +5 |
| Has description | +5 |
| Adult-only keywords found | -25 each |
| No date | -20 |
| No venue | -10 |

- **Score ≥ 50** → Auto-submit (high confidence)
- **Score 30–49** → Stage for editor review
- **Excluded keywords** → Always rejected

---

## Setup

### 1. Install dependencies

```bash
cd wp-event-ingestion
npm install
npx playwright install chromium
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required `.env` values:

| Key | Where to get it |
|-----|----------------|
| `CITYSPARK_EMAIL` | Your CitySpark hub.cityspark.com login |
| `CITYSPARK_PASSWORD` | Same |
| `EVENTBRITE_TOKEN` | https://www.eventbrite.com/platform/api |
| `MEETUP_API_KEY` | https://www.meetup.com/api/oauth/list/ |
| `NPS_API_KEY` | Free at https://www.nps.gov/subjects/digital/nps-data-api.htm |

### 3. Test a fetch

```bash
npm run fetch
```

---

## Usage

### Manual workflow (recommended to start)

```bash
# 1. Pull events from all sources
npm run fetch

# 2. Review and approve events interactively
npm run review
# → Opens a browser for each event you approve so you can verify the CitySpark form
```

### Semi-automated workflow

```bash
# Fetch + auto-submit high-confidence (score ≥ 50) events
# Leaves lower-confidence events staged for manual review
node src/index.js pipeline
```

### Fully automated (cron)

```bash
# Start the scheduler — runs on CRON_SCHEDULE from .env (default: Mondays 8am)
node src/index.js cron
```

Or add to crontab directly:
```
0 8 * * 1 cd /path/to/wp-event-ingestion && node src/index.js pipeline --auto >> data/logs/cron.log 2>&1
```

### Check status

```bash
node src/index.js status
```

---

## Data Files

```
data/
  staged/        ← Events waiting for editor review (JSON files)
  submitted/     ← Archive of submitted events
  logs/
    YYYY-MM-DD.json   ← Run summaries
    cityspark-*.png   ← Screenshots from CitySpark submission
    submitted-ids.json ← Deduplication registry
```

---

## Adding More Sources

Create a new file in `src/scrapers/`:

```javascript
// src/scrapers/mysource.js
import { scoreEvent, normalizeEvent } from '../utils/scorer.js';

export async function fetchMySourceEvents() {
  const rawEvents = await callMyAPI();
  return rawEvents.map(raw => {
    const normalized = normalizeEvent({
      source: 'mysource',
      sourceId: raw.id,
      title: raw.name,
      // ... map fields
    });
    return { ...normalized, score: scoreEvent(normalized), source: 'mysource' };
  });
}
```

Then add it to `src/index.js` in the `fetchAll()` function.

### Suggested additional sources

- **Virginia ArtsFairfax** — arts.fairfaxcounty.gov
- **Montgomery County Recreation** — montgomerycountymd.gov/rec
- **Arlington Parks** — arlingtonva.us/parks
- **Alexandria Recreation** — alexandriava.gov/recreation
- **DC Public Library events** — dclibrary.org/events

---

## CitySpark Submission Notes

CitySpark has **no public POST API** — submissions go through their web form. The Playwright submitter:

1. Logs into hub.cityspark.com with your credentials
2. Navigates to the Washington Parent submission URL
3. Fills in all form fields
4. Selects the free basic listing option
5. Submits and takes a screenshot for audit purposes

**All submitted events still go through CitySpark's editorial review** before appearing on the Washington Parent calendar (typically a 2-hour window per CitySpark's policy).

### Troubleshooting CitySpark submissions

If the submitter stops working (CitySpark updates their form):
1. Check screenshots in `data/logs/cityspark-*.png`
2. Run with `headless: false` to watch the browser
3. Update field selectors in `src/submitter/cityspark.js`

---

## Family-Friendly Keyword Tuning

Edit `config/settings.js` to adjust:
- `FAMILY_KEYWORDS` — words that boost relevance score
- `EXCLUDE_KEYWORDS` — words that disqualify an event
- `MIN_SCORE_TO_STAGE` — minimum score to keep an event (default: 30)

---

## License

Internal tool — Washington Parent / Semantica Digital
