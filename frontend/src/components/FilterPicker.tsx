import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { fold } from "../model";
export type PickerItem = {
  id: string;
  name: string;
  description?: string;
  depth?: number;
  parentId?: string;
};
function ItemLabel({
  item,
  descriptionId,
}: {
  item: PickerItem;
  descriptionId?: string;
}) {
  return (
    <span className="picker-item-label">
      <span>{item.name}</span>
      {item.description && (
        <small id={descriptionId} className="picker-item-description">
          {" "}
          - {item.description}
        </small>
      )}
    </span>
  );
}
const itemText = (item: PickerItem) =>
  item.name + (item.description ? " - " + item.description : "");
export function Picker({
  label,
  value,
  onChange,
  items,
  single = false,
  empty = "Tümü",
  compact = false,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  items: PickerItem[];
  single?: boolean;
  empty?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const descriptionPrefix = useId();
  const descriptionId = (item: PickerItem) =>
    item.description
      ? descriptionPrefix + "-" + encodeURIComponent(item.id)
      : undefined;
  const closePicker = () => {
    setOpen(false);
    setQuery("");
  };
  const shown = items.filter((i) => fold(itemText(i)).includes(fold(query)));
  const selected = items.filter((i) => value.includes(i.id));
  return (
    <div
      ref={pickerRef}
      className={
        "pick" +
        (value.length ? " filter-active" : "") +
        (compact ? " pick-compact" : "")
      }
    >
      <span>{label}</span>
      <Popover
        open={open}
        modal={modal}
        onOpenChange={(v) => {
          // A dialog locks scrolling outside itself. Its portalled picker needs
          // its own modal scroll boundary so wheel/touch scrolling stays usable.
          if (v) setModal(!!pickerRef.current?.closest('[role="dialog"]'));
          setOpen(v);
          if (!v) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="pickerbutton"
            aria-label={label}
            title={selected.map(itemText).join(", ")}
          >
            <span>
              {value.length ? (
                selected.length === 1 ? (
                  <ItemLabel item={selected[0]} />
                ) : (
                  value.length + " seçim"
                )
              ) : (
                empty
              )}
            </span>
            <ChevronDown size={15} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className={
            "pickerpanel" +
            (single ? " pickerpanel-single" : "") +
            (compact ? " pickerpanel-compact" : "")
          }
          align="start"
          side="bottom"
          collisionPadding={12}
        >
          <div className="pickersearch">
            <Search size={16} />
            <input
              autoFocus
              aria-label={label + " içinde ara"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Yazarak ara…"
            />
          </div>
          {!single && (
            <div className="pickeractions">
              <button
                onClick={() =>
                  onChange([...new Set([...value, ...shown.map((x) => x.id)])])
                }
              >
                Tümünü Seç
              </button>
              <button onClick={() => onChange([])}>Seçimleri Kaldır</button>
            </div>
          )}
          <div className="pickeroptions">
            {single && (
              <button
                className="option"
                onClick={() => {
                  onChange([]);
                  closePicker();
                }}
              >
                {empty}
              </button>
            )}
            {shown.map((i) =>
              single ? (
                <button
                  key={i.id}
                  aria-label={i.name}
                  data-leadership-depth={i.depth}
                  data-leadership-parent={i.parentId || undefined}
                  title={i.parentId ? "Üst liderlik: " + i.parentId : undefined}
                  style={
                    i.depth
                      ? { paddingInlineStart: 7 + Math.min(i.depth, 8) * 14 }
                      : undefined
                  }
                  aria-describedby={descriptionId(i)}
                  className={"option " + (value.includes(i.id) ? "chosen" : "")}
                  onClick={() => {
                    onChange([i.id]);
                    closePicker();
                  }}
                >
                  {!!i.depth && (
                    <span
                      className="picker-hierarchy-branch"
                      aria-hidden="true"
                    >
                      ↳
                    </span>
                  )}
                  <ItemLabel item={i} descriptionId={descriptionId(i)} />
                  {value.includes(i.id) && <Check size={15} />}
                </button>
              ) : (
                <label
                  key={i.id}
                  className="option"
                  data-leadership-depth={i.depth}
                  data-leadership-parent={i.parentId || undefined}
                  title={i.parentId ? "Üst liderlik: " + i.parentId : undefined}
                  style={
                    i.depth
                      ? { paddingInlineStart: 7 + Math.min(i.depth, 8) * 14 }
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    aria-label={i.name}
                    aria-describedby={descriptionId(i)}
                    checked={value.includes(i.id)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...value, i.id]
                          : value.filter((v) => v !== i.id),
                      )
                    }
                  />
                  {!!i.depth && (
                    <span
                      className="picker-hierarchy-branch"
                      aria-hidden="true"
                    >
                      ↳
                    </span>
                  )}
                  <ItemLabel item={i} descriptionId={descriptionId(i)} />
                </label>
              ),
            )}
            {!shown.length && <p>Sonuç bulunamadı.</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
export function Single({
  label,
  value,
  onChange,
  items,
  empty = "Seçin",
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: PickerItem[];
  empty?: string;
  compact?: boolean;
}) {
  return (
    <Picker
      label={label}
      value={value ? [value] : []}
      onChange={(v) => onChange(v[0] || "")}
      items={items}
      single
      empty={empty}
      compact={compact}
    />
  );
}
