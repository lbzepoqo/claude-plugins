#!/usr/bin/env node
// check_ui.mjs: open a page in Chromium and report what a reviewer would catch.
//
// Usage:
//   node check_ui.mjs <url> [--out DIR] [--widths 360,1366,1920] [--schemes light,dark]
//                     [--storage-state FILE] [--tabs 40] [--wait 1500] [--wait-until load]
//
// For each width it saves a full-page screenshot and reports console errors, horizontal page
// overflow, elements whose content is wider than their box, controls without an accessible name,
// controls that share one name, inputs without a label, images without alt or size, and clickable
// elements that are not buttons or links. At the widest width it presses Tab repeatedly and lists
// each focus stop and whether its look changes when focused. If axe-core can be resolved from the
// project, its WCAG 2.2 AA violations are added. Each extra color scheme adds a screenshot per width
// and its own overflow numbers.
//
// --storage-state takes a Playwright storage state file (cookies and local storage of a signed-in
// session, for example from `npx playwright codegen --save-storage=FILE <url>`), so pages behind a
// sign-in can be checked. Keep that file out of git.
//
// Needs Playwright (the project's, or a global npm install). Exits 2 if missing, 1 on bad options.
// Writes only inside --out (default: ./.ui-check). Prints a JSON report.
//
// Adapted from claude-code-templates' senior-frontend skill (MIT); see ../references/NOTICE.md.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { auditDom, focusStop, markFocusables, measureOverflow } from './page-audit.mjs';

const USAGE =
  'Usage: node check_ui.mjs <http(s) url> [--out DIR] [--widths 360,1366,1920] [--schemes light,dark] ' +
  '[--storage-state FILE] [--tabs 40] [--wait 1500] [--wait-until load|domcontentloaded|networkidle]';
const KNOWN_OPTIONS = ['out', 'widths', 'schemes', 'storage-state', 'tabs', 'wait', 'wait-until'];

function fail(message) {
  console.error(message + '\n' + USAGE);
  process.exit(1);
}

// Parses `--name value` and `--name=value`; the URL is the one argument that is not an option.
const options = {};
const positional = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const argument = args[i];
  if (!argument.startsWith('--')) {
    positional.push(argument);
    continue;
  }
  const [name, inlineValue] = argument.slice(2).split(/=(.*)/s);
  if (!KNOWN_OPTIONS.includes(name)) fail(`Unknown option --${name}.`);
  const value = inlineValue ?? args[++i];
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value.`);
  options[name] = value;
}
const url = positional[0];
if (positional.length !== 1 || !/^https?:\/\//.test(url)) fail('Give exactly one http(s) URL.');

const outDir = path.resolve(options.out ?? '.ui-check');
const widths = (options.widths ?? '360,1366,1920').split(',').map(Number);
if (!widths.length || widths.some((width) => !Number.isInteger(width) || width <= 0)) {
  fail('--widths takes positive whole numbers separated by commas, such as 360,1366,1920.');
}
const schemes = (options.schemes ?? 'light').split(',');
if (schemes.some((scheme) => scheme !== 'light' && scheme !== 'dark')) fail('--schemes takes light, dark or light,dark.');
const storageState = options['storage-state'] ?? null;
if (storageState && !existsSync(storageState)) fail(`Storage state file not found: ${storageState}`);
const maxTabs = Number(options.tabs ?? '40');
const settleMs = Number(options.wait ?? '1500');
if (!Number.isInteger(maxTabs) || maxTabs < 0) fail('--tabs takes a whole number.');
if (!Number.isInteger(settleMs) || settleMs < 0) fail('--wait takes a whole number of milliseconds.');
// networkidle never arrives on a page that keeps a stream or a poll open, so load is the default.
const waitUntil = options['wait-until'] ?? 'load';
if (!['load', 'domcontentloaded', 'networkidle'].includes(waitUntil)) fail('--wait-until takes load, domcontentloaded or networkidle.');

// Looks in the project (the working folder), next to this script, then in npm's global folder.
function globalNodeModules() {
  try {
    return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' }).trim();
  } catch {
    return null;
  }
}
function load(name) {
  const bases = [path.join(process.cwd(), 'noop.js'), import.meta.url];
  const globalRoot = globalNodeModules();
  if (globalRoot) bases.push(path.join(globalRoot, 'noop.js'));
  for (const base of bases) {
    try {
      return createRequire(base)(name);
    } catch (error) {
      // A package that is there but fails to load is a real error, not a missing package.
      if (error?.code !== 'MODULE_NOT_FOUND' || !String(error.message).includes(`'${name}'`)) throw error;
    }
  }
  return null;
}
const playwright = load('playwright') || load('@playwright/test');
if (!playwright) {
  console.error(
    'Playwright not found. Run this from the project folder after adding Playwright as a dev dependency ' +
      '(and downloading its Chromium build with `npx playwright install chromium`), or install it globally with npm.'
  );
  process.exit(2);
}
let axeSource = null;
try {
  const axePath = createRequire(path.join(process.cwd(), 'noop.js')).resolve('axe-core/axe.min.js');
  axeSource = readFileSync(axePath, 'utf8');
} catch {}

mkdirSync(outDir, { recursive: true });
const browser = await playwright.chromium.launch();
const report = {
  url,
  outDir,
  signedIn: !!storageState,
  widths: {},
  focusWalk: null,
  axe: axeSource ? null : 'axe-core not installed (optional)'
};
const widest = Math.max(...widths);

async function runAxe(page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    if (!window.axe) throw new Error('axe did not load on this page (an AMD loader or the page CSP can stop it)');
    const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
    const result = await window.axe.run(document, { runOnly: tags });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(' '))
    }));
  });
}

async function walkFocus(page) {
  // Records how each focusable element looks unfocused, then starts Tab from the top of the page.
  // Blurring instead of clicking keeps the walk from opening whatever sits in a corner.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.evaluate(markFocusables);
  const stops = [];
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(focusStop);
    if (!stop) break;
    if (stops.length && stops[0].key === stop.key) break; // wrapped around
    stops.push(stop);
  }
  return {
    finalUrl: page.url(),
    stops: stops.map(({ key, ...stop }) => stop),
    withoutVisibleFocus: stops.filter((stop) => !stop.visibleFocus).map((stop) => `${stop.el} "${stop.name}"`)
  };
}

async function checkPage(width, scheme, entry, isFirstScheme) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: scheme,
    ...(storageState ? { storageState } : {})
  });
  const consoleErrors = [];
  const target = isFirstScheme ? entry : (entry[scheme] = {});
  target.consoleErrors = consoleErrors;
  try {
    const page = await context.newPage();
    page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text().slice(0, 300)));
    page.on('pageerror', (error) => consoleErrors.push(String(error).slice(0, 300)));
    await page.goto(url, { waitUntil, timeout: 30000 });
    await page.waitForTimeout(settleMs);
    target.screenshot = path.join(outDir, `page-${width}-${scheme}.png`);
    await page.screenshot({ path: target.screenshot, fullPage: true });
    Object.assign(target, await page.evaluate(measureOverflow));
    if (!isFirstScheme) return;
    Object.assign(target, { scheme, finalUrl: page.url() }, await page.evaluate(auditDom));
    if (width !== widest) return;
    if (axeSource) {
      try {
        report.axe = await runAxe(page);
      } catch (error) {
        report.axe = { error: String(error).slice(0, 300) };
      }
    }
    try {
      report.focusWalk = await walkFocus(page);
    } catch (error) {
      report.focusWalk = { error: String(error).slice(0, 300) };
    }
  } catch (error) {
    target.error = String(error).slice(0, 300);
  } finally {
    await context.close();
  }
}

for (const width of widths) {
  const entry = {};
  report.widths[width] = entry;
  for (const [index, scheme] of schemes.entries()) await checkPage(width, scheme, entry, index === 0);
}
await browser.close();

writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
