// Copied from plugins/secret-guard/hooks/register.ts (secret-guard 0.1.17, MIT, Mehmet Aras), not imported: an installed
// plugin is cached in its own folder, so a path into another plugin does not resolve, and secret-guard exports `scrub`
// from its hooks module, which also loads its shell parser. Keep in step with secret-guard when its rules change.

// Derived from gitleaks' default rules, loosened where key formats change.
const SECRET_RULES: readonly [string, RegExp][] = [
  ['private-key', /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----|$)/g],
  ['aws-key', /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/g],
  ['github-token', /\b(?:gh[pousr]_[0-9A-Za-z]{36}|github_pat_\w{82})\b/g],
  ['slack-token', /\bxox[abpers]-[0-9A-Za-z-]{10,}/g],
  ['slack-webhook', /hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/g],
  ['stripe-key', /\b[sr]k_(?:test|live|prod)_[0-9A-Za-z]{10,99}\b/g],
  ['google-api-key', /\bAIza[\w-]{35}(?![\w-])/g],
  ['anthropic-key', /\bsk-ant-[\w-]{20,}/g],
  ['openai-key', /\bsk-(?:proj|svcacct|admin)-[\w-]{20,}/g],
  ['jwt', /\bey[A-Za-z0-9_-]{17,}\.ey[A-Za-z0-9_-]{17,}\.[A-Za-z0-9_-]{10,}/g],
]

// Only the value is hidden; the name stays so the model knows the key exists.
const ASSIGNMENTS = [
  // .env style: UPPER_CASE name, unquoted or quoted value, not a $reference or <placeholder>
  // AUTH and PASS count only as the last whole word (REDISCLI_AUTH, DB_PASS), so AUTHOR, BYPASS and GOOGLE_OAUTH stay.
  /^(?<head>\s*(?:export\s+)?(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIAL)[A-Z0-9_]*|(?:[A-Z0-9_]*_)?(?:AUTH|PASS))\s*=\s*["']?)(?<value>[^\s"'#$<]{12,})/gm,
  // code, JSON, YAML: a quoted literal assigned to a secret-shaped name
  /(?<head>["']?\b[\w.-]*(?:secret|token|password|passwd|api_?key|access_?key|private_?key)["']?\s*[:=]\s*(["']))(?<value>[^"'\s$<{]{12,})(?=\2)/gi,
  // the password in a connection URL: redis://:pass@host, postgres://user:pass@host; it runs to the last @
  /(?<head>\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)(?<value>[^\s/$<{[][^\s/]{7,})(?=@)/gi,
]

const tag = (rule: string) => `[secret-guard: ${rule}]`
const isExample = (match: string) => /example|dummy|placeholder/i.test(match)
const isPlaceholderName = (head: string) => !head.includes('://') && /(?:^|[^a-z])(placeholder|dummy)(?:[^a-z]|$)/i.test(head)

/** The text with every secret secret-guard recognizes replaced by a `[secret-guard: <rule>]` tag. */
export const scrub = (text: string): string => {
  let out = text
  for (const [rule, pattern] of SECRET_RULES) {
    out = out.replace(pattern, match => (rule !== 'private-key' && isExample(match) ? match : tag(rule)))
  }
  for (const pattern of ASSIGNMENTS) {
    out = out.replace(pattern, (match, ...args) => {
      const { head, value } = args.at(-1) as { head: string; value: string }
      if (isExample(value) || isPlaceholderName(head) || value.startsWith('[secret-guard')) return match
      return head + tag('secret-value')
    })
  }
  return out
}
