#!/usr/bin/env node
// Claude Code statusline. Reads session JSON on stdin, writes one line to stdout.
//
//   ● Sonnet 5 │ ⎇ feat/deal-lifecycle… ●44 │ $43.42 · 1h51m │ ⚡5h 28% │ ████░░░░░░ 41% 408k/1M
//
// v2 design notes (superseded the v1 "chip row"):
//   - Color carries STATE, not identity. In the calm state nothing has a
//     background -- plain text + hue-coded icons on the terminal's own
//     background, separated by muted "│". The eye has nothing to parse but
//     the numbers.
//   - A colored background appears ONLY when something needs attention:
//     context usage >=60% (WARN) / >=80% (HOT), or a rate limit >=70%/90%.
//     That's the entire vocabulary of backgrounds on this line -- so the
//     instant one appears, it means "act", not "here's another fact".
//   - Context usage is shown exactly once (merged bar + count + percent),
//     not three times like v1's qualifier + chip + bar.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

// --- palette ---------------------------------------------------------------
// Set CLAUDE_STATUSLINE_256 to fall back to the 256-colour cube.
const TRUECOLOR = !process.env.CLAUDE_STATUSLINE_256;

// Each colour is [r, g, b, fallback256]. The fallback index is hand-picked, not
// quantised: the 6x6x6 cube is too coarse at these lightnesses and collapses
// distinct dark hues onto one cell.
const ansi = (c, layer) =>
  TRUECOLOR ? `\x1b[${layer};2;${c[0]};${c[1]};${c[2]}m` : `\x1b[${layer};5;${c[3]}m`;
const bg = (c) => ansi(c, 48);
const fg = (c) => ansi(c, 38);

const R = "\x1b[0m";
const BOLD = "\x1b[1m";
const UNBOLD = "\x1b[22m"; // turns bold off without resetting color (unlike R)

const TEXT = [234, 235, 239, 231]; // #eaebef  primary text on the terminal bg
const MUTED = [168, 170, 181, 145]; // #a8aab5  secondary detail / separators
const TRACK = [103, 105, 111, 243]; // #67696f  unfilled bar blocks
const DARK_TEXT = [18, 19, 21, 234]; // near-black, on a lit alert background

// Icon hues -- identity color for scanning, never used as a background.
const HUE = {
  git: [110, 190, 214, 116], // cyan
  cost: [110, 214, 187, 115], // teal
  rate: [214, 175, 110, 179], // amber
};

// Context/rate pressure: the only saturated colours in the design, shared by
// the bar's accent (light-on-dark) and any alert background (dark-on-light).
const OK = [105, 217, 141, 114]; // #69d98d  <60%
const WARN = [240, 197, 81, 221]; // #f0c551  60-79%
const HOT = [253, 116, 104, 210]; // #fd7468  >=80%, "bright red"

// Deliberately dim (unlike OK/HOT above) -- the conventional diff-color pair,
// desaturated enough to read as "labeling", not "alert", so it doesn't
// compete with the color-as-state vocabulary the rest of the line uses.
const DIFF_ADD = [140, 185, 150, 108]; // dim green
const DIFF_DEL = [205, 145, 140, 174]; // dim red

const SEP = `${fg(TRACK)} │ ${fg(TEXT)}`; // muted separator between segments

const alertSeg = (rgb, text) => `${bg(rgb)}${fg(DARK_TEXT)} ${text} ${R}`;
const pressureColor = (ratio) => (ratio >= 0.8 ? HOT : ratio >= 0.5 ? WARN : OK);

// Three-stage escalation: the bar/percent accent (pressureColor, elsewhere)
// already turns amber at 50% as an early notice, one stage ahead of these
// 60%/80% thresholds which add the colored background + action suffix.
// urgent (>=90%) bolds the whole segment, not just the suffix -- the last
// unambiguous step before auto-compact territory.
function contextStatus(pct) {
  if (pct >= 80) return { rgb: HOT, suffix: "/clear now", urgent: pct >= 90 };
  if (pct >= 60) return { rgb: WARN, suffix: "/compact", urgent: false };
  return { rgb: OK, suffix: "OK", urgent: false };
}

// --- formatting ------------------------------------------------------------
const trimZero = (s) => s.replace(/\.0$/, "");

function fmtTokens(n) {
  if (!Number.isFinite(n)) return "?";
  if (n >= 1e6) return trimZero((n / 1e6).toFixed(1)) + "M";
  if (n >= 1e3) return trimZero((n / 1e3).toFixed(n >= 1e4 ? 0 : 1)) + "k";
  return String(Math.round(n));
}

function fmtCost(usd) {
  if (typeof usd !== "number" || !isFinite(usd)) return null;
  if (usd >= 100) return `$${usd.toFixed(1)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(3)}`;
}

function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return "<1m";
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}m` : `${h}h`;
}

// Minutes until a unix-seconds timestamp, floored, never negative.
function minsUntil(unixSec) {
  if (!Number.isFinite(unixSec)) return null;
  const mins = Math.floor((unixSec * 1000 - Date.now()) / 60000);
  return mins > 0 ? mins : 0;
}

function truncMiddle(name, max) {
  if (!name || name.length <= max) return name;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${name.slice(0, head)}…${name.slice(name.length - tail)}`;
}

// Prose (session names) carries its meaning up front, unlike a branch/path --
// truncate at the end instead of gutting the middle.
function truncEnd(name, max) {
  if (!name || name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

// Spend rate, in $/hour. Suppressed under 10 minutes elapsed -- too noisy to
// be predictive that early in a session.
function fmtBurn(usd, ms) {
  if (typeof usd !== "number" || !isFinite(usd) || !Number.isFinite(ms) || ms < 10 * 60000) return null;
  const perHour = usd / (ms / 3600000);
  if (!isFinite(perHour)) return null;
  return `$${perHour.toFixed(perHour >= 10 ? 0 : 1)}/h`;
}

function fmtEta(mins) {
  if (!Number.isFinite(mins)) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}m` : `${h}h`;
}

function fmtTokensLeft(remaining) {
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  return `${fmtTokens(remaining)} left`;
}

// Minutes until the context window fills, extrapolating the session's average
// token/ms rate. A rough estimate (bursty usage will beat it) -- the "~"
// prefix at the call site signals that. Suppressed under 10 minutes elapsed,
// same guard as fmtBurn, since an early rate is too noisy to extrapolate from.
function etaToFull(used, limit, durationMs) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || !Number.isFinite(durationMs) || durationMs < 10 * 60000) {
    return null;
  }
  const remaining = limit - used;
  const ratePerMs = used / durationMs;
  if (remaining <= 0 || ratePerMs <= 0) return null;
  const mins = Math.round(remaining / ratePerMs / 60000);
  return mins > 0 ? mins : null;
}

// --- session data ----------------------------------------------------------
// Total size of the context window, in tokens.
function contextLimit(data) {
  const cw = data?.context_window ?? data?.context ?? {};
  for (const v of [cw.context_window_size, cw.total_tokens, cw.max_tokens, cw.context_limit]) {
    if (Number.isFinite(v) && v > 0) return v;
  }
  const id = `${data?.model?.id ?? ""} ${data?.model?.display_name ?? ""}`;
  if (/\[1m\]|1m context/i.test(id)) return 1e6;
  if (data?.exceeds_200k_tokens) return 1e6;
  return 2e5;
}

// Tokens currently occupying the context window.
function usedTokens(data, limit) {
  const cw = data?.context_window ?? data?.context ?? {};
  const u = cw.current_usage;
  if (u) {
    const n =
      (u.input_tokens || 0) +
      (u.cache_read_input_tokens || 0) +
      (u.cache_creation_input_tokens || 0) +
      (u.output_tokens || 0);
    if (n > 0) return n;
  }
  for (const v of [cw.used_tokens, cw.tokens_used, cw.used]) {
    if (Number.isFinite(v) && v >= 0) return v;
  }
  const pct = cw.used_percentage ?? cw.percentage;
  if (Number.isFinite(pct)) return Math.round((pct / 100) * limit);
  return tokensFromTranscript(data?.transcript_path);
}

// Fallback: last assistant usage record in the session transcript. Only the tail
// of the file is read, since transcripts grow to many megabytes.
function tokensFromTranscript(file) {
  if (!file) return null;
  let fd;
  try {
    const size = fs.statSync(file).size;
    const span = Math.min(size, 1 << 20);
    const buf = Buffer.alloc(span);
    fd = fs.openSync(file, "r");
    fs.readSync(fd, buf, 0, span, size - span);
    let text = buf.toString("utf8");
    if (span < size) text = text.slice(text.indexOf("\n") + 1); // drop the partial line
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith("{")) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.isSidechain) continue; // subagent turns have their own window
      const u = entry?.message?.usage ?? entry?.usage;
      if (!u) continue;
      const n =
        (u.input_tokens || 0) +
        (u.cache_read_input_tokens || 0) +
        (u.cache_creation_input_tokens || 0) +
        (u.output_tokens || 0);
      if (n > 0) return n;
    }
  } catch {
    /* unreadable transcript: fall through */
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
  return null;
}

// --- git state ---------------------------------------------------------------
// workspace.git_branch is not present in this CC version's stdin payload, so
// branch/dirty/ahead-behind are derived directly via one `git status` call.
// Cached to a per-cwd temp file (short TTL) since the statusline re-invokes
// this script on every render.
const GIT_CACHE_TTL_MS = 4000;

function gitCacheFile(dir) {
  const safe = dir.replace(/[^a-zA-Z0-9]/g, "_");
  return path.join(os.tmpdir(), `claude-statusline-git-${safe}.json`);
}

function gitState(dir) {
  if (!dir) return null;
  const file = gitCacheFile(dir);
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs < GIT_CACHE_TTL_MS) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch {
    /* no cache yet or unreadable: fall through to a live git call */
  }

  let result = null;
  try {
    const out = execSync("git --no-optional-locks status --porcelain=v2 --branch", {
      cwd: dir,
      timeout: 300,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    let branch = null;
    let oid = null;
    let ahead = 0;
    let behind = 0;
    let hasUpstream = false;
    let dirty = 0;
    let conflicts = 0;
    for (const line of out.split("\n")) {
      if (line.startsWith("# branch.oid")) {
        oid = line.slice("# branch.oid ".length).trim();
      } else if (line.startsWith("# branch.head")) {
        branch = line.slice("# branch.head ".length).trim();
      } else if (line.startsWith("# branch.upstream")) {
        hasUpstream = true;
      } else if (line.startsWith("# branch.ab")) {
        const m = line.match(/\+(\d+) -(\d+)/);
        if (m) {
          ahead = Number(m[1]);
          behind = Number(m[2]);
        }
      } else if (line.startsWith("u ")) {
        conflicts++; // unmerged (mid-merge/rebase conflict), not plain dirty
      } else if (line && !line.startsWith("#")) {
        dirty++;
      }
    }
    // Detached HEAD: branch.head reads "(detached)" -- fall back to a short SHA
    // instead of dropping the whole segment (which used to read as "not a repo").
    const label = branch && branch !== "(detached)" ? branch : oid ? `@${oid.slice(0, 7)}` : null;
    if (label) {
      result = {
        branch: label,
        dirty,
        conflicts,
        ahead: hasUpstream ? ahead : null,
        behind: hasUpstream ? behind : null,
      };
    }
  } catch {
    result = null; // not a repo, git missing, or the call timed out
  }

  try {
    fs.writeFileSync(file, JSON.stringify(result));
  } catch {
    /* best-effort cache; a failed write just means the next render re-runs git */
  }
  return result;
}

// --- rate limits -------------------------------------------------------------
// Calm: show only the worse of 5h/7d, plain text -- a second number nobody
// needs to see yet. Escalates to the shared traffic-light palette (both
// numbers + reset ETA) only once a cap is actually close.
const RATE_WARN = 70;
const RATE_HOT = 90;

function rateLimitInfo(data) {
  const rl = data?.rate_limits;
  if (!rl) return null;
  const five = rl.five_hour?.used_percentage;
  const seven = rl.seven_day?.used_percentage;
  if (!Number.isFinite(five) && !Number.isFinite(seven)) return null;

  const worst = Math.max(five ?? -Infinity, seven ?? -Infinity);
  const worstIsFive = (five ?? -Infinity) >= (seven ?? -Infinity);

  let rgb = null; // null = calm, worst-only
  if (worst >= RATE_HOT) rgb = HOT;
  else if (worst >= RATE_WARN) rgb = WARN;

  if (!rgb) {
    const label = worstIsFive ? "5h" : "7d";
    return { text: `${label} ${Math.round(worst)}%`, rgb: null };
  }

  const text = [
    Number.isFinite(five) ? `5h ${Math.round(five)}%` : null,
    Number.isFinite(seven) ? `7d ${Math.round(seven)}%` : null,
  ]
    .filter(Boolean)
    .join("  ");
  const resetMins = minsUntil(worstIsFive ? rl.five_hour?.resets_at : rl.seven_day?.resets_at);
  const eta = resetMins != null ? ` → ${fmtEta(resetMins)}` : "";
  return { text: text + eta, rgb };
}

// --- render ----------------------------------------------------------------
function modelName(data) {
  const raw = data?.model?.display_name || data?.model?.id || "Claude";
  const m = raw.match(/^(.*?)\s*\(.*\)$/); // strip any harness-supplied "(1M context)" suffix
  return m ? m[1] : raw;
}

// Session settings that silently change model behavior. Calm/default state
// shows nothing; a deviation from the usual setup is one glance.
function modelModifiers(data) {
  const tags = [];
  if (data?.fast_mode) tags.push("»fast");
  if (data?.thinking && data.thinking.enabled === false) tags.push("no-think");
  const effort = data?.effort?.level;
  if (effort && effort !== "high") tags.push(`e:${effort}`);
  return tags;
}

function progressBar(ratio, accent) {
  const BLOCKS = 8;
  const filled = Math.min(BLOCKS, Math.max(0, Math.round(ratio * BLOCKS)));
  return fg(accent) + "█".repeat(filled) + fg(TRACK) + "░".repeat(BLOCKS - filled);
}

function render(data) {
  const limit = contextLimit(data);
  const used = usedTokens(data, limit);
  const known = Number.isFinite(used);
  const ratio = known ? Math.min(1, Math.max(0, used / limit)) : 0;
  const accent = pressureColor(ratio);

  const segments = [];

  const modTags = modelModifiers(data).join(" ");
  segments.push(
    `${fg(accent)}●${fg(TEXT)}${BOLD} ${modelName(data)}${R}${modTags ? `${fg(MUTED)} ${modTags}${fg(TEXT)}` : ""}`
  );

  const style = data?.output_style?.name;
  if (style && style !== "default") segments.push(`${fg(MUTED)}${style}${fg(TEXT)}`);

  const git = gitState(data?.workspace?.current_dir || data?.cwd);
  if (git) {
    const bits = [`${fg(HUE.git)}⎇${fg(TEXT)} ${truncMiddle(git.branch, 22)}`];
    if (git.dirty) bits.push(`${fg(MUTED)}●${git.dirty}${fg(TEXT)}`);
    if (git.conflicts) bits.push(`${fg(HOT)}⚠${git.conflicts}${fg(TEXT)}`);
    if (git.ahead) bits.push(`${fg(MUTED)}↑${git.ahead}${fg(TEXT)}`);
    if (git.behind) bits.push(`${fg(MUTED)}↓${git.behind}${fg(TEXT)}`);
    segments.push(bits.join(" "));
  }

  const cost = fmtCost(data?.cost?.total_cost_usd);
  if (cost) {
    const bits = [`${fg(HUE.cost)}$${fg(TEXT)}${cost.replace(/^\$/, "")}`];
    const burn = fmtBurn(data?.cost?.total_cost_usd, data?.cost?.total_duration_ms);
    if (burn) bits.push(`${fg(MUTED)}${burn}`);
    const duration = fmtDuration(data?.cost?.total_duration_ms);
    if (duration) bits.push(`${fg(MUTED)}${duration}`);
    const added = data?.cost?.total_lines_added;
    const removed = data?.cost?.total_lines_removed;
    const lineBits = [];
    if (added) lineBits.push(`${fg(DIFF_ADD)}+${added}`);
    if (removed) lineBits.push(`${fg(DIFF_DEL)}−${removed}`);
    if (lineBits.length) bits.push(`${lineBits.join(`${fg(TEXT)} `)}${fg(TEXT)}`);
    segments.push(bits.join(` ${fg(MUTED)}·${fg(TEXT)} `));
  }

  const rate = rateLimitInfo(data);
  if (rate) {
    segments.push(rate.rgb ? alertSeg(rate.rgb, `⚡${rate.text}`) : `${fg(HUE.rate)}⚡${fg(MUTED)}${rate.text}${fg(TEXT)}`);
  }

  const cw = data?.context_window ?? data?.context ?? {};
  const pct = Number.isFinite(cw.used_percentage) ? cw.used_percentage : ratio * 100;
  const status = contextStatus(pct);
  const countText = `${known ? fmtTokens(used) : "?"}/${fmtTokens(limit)}`;
  if (status.rgb === OK) {
    segments.push(
      `${progressBar(ratio, accent)}${fg(accent)} ${known ? `${Math.round(ratio * 100)}%` : "--"}${fg(MUTED)} ${countText}${fg(TEXT)}`
    );
  } else {
    const leftText = known ? fmtTokensLeft(limit - used) : null;
    const etaText = known ? etaToFull(used, limit, data?.cost?.total_duration_ms) : null;
    const extra = [leftText, etaText != null ? `~${fmtEta(etaText)}` : null].filter(Boolean).join(" ");
    const facts = extra ? `${Math.round(ratio * 100)}% ${countText} · ${extra}` : `${Math.round(ratio * 100)}% ${countText}`;
    const suffix = `${BOLD}${status.suffix}${UNBOLD}`;
    const body = `${progressBar(ratio, DARK_TEXT)}${fg(DARK_TEXT)} ${facts} ${suffix}`;
    segments.push(alertSeg(status.rgb, status.urgent ? `${BOLD}${body}${UNBOLD}` : body));
  }

  if (data?.session_name) segments.push(`${fg(MUTED)}${truncEnd(data.session_name, 24)}${fg(TEXT)}`);

  return segments.join(SEP);
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let line;
  try {
    line = render(JSON.parse(input.replace(/^﻿/, "")));
  } catch {
    line = "claude";
  }
  process.stdout.write(line);
});
