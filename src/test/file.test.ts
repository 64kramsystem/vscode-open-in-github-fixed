import * as assert from "assert";
import * as file from "../file";

suite("fileCommand # formatGitHubFileUrl", () => {
  test("should format strings for quick pick view", () => {
    const results = file.formatGitHubFileUrl(
      "https://remote.url",
      "master",
      "rel/path/to/file.js",
      {},
      { start: 10 }
    );
    assert.equal(
      results,
      "https://remote.url/blob/master/rel/path/to/file.js#L10"
    );
  });

  test("should format strings for quick pick view with remote mapping", () => {
    const results = file.formatGitHubFileUrl(
      "https://remote.url",
      "master",
      "rel/path/to/file.js",
      { "https://remote.url": "https://mapped.remote.url" },
      { start: 10 }
    );
    assert.equal(
      results,
      "https://mapped.remote.url/blob/master/rel/path/to/file.js#L10"
    );
  });

  test("should format strings for quick pick view", () => {
    const results = file.formatGitHubFileUrl(
      "https://remote.url",
      "master",
      "rel/path/to/file.js",
      {},
      { start: 10, end: 20 }
    );
    assert.equal(
      results,
      "https://remote.url/blob/master/rel/path/to/file.js#L10-L20"
    );
  });

  test("should format strings for quick pick view", () => {
    const results = file.formatGitHubFileUrl(
      "https://remote.url",
      "master",
      "rel/path/to/file.js",
      {},
      { start: 10, end: 10 }
    );
    assert.equal(
      results,
      "https://remote.url/blob/master/rel/path/to/file.js#L10"
    );
  });

  test("should format strings for quick pick view", () => {
    const results = file.formatGitHubFileUrl(
      "https://remote.url",
      "master",
      "rel/path/to/file.js"
    );
    assert.equal(results, "https://remote.url/blob/master/rel/path/to/file.js");
  });

  test("should format strings for quick pick view", () => {
    const results = file.formatGitHubFileUrl(
      "https://remote.url",
      "feature/#foo",
      "rel/path/to/file.js"
    );
    assert.equal(
      results,
      "https://remote.url/blob/feature/%23foo/rel/path/to/file.js"
    );
  });

  test("should add ?plain=1 for markdown links", () => {
    const results = file.formatGitHubFileUrl(
      "https://remote.url",
      "master",
      "rel/path/to/file.md",
      {},
      { start: 10 }
    );
    assert.equal(
      results,
      "https://remote.url/blob/master/rel/path/to/file.md?plain=1#L10"
    );
  });

  test("wiki: rewrites <repo>.wiki remote to /wiki/<page>, drops .md, branch, query, lines", () => {
    const results = file.formatGitHubFileUrl(
      "https://github.com/owner/repo.wiki",
      "master",
      "Home.md",
      {},
      { start: 10, end: 20 }
    );
    assert.equal(results, "https://github.com/owner/repo/wiki/Home");
  });

  test("wiki: works without lines and with hyphenated page name", () => {
    const results = file.formatGitHubFileUrl(
      "https://github.com/owner/repo.wiki",
      "master",
      "Some-Page.md"
    );
    assert.equal(results, "https://github.com/owner/repo/wiki/Some-Page");
  });

  test("wiki: applies remote URL mapping before wiki detection", () => {
    const results = file.formatGitHubFileUrl(
      "https://github.com/owner/repo.wiki",
      "master",
      "Home.md",
      {
        "https://github.com/owner/repo.wiki":
          "https://github.com/mapped/repo.wiki",
      }
    );
    assert.equal(results, "https://github.com/mapped/repo/wiki/Home");
  });

  test("wiki: flattens nested wiki paths (GitHub wikis have no directories)", () => {
    const results = file.formatGitHubFileUrl(
      "https://github.com/owner/repo.wiki",
      "master",
      "calibration/calibration_guide.md"
    );
    assert.equal(
      results,
      "https://github.com/owner/repo/wiki/calibration_guide"
    );
  });

  test("wiki: strips non-Markdown wiki markup extensions", () => {
    assert.equal(
      file.formatGitHubFileUrl(
        "https://github.com/owner/repo.wiki",
        "master",
        "Home.textile"
      ),
      "https://github.com/owner/repo/wiki/Home"
    );
    assert.equal(
      file.formatGitHubFileUrl(
        "https://github.com/owner/repo.wiki",
        "master",
        "Page.asciidoc"
      ),
      "https://github.com/owner/repo/wiki/Page"
    );
  });

  test("wiki: preserves path for non-page assets (workflows, images)", () => {
    assert.equal(
      file.formatGitHubFileUrl(
        "https://github.com/owner/repo.wiki",
        "master",
        ".github/workflows/deploy-wiki.yml"
      ),
      "https://github.com/owner/repo/wiki/.github/workflows/deploy-wiki.yml"
    );
    assert.equal(
      file.formatGitHubFileUrl(
        "https://github.com/owner/repo.wiki",
        "master",
        "images/GUI/filament-preset.png"
      ),
      "https://github.com/owner/repo/wiki/images/GUI/filament-preset.png"
    );
  });

  test("wiki: strips full github-markup extension set", () => {
    const cases: Array<[string, string]> = [
      ["Page.mdx", "Page"],
      ["Code.litcoffee", "Code"],
      ["Guide.rest", "Guide"],
      ["Guide.rst.txt", "Guide"],
      ["Guide.rest.txt", "Guide"],
      ["Doc.pod6", "Doc"],
      ["Doc.mediawiki", "Doc"],
      ["Page.adoc", "Page"],
    ];
    for (const [input, expected] of cases) {
      assert.equal(
        file.formatGitHubFileUrl(
          "https://github.com/owner/repo.wiki",
          "master",
          input
        ),
        `https://github.com/owner/repo/wiki/${expected}`,
        `input=${input}`
      );
    }
  });

  test("wiki: appends precomputed anchor to page URL", () => {
    assert.equal(
      file.formatGitHubFileUrl(
        "https://github.com/owner/repo.wiki",
        "master",
        "Home.md",
        {},
        { start: 1, anchor: "#installation" }
      ),
      "https://github.com/owner/repo/wiki/Home#installation"
    );
  });

  test("wiki: no anchor when not provided", () => {
    assert.equal(
      file.formatGitHubFileUrl(
        "https://github.com/owner/repo.wiki",
        "master",
        "Home.md",
        {},
        { start: 1 }
      ),
      "https://github.com/owner/repo/wiki/Home"
    );
  });

  test("wiki: anchor appended to non-page asset path as-is (caller controls)", () => {
    // anchor is precomputed in baseCommand and only set for Markdown
    // files, so non-page assets never receive one in practice. Verify
    // the formatter doesn't add one on its own.
    assert.equal(
      file.formatGitHubFileUrl(
        "https://github.com/owner/repo.wiki",
        "master",
        "images/foo.png",
        {},
        { start: 1 }
      ),
      "https://github.com/owner/repo/wiki/images/foo.png"
    );
  });
});

suite("fileCommand # formatBitbucketFileUrl", () => {
  test("should format strings for quick pick view", () => {
    const results = file.formatBitbucketFileUrl(
      "https://bitbucket.org/some/repo",
      "master",
      "rel/path/to/file.js",
      {},
      { start: 10 }
    );
    assert.equal(
      results,
      "https://bitbucket.org/some/repo/src/master/rel/path/to/file.js#file.js-10"
    );
  });
  test("should format strings for quick pick view with remote mapping", () => {
    const results = file.formatBitbucketFileUrl(
      "https://bitbucket.org/some/repo",
      "master",
      "rel/path/to/file.js",
      {
        "https://bitbucket.org/some/repo":
          "https://mapped.bitbucket.org/some/repo",
      },
      { start: 10 }
    );
    assert.equal(
      results,
      "https://mapped.bitbucket.org/some/repo/src/master/rel/path/to/file.js#file.js-10"
    );
  });
  test("should format strings for quick pick view", () => {
    const results = file.formatBitbucketFileUrl(
      "https://bitbucket.org/some/repo",
      "master",
      "rel/path/to/file.js",
      {},
      { start: 10, end: 20 }
    );
    assert.equal(
      results,
      "https://bitbucket.org/some/repo/src/master/rel/path/to/file.js#file.js-10:20"
    );
  });
  test("should format strings for quick pick view", () => {
    const results = file.formatBitbucketFileUrl(
      "https://bitbucket.org/some/repo",
      "master",
      "rel/path/to/file.js",
      {},
      { start: 10, end: 10 }
    );
    assert.equal(
      results,
      "https://bitbucket.org/some/repo/src/master/rel/path/to/file.js#file.js-10"
    );
  });
  test("should format strings for quick pick view", () => {
    const results = file.formatBitbucketFileUrl(
      "https://bitbucket.org/some/repo",
      "master",
      "rel/path/to/file.js"
    );
    assert.equal(
      results,
      "https://bitbucket.org/some/repo/src/master/rel/path/to/file.js"
    );
  });
});

suite("fileCommand # formatGitlabFileUrl", () => {
  test("should format strings for quick pick view", () => {
    const results = file.formatGitlabFileUrl(
      "https://gitlab.com/test/repo",
      "master",
      "rel/path/to/file.js",
      {},
      { start: 10 }
    );
    assert.equal(
      results,
      "https://gitlab.com/test/repo/blob/master/rel/path/to/file.js#L10"
    );
  });
  test("should format strings for quick pick view with remote mapping", () => {
    const results = file.formatGitlabFileUrl(
      "https://gitlab.com/test/repo",
      "master",
      "rel/path/to/file.js",
      { "https://gitlab.com/test/repo": "https://mapped.gitlab.com/test/repo" },
      { start: 10 }
    );
    assert.equal(
      results,
      "https://mapped.gitlab.com/test/repo/blob/master/rel/path/to/file.js#L10"
    );
  });
  test("should format strings for quick pick view", () => {
    const results = file.formatGitlabFileUrl(
      "https://gitlab.com/test/repo",
      "master",
      "rel/path/to/file.js",
      {},
      { start: 10, end: 20 }
    );
    assert.equal(
      results,
      "https://gitlab.com/test/repo/blob/master/rel/path/to/file.js#L10-20"
    );
  });
  test("should format strings for quick pick view", () => {
    const results = file.formatGitlabFileUrl(
      "https://gitlab.com/test/repo",
      "master",
      "rel/path/to/file.js",
      {},
      { start: 10, end: 10 }
    );
    assert.equal(
      results,
      "https://gitlab.com/test/repo/blob/master/rel/path/to/file.js#L10"
    );
  });
  test("should format strings for quick pick view", () => {
    const results = file.formatGitlabFileUrl(
      "https://gitlab.com/test/repo",
      "master",
      "rel/path/to/file.js"
    );
    assert.equal(
      results,
      "https://gitlab.com/test/repo/blob/master/rel/path/to/file.js"
    );
  });
  test("should format strings for quick pick view", () => {
    const results = file.formatGitlabFileUrl(
      "https://gitlab.com/test/repo",
      "feature/#foo",
      "rel/path/to/file.js"
    );
    assert.equal(
      results,
      "https://gitlab.com/test/repo/blob/feature/%23foo/rel/path/to/file.js"
    );
  });
});
