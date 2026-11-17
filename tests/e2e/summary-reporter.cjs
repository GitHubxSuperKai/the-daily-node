// Playwright reporter that writes test-results/verify/summary.json for
// scripts/verify.cjs, which turns it into the `verify: ...` summary line.
//
//   { status, failed, externalRequests, externalOrigins }
//
// status is FullResult.status. failed lists the flow names (spec basename without
// .spec.js, deduplicated) of every test whose outcome is 'unexpected'.
// externalRequests sums the harness's count of real live fetches from each test's
// 'verify-external-requests' attachment; externalOrigins is the sorted union of the
// origins in each 'verify-external-origins' attachment (a JSON array, origins only).
// Both are 0 / [] in fixture mode by construction. Prints nothing.
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
    const origins = new Set();
    for (const t of tests) {
      for (const r of t.results) {
        for (const a of r.attachments) {
          if (a.name === 'verify-external-requests' && a.body) {
            externalRequests += Number(a.body.toString()) || 0;
          }
          if (a.name === 'verify-external-origins' && a.body) {
            for (const origin of JSON.parse(a.body.toString())) origins.add(origin);
          }
        }
      }
    }
    const externalOrigins = [...origins].sort();
    fs.mkdirSync(path.dirname(SUMMARY), { recursive: true });
    fs.writeFileSync(
      SUMMARY,
      `${JSON.stringify({ status: result.status, failed, externalRequests, externalOrigins }, null, 2)}\n`,
    );
  }

  printsToStdio() {
    return false;
  }
}

module.exports = SummaryReporter;
