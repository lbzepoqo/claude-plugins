# plugin-updates

Claude Code updates plugins on its own only for marketplaces with auto-update on, which by default are Anthropic's official ones. A plugin from any other marketplace stays at the version you installed until you update it, and nothing tells you it fell behind.

This plugin tells you, without updating anything.

## How it works

Once a day, 30 seconds after a session starts, the plugin checks every installed plugin against its marketplace:

- it keeps a bare, blobless git mirror of each marketplace repository (and of each plugin repository a marketplace points to) under `~/.cache/plugin-updates`, and fetches it;
- it reads the plugin's entry in the latest `marketplace.json` and counts the commits between the installed commit and the upstream one, limited to the plugin's own folder, so a commit that changes only the marketplace's README does not count;
- a pinned `sha` in the listing is the upstream commit; without one, the branch in `ref` or the default branch is.

The mirrors are the plugin's own. Claude Code's marketplace clones and installed plugins are never touched.

When something is behind:

- the status line under the prompt shows `updates: claude-hud 537, cloudflare 13`;
- a toast says so once, and again only when a newer upstream commit appears.

`/plugin-updates` runs the check right away and lists, for each plugin that is behind, the latest missing commits and the command that updates it, for example `claude plugin update claude-hud@claude-hud`. It also lists what it could not check and why.

A plugin with new commits under an unchanged version is held, not behind. Claude Code replaces an installed copy only when the version changes, so `claude plugin update` would do nothing until the author bumps it. A held plugin gets no status line entry and no toast; `/plugin-updates` lists it under held with its missing commits.

## Copied skills

A skill copied by hand from a repository can be checked too. Put a `SOURCE.txt` in the skill's folder:

```
Source: https://github.com/owner/repo (commit 683bc88), copied after review.
Path: skills/my-skill
```

`Path:` lists the files or folders that were copied, separated by spaces; without it every commit in the repository counts. The list then shows a compare link for the missing commits, so you can review them before copying the newer version.

## What it does not check

Plugins from `npm`, `archive` and `command` sources, marketplaces that are not git repositories (a local folder or a hosted `marketplace.json` file), and any source that is not a plain `https` URL. These show under "Not checked" with the reason.

## Cost

No model calls. One `git fetch` per repository per day; the first check clones the mirrors (about 24 MB for seven plugins from five repositories).

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install plugin-updates@lbzepoqo
```

Restart Claude Code.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
