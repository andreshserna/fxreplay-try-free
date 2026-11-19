import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { run } from './sample-size.mjs';
import { duration, sampleSizePerArm } from './stats.mjs';

test('the text output carries the inputs, the two rates and the per-arm number', () => {
  const perArm = sampleSizePerArm({ baseline: 0.1, relativeMde: 0.15 });
  const { code, stdout, stderr } = run(['--baseline', '0.10', '--mde', '0.15']);
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /Baseline rate: +10%/);
  assert.match(stdout, /Minimum effect: +\+15% relative/);
  assert.match(stdout, /10% \(control\) vs 11\.5% \(variant\)/);
  assert.match(stdout, /Alpha: +0\.05/);
  assert.match(stdout, /Power: +0\.8/);
  assert.match(stdout, new RegExp(`Visitors per arm: +${perArm}\\n`));
  assert.match(stdout, new RegExp(`Visitors in total: +${perArm * 2}\\n`));
  assert.doesNotMatch(stdout, /Duration/, 'no duration without --daily-visitors');
});

test('with --daily-visitors the text adds the days and the whole weeks', () => {
  // 2% baseline, +25%: 13807 per arm (see stats.test.mjs). 27614 / 1500 = 18.4 -> 19 days, 3 weeks.
  const { code, stdout } = run(['--baseline', '0.02', '--mde', '0.25', '--daily-visitors', '1500']);
  assert.equal(code, 0);
  assert.match(stdout, /Visitors per arm: +13807\n/);
  assert.match(stdout, /Days needed: +19\n/);
  assert.match(stdout, /Duration: +3 whole weeks\n/);
});

test('--json prints one object that matches the functions', () => {
  const { code, stdout } = run([
    '--baseline',
    '0.1',
    '--mde',
    '-0.15',
    '--alpha',
    '0.05',
    '--power',
    '0.8',
    '--daily-visitors',
    '2000',
    '--json',
  ]);
  assert.equal(code, 0);
  const result = JSON.parse(stdout);
  const perArm = sampleSizePerArm({ baseline: 0.1, relativeMde: -0.15 });
  assert.equal(perArm, 5853);
  assert.deepEqual(result, {
    test: 'two-sided two-proportion z-test, two equal arms',
    baseline: 0.1,
    relativeMde: -0.15,
    alpha: 0.05,
    power: 0.8,
    controlRate: 0.1,
    variantRate: 0.085,
    perArm,
    total: perArm * 2,
    dailyVisitors: 2000,
    ...duration({ perArm, dailyVisitors: 2000 }),
  });
});

test('--help prints the usage and succeeds', () => {
  const { code, stdout } = run(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /^Usage: /);
  assert.match(stdout, /--daily-visitors/);
});

test('invalid usage is a one-line error and exit code 2', () => {
  const cases = [
    [['--baseline', '0.1', '--mde', '0.15', '--foo'], /Unknown option '--foo'/],
    [['--baseline', '0.1'], /--mde is required/],
    [['--baseline', 'abc', '--mde', '0.15'], /--baseline must be a number/],
    [['--baseline', '0.1', '--mde', '0'], /--mde must be/],
    [['--baseline', '0.9', '--mde', '0.2'], /--mde 0\.2 moves the baseline/],
    [['--baseline', '0.1', '--mde', '0.2', '--power', '1'], /--power must be/],
    [['--baseline', '0.1', '--mde', '0.2', '--daily-visitors', '0'], /--daily-visitors must be/],
    [['--baseline', '0.1', '--mde'], /--mde/],
    [['0.1'], /positional/],
  ];
  for (const [argv, message] of cases) {
    const { code, stdout, stderr } = run(argv);
    assert.equal(code, 2, argv.join(' '));
    assert.equal(stdout, '');
    assert.match(stderr, /^sample-size: [^\n]+\n$/, `one line for ${argv.join(' ')}`);
    assert.match(stderr, message, argv.join(' '));
  }
});

test('the script runs as a command and sets its exit code', () => {
  const script = fileURLToPath(new URL('./sample-size.mjs', import.meta.url));
  const ok = spawnSync(process.execPath, [script, '--baseline', '0.1', '--mde', '0.2'], {
    encoding: 'utf8',
  });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /Visitors per arm: +3839\n/);

  const bad = spawnSync(process.execPath, [script, '--bogus'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /^sample-size: Unknown option '--bogus'\n$/);
});
