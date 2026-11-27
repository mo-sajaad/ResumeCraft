// Stylesheet guards that jsdom cannot check through computed styles, so they
// read the CSS source and parse it with postcss (already present through Vite).
// SHELL-002: Home.css is scoped under .home-page, and the dashboard rules that
//   leaked onto other pages are scoped with :where(.dashboard-shell).
// SHELL-016: the reduced-motion rule lives in the global design-system.css.
// SHELL-005: focus outline tokens exist and :focus-visible uses them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const homeCss = read('../src/pages/Home.css');
const dashboardCss = read('../src/pages/dashboard/DashboardShared.css');
const designCss = read('../src/styles/design-system.css');

const norm = (selector) => selector.replace(/\s+/g, ' ').trim();

// Every selector of every style rule, skipping keyframe steps (from, to, 50%).
function selectorsOf(css) {
  const out = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    rule.selectors.forEach((selector) => out.push(norm(selector)));
  });
  return out;
}

const HOME_SCOPE = /\.home-page(?![\w-])/;

describe('Home.css scoping (SHELL-002)', () => {
  const selectors = selectorsOf(homeCss);

  it('has rules to check', () => {
    expect(selectors.length).toBeGreaterThan(20);
  });

  it('puts every selector under .home-page', () => {
    expect(selectors.filter((selector) => !HOME_SCOPE.test(selector))).toEqual([]);
  });

  it('has no bare global rules such as :root, html, body, *, .btn, input or headings', () => {
    const bare = /^(:root|html|body|\*|\.btn[\w-]*|input|textarea|button|a|details|summary|h[1-6])(?=$|[\s:.[,>+~])/;
    const leaking = selectors.filter((selector) => bare.test(selector) && !HOME_SCOPE.test(selector));
    expect(leaking).toEqual([]);
  });

  it('does not carry the global reduced-motion block any more', () => {
    expect(homeCss).not.toMatch(/prefers-reduced-motion/);
  });
});

describe('DashboardShared.css scoping (SHELL-002)', () => {
  const selectors = selectorsOf(dashboardCss);
  const PREFIX = ':where(.dashboard-shell) ';

  const SCOPED = [
    '.btn',
    '.btn-outline',
    '.btn-dark',
    '.btn:hover',
    '.btn:active',
    '.pricing-grid',
    '.feature-grid',
    'input',
    'textarea',
    'input::placeholder',
    'textarea::placeholder',
  ];

  it.each(SCOPED)('scopes "%s" to :where(.dashboard-shell)', (selector) => {
    expect(selectors).toContain(PREFIX + selector);
  });

  it.each(SCOPED.filter((s) => s !== '.btn'))('has no bare "%s" rule', (selector) => {
    expect(selectors).not.toContain(selector);
  });

  // SHELL-002 residual: the transition rule ".btn, .quick-card, .edit-link" and
  // the .btn-danger rules must not reach .btn elements outside the dashboard.
  it('has no bare ".btn" rule', () => {
    expect(selectors).not.toContain('.btn');
  });

  it('defines the page-level .error-message card (SHELL-015)', () => {
    expect(selectors).toContain('.error-message');
  });
});

describe('design-system.css global rules', () => {
  const root = postcss.parse(designCss);

  it('contains the prefers-reduced-motion block that disables motion (SHELL-016)', () => {
    const blocks = [];
    root.walkAtRules('media', (atRule) => {
      if (/prefers-reduced-motion\s*:\s*reduce/.test(atRule.params)) blocks.push(atRule);
    });
    expect(blocks).toHaveLength(1);

    const decls = {};
    let selectors = [];
    blocks[0].walkRules((rule) => {
      selectors = selectors.concat(rule.selectors.map(norm));
      rule.walkDecls((decl) => {
        decls[decl.prop] = `${decl.value}${decl.important ? ' !important' : ''}`;
      });
    });
    expect(selectors).toContain('*');
    expect(decls.animation).toMatch(/^none !important$/);
    expect(decls.transition).toMatch(/^none !important$/);
    expect(decls['scroll-behavior']).toMatch(/^auto !important$/);
  });

  it('defines the focus tokens (SHELL-005)', () => {
    const tokens = {};
    root.walkRules((rule) => {
      if (!rule.selectors.map(norm).includes(':root')) return;
      rule.walkDecls(/^--/, (decl) => {
        tokens[decl.prop] = decl.value.trim();
      });
    });
    expect(tokens['--color-focus']).toBeTruthy();
    expect(tokens['--focus-outline-width']).toBe('2px');
    expect(tokens['--focus-outline-offset']).toBe('2px');
    expect(tokens['--focus-ring']).toBeTruthy();
  });

  it('draws :focus-visible as a solid outline from the tokens (SHELL-005)', () => {
    const outlines = [];
    root.walkRules((rule) => {
      if (rule.parent?.type !== 'root' || !rule.selectors.map(norm).includes(':focus-visible')) return;
      rule.walkDecls('outline', (decl) => outlines.push(decl.value.replace(/\s+/g, ' ').trim()));
    });
    expect(outlines).toContain('var(--focus-outline-width) solid var(--color-focus)');
    expect(outlines).not.toContain('none');
  });
});
