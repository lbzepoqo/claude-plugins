// In-page checks for check_ui.mjs. Playwright serializes each function and runs it inside the
// page, so each must not reference anything outside its own body (globals on window are fine).
//
// Adapted from claude-code-templates' senior-frontend skill (MIT); see ../references/NOTICE.md.

// Runs in the page: how far the page scrolls sideways, which elements end past its right edge, and
// which elements hold content wider than their own box (a cut name, a button row that runs out of a
// card). Overflow shows on every ancestor of the element that causes it, so only the innermost
// element of each chain is reported. Scroll containers, deliberate ellipses and screen-reader-only
// boxes (1 px wide or high, such as a hidden table header) are left out.
export function measureOverflow() {
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const describe = (element) => {
    let tag = element.tagName.toLowerCase();
    if (element.id) tag += '#' + element.id;
    if (typeof element.className === 'string' && element.className.trim()) {
      tag += '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.');
    }
    const text = (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return '<' + tag + '>' + (text ? ' "' + text + '"' : '');
  };
  const innermost = (elements) => elements.filter((element) => !elements.some((other) => other !== element && element.contains(other)));
  const root = document.documentElement;
  const overflowPx = root.scrollWidth - root.clientWidth;
  const pastRightEdge = [];
  const widerThanBox = [];
  for (const element of document.querySelectorAll('body *')) {
    if (!isVisible(element)) continue;
    const style = getComputedStyle(element);
    if (overflowPx > 1 && pastRightEdge.length < 500 && style.position !== 'fixed') {
      if (element.getBoundingClientRect().right > root.clientWidth + 1) pastRightEdge.push(element);
    }
    if (widerThanBox.length < 500 && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) {
      const scrolls = style.overflowX === 'auto' || style.overflowX === 'scroll';
      if (!scrolls && style.textOverflow !== 'ellipsis') widerThanBox.push(element);
    }
  }
  return {
    overflowPx,
    overflowingElements: innermost(pastRightEdge)
      .slice(0, 5)
      .map((element) => describe(element) + ' ends at ' + Math.round(element.getBoundingClientRect().right) + 'px'),
    contentWiderThanBox: innermost(widerThanBox)
      .slice(0, 10)
      .map((element) => describe(element) + ' holds ' + element.scrollWidth + 'px in ' + element.clientWidth + 'px')
  };
}

// Runs in the page: static DOM heuristics.
export function auditDom() {
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const describe = (element) => {
    let tag = element.tagName.toLowerCase();
    if (element.id) tag += '#' + element.id;
    if (typeof element.className === 'string' && element.className.trim()) {
      tag += '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.');
    }
    const text = (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return '<' + tag + '>' + (text ? ' "' + text + '"' : '');
  };
  const accessibleName = (element) => {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const fromIds = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (fromIds) return fromIds;
    }
    if (element.getAttribute('aria-label')?.trim()) return element.getAttribute('aria-label').trim();
    if (element.tagName === 'INPUT') {
      if (['submit', 'button', 'reset'].includes(element.type) && element.value.trim()) return element.value.trim();
      if (element.type === 'submit' || element.type === 'reset') return element.type; // the browser's default label
      if (element.type === 'image' && element.alt?.trim()) return element.alt.trim();
    }
    if (element.labels && element.labels.length) return [...element.labels].map((label) => label.textContent).join(' ').trim();
    const imageAlt = [...element.querySelectorAll('img[alt]')].map((image) => image.alt).join(' ');
    return ((element.textContent || '') + ' ' + imageAlt + ' ' + (element.getAttribute('title') || '')).trim();
  };
  const issues = [];
  const interactive = 'button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"], summary';
  const nameCounts = new Map();
  for (const element of document.querySelectorAll(interactive)) {
    if (!isVisible(element)) continue;
    const name = accessibleName(element);
    if (!name) issues.push('no accessible name: ' + describe(element));
    else nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }
  for (const [name, count] of nameCounts) {
    if (count > 2 && name.length < 25) {
      issues.push(count + ' controls share the name "' + name + '" (say which item each one acts on)');
    }
  }
  const buttonInputs = ['submit', 'button', 'reset', 'image'];
  for (const element of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
    if (!isVisible(element)) continue;
    const label = accessibleName(element);
    const isButton = element.tagName === 'INPUT' && buttonInputs.includes(element.type);
    if (!label || label === (element.getAttribute('title') || '').trim()) {
      issues.push((isButton ? 'button without a name: ' : 'input without label: ') + describe(element) + (isButton ? '' : ' (placeholder is not a label)'));
    }
    const standalone = ['checkbox', 'radio', 'search', 'range', ...buttonInputs].includes(element.type);
    if (element.tagName === 'INPUT' && !element.closest('form') && !standalone) {
      issues.push('input outside a <form> (Enter will not submit): ' + describe(element));
    }
  }
  for (const image of document.querySelectorAll('img')) {
    if (!image.hasAttribute('alt')) issues.push('img without alt: ' + image.getAttribute('src'));
    if (!image.getAttribute('width') || !image.getAttribute('height')) {
      issues.push('img without width/height (layout shift): ' + image.getAttribute('src'));
    }
  }
  // cursor is inherited, so only the element where the pointer cursor starts is judged.
  const nativeControl = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|SUMMARY|OPTION)$/;
  let clickableCount = 0;
  for (const element of document.querySelectorAll('body *')) {
    if (nativeControl.test(element.tagName) || element.closest('a,button,label,summary,[role],[tabindex]')) continue;
    if (getComputedStyle(element).cursor !== 'pointer' || !isVisible(element)) continue;
    if (element.parentElement && getComputedStyle(element.parentElement).cursor === 'pointer') continue;
    issues.push('clickable-looking non-interactive element (use <button> or <a>): ' + describe(element));
    if (++clickableCount >= 20) {
      issues.push('more clickable-looking non-interactive elements not listed');
      break;
    }
  }
  const headingCount = document.querySelectorAll('h1').length;
  if (headingCount !== 1) issues.push(headingCount + ' <h1> elements on the page (expected 1)');
  return { issues };
}

// Runs in the page before the Tab walk: gives each focusable element an id and records how it
// looks unfocused, so focusStop can tell a focus indicator from a style it always has.
export function markFocusables() {
  const selector = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';
  const looks = {};
  let next = 0;
  for (const element of document.querySelectorAll(selector)) {
    const id = String(next++);
    element.setAttribute('data-ui-check-id', id);
    const style = getComputedStyle(element);
    looks[id] = [style.outlineStyle, style.outlineColor, style.outlineWidth, style.boxShadow, style.borderColor, style.backgroundColor, style.color, style.textDecorationLine].join('|');
  }
  window.__uiCheckLooks = looks;
}

// Runs in the page: describes the focused element, and whether its look differs from unfocused.
export function focusStop() {
  const element = document.activeElement;
  if (!element || element === document.body) return null;
  const style = getComputedStyle(element);
  const isTransparent = (color) => color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);
  const outlineShows = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && !isTransparent(style.outlineColor);
  const id = element.getAttribute('data-ui-check-id');
  const before = id !== null ? window.__uiCheckLooks?.[id] : undefined;
  const now = [style.outlineStyle, style.outlineColor, style.outlineWidth, style.boxShadow, style.borderColor, style.backgroundColor, style.color, style.textDecorationLine].join('|');
  // Without a record (an element added after the walk began), fall back to a visible outline or shadow.
  const visibleFocus = before !== undefined ? before !== now && (outlineShows || before.split('|').slice(3).join('|') !== now.split('|').slice(3).join('|')) : outlineShows || style.boxShadow !== 'none';
  const raw = element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || '';
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 50);
  // The recorded id is stable across scrolling and fixed headers; the position is the fallback.
  const rect = element.getBoundingClientRect();
  const key = id !== null ? 'id:' + id : element.tagName + '|' + name + '|' + Math.round(rect.top + window.scrollY) + '|' + Math.round(rect.left + window.scrollX);
  const role = element.getAttribute('role') ? '[role=' + element.getAttribute('role') + ']' : '';
  return { key, el: element.tagName.toLowerCase() + role, name, visibleFocus };
}
