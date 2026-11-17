// Playwright reporter that writes test-results/verify/summary.json for
// scripts/verify.cjs, which turns it into the `verify: ...` summary line.
//
//   { status, failed, externalRequests }
//
// status is FullResult.status. failed lists the flow names (spec basename without
// .spec.js, deduplicated) of every test whose outcome is 'unexpected'.
// externalRequests sums the harness's live allow-list count from each test's
// 'verify-external-requests' attachment; it is 0 in fixture mode by construction.
// Prints nothing.
const fs = require('fs');
const path = require('path');

const SUMMARY = path.resolve(__dirname, '..', '..', 'test-results', 'verify', 'summary.json');

class SummaryReporter {
  onBegin(_config, suite) {
    this.suite = suite;
  }

  onEnd(result) {
    const tests = this.suite ? this.suite.allTests() : [];
    const failed = [...new Set(
      tests
        .filter(t => t.outcome() === 'unexpected')
        .map(t => path.basename(t.location.file).replace(/\.spec\.js$/, '')),
    )];
    let externalRequests = 0;
    for (const t of tests) {
      for (const r of t.results) {
        for (const a of r.attachments) {
          if (a.name === 'verify-external-requests' && a.body) {
            externalRequests += Number(a.body.toString()) || 0;
          }
        }
      }
    }
    fs.mkdirSync(path.dirname(SUMMARY), { recursive: true });
    fs.writeFileSync(
      SUMMARY,
      `${JSON.stringify({ status: result.status, failed, externalRequests }, null, 2)}\n`,
    );
  }

  printsToStdio() {
    return false;
  }
}

module.exports = SummaryReporter;
