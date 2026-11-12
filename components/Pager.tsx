"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Splits a list into pages. The page resets to 1 whenever `resetKey` changes
 * (a new filter or search), and is clamped when the list shrinks.
 */
export function usePaged<T>(items: T[], size: number, resetKey: unknown = null) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const cur = Math.min(page, pages - 1);
  return {
    rows: items.slice(cur * size, cur * size + size),
    page: cur,
    pages,
    total: items.length,
    from: items.length ? cur * size + 1 : 0,
    to: Math.min(items.length, cur * size + size),
    setPage,
  };
}

/** Previous / next with "21–40 of 132". Hidden when everything fits on one page. */
export function Pager({
  page,
  pages,
  total,
  from,
  to,
  setPage,
  compact,
  label = "items",
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  setPage: (p: number) => void;
  compact?: boolean;
  label?: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className={`pager${compact ? " compact" : ""}`} aria-label={`Pages of ${label}`}>
      <span className="xs muted num">
        {from}–{to} of {total}
      </span>
      <div className="row" style={{ gap: 4 }}>
        <button type="button" className="btn sm ghost pager-btn" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
          <Icon name="back" size={16} />
          {!compact && "Prev"}
        </button>
        <span className="xs num pager-count">
          {page + 1} / {pages}
        </span>
        <button type="button" className="btn sm ghost pager-btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
          {!compact && "Next"}
          <Icon name="chevron" size={16} />
        </button>
      </div>
    </nav>
  );
}
