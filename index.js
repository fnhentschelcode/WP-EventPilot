// src/index.js
// Washington Parent → CitySpark Event Ingestion Pipeline
// ──────────────────────────────────────────────────────
// Commands:
//   node src/index.js fetch      ← pull events from all sources
//   node src/index.js review     ← interactive editor review
//   node src/index.js submit     ← auto-submit high-confidence events
//   node src/index.js pipeline   ← fetch + auto-submit (for cron)

import 'dotenv/config';
import { fetchEventbriteEvents } from './scrapers/eventbrite.js';
import { fetchMeetupEvents } from './scrapers/meetup.js';
import { fetchDCGovEvents } from './scrapers/dcgov.js';
import { stageEvents, loadStagedEvents, printStagedSummary } from './staging.js';
import { runReview } from './review.js';
import { log, writeRunLog } from './utils/logger.js';

const [,, command = 'pipeline', ...flags] = process.argv;
const isAutoSubmit = flags.includes('--auto');

async function fetchAll() {
  log.section('FETCHING EVENTS FROM ALL SOURCES');
  const startTime = Date.now();

  const results = await Promise.allSettled([
    fetchEventbriteEvents(),
    fetchMeetupEvents(),
    fetchDCGovEvents(),
  ]);

  const allEvents = results.flatMap(r =>
    r.status === 'fulfilled' ? r.value : []
  );

  const errors = results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason?.message);

  if (errors.length) {
    log.warn(`Some sources failed: ${errors.join(', ')}`);
  }

  log.section(`TOTAL: ${allEvents.length} events fetched from all sources`);

  const { staged, excluded } = stageEvents(allEvents);

  writeRunLog({
    command: 'fetch',
    totalFetched: allEvents.length,
    totalStaged: staged.length,
    totalExcluded: excluded.length,
    durationMs: Date.now() - startTime,
    errors,
  });

  return staged;
}

async function main() {
  log.section(`🗓  WASHINGTON PARENT EVENT INGESTION PIPELINE`);
  log.info(`Command: ${command} | ${new Date().toLocaleString()}`);

  switch (command) {
    case 'fetch': {
      await fetchAll();
      const staged = loadStagedEvents();
      printStagedSummary(staged);
      log.info(`\nNext step: run "npm run review" to approve events for CitySpark`);
      break;
    }

    case 'review': {
      await runReview({ autoSubmit: isAutoSubmit });
      break;
    }

    case 'submit': {
      // Auto-submit without interactive review
      await runReview({ autoSubmit: true });
      break;
    }

    case 'pipeline': {
      // Full automated pipeline: fetch → stage → auto-submit high-confidence
      log.section('RUNNING FULL AUTOMATED PIPELINE');
      await fetchAll();
      await runReview({ autoSubmit: true });

      const remaining = loadStagedEvents();
      if (remaining.length > 0) {
        log.info(`\n${remaining.length} events still staged for manual review.`);
        log.info('Run: npm run review');
      }
      break;
    }

    case 'status': {
      const staged = loadStagedEvents();
      printStagedSummary(staged);
      break;
    }

    case 'cron': {
      // Start the scheduler (long-running process)
      const { default: cron } = await import('node-cron');
      const schedule = process.env.CRON_SCHEDULE || '0 8 * * 1'; // Mondays 8am

      log.info(`\n⏰ Scheduler started. Running on: ${schedule}`);
      log.info('Ctrl+C to stop\n');

      cron.schedule(schedule, async () => {
        log.section('SCHEDULED RUN STARTING');
        await fetchAll();
        await runReview({ autoSubmit: true });
        log.section('SCHEDULED RUN COMPLETE');
      });

      // Keep process alive
      process.stdin.resume();
      break;
    }

    default: {
      console.log(`
Washington Parent Event Ingestion Pipeline
──────────────────────────────────────────
Usage: node src/index.js <command> [flags]

Commands:
  fetch      Pull events from Eventbrite, Meetup, DC Gov
  review     Interactive editor review of staged events
  submit     Auto-submit high-confidence events to CitySpark
  pipeline   fetch + submit (good for cron jobs)
  status     Show currently staged events
  cron       Start scheduled runner (uses CRON_SCHEDULE from .env)

Flags:
  --auto     In review mode, skip interactive prompts

Examples:
  node src/index.js fetch
  node src/index.js review
  node src/index.js pipeline --auto
      `);
    }
  }
}

main().catch(err => {
  log.error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});