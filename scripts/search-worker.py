"""Keeps docparser's retriever warm so a search costs milliseconds.

Measured on the contract corpus, one CLI invocation spends:

    import DocxToolkit   195 ms
    BM25 query           1-6 ms
    embedding model      881 ms   (first query that needs it)

The query is already fast. Everything else is setup thrown away when the
process exits, and paid again on the next search — so a review that consults
precedent three times pays it three times.

This holds the toolkit open and answers line-delimited JSON on stdin:

    {"id": 1, "query": "지연배상 상한", "topK": 5}
    -> {"id": 1, "ok": true, "text": "..."}

One request per line, one response per line, `id` echoed so the caller can
match them. Errors come back as `{"ok": false, "error": "..."}` rather than a
traceback on stderr, because a caller that has to parse a traceback to notice a
failure will eventually not notice one.
"""

import json
import os
import sys


def main() -> int:
    src = os.environ.get("DOCPARSER_SRC")
    if not src:
        print(json.dumps({"ok": False, "error": "DOCPARSER_SRC not set"}), flush=True)
        return 1
    sys.path.insert(0, src)

    try:
        from docparser.tools import DocxToolkit
    except Exception as exc:  # noqa: BLE001 - reported to the caller, not raised
        print(json.dumps({"ok": False, "error": f"import failed: {exc}"}), flush=True)
        return 1

    toolkit = DocxToolkit()
    # Tells the parent the import is done and the next request will be fast.
    print(json.dumps({"ready": True}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "bad json"}), flush=True)
            continue

        rid = req.get("id")
        try:
            text = toolkit.hybrid_search(str(req.get("query", "")), top_k=int(req.get("topK", 5)))
            print(json.dumps({"id": rid, "ok": True, "text": text}), flush=True)
        except Exception as exc:  # noqa: BLE001
            # A failed query must not kill the worker; the next one may be fine,
            # and respawning costs the whole setup again.
            print(json.dumps({"id": rid, "ok": False, "error": str(exc)}), flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
