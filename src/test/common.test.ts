import * as assert from "assert";
import * as common from "../common";

suite("#getRemotes", () => {
  const mockRemoteResult = `
origin	git@github.yandex-team.ru:search-interfaces/web4.git (fetch)
origin	git@github.yandex-team.ru:search-interfaces/web4.git
upstream	https://github.yandex-team.ru/serp/web4 (fetch)
upstream	https://github.yandex-team.ru/serp/web4 (push)
`;

  test("should return correct remotes list", (done) => {
    common
      .getRemotes(
        (cmd, opts, cb) => cb(null, mockRemoteResult, null),
        "",
        "",
        "",
        ["master"]
      )
      .then((list) => {
        assert.deepEqual(list, [
          "git@github.yandex-team.ru:search-interfaces/web4.git",
          "https://github.yandex-team.ru/serp/web4",
        ]);
        done();
      })
      .catch(done);
  });

  test("should account for defaultRemote", (done) => {
    common
      .getRemotes(
        (cmd, opts, cb) => cb(null, mockRemoteResult, null),
        "",
        "upstream",
        "",
        ["master"]
      )
      .then((list) => {
        assert.deepEqual(list, [
          "https://github.yandex-team.ru/serp/web4",
          "git@github.yandex-team.ru:search-interfaces/web4.git",
        ]);
        done();
      })
      .catch(done);
  });

  test("should be rejected if error occured", (done) => {
    common
      .getRemotes(
        (cmd, opts, cb) => cb(null, mockRemoteResult, "error"),
        "",
        "",
        "",
        ["master"]
      )
      .then(done)
      .catch(() => done());
  });
});

suite("#formatRemotes", () => {
  const mockRemotesList = [
    "git@github.com:d4rkr00t/language-stylus.git",
    "git@github.yandex-team.ru:search-interfaces/web4.git",
    "https://github.yandex-team.ru/serp/web4",
    "https://github.com/d4rkr00t/language-stylus",
    "https://github.com/Microsoft/TypeScript.git",
    "ssh://user@host.xz/path/to/repo.git/",
    "git://host.xz/path/to/repo.git/",
    "https://host.xz/path/to/repo.git/",
    "ftps://host.xz/path/to/repo.git/",
    "http://host.xz/path/to/repo.git/",
    "ftp://host.xz/path/to/repo.git/",
    "https://user@github.com/some/repo.git",
    "ssh://git@bitbucket-mirror-au.internal.atlassian.com:7999/confcloud/confluence-frontend.git",
    "../other",
  ];

  test("should correctly format all types of git remote urls", () => {
    const result = mockRemotesList.map(
      (mock) => common.formatRemotes([mock])[0]
    );
    assert.deepEqual(result, [
      "https://github.com/d4rkr00t/language-stylus",
      "https://github.yandex-team.ru/search-interfaces/web4",
      "https://github.yandex-team.ru/serp/web4",
      "https://github.com/d4rkr00t/language-stylus",
      "https://github.com/Microsoft/TypeScript",
      "https://host.xz/path/to/repo",
      "https://host.xz/path/to/repo.git",
      "https://host.xz/path/to/repo",
      "https://host.xz/path/to/repo.git",
      "http://host.xz/path/to/repo",
      "http://host.xz/path/to/repo.git",
      "https://github.com/some/repo",
      "https://bitbucket-mirror-au.internal.atlassian.com/confcloud/confluence-frontend",
      undefined,
    ]);
  });
});

suite("#getBranches", () => {
  const mockBranchResult = `
  dev
* sysoev/SERP-42779
  remotes/origin/sysoev/SERP-42779
  remotes/origin/dev
`;
  const mockBranchResultNoRemotes = `
  dev
* sysoev/SERP-42779
`;

  test("should return current branch", (done) => {
    common
      .getBranches(
        (cmd, opts, cb) => cb(null, mockBranchResult, null),
        "",
        "dev",
        100,
        true
      )
      .then((branch) => {
        assert.deepEqual(branch, ["sysoev/SERP-42779", "dev"]);
        done();
      })
      .catch(done);
  });

  test("should return empty string if there aren`t any remotes with the name of current branch", (done) => {
    common
      .getBranches(
        (cmd, opts, cb) => cb(null, mockBranchResultNoRemotes, null),
        "",
        "dev",
        100,
        true
      )
      .then((branch) => {
        !branch.length && done();
      })
      .catch(done);
  });

  test("should be rejected if error occured", (done) => {
    common
      .getBranches(
        (cmd, opts, cb) => cb(null, mockBranchResult, "error"),
        "",
        "dev"
      )
      .then(done)
      .catch(() => done());
  });
});

suite("#getCurrentRevision", () => {
  const mockRevisionResult = "abc123\n";

  test("should return current revision, with newline stripped", (done) => {
    common
      .getCurrentRevision(
        (cmd, opts, cb) => cb(null, mockRevisionResult, null),
        ""
      )
      .then((branch) => {
        assert.deepEqual(branch, "abc123");
        done();
      })
      .catch(done);
  });

  test("should be rejected if error occurred", (done) => {
    common
      .getCurrentRevision(
        (cmd, opts, cb) => cb(null, mockRevisionResult, "error"),
        ""
      )
      .then(done)
      .catch(() => done());
  });
});

suite("#prepareQuickPickItems", () => {
  const formatters = {
    github: () => "",
    bitbucket: () => "",
    bitbucketServer: () => "",
    gitlab: () => "",
  };
  suite("if current branch and master branch are equal", () => {
    test("should return only 1 item if there is only 1 remote", () => {
      const result = common.prepareQuickPickItems(
        "auto",
        formatters,
        {},
        "test-command",
        "file.js",
        { start: 10 },
        [["https://rem"], ["master"]]
      );
      assert.equal(result.length, 1);
    });

    test("should return only 1 item if there is only 1 remote", () => {
      const result = common.prepareQuickPickItems(
        "auto",
        formatters,
        {},
        "test-command",
        "file.js",
        { start: 10, end: 20 },
        [["https://rem"], ["master"]]
      );
      assert.equal(result.length, 1);
    });

    test("should return number of quick pick items equal to number of remotes", () => {
      const result = common.prepareQuickPickItems(
        "auto",
        formatters,
        {},
        "test-command",
        "file.js",
        { start: 10, end: 20 },
        [["https://rem", "https://rem2"], ["master"]]
      );
      assert.equal(result.length, 2);
    });
  });

  suite("if current branch and master branch are not equal", () => {
    const result = common.prepareQuickPickItems(
      "auto",
      formatters,
      {},
      "test-command",
      "file.js",
      { start: 10, end: 20 },
      [
        ["https://rem", "https://rem2"],
        ["feat", "master"],
      ]
    );

    test("should merge quick pick items for current branch and master branch", () => {
      assert.equal(result.length, 4);
    });

    test("should merge quick pick items for current branch and master branch in correct order", () => {
      assert.ok(result[0].detail.includes("feat"));
      assert.ok(result[1].detail.includes("master"));
    });
  });
});

suite("#isMarkdownFile", () => {
  test("matches Markdown-family extensions only", () => {
    for (const ext of [
      "md",
      "mkd",
      "mkdn",
      "mdwn",
      "mdown",
      "markdown",
      "mdx",
      "litcoffee",
    ]) {
      assert.ok(
        common.isMarkdownFile(`Home.${ext}`),
        `expected match for .${ext}`
      );
    }
    for (const ext of ["textile", "rdoc", "rst", "rest", "adoc", "pod"]) {
      assert.ok(
        !common.isMarkdownFile(`Home.${ext}`),
        `expected no match for .${ext}`
      );
    }
  });
});

suite("#computeMarkdownHeadingAnchor", () => {
  test("returns anchor for ATX heading on cursor line", () => {
    const lines = ["# Top", "", "## Installation"];
    assert.equal(
      common.computeMarkdownHeadingAnchor(lines, 2),
      "#installation"
    );
  });

  test("supports all six heading levels", () => {
    for (let level = 1; level <= 6; level++) {
      const lines = [`${"#".repeat(level)} Header`];
      assert.equal(
        common.computeMarkdownHeadingAnchor(lines, 0),
        "#header",
        `level=${level}`
      );
    }
  });

  test("returns empty for non-heading lines", () => {
    assert.equal(
      common.computeMarkdownHeadingAnchor(["Plain paragraph."], 0),
      ""
    );
    assert.equal(common.computeMarkdownHeadingAnchor([""], 0), "");
  });

  test("strips trailing closing ATX hash run", () => {
    assert.equal(
      common.computeMarkdownHeadingAnchor(["## Heading ##"], 0),
      "#heading"
    );
  });

  test("collapses internal whitespace to single hyphens", () => {
    assert.equal(
      common.computeMarkdownHeadingAnchor(["##  Spaced   Out  "], 0),
      "#spaced-out"
    );
  });

  test("drops punctuation, ASCII-lowercases, preserves non-ASCII letter case", () => {
    // Per GitHub docs / html-pipeline's `ascii_downcase`: only A–Z are
    // lowered, so Θ stays Θ (not θ).
    assert.equal(
      common.computeMarkdownHeadingAnchor(
        ["## This'll be a _Helpful_ Section About the Greek Letter Θ!"],
        0
      ),
      "#thisll-be-a-helpful-section-about-the-greek-letter-Θ"
    );
  });

  test("strips reference-style and shortcut links", () => {
    assert.equal(
      common.computeMarkdownHeadingAnchor(["## See [documentation][guide]"], 0),
      "#see-documentation"
    );
    assert.equal(
      common.computeMarkdownHeadingAnchor(["## See [docs]"], 0),
      "#see-docs"
    );
  });

  test("respects fence length: shorter fences inside longer ones don't close", () => {
    const lines = [
      "````markdown",
      "```js",
      "## inside sample",
      "```",
      "````",
      "## After",
    ];
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 2), "");
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 5), "#after");
  });

  test("Setext headings participate in duplicate-slug counting", () => {
    const lines = ["Usage", "-----", "", "## Usage"];
    // Setext h2 "Usage" → #usage; later ATX "## Usage" → #usage-1.
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 0), "#usage");
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 1), "#usage");
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 3), "#usage-1");
  });

  test("decodes hexadecimal HTML entities", () => {
    // &#x26; → '&'; '&' is then stripped as punctuation; the
    // surrounding spaces collapse to a single hyphen.
    assert.equal(
      common.computeMarkdownHeadingAnchor(["## API &#x26; CLI"], 0),
      "#api-cli"
    );
  });

  test("indented 4+ spaces is a code block, not a Setext heading", () => {
    const lines = ["    Usage", "-----", "", "## Usage"];
    // First "Usage" is a code block (indented 4 spaces) so `-----` is a
    // thematic break, not a setext underline. The real heading is the
    // ATX one, which must claim #usage (not #usage-1).
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 3), "#usage");
  });

  test("HTML comments suppress heading-like content", () => {
    const lines = ["<!--", "## Hidden", "-->", "## Hidden"];
    // Heading inside the comment doesn't contribute; visible #Hidden
    // gets the bare slug.
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 3), "#hidden");
  });

  test("collision-avoidance: literal `## Foo-1` after two `## Foo`s", () => {
    const lines = ["## Foo", "## Foo", "## Foo-1"];
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 0), "#foo");
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 1), "#foo-1");
    // Third heading would otherwise collide with the second's #foo-1.
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 2), "#foo-1-1");
  });

  test("strips inline formatting before slugging", () => {
    assert.equal(
      common.computeMarkdownHeadingAnchor(
        ["## Use `npm install` and **read** the [docs](https://x)"],
        0
      ),
      "#use-npm-install-and-read-the-docs"
    );
  });

  test("disambiguates repeated headings with -1, -2 …", () => {
    const lines = ["## Usage", "", "## Usage", "", "## Usage"];
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 0), "#usage");
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 2), "#usage-1");
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 4), "#usage-2");
  });

  test("ignores heading-like lines inside fenced code blocks", () => {
    const lines = [
      "Intro",
      "```",
      "## Not a heading",
      "```",
      "## Real heading",
    ];
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 2), "");
    assert.equal(
      common.computeMarkdownHeadingAnchor(lines, 4),
      "#real-heading"
    );
  });

  test("respects ~~~ fences as well as backticks", () => {
    const lines = ["~~~", "## inside tilde fence", "~~~", "## After"];
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 1), "");
    assert.equal(common.computeMarkdownHeadingAnchor(lines, 3), "#after");
  });

  test("returns empty when cursor index is out of range", () => {
    assert.equal(common.computeMarkdownHeadingAnchor([], 0), "");
  });
});
