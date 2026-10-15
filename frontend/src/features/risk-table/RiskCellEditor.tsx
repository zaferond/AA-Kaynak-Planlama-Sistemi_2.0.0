import { Trash2 } from "lucide-react";
import {
  riskCategories,
  riskStatuses,
  riskStrategyKeys,
} from "../../../../shared/risk-policy.ts";
import type { Risk, RiskSystem } from "../../model";
import type { RiskColumn } from "./columns";
import type { RiskUpdate } from "./types";
import RiskValue from "./RiskValue";

export default function RiskCellEditor({
  column,
  risk,
  systems,
  index,
  saving,
  isNew,
  canDelete,
  conflict,
  update,
  remove,
}: {
  column: RiskColumn;
  risk: Risk;
  systems: RiskSystem[];
  index: number;
  saving: boolean;
  isNew: boolean;
  canDelete: boolean;
  conflict: boolean;
  update: RiskUpdate;
  remove: () => Promise<void>;
}) {
  if (!("editor" in column))
    return <RiskValue risk={risk} column={column} index={index} />;
  const common = {
    className: "risk-inline-input",
    "data-risk-input": column.key,
    disabled: saving,
    "aria-label": column.label,
  };
  switch (column.editor) {
    case "system": {
      const selected = systems.find(
        (item) =>
          item.id === risk.systemId ||
          (!risk.systemId && item.name === risk.system),
      );
      const legacyValue = "legacy:" + risk.system;
      return (
        <select
          {...common}
          value={selected?.id || (risk.system ? legacyValue : "")}
          onChange={(event) => {
            if (event.target.value === legacyValue) return;
            const item = systems.find((item) => item.id === event.target.value);
            update("systemId", item?.id);
            update("system", item?.name || "");
          }}
        >
          <option value="">Sistem / alt sistem seçin</option>
          {!selected && risk.system && (
            <option value={legacyValue}>{risk.system} (mevcut kayıt)</option>
          )}
          {systems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      );
    }
    case "strategy": {
      const strategy = riskStrategyKeys[column.key];
      return (
        <button
          type="button"
          className={
            "risk-inline-strategy" +
            (risk.strategy === strategy ? " selected" : "")
          }
          data-risk-input={column.key}
          disabled={saving}
          aria-label={column.label + " stratejisi"}
          aria-pressed={risk.strategy === strategy}
          onClick={() =>
            update("strategy", risk.strategy === strategy ? "" : strategy)
          }
        >
          {risk.strategy === strategy ? "✓" : "Seç"}
        </button>
      );
    }
    case "category":
      return (
        <select
          {...common}
          value={risk.category}
          onChange={(event) =>
            update("category", event.target.value as Risk["category"])
          }
        >
          {riskCategories.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      );
    case "status":
      return (
        <select
          {...common}
          value={risk.status}
          onChange={(event) =>
            update("status", event.target.value as Risk["status"])
          }
        >
          {riskStatuses.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      );
    case "likelihood": {
      const key = column.key;
      return (
        <select
          {...common}
          value={risk[key]}
          onChange={(event) => update(key, Number(event.target.value))}
        >
          <option value={0}>Seçin</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      );
    }
    case "residual": {
      const key = column.key;
      return (
        <select
          {...common}
          value={risk[key] ?? ""}
          onChange={(event) =>
            update(key, event.target.value ? Number(event.target.value) : null)
          }
        >
          <option value="">—</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      );
    }
    case "date": {
      const key = column.key;
      return (
        <input
          type="date"
          {...common}
          value={risk[key]}
          onChange={(event) => update(key, event.target.value)}
        />
      );
    }
    case "multiline": {
      const key = column.key;
      return (
        <div>
          {key === "description" && (
            <div className="risk-edit-description-head">
              <span className="risk-row-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              {isNew && <span className="risk-new-badge">YENİ RİSK</span>}
            </div>
          )}
          <textarea
            {...common}
            className="risk-inline-input risk-inline-textarea"
            rows={3}
            maxLength={5000}
            value={risk[key]}
            onChange={(event) => update(key, event.target.value)}
          />
          {key === "description" && !isNew && canDelete && (
            <button
              type="button"
              className="risk-inline-delete"
              disabled={saving || conflict}
              onClick={() => void remove()}
            >
              <Trash2 size={14} aria-hidden="true" />
              Riski Sil
            </button>
          )}
        </div>
      );
    }
    case "text": {
      const key = column.key;
      return (
        <input
          type="text"
          {...common}
          maxLength={200}
          value={risk[key]}
          onChange={(event) => update(key, event.target.value)}
        />
      );
    }
  }
}
