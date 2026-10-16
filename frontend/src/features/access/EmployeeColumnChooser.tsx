import { Columns3 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EMPLOYEE_COLUMNS, type EmployeeColumnId } from "./employee-columns";

type Props = {
  hidden: readonly EmployeeColumnId[];
  onToggle: (id: EmployeeColumnId) => void;
  onReset: () => void;
};

const optional = EMPLOYEE_COLUMNS.filter((c) => !("fixed" in c));

/** "Sütunlar" menu: Seç, Ad Soyad and İşlemler always stay visible. */
export default function EmployeeColumnChooser({
  hidden,
  onToggle,
  onReset,
}: Props) {
  const shown = optional.length - hidden.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="button employee-column-trigger"
          aria-label={`Sütunlar: ${shown} / ${optional.length} görünür`}
        >
          <Columns3 size={15} aria-hidden="true" />
          Sütunlar
          {hidden.length > 0 && (
            <span className="employee-column-count">
              {shown}/{optional.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="employee-column-menu">
        <div className="employee-column-menu-head">
          <strong>Görünen sütunlar</strong>
          <small>Ad Soyad ve İşlemler her zaman görünür.</small>
        </div>
        <div role="group" aria-label="Görünen sütunlar">
          {optional.map((column) => (
            <label key={column.id}>
              <input
                type="checkbox"
                checked={!hidden.includes(column.id)}
                onChange={() => onToggle(column.id)}
              />
              {column.label}
            </label>
          ))}
        </div>
        <button
          type="button"
          className="textbutton"
          disabled={!hidden.length}
          onClick={onReset}
        >
          Tümünü Göster
        </button>
      </PopoverContent>
    </Popover>
  );
}
