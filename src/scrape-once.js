import { scrape, SessionExpiredError } from './scraper.js';

/**
 * Dev helper: scrape once and print parsed results. Pass --html to also dump the
 * raw results-table HTML so selectors can be refined against the live page.
 * Pass --headed to watch the browser.
 */
async function main() {
  const dumpHtml = process.argv.includes('--html');
  const headless = !process.argv.includes('--headed');
  try {
    const { results, rawTables } = await scrape({ headless, dumpHtml });
    console.log(`\nParsed ${results.length} result(s):\n`);
    for (const r of results) {
      console.log(`  [${r.term}] ${r.courseCode} — ${r.courseName} => ${r.grade}`);
    }
    if (dumpHtml && rawTables) {
      console.log(`\n--- RAW TABLES (${rawTables.length}) ---`);
      rawTables.forEach((html, i) => {
        console.log(`\n### table[${i}] ###\n${html.slice(0, 4000)}`);
      });
    }
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      console.error('🔐 Session expired — run `npm run login` first.');
      process.exit(2);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
