// src/submitter/cityspark.js
// Automates submission of staged events to CitySpark using Playwright.
// CitySpark has no public POST API, so we drive the browser form.
//
// IMPORTANT: Run `npx playwright install chromium` once before using.

import { chromium } from 'playwright';
import { log } from '../utils/logger.js';
import { CITYSPARK_CATEGORIES } from '../../config/settings.js';

const SUBMIT_URL = process.env.CITYSPARK_SUBMIT_URL
  || 'https://hub.cityspark.com/event/submission/WashingtonParentMag';

/**
 * Submit a single event to CitySpark via browser automation.
 * Returns { success, citpysparkId, error }
 */
export async function submitToCitySpark(event, options = {}) {
  const { headless = true, slowMo = 50 } = options;

  log.info(`  Submitting to CitySpark: "${event.title}"`);

  const browser = await chromium.launch({ headless, slowMo });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  try {
    // ── Step 1: Log in ──────────────────────────────────────────────────────

    await page.goto('https://hub.cityspark.com/account/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Fill login form (CitySpark uses email/password)
    const emailField = page.locator('input[type="email"], input[name="email"], #email');
    const passwordField = page.locator('input[type="password"], input[name="password"], #password');

    if (await emailField.count() > 0) {
      await emailField.fill(process.env.CITYSPARK_EMAIL || '');
      await passwordField.fill(process.env.CITYSPARK_PASSWORD || '');
      await page.locator('button[type="submit"], input[type="submit"]').first().click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
      log.info('    ✓ Logged in to CitySpark');
    }

    // ── Step 2: Navigate to submission form ─────────────────────────────────

    await page.goto(SUBMIT_URL, { waitUntil: 'networkidle', timeout: 30000 });
    log.info('    ✓ Loaded submission form');

    // ── Step 3: Fill event title ─────────────────────────────────────────────

    const titleField = page.locator('input[name="title"], input[placeholder*="title" i], #title');
    if (await titleField.count() > 0) {
      await titleField.fill(event.title.slice(0, 100)); // CitySpark title limit
    }

    // ── Step 4: Fill description ─────────────────────────────────────────────

    const descField = page.locator(
      'textarea[name="description"], textarea[placeholder*="description" i], #description'
    );
    if (await descField.count() > 0) {
      // CitySpark accepts plain text or HTML in description
      const desc = formatDescription(event);
      await descField.fill(desc.slice(0, 5000));
    }

    // ── Step 5: Event URL ────────────────────────────────────────────────────

    const urlField = page.locator('input[name="url"], input[placeholder*="url" i], input[placeholder*="website" i]');
    if (await urlField.count() > 0 && event.sourceUrl) {
      await urlField.fill(event.sourceUrl);
    }

    // ── Step 6: Date & Time ──────────────────────────────────────────────────

    if (event.startDate) {
      const startD = new Date(event.startDate);

      // Date field (various formats CitySpark uses)
      const dateField = page.locator('input[name="start_date"], input[name="startDate"], input[placeholder*="date" i]').first();
      if (await dateField.count() > 0) {
        await dateField.fill(formatDate(startD));
      }

      // Time field
      const timeField = page.locator('input[name="start_time"], input[name="startTime"], input[placeholder*="time" i]').first();
      if (await timeField.count() > 0) {
        await timeField.fill(formatTime(startD));
      }

      // End date/time
      if (event.endDate) {
        const endD = new Date(event.endDate);
        const endDateField = page.locator('input[name="end_date"], input[name="endDate"]').first();
        if (await endDateField.count() > 0) {
          await endDateField.fill(formatDate(endD));
        }
        const endTimeField = page.locator('input[name="end_time"], input[name="endTime"]').first();
        if (await endTimeField.count() > 0) {
          await endTimeField.fill(formatTime(endD));
        }
      }
    }

    // ── Step 7: Venue / Location ─────────────────────────────────────────────

    const venueField = page.locator(
      'input[name="venue"], input[name="location_name"], input[placeholder*="venue" i]'
    ).first();
    if (await venueField.count() > 0 && event.venueName) {
      await venueField.fill(event.venueName);
    }

    const addressField = page.locator(
      'input[name="address"], input[name="street"], input[placeholder*="address" i]'
    ).first();
    if (await addressField.count() > 0 && event.address) {
      await addressField.fill(event.address);
    }

    const cityField = page.locator('input[name="city"]').first();
    if (await cityField.count() > 0 && event.city) {
      await cityField.fill(event.city);
    }

    const stateField = page.locator('input[name="state"], select[name="state"]').first();
    if (await stateField.count() > 0 && event.state) {
      const tag = await stateField.evaluate(el => el.tagName);
      if (tag === 'SELECT') {
        await stateField.selectOption(event.state);
      } else {
        await stateField.fill(event.state);
      }
    }

    const zipField = page.locator('input[name="zip"], input[name="postal_code"]').first();
    if (await zipField.count() > 0 && event.zip) {
      await zipField.fill(event.zip);
    }

    // ── Step 8: Admission / Price ────────────────────────────────────────────

    if (event.isFree) {
      const freeCheckbox = page.locator(
        'input[type="checkbox"][name*="free" i], label:has-text("Free") input'
      ).first();
      if (await freeCheckbox.count() > 0) {
        await freeCheckbox.check();
      }
    } else if (event.priceMin != null) {
      const priceField = page.locator(
        'input[name="price"], input[name="admission"], input[placeholder*="price" i]'
      ).first();
      if (await priceField.count() > 0) {
        await priceField.fill(String(event.priceMin));
      }
    }

    // ── Step 9: Image URL ────────────────────────────────────────────────────

    if (event.imageUrl) {
      const imageUrlField = page.locator(
        'input[name="image_url"], input[placeholder*="image url" i]'
      ).first();
      if (await imageUrlField.count() > 0) {
        await imageUrlField.fill(event.imageUrl);
      }
    }

    // ── Step 10: Take a screenshot before submitting ─────────────────────────

    await page.screenshot({
      path: `./data/logs/cityspark-prefill-${Date.now()}.png`,
      fullPage: false,
    });

    // ── Step 11: Select "Free basic listing" and submit ──────────────────────

    // Click Review / Next button
    const reviewBtn = page.locator('button:has-text("Review"), button:has-text("Next"), input[value="Review"]').first();
    if (await reviewBtn.count() > 0) {
      await reviewBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // On the promotion page, select "No thanks, free listing"
    const freeListingOption = page.locator(
      'label:has-text("No thanks"), input[value*="free" i], label:has-text("free basic")'
    ).first();
    if (await freeListingOption.count() > 0) {
      await freeListingOption.click();
    }

    // Final submit
    const submitBtn = page.locator('button:has-text("Submit"), input[value="Submit Event"]').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 20000 });
    }

    // ── Step 12: Confirm success ─────────────────────────────────────────────

    const url = page.url();
    const pageText = await page.textContent('body');
    const success = url.includes('confirmation') ||
      url.includes('success') ||
      (pageText || '').toLowerCase().includes('submitted') ||
      (pageText || '').toLowerCase().includes('thank you');

    await page.screenshot({
      path: `./data/logs/cityspark-result-${Date.now()}.png`,
    });

    if (success) {
      log.success(`    ✓ Submitted: "${event.title}"`);
      return { success: true };
    } else {
      log.warn(`    ? Uncertain submission result for: "${event.title}"`);
      return { success: false, error: 'Could not confirm submission' };
    }

  } catch (err) {
    log.error(`    ✗ CitySpark submission error: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

/**
 * Submit multiple events with delay between each to avoid rate limits.
 */
export async function submitBatch(events, options = {}) {
  const results = [];

  for (const event of events) {
    const result = await submitToCitySpark(event, options);
    results.push({ event, ...result });

    if (result.success) {
      await sleep(3000); // wait 3s between successful submissions
    } else {
      await sleep(5000); // wait longer after failures
    }
  }

  return results;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function formatDate(date) {
  // MM/DD/YYYY format
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

function formatTime(date) {
  // HH:MM AM/PM
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function formatDescription(event) {
  const parts = [event.description];
  if (event.organizerName) parts.push(`\n\nOrganizer: ${event.organizerName}`);
  if (event.sourceUrl) parts.push(`\nMore info: ${event.sourceUrl}`);
  if (event.isFree) parts.push('\n\nThis event is FREE to attend.');
  else if (event.priceMin != null) {
    parts.push(`\n\nAdmission: $${event.priceMin}${event.priceMax ? ` - $${event.priceMax}` : ''}`);
  }
  return parts.join('').trim();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));