// src/review.js
// Interactive CLI for editors to review staged events before CitySpark submission.
// Run: node src/index.js review

import { loadStagedEvents, markStagedAsSubmitted, rejectStagedEvent, printStagedSummary } from './staging.js';
import { submitToCitySpark } from './submitter/cityspark.js';
import { log } from './utils/logger.js';

export async function runReview(options = {}) {
  const { autoSubmit = false } = options;

  const events = loadStagedEvents();

  if (events.length === 0) {
    log.info('✓ No events staged for review. Run "npm run fetch" first.');
    return;
  }

  printStagedSummary(events);

  if (autoSubmit) {
    // Non-interactive: auto-submit all HIGH confidence events (score >= 50)
    const autoApproved = events.filter(e => (e.score?.total || 0) >= 50);
    log.section(`Auto-submitting ${autoApproved.length} high-confidence events...`);

    for (const event of autoApproved) {
      const result = await submitToCitySpark(event, { headless: true });
      if (result.success) {
        markStagedAsSubmitted(event);
      }
    }

    const remaining = events.filter(e => (e.score?.total || 0) < 50);
    if (remaining.length > 0) {
      log.info(`\n${remaining.length} events need manual review. Run "npm run review" to review them.`);
    }
    return;
  }

  // Interactive review
  try {
    const { default: inquirer } = await import('inquirer');

    log.section('INTERACTIVE REVIEW MODE');
    console.log('For each event: (s)ubmit, (r)eject, (k)eep staged, (q)uit\n');

    for (const event of events) {
      printEventDetail(event);

      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'Action:',
        choices: [
          { name: '✓ Submit to CitySpark', value: 'submit' },
          { name: '✗ Reject (never show again)', value: 'reject' },
          { name: '~ Keep staged for later', value: 'keep' },
          { name: '⏹ Quit review', value: 'quit' },
        ],
      }]);

      if (action === 'quit') break;

      if (action === 'submit') {
        log.info(`Submitting "${event.title}"...`);
        const result = await submitToCitySpark(event, { headless: false }); // visible browser for manual review
        if (result.success) {
          markStagedAsSubmitted(event);
          log.success('Submitted!');
        } else {
          log.error(`Submission failed: ${result.error}`);
          const { retry } = await inquirer.prompt([{
            type: 'confirm',
            name: 'retry',
            message: 'Keep staged to retry later?',
            default: true,
          }]);
          if (!retry) rejectStagedEvent(event);
        }
      } else if (action === 'reject') {
        rejectStagedEvent(event);
      }
      // 'keep' = do nothing

      console.log('');
    }

    log.success('Review complete.');
  } catch (err) {
    // inquirer not available or non-interactive mode
    log.warn('Interactive mode not available. Use --auto flag for automatic submission.');
    log.info('Or review staged events in: ./data/staged/');
  }
}

function printEventDetail(event) {
  const border = '─'.repeat(70);
  console.log(`\n${border}`);
  console.log(`📅 ${event.title}`);
  console.log(`   Score: ${event.score?.total || 0}/100 | Source: ${event.source} | Recommend: ${event.score?.recommendation}`);
  if (event.startDate) {
    const d = new Date(event.startDate);
    console.log(`   Date:  ${d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
  }
  if (event.venueName || event.city) {
    console.log(`   Where: ${[event.venueName, event.address, event.city, event.state].filter(Boolean).join(', ')}`);
  }
  if (event.isFree) {
    console.log(`   Cost:  FREE`);
  } else if (event.priceMin != null) {
    console.log(`   Cost:  $${event.priceMin}${event.priceMax ? ` - $${event.priceMax}` : '+'}`);
  }
  if (event.score?.breakdown?.matchedKeywords?.length) {
    console.log(`   Tags:  ${event.score.breakdown.matchedKeywords.slice(0, 6).join(', ')}`);
  }
  if (event.description) {
    console.log(`   Desc:  ${event.description.slice(0, 150)}${event.description.length > 150 ? '...' : ''}`);
  }
  if (event.sourceUrl) {
    console.log(`   URL:   ${event.sourceUrl}`);
  }
  console.log(border);
}