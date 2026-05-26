import { window, workspace, QuickPickItem } from "vscode";

const exec = require("child_process").exec;
const path = require("path");
const open = require("open");
const R = require("ramda");
const clipboardy = require("clipboardy");

export const BRANCH_URL_SEP = " — ";

interface Formatters {
  github: Function;
  bitbucket: Function;
  bitbucketServer: Function;
  gitlab: Function;
}

export interface SelectedLines {
  start: number;
  end?: number;
  /**
   * Pre-computed URL fragment for the cursor position — e.g.
   * `#installation` when the cursor sits on a Markdown ATX heading in a
   * wiki page. Empty when not applicable. Computed once in `baseCommand`
   * so URL formatters stay pure.
   */
  anchor?: string;
}

export type Action = (item?: QuickPickItem) => void;
export type RemoteURLMappings = Record<string, string>;

/**
 * Makes initial preparations for all commands.
 *
 * @return {Promise}
 */
export function baseCommand(
  commandName: string,
  action: Action,
  formatters: Formatters
) {
  const activeTextEditor = window.activeTextEditor;

  if (!activeTextEditor) {
    window.showErrorMessage("No opened files.");
    return;
  }

  const filePath = window.activeTextEditor.document.fileName;
  const fileUri = window.activeTextEditor.document.uri;
  const lineStart = window.activeTextEditor.selection.start.line + 1;
  const lineEnd = window.activeTextEditor.selection.end.line + 1;
  let anchor = "";
  if (isMarkdownFile(filePath)) {
    try {
      const cursorLineIndex = lineStart - 1;
      // One line of lookahead so we can detect Setext headings sitting
      // on the cursor line.
      const lastIndex = Math.min(
        cursorLineIndex + 1,
        window.activeTextEditor.document.lineCount - 1
      );
      const docLines: string[] = [];
      for (let i = 0; i <= lastIndex; i++) {
        docLines.push(window.activeTextEditor.document.lineAt(i).text);
      }
      anchor = computeMarkdownHeadingAnchor(docLines, cursorLineIndex);
    } catch {
      // Anchor generation is a convenience; never let it break URL copy.
      anchor = "";
    }
  }
  const selectedLines: SelectedLines = {
    start: lineStart,
    end: lineEnd,
    anchor,
  };
  const config = workspace.getConfiguration(
    "openInGitHub",
    window.activeTextEditor.document.uri
  );
  const defaultBranch =
    workspace
      .getConfiguration("openInGitHub", fileUri)
      .get<string>("defaultBranch") || "master";
  const defaultRemote =
    workspace
      .getConfiguration("openInGitHub", fileUri)
      .get<string>("defaultRemote") || "origin";
  const alwaysUseDefaultBranch =
    workspace
      .getConfiguration("openInGitHub", fileUri)
      .get<string>("alwaysUseDefaultBranch") || false;
  const maxBuffer =
    workspace
      .getConfiguration("openInGithub", fileUri)
      .get<number>("maxBuffer") || undefined;
  const excludeCurrentRevision =
    workspace
      .getConfiguration("openInGitHub")
      .get<boolean>("excludeCurrentRevision") || false;
  const remoteURLMapping =
    workspace
      .getConfiguration("openInGitHub")
      .get<RemoteURLMappings>("remoteURLMapping") || {};
  const repositoryType = config.get<string>("repositoryType");
  const projectPath = path.dirname(filePath);

  return getRepoRoot(exec, projectPath).then((repoRootPath) => {
    const relativeFilePath = path.relative(repoRootPath, filePath);

    return (
      alwaysUseDefaultBranch
        ? Promise.resolve([defaultBranch])
        : getBranches(
            exec,
            projectPath,
            defaultBranch,
            maxBuffer,
            excludeCurrentRevision
          )
    )
      .then((branches) => {
        const getRemotesPromise = getRemotes(
          exec,
          projectPath,
          defaultRemote,
          defaultBranch,
          branches
        ).then(formatRemotes);
        return Promise.all([getRemotesPromise, branches]);
      })
      .then((result) => {
        return prepareQuickPickItems(
          repositoryType,
          formatters,
          remoteURLMapping,
          commandName,
          relativeFilePath,
          selectedLines,
          result
        );
      })
      .then(showQuickPickWindow)
      .then(action)
      .catch(displayErrorMessage);
  });
}

function displayErrorMessage(err: string | (Error & { code?: string })) {
  if (typeof err === "string") {
    return window.showErrorMessage(err);
  }

  if (err?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return window.showErrorMessage(
      'Child process stdio maxbuffer error, increase the maxBuffer size in setting, e.g.:\n\n "openInGithub.maxBuffer": 512000'
    );
  }

  return window.showErrorMessage(err.message ?? err.code);
}

/**
 * Returns repo root path.
 *
 * @param {Function} exec
 * @param {String} workspacePath
 *
 * @return {Promise<String>}
 */
export function getRepoRoot(exec, workspacePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      "git rev-parse --show-toplevel",
      { cwd: workspacePath },
      (error, stdout, stderr) => {
        if (stderr || error) return reject(stderr || error);
        resolve(stdout.trim());
      }
    );
  });
}

/**
 * Returns raw list of remotes.
 *
 * @param {Function} exec
 * @param {String} projectPath
 * @param {String} defaultRemote
 * @param {String} defaultBranch
 * @param {String[]} branches
 *
 * @return {Promise<String[]>}
 */
export function getRemotes(
  exec,
  projectPath: string,
  defaultRemote: string,
  defaultBranch: string,
  branches: string[]
) {
  /**
   * If there is only default branch that was pushed to remote then return only default remote.
   */
  if (branches.length === 1 && branches[0] === defaultBranch) {
    return getRemoteByName(exec, projectPath, defaultRemote);
  }

  return getAllRemotes(exec, projectPath, defaultRemote);
}

/**
 * Returns raw list of all remotes.
 *
 * @todo: Should work on windows too...
 *
 * @param {Function} exec
 * @param {String} projectPath
 *
 * @return {Promise<String[]>}
 */
export function getAllRemotes(
  exec,
  projectPath: string,
  defaultRemote: string
): Promise<string[]> {
  const sortRemoteByDefaultRemote = (defaultRemote: string) =>
    defaultRemote
      ? R.sort((a, b) =>
          a[0].startsWith(defaultRemote)
            ? -1
            : b[0].startsWith(defaultRemote)
            ? 1
            : 0
        )
      : R.identity;
  const process = R.compose(
    R.uniq,
    R.map(R.head),
    R.map(R.split(" ")),
    R.reject(R.isEmpty),
    R.map(R.last),
    sortRemoteByDefaultRemote(defaultRemote),
    R.map(R.split(/\t/)),
    R.split("\n")
  );

  return new Promise((resolve, reject) => {
    exec("git remote -v", { cwd: projectPath }, (error, stdout, stderr) => {
      if (stderr || error) return reject(stderr || error);
      resolve(process(stdout));
    });
  });
}

/**
 * Returns raw remote by given name e.g. – origin
 *
 * @param {Function} exec
 * @param {String} projectPath
 * @param {String} remoteName
 *
 * @return {Promise<String[]>}
 */
export function getRemoteByName(
  exec,
  projectPath: string,
  remoteName: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    exec(
      `git config --get remote.${remoteName}.url`,
      { cwd: projectPath },
      (error, stdout, stderr) => {
        if (stderr || error) return reject(stderr || error);
        resolve([stdout]);
      }
    );
  });
}

/**
 * Returns formatted list of remotes.
 *
 * @param {String[]} remotes
 *
 * @return {String[]}
 */
export function formatRemotes(remotes: string[]): string[] {
  const process = R.compose(
    R.uniq,
    R.map(R.replace(/\/$/, "")),
    R.reject(R.isEmpty),
    R.map(R.replace(/\n/, "")),
    R.map(R.trim),
    R.map((rem) => rem.replace(/\/\/(.+)@github/, "//github")),
    R.map((rem) =>
      rem.match(/github\.com/) ? rem.replace(/\.git(\b|$)/, "") : rem
    ),
    R.reject(R.isNil),
    R.map((rem) => {
      if (rem.match(/^https?:/)) {
        return rem.replace(/\.git(\b|$)/, "");
      } else if (rem.match(/@/)) {
        return (
          "https://" +
          rem
            .replace(/^.+@/, "")
            .replace(/\.git(\b|$)/, "")
            .replace(/:\d{1,4}/, "") // <- remove port
            .replace(/:/g, "/")
        );
      } else if (rem.match(/^ftps?:/)) {
        return rem.replace(/^ftp/, "http");
      } else if (rem.match(/^ssh:/)) {
        return rem.replace(/^ssh/, "https");
      } else if (rem.match(/^git:/)) {
        return rem.replace(/^git/, "https");
      }
    })
  );

  return process(remotes);
}

/**
 * Returns current branch.
 *
 * @todo: Should work on windows too...
 *
 * @param {Function} exec
 * @param {String} filePath
 * @param {String} defaultBranch
 *
 * @return {Promise<String>}
 */
export function getBranches(
  exec,
  projectPath: string,
  defaultBranch: string,
  maxBuffer?: number,
  excludeCurrentRevision?: boolean
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const options: any = { cwd: projectPath };
    if (maxBuffer) options.maxBuffer = maxBuffer;

    exec("git branch --no-color -a", options, (error, stdout, stderr) => {
      if (stderr || error) return reject(stderr || error);

      const getCurrentBranch = R.compose(
        R.trim,
        R.replace("*", ""),
        R.find((line) => line.startsWith("*")),
        R.split("\n")
      );

      const processBranches = R.compose(
        R.filter((br) => stdout.match(new RegExp(`remotes\/.*\/${br}`))),
        R.uniq
      );

      const currentBranch = getCurrentBranch(stdout);
      const branches = processBranches([currentBranch, defaultBranch]);

      return excludeCurrentRevision
        ? resolve(branches)
        : getCurrentRevision(exec, projectPath).then((currentRevision) => {
            return resolve(branches.concat(currentRevision));
          });
    });
  });
}

/**
 * Returns the commit sha for HEAD.
 *
 * @param {Function} exec
 * @param {String} projectPath
 * @param {String} defaultBranch
 *
 * @return {Promise<String>}
 */
export function getCurrentRevision(exec, projectPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      "git rev-parse HEAD",
      { cwd: projectPath },
      (error, stdout, stderr) => {
        if (stderr || error) return reject(stderr || error);
        resolve(stdout.trim());
      }
    );
  });
}

export function formatQuickPickItems(
  repositoryType: string,
  formatters: Formatters,
  remoteURLMappings: RemoteURLMappings,
  commandName: string,
  relativeFilePath: string,
  lines: SelectedLines,
  remotes: string[],
  branch: string
): QuickPickItem[] {
  return remotes
    .map((remote) => ({
      remote,
      url: chooseFormatter(formatters, repositoryType, remote)(
        remote,
        branch,
        relativeFilePath,
        remoteURLMappings,
        lines
      ),
    }))
    .map((remote) => ({
      label: relativeFilePath,
      detail: `${branch} | ${remote.remote}`,
      description: `[${commandName}]`,
      url: remote.url,
    }));
}

/**
 * Builds quick pick items list.
 *
 * @param {String} relativeFilePath
 * @param {SelectedLines} lines
 *
 * @return {String[]}
 */
export function prepareQuickPickItems(
  repositoryType: string,
  formatters: Formatters,
  remoteURLMappings: RemoteURLMappings,
  commandName: string,
  relativeFilePath: string,
  lines: SelectedLines,
  [remotes, branches]: string[][]
): QuickPickItem[] {
  if (!branches.length) {
    return [];
  }

  if (branches.length === 1) {
    return formatQuickPickItems(
      repositoryType,
      formatters,
      remoteURLMappings,
      commandName,
      relativeFilePath,
      lines,
      remotes,
      branches[0]
    );
  }

  const processBranches = R.compose(
    R.flatten,
    // Join: [1,2,3], [4,5,6], [7,8,9] -> [1,4,7], [2,5,8], [3,6,9]
    (results) =>
      R.map(
        (i) => R.map((item) => item[i], results),
        R.range(0, results[0].length)
      ),
    R.map((branch) =>
      formatQuickPickItems(
        repositoryType,
        formatters,
        remoteURLMappings,
        commandName,
        relativeFilePath,
        lines,
        remotes,
        branch
      )
    )
  );
  return processBranches(branches);
}

export function formatGithubBranchName(branch) {
  return branch
    .split("/")
    .map((c) => encodeURIComponent(c))
    .join("/");
}

/**
 * Returns true if remote is bitbucket.
 */
export function isBitbucket(remote: string): boolean {
  return !!remote.match("bitbucket.org");
}

/**
 * Returns true if remote is a GitHub wiki repo (URL ends with `.wiki`).
 *
 * GitHub clones wikis from `*.wiki.git`; after `formatRemotes` strips `.git`,
 * the remaining URL ends with `.wiki`.
 */
export function isGitHubWiki(remote: string): boolean {
  return /\.wiki$/.test(remote);
}

/**
 * Markdown-family extensions only (subset of WIKI_MARKUP_EXTENSION). Used
 * to gate heading-anchor generation: Textile/RST/AsciiDoc/etc. use
 * different heading syntax and slug rules.
 */
const MARKDOWN_EXTENSION =
  /\.(md|mkd|mkdn|mdwn|mdown|markdown|mdx|litcoffee)$/i;

export function isMarkdownFile(filePath: string): boolean {
  return MARKDOWN_EXTENSION.test(filePath);
}

/**
 * Decode a numeric character reference; return empty string for invalid
 * code points so a bogus `&#x110000;` can't crash the URL command.
 */
function safeCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  return String.fromCodePoint(cp);
}

/**
 * Strip inline Markdown formatting from a heading's source text the way
 * GitHub's renderer would before slugging. Handles links (inline,
 * reference, shortcut), images, inline code, bold/emphasis, strike-
 * through, raw HTML tags, and the most common HTML entities.
 */
function stripInlineMarkdown(text: string): string {
  return (
    text
      // Images: ![alt](url) / ![alt][ref] / ![alt]
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
      .replace(/!\[([^\]]*)\]/g, "$1")
      // Links: [text](url) / [text][ref] / [text]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
      .replace(/\[([^\]]+)\]/g, "$1")
      // Inline code spans (single or multiple backticks)
      .replace(/(`+)([^`]+?)\1/g, "$2")
      // Bold / emphasis / strikethrough
      .replace(/\*\*([^*]+?)\*\*/g, "$1")
      .replace(/(?<![A-Za-z0-9_])__([^_]+?)__(?![A-Za-z0-9_])/g, "$1")
      .replace(/\*([^*]+?)\*/g, "$1")
      .replace(/(?<![A-Za-z0-9_])_([^_]+?)_(?![A-Za-z0-9_])/g, "$1")
      .replace(/~~([^~]+?)~~/g, "$1")
      // Raw HTML tags
      .replace(/<[^>]+>/g, "")
      // Common HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => safeCodePoint(parseInt(n, 16)))
      .replace(/&#(\d+);/g, (_, n) => safeCodePoint(parseInt(n, 10)))
  );
}

/**
 * Slug a Markdown heading the way GitHub's renderer does. Critically:
 * only ASCII A–Z are lowercased — non-ASCII letters keep their case
 * (matches `html-pipeline`'s `ascii_downcase`). Punctuation that isn't
 * `_` or `-` is dropped; spaces collapse to single hyphens.
 */
function slugifyMarkdownHeading(headingText: string): string {
  return stripInlineMarkdown(headingText)
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Returns the slug for a heading line on its own — empty string if the
 * line isn't an ATX heading.
 */
function atxHeadingSlug(line: string): string {
  const m = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
  return m ? slugifyMarkdownHeading(m[1]) : "";
}

/**
 * True if `line` looks like a Setext underline (`=+` for h1, `-+` for
 * h2). The caller must also confirm the line above is paragraph text.
 */
function isSetextUnderline(line: string): boolean {
  return /^ {0,3}(?:=+|-+)\s*$/.test(line);
}

/**
 * If the cursor sits on a Markdown heading (ATX or Setext), returns the
 * URL fragment GitHub would assign — including `-1`/`-2`/… disambiguation
 * for repeated slugs (with collision-avoidance against literal slugs
 * already in the document). Returns empty string for non-heading lines,
 * lines inside fenced code blocks or HTML comments, and slugs that
 * collapse to empty.
 *
 * Fence-length and Setext detection require lookahead, so `lines` should
 * include at least one line past `cursorLineIndex` when possible.
 *
 * Best-effort, not a CommonMark parser. Known limitations:
 * - raw HTML blocks (e.g. `<div>…</div>`) are treated as regular text;
 *   heading-looking lines inside them may be counted.
 * - autolinks (`<https://…>`) inside headings are dropped as HTML tags.
 * - named HTML entities outside `&amp;`/`&lt;`/`&gt;`/`&quot;`/`&apos;`
 *   pass through literally.
 * - headings inside blockquotes (`> ## Title`) aren't detected.
 *
 * Defense-in-depth: callers should wrap invocations in try/catch to keep
 * a future bug here from breaking the URL command.
 */
export function computeMarkdownHeadingAnchor(
  lines: readonly string[],
  cursorLineIndex: number
): string {
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let inHtmlComment = false;
  const counts: Record<string, number> = {};
  const occupied = new Set<string>();
  let cursorAnchor = "";
  let i = 0;

  // Reserve a final slug, advancing the counter past any collisions
  // already produced (e.g. literal `## Foo-1` after two `## Foo`s).
  const reserveSlug = (base: string): string => {
    let n = counts[base] ?? 0;
    let final = n === 0 ? base : `${base}-${n}`;
    while (occupied.has(final)) {
      n++;
      final = `${base}-${n}`;
    }
    counts[base] = n + 1;
    occupied.add(final);
    return final;
  };

  while (i < lines.length && i <= cursorLineIndex) {
    const line = lines[i];

    // HTML comment block. Comments can span lines and may even share a
    // line with content; we conservatively skip everything between
    // `<!--` and `-->`.
    if (inHtmlComment) {
      if (line.includes("-->")) inHtmlComment = false;
      i++;
      continue;
    }
    if (line.includes("<!--") && !/<!--.*-->/.test(line)) {
      inHtmlComment = true;
      i++;
      continue;
    }

    // Fence handling. Closing fence must match the opener's character
    // and be at least as long, and may not carry an info string.
    if (inFence) {
      const closeRe = new RegExp(`^ {0,3}\\${fenceChar}{${fenceLen},}\\s*$`);
      if (closeRe.test(line)) {
        inFence = false;
        fenceChar = "";
        fenceLen = 0;
      }
      i++;
      continue;
    }
    const fenceOpen = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceOpen) {
      inFence = true;
      fenceChar = fenceOpen[1][0];
      fenceLen = fenceOpen[1].length;
      i++;
      continue;
    }

    // ATX heading on this line. Indented 4+ spaces would be a code block.
    if (!/^ {4,}/.test(line)) {
      const atxSlug = atxHeadingSlug(line);
      if (atxSlug) {
        const final = reserveSlug(atxSlug);
        if (i === cursorLineIndex) cursorAnchor = final;
        i++;
        continue;
      }
    }

    // Setext heading: text on `i`, underline on `i+1`. Text indented 4+
    // spaces is an indented code block, not a heading.
    if (
      i + 1 < lines.length &&
      line.trim() !== "" &&
      !/^ {4,}/.test(line) &&
      !/^ {0,3}#{1,6}\s/.test(line) &&
      isSetextUnderline(lines[i + 1])
    ) {
      const slug = slugifyMarkdownHeading(line.trim());
      if (slug) {
        const final = reserveSlug(slug);
        if (i === cursorLineIndex || i + 1 === cursorLineIndex) {
          cursorAnchor = final;
        }
      }
      i += 2;
      continue;
    }

    // Cursor on a non-heading line.
    if (i === cursorLineIndex) return "";
    i++;
  }

  return cursorAnchor ? `#${cursorAnchor}` : "";
}

/**
 * Recognized wiki-page markup extensions, matching the github-markup gem
 * (https://github.com/github/markup/blob/master/lib/github/markups.rb).
 * Only files with these extensions render as wiki pages.
 */
const WIKI_MARKUP_EXTENSION =
  /\.(md|mkd|mkdn|mdwn|mdown|markdown|mdx|litcoffee|textile|rdoc|org|creole|(media)?wiki|re?st(\.txt)?|a(scii)?doc|asc|pod6?)$/i;

/**
 * Returns true if `filePath` is a wiki *page* (a rendered markup file),
 * as opposed to a non-page asset (image, workflow, etc.) that may also
 * live in a wiki repo.
 */
export function isGitHubWikiPage(filePath: string): boolean {
  return WIKI_MARKUP_EXTENSION.test(filePath);
}

/**
 * Builds the rendered-wiki URL for a file in a `*.wiki` repo.
 *
 * - Pages flatten to a basename without extension — GitHub wiki page
 *   identifiers are flat. `calibration/calibration_guide.md` →
 *   `/wiki/calibration_guide`, `Home.textile` → `/wiki/Home`.
 * - Non-page assets preserve their full path —
 *   `.github/workflows/deploy-wiki.yml` →
 *   `/wiki/.github/workflows/deploy-wiki.yml`.
 *
 * Either way, wiki URLs don't support `/blob/<branch>/`, `?plain=1`, or
 * line anchors.
 */
export function formatGitHubWikiPageUrl(
  remote: string,
  filePath: string
): string {
  const base = remote.replace(/\.wiki$/, "");
  if (isGitHubWikiPage(filePath)) {
    const basename = path.basename(filePath);
    const page = basename.replace(WIKI_MARKUP_EXTENSION, "");
    return `${base}/wiki/${page}`;
  }
  return `${base}/wiki/${filePath}`;
}

/**
 * Returns true if remote is gitlab.
 */
export function isGitlab(remote: string): boolean {
  return !!remote.match("gitlab.com");
}

export function formatBitbucketLinePointer(
  filePath: string,
  lines?: SelectedLines
): string {
  if (!lines || !lines.start) {
    return "";
  }
  const fileBasename = `#${path.basename(filePath)}`;
  let linePointer = `${fileBasename}-${lines.start}`;
  if (lines.end && lines.end != lines.start) linePointer += `:${lines.end}`;

  return linePointer;
}

export function formatGitHubLinePointer(lines?: SelectedLines): string {
  if (!lines || !lines.start) {
    return "";
  }

  let linePointer = `#L${lines.start}`;
  if (lines.end && lines.end != lines.start) linePointer += `-L${lines.end}`;

  return linePointer;
}

export function formatGitHubQueryParams(filePath: string): string {
  if (filePath.endsWith(".md")) {
    return "?plain=1";
  }

  return "";
}

export function formatGitlabLinePointer(lines?: SelectedLines): string {
  if (!lines || !lines.start) {
    return "";
  }

  let linePointer = `#L${lines.start}`;
  if (lines.end && lines.end != lines.start) linePointer += `-${lines.end}`;

  return linePointer;
}

/**
 * Shows quick pick window.
 *
 * @param {String[]} quickPickList
 */
export function showQuickPickWindow(quickPickList: QuickPickItem[]) {
  if (quickPickList.length === 1) {
    return Promise.resolve(quickPickList[0]);
  }

  return window.showQuickPick(quickPickList);
}

/**
 * Opens given quick pick item in browser.
 *
 * @param {String} item
 */
export async function openQuickPickItem(item?: QuickPickItem) {
  if (!item) return;
  return await open((item as any).url);
}

/**
 * Copies given quick pick item to the clipboard.
 *
 * @param {String} item
 */
export function copyQuickPickItem(item?: QuickPickItem) {
  if (!item) return;
  const url = (item as any).url;
  clipboardy.writeSync(url);
  window.showInformationMessage("Copied to the clipboard: " + url);
}

/**
 * Chooses proper formatter based on repository type.
 */
function chooseFormatter(
  formatters: Formatters,
  repositoryType: string,
  remote: string
): Function {
  switch (repositoryType) {
    case "auto": {
      if (isBitbucket(remote)) {
        return formatters.bitbucket;
      }

      if (isGitlab(remote)) {
        return formatters.gitlab;
      }

      return formatters.github;
    }
    case "github":
      return formatters.github;
    case "bitbucket":
      return formatters.bitbucket;
    case "bitbucket-server":
      return formatters.bitbucketServer;
    case "gitlab":
      return formatters.gitlab;
  }
}
