import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { globalSearch, SEARCH_TYPE_LABELS, type SearchResult } from "../api/search.js";

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 8;

// A simple debounced dropdown, not a full command palette — this app has no
// modal/overlay library and a plain inline-styled UI throughout, so a
// lightweight anchored dropdown fits the existing architecture better than
// introducing new UI infrastructure for one feature.
export const GlobalSearch = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await globalSearch(trimmed, { limit: RESULT_LIMIT });
        setResults(res.results);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Search failed.");
        setResults([]);
      } finally {
        setLoading(false);
        setHasSearched(true);
        setHighlightedIndex(0);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onGlobalKeyDown);
    return () => document.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const goToResult = useCallback(
    (result: SearchResult) => {
      navigate(result.url);
      setOpen(false);
      setQuery("");
      setResults([]);
      inputRef.current?.blur();
    },
    [navigate],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[highlightedIndex];
      if (target) goToResult(target);
    }
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const result of results) {
      const list = groups.get(result.type) ?? [];
      list.push(result);
      groups.set(result.type, list);
    }
    return [...groups.entries()];
  }, [results]);

  let flatIndex = -1;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "320px" }}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search… (Ctrl+K)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{ width: "100%", padding: "0.4rem 0.6rem" }}
        aria-label="Global search"
      />

      {open && query.trim() && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "white",
            border: "1px solid #ddd",
            borderRadius: "4px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            maxHeight: "60vh",
            overflowY: "auto",
            zIndex: 100,
          }}
        >
          {loading && <p style={{ padding: "0.75rem" }}>Searching…</p>}

          {!loading && error && (
            <p role="alert" style={{ padding: "0.75rem", color: "crimson" }}>
              {error}
            </p>
          )}

          {!loading && !error && hasSearched && results.length === 0 && (
            <p style={{ padding: "0.75rem", color: "#555" }}>No results for "{query.trim()}".</p>
          )}

          {!loading &&
            !error &&
            grouped.map(([type, items]) => (
              <div key={type}>
                <div style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem", fontWeight: "bold", color: "#888", background: "#fafafa" }}>
                  {SEARCH_TYPE_LABELS[type as keyof typeof SEARCH_TYPE_LABELS] ?? type}
                </div>
                {items.map((result) => {
                  flatIndex += 1;
                  const isHighlighted = flatIndex === highlightedIndex;
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      type="button"
                      onClick={() => goToResult(result)}
                      onMouseEnter={() => setHighlightedIndex(flatIndex)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "0.5rem 0.75rem",
                        border: "none",
                        background: isHighlighted ? "#eef2ff" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{result.title}</div>
                      <div style={{ fontSize: "0.8rem", color: "#666" }}>
                        {result.subtitle}
                        {result.status ? ` · ${result.status}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
