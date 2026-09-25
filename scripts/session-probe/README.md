# Session shape probe

Throwaway diagnostic for mapping unmapped Classroom web-RPC fields (due
dates, points, materials, grades, timestamps) without guessing wire
formats. Captures real responses locally, analyzes their **shape**
offline, and only the redacted shape ever leaves your machine.

## Safety

- **Read-only.** Every call is a page GET or a query RPC. Nothing here
  can turn in, post, upload, delete, or modify anything.
- **Cookie via env only.** `C_CLASSROOM` is read from the environment.
  Never pass the cookie as a CLI argument (shell history) and never
  commit captures.
- **Captures stay local.** They land in a fresh system-tmpdir per run
  (printed as `captures go to …`). Delete that directory when done.
- The analyzer prints slot indices + value **kinds** only
  (`ms-epoch`, `small-int`, `url[drive.google.com]`, …). No titles,
  names, emails, or text. Paste its output anywhere.

## Run

```bash
export C_CLASSROOM='<whole Cookie header value>'
bun scripts/session-probe/harness.ts slots
bun scripts/session-probe/harness.ts courses 0
bun scripts/session-probe/harness.ts streamraw 0 <courseId> 50
python3 scripts/session-probe/analyze.py <captures-dir>/stream-<courseId>.txt
```

(`npx -y tsx@4.19.1 …` works in place of `bun`.)
Pick a course with a graded assignment that has attachments. Then paste
the analyzer output back. Grades take a second round (`members` to find
your web id, then `subqueryraw 0 <courseId> <workId>` + analyze).
