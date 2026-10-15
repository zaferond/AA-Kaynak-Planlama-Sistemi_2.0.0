import { Layers3 } from "lucide-react";

export type SummaryFilter = {
  label: string;
  values: string[];
  active: boolean;
};
export function FilterSummaryChips({ filters }: { filters: SummaryFilter[] }) {
  return (
    <span className="capacity-filter-list">
      {filters.map(({ label, values, active }) => (
        <span
          key={label}
          className={"capacity-filter-chip" + (active ? " is-active" : "")}
          title={label + ": " + (values.length ? values.join(", ") : "Tümü")}
        >
          <span>{label}</span>
          <strong>{values.length ? values.join(", ") : "Tümü"}</strong>
        </span>
      ))}
    </span>
  );
}
export default function WorkspaceFilterSummary({
  filters,
  title = "Filtrelenen Projeler",
  ariaLabel = "Proje ekranında uygulanan filtreler",
  className = "",
}: {
  filters: SummaryFilter[];
  title?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={"capacitystrip project-filter-summary " + className}
      role="region"
      aria-label={ariaLabel}
    >
      <span className="capacitystrip-icon" aria-hidden="true">
        <Layers3 size={18} />
      </span>
      <span className="capacitystrip-copy">
        <strong>{title}</strong>
        <FilterSummaryChips filters={filters} />
      </span>
    </div>
  );
}
