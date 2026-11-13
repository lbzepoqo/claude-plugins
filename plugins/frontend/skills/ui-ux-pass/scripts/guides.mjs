#!/usr/bin/env node
// Looks up Google Chrome's modern-web-guidance guides (Markdown, Apache-2.0) in a local clone.
//
//   node guides.mjs search <words...>   guides matching the words, best first, with their paths
//   node guides.mjs path <id>           the file of one guide, by `folder/name` or bare `name`
//   node guides.mjs list                every guide, by folder
//   node guides.mjs where               the clone's folder, commit and age
//
// The clone lives in ~/.cache/modern-web-guidance (or MODERN_WEB_GUIDANCE_DIR). It is made on first
// use and refreshed once it is 7 or more days old. A failed refresh is tried again after a day, and
// the old copy is used meanwhile. Nothing from the repo runs; the script only reads its guides.
//
// Exit codes: 1 bad usage or no such guide, 2 no copy (the first clone failed), 3 a copy without
// the guides folder (upstream moved it).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_URL = 'https://github.com/GoogleChrome/modern-web-guidance.git';
const GUIDES_SUBDIR = path.join('skills', 'modern-web-guidance', 'guides');
const UPDATED_STAMP = path.join('.git', 'last-update');
const ATTEMPT_STAMP = path.join('.git', 'last-update-attempt');
const REFRESH_AFTER_DAYS = 7;
const RETRY_FAILED_AFTER_DAYS = 1;
const GIT_TIMEOUT_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const cloneDir = path.resolve(process.env.MODERN_WEB_GUIDANCE_DIR || path.join(os.homedir(), '.cache', 'modern-web-guidance'));
const guidesDir = path.join(cloneDir, GUIDES_SUBDIR);

function fail(message, code = 1) {
	console.error(message);
	process.exit(code);
}

function runGit(args, cwd) {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: GIT_TIMEOUT_MS,
	}).trim();
}

function gitErrorText(error) {
	const text = (error.stderr || error.message || String(error)).toString().trim();
	return text.split('\n').pop() || 'git failed';
}

function writeStamp(stampPath) {
	fs.writeFileSync(path.join(cloneDir, stampPath), new Date().toISOString() + '\n');
}

function readStamp(stampPath) {
	try {
		const date = new Date(fs.readFileSync(path.join(cloneDir, stampPath), 'utf8').trim());
		return Number.isNaN(date.getTime()) ? null : date;
	} catch {
		return null;
	}
}

function ageInDays(date) {
	return date ? Math.floor((Date.now() - date.getTime()) / DAY_MS) : null;
}

// A copy counts only when git has a commit checked out and the guides folder is there; a clone
// cut off halfway leaves a `.git` folder with neither.
function cloneIsUsable() {
	if (!fs.existsSync(guidesDir)) return false;
	try {
		runGit(['rev-parse', '--verify', 'HEAD'], cloneDir);
		return true;
	} catch {
		return false;
	}
}

// Clones into a temporary folder beside the target and renames it into place, so a second run
// starting at the same time never sees a half-made copy.
function cloneFresh() {
	const parentDir = path.dirname(cloneDir);
	fs.mkdirSync(parentDir, { recursive: true });
	const tempDir = fs.mkdtempSync(path.join(parentDir, `${path.basename(cloneDir)}-clone-`));
	try {
		runGit(['clone', '--quiet', '--depth', '1', REPO_URL, tempDir]);
	} catch (error) {
		fs.rmSync(tempDir, { recursive: true, force: true });
		if (cloneIsUsable()) return;
		fail(`Could not clone ${REPO_URL} into ${cloneDir}: ${gitErrorText(error)}`, 2);
	}
	if (fs.existsSync(cloneDir) && !cloneIsUsable()) fs.rmSync(cloneDir, { recursive: true, force: true });
	try {
		fs.renameSync(tempDir, cloneDir);
	} catch (error) {
		fs.rmSync(tempDir, { recursive: true, force: true });
		if (!cloneIsUsable()) fail(`Could not move the clone into ${cloneDir}: ${error.message}`, 2);
		return; // another run finished its clone first
	}
	writeStamp(UPDATED_STAMP);
}

// The copy is a read-only cache, so a refresh takes the newest upstream commit as it is, which also
// works after upstream rewrites its history.
function refresh() {
	const age = ageInDays(readStamp(UPDATED_STAMP));
	if (age !== null && age < REFRESH_AFTER_DAYS) return;
	const attemptAge = ageInDays(readStamp(ATTEMPT_STAMP));
	if (attemptAge !== null && attemptAge < RETRY_FAILED_AFTER_DAYS) return;
	writeStamp(ATTEMPT_STAMP);
	try {
		runGit(['fetch', '--quiet', '--depth', '1', 'origin', 'HEAD'], cloneDir);
		runGit(['reset', '--quiet', '--hard', 'FETCH_HEAD'], cloneDir);
		writeStamp(UPDATED_STAMP);
	} catch (error) {
		const ageText = age === null ? 'of unknown age' : `${age} days old`;
		console.error(
			`Update failed (${gitErrorText(error)}); using the copy in ${cloneDir}, ${ageText}. Next try in ${RETRY_FAILED_AFTER_DAYS} day.`,
		);
	}
}

function ensureCopy() {
	if (cloneIsUsable()) refresh();
	else cloneFresh();
	if (!fs.existsSync(guidesDir)) fail(`The copy in ${cloneDir} has no ${GUIDES_SUBDIR} folder; upstream may have moved it.`, 3);
}

// A guide's title is its first "# " heading; its summary is the first paragraph of text after it,
// past any further headings.
function readGuide(filePath) {
	const text = fs.readFileSync(filePath, 'utf8');
	const lines = text.split(/\r?\n/);
	let title = '';
	let inCode = false;
	const summaryLines = [];
	for (const line of lines) {
		if (!title) {
			if (line.startsWith('# ')) title = line.slice(2).trim();
			continue;
		}
		if (line.startsWith('```')) {
			if (summaryLines.length) break;
			inCode = !inCode;
			continue;
		}
		if (inCode) continue;
		if (!line.trim() || line.startsWith('#')) {
			if (summaryLines.length) break;
			continue;
		}
		summaryLines.push(line.trim());
	}
	return { title, summary: summaryLines.join(' '), body: text };
}

function allGuides() {
	const guides = [];
	for (const folder of fs.readdirSync(guidesDir, { withFileTypes: true })) {
		if (!folder.isDirectory()) continue;
		for (const file of fs.readdirSync(path.join(guidesDir, folder.name))) {
			if (!file.endsWith('.md')) continue;
			const filePath = path.join(guidesDir, folder.name, file);
			const id = `${folder.name}/${file.slice(0, -3)}`;
			guides.push({ id, name: file.slice(0, -3), folder: folder.name, filePath, ...readGuide(filePath) });
		}
	}
	return guides.sort((first, second) => first.id.localeCompare(second.id));
}

// A folder's own guide (css/css.md) holds the rules for the whole discipline.
function disciplineGuide(guide) {
	const filePath = path.join(guidesDir, guide.folder, `${guide.folder}.md`);
	return guide.name !== guide.folder && fs.existsSync(filePath) ? filePath : null;
}

const STOPWORDS = new Set(
	'a an and are as at be before after build by can do for from how in into is it make of on or set show the to use using via what when with without add create'.split(' '),
);
const SUFFIXES = ['ions', 'ion', 'ings', 'ing', 'ed', 'es', 's', 'e'];

// Reduces a word to a stem so truncate, truncated and truncation, or form and forms, match,
// while form and format, or list and listener, do not.
function stem(word) {
	for (const suffix of SUFFIXES) {
		if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
	}
	return word;
}

function stemList(text) {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((rawWord) => rawWord.length >= 2 && !STOPWORDS.has(rawWord))
		.map(stem);
}

function stemsOf(text) {
	return new Set(stemList(text));
}

function stemCounts(text) {
	const counts = new Map();
	for (const wordStem of stemList(text)) counts.set(wordStem, (counts.get(wordStem) || 0) + 1);
	return counts;
}

// Score per query word: in the file name 3, in the title 2, in the summary 1. A word found only
// in the body scores 0.5 per use, up to 3, so a guide that is about the word (truncation used ten
// times) is not outranked by one that has it once in its name. Results are ranked by score, and every guide with at least half the best score is kept.
function search(guides, query) {
	const queryStems = [...stemsOf(query)];
	if (!queryStems.length) fail('Give some words to search for, for example: search light dismiss dialog');
	const scored = [];
	for (const guide of guides) {
		const nameStems = stemsOf(guide.id.replace('/', ' '));
		const titleStems = stemsOf(guide.title);
		const summaryStems = stemsOf(guide.summary);
		const bodyCounts = stemCounts(guide.body);
		let score = 0;
		for (const queryStem of queryStems) {
			const headerScore =
				(nameStems.has(queryStem) ? 3 : 0) + (titleStems.has(queryStem) ? 2 : 0) + (summaryStems.has(queryStem) ? 1 : 0);
			score += headerScore || Math.min(3, 0.5 * (bodyCounts.get(queryStem) || 0));
		}
		if (score) scored.push({ guide, score });
	}
	if (!scored.length) return [];
	scored.sort((first, second) => second.score - first.score || first.guide.id.localeCompare(second.guide.id));
	const bestScore = scored[0].score;
	return scored.filter((entry) => entry.score * 2 >= bestScore).map((entry) => entry.guide);
}

function describe(guide) {
	const discipline = disciplineGuide(guide);
	return [
		`${guide.id}: ${guide.title}`,
		guide.summary ? `  ${guide.summary}` : null,
		`  ${guide.filePath}`,
		discipline ? `  discipline guide: ${discipline}` : null,
	]
		.filter(Boolean)
		.join('\n');
}

const [command, ...rest] = process.argv.slice(2);
if (!['search', 'path', 'list', 'where'].includes(command)) {
	fail('Usage: node guides.mjs search <words...> | path <id> | list | where');
}

ensureCopy();

if (command === 'where') {
	let commit;
	try {
		commit = runGit(['log', '-1', '--format=%h %cs %s'], cloneDir);
	} catch (error) {
		commit = `unknown (${gitErrorText(error)})`;
	}
	const age = ageInDays(readStamp(UPDATED_STAMP));
	console.log(`${cloneDir}\ncommit ${commit}\nlast update ${age === null ? 'unknown' : `${age} days ago`}`);
} else if (command === 'path') {
	const wanted = rest.join(' ').trim().replace(/\.md$/, '');
	if (!wanted) fail('Give a guide id, for example: path ui-components/dialog');
	const matches = allGuides().filter((guide) => guide.id === wanted || guide.name === wanted);
	if (!matches.length) fail(`No guide with the id ${wanted}. Try: search ${wanted.replace(/[-/]/g, ' ')}`);
	console.log(matches.map(describe).join('\n\n'));
} else if (command === 'list') {
	let currentFolder = '';
	for (const guide of allGuides()) {
		if (guide.folder !== currentFolder) {
			currentFolder = guide.folder;
			console.log(`\n${currentFolder}/`);
		}
		console.log(`  ${guide.id}: ${guide.title}`);
	}
	console.log(`\nGuides are in ${guidesDir}`);
} else {
	const results = search(allGuides(), rest.join(' '));
	if (!results.length) {
		console.log('No guide matches. Try the name of the HTML element or UI pattern (dialog, popover, table, select), or run `list`.');
	} else {
		console.log(results.map(describe).join('\n\n'));
	}
}
