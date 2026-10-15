export default function Pager({
  total,
  page,
  size,
  onChange,
  label,
}: {
  total: number;
  page: number;
  size: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  return (
    <div className="pager">
      <span>
        {label}: {page * size + 1}–{Math.min(total, (page + 1) * size)} /{" "}
        {total}
      </span>
      <button
        className="button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Önceki
      </button>
      <label>
        Sayfa{" "}
        <select value={page} onChange={(e) => onChange(Number(e.target.value))}>
          {Array.from({ length: pages }, (_, i) => (
            <option key={i} value={i}>
              {i + 1} / {pages}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button"
        disabled={page >= pages - 1}
        onClick={() => onChange(page + 1)}
      >
        Sonraki
      </button>
      <small>Toplamlar ve dışa aktarım tüm filtre sonuçlarını kapsar.</small>
    </div>
  );
}
