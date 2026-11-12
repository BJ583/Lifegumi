import { ChevronLeft, ChevronRight } from "lucide-react";

function pageItems(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages]);
  const start = page <= 4 ? 2 : page >= totalPages - 3 ? totalPages - 5 : page - 2;
  const end = page <= 4 ? 6 : page >= totalPages - 3 ? totalPages - 1 : page + 2;
  for (let current = start; current <= end; current += 1) pages.add(current);
  const sorted = Array.from(pages).sort((left, right) => left - right);
  return sorted.flatMap((value, index) => index && value - sorted[index - 1] > 1 ? ["ellipsis-" + value, value] : [value]);
}

export function Pagination({ page, totalPages, total, onChange, label = "记录" }) {
  if (totalPages <= 1) return total ? <p className="pagination-summary">共 {total} 条{label}</p> : null;

  function goTo(nextPage) {
    if (nextPage === page || nextPage < 1 || nextPage > totalPages) return;
    onChange(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <nav className="pagination" aria-label={`${label}分页`}>
      <button className="pagination-wide" type="button" disabled={page <= 1} onClick={() => goTo(page - 1)}><ChevronLeft size={16} />上一页</button>
      {pageItems(page, totalPages).map((entry) => typeof entry === "string" ? (
        <span className="pagination-ellipsis" key={entry}>…</span>
      ) : (
        <button className={`pagination-page ${entry === page ? "active" : ""}`} type="button" key={entry} onClick={() => goTo(entry)} aria-current={entry === page ? "page" : undefined}>{entry}</button>
      ))}
      <button className="pagination-wide" type="button" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>下一页<ChevronRight size={16} /></button>
    </nav>
  );
}