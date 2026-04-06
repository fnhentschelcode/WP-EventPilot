// src/staging.js
// Manages the staging area where events wait for editor review before submission.

import fs from 'fs';
import path from 'path';
import { PATHS, MIN_SCORE_TO_STAGE } from '../config/settings.js';
import { filterNewEvents, markAsSubmitted } from './utils/dedup.js';
import { log } from './utils/logger.js';

/**
 * Stage a list of events (save to ./data/staged/ as JSON files).
 * Only stages events that pass the score threshold and aren't already staged/submitted.
 */
export function stageEvents(events) {
  if (!fs.existsSync(PATHS.staged)) {
    fs.mkdirSync(PATHS.staged, { recursive: true });
  }

  // Filter out already submitted events
  const newEvents = filterNewEvents(events);

  // Filter by score
  const toStage = newEvents.filter(e =>
    e.score?.recommendation === 'STAGE' ||
    e.score?.recommendation === 'LOW_RELEVANCE' // include low-relevance for editor review
  );

  const excluded = newEvents.filter(e => e.score?.recommendation === 'EXCLUDE');

  log.info(`  Staging: ${toStage.length} events | Excluded: ${excluded.length} | Already seen: ${events.length - newEvents.length}`);

  // Save each staged event as its own JSON file
  const staged = [];
  for (const event of toStage) {
    const filename = safeFilename(event);
    const filepath = path.join(PATHS.staged, filename);

    if (!fs.existsSync(filepath)) { // don't overwrite existing staged events
      fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
      staged.push(event);
    }
  }

  log.success(`  ✓ ${staged.length} new events staged to ${PATHS.staged}`);
  return { staged, excluded };
}

/**
 * Load all currently staged events.
 */
export function loadStagedEvents() {
  if (!fs.existsSync(PATHS.staged)) return [];

  return fs.readdirSync(PATHS.staged)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(PATHS.staged, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Sort by score descending, then by date
      const scoreDiff = (b.score?.total || 0) - (a.score?.total || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(a.startDate || 0) - new Date(b.startDate || 0);
    });
}

/**
 * Move a staged event to submitted (remove from staged, mark as submitted).
 */
export function markStagedAsSubmitted(event) {
  const filename = safeFilename(event);
  const stagedPath = path.join(PATHS.staged, filename);

  // Remove from staged folder
  if (fs.existsSync(stagedPath)) {
    fs.unlinkSync(stagedPath);
  }

  // Save to submitted archive
  if (!fs.existsSync(PATHS.submitted)) {
    fs.mkdirSync(PATHS.submitted, { recursive: true });
  }
  const submittedPath = path.join(PATHS.submitted, filename);
  fs.writeFileSync(submittedPath, JSON.stringify({
    ...event,
    submittedAt: new Date().toISOString(),
  }, null, 2));

  // Mark in dedup registry
  markAsSubmitted([event]);
}

/**
 * Remove a staged event (editor rejected it).
 */
export function rejectStagedEvent(event) {
  const filename = safeFilename(event);
  const stagedPath = path.join(PATHS.staged, filename);
  if (fs.existsSync(stagedPath)) {
    fs.unlinkSync(stagedPath);
  }
  // Also mark as "submitted" so we don't re-fetch it
  markAsSubmitted([event]);
  log.info(`  Rejected: "${event.title}"`);
}

/**
 * Print a summary of staged events to the terminal.
 */
export function printStagedSummary(events) {
  if (events.length === 0) {
    log.info('  No events currently staged.');
    return;
  }

  log.section(`📋 STAGED EVENTS (${events.length} total)`);

  const high = events.filter(e => (e.score?.total || 0) >= 50);
  const medium = events.filter(e => (e.score?.total || 0) >= MIN_SCORE_TO_STAGE && (e.score?.total || 0) < 50);
  const low = events.filter(e => (e.score?.total || 0) < MIN_SCORE_TO_STAGE);

  console.log(`\n🟢 HIGH confidence (${high.length}):`);
  high.forEach(printEventLine);

  console.log(`\n🟡 MEDIUM confidence (${medium.length}):`);
  medium.forEach(printEventLine);

  console.log(`\n🔴 LOW confidence (${low.length}) — editor review needed:`);
  low.forEach(printEventLine);
}

function printEventLine(e) {
  const date = e.startDate ? new Date(e.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date';
  const score = e.score?.total || 0;
  const keywords = (e.score?.breakdown?.matchedKeywords || []).slice(0, 3).join(', ');
  console.log(`  [${score.toString().padStart(3)}] ${date} | ${e.title.slice(0, 55).padEnd(55)} | ${e.source} | ${keywords}`);
}

function safeFilename(event) {
  const title = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
  const date = event.startDate ? event.startDate.slice(0, 10) : 'nodate';
  return `${event.source}-${date}-${title}.json`;
}