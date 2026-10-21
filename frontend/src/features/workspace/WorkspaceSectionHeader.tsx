import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type WorkspaceSectionTab = {
  value: string;
  label: string;
  badge?: number;
};

/** The same heading, view tabs and page actions across the workspace. */
export default function WorkspaceSectionHeader({
  title,
  label,
  tabs = [],
  value,
  onChange,
  actions,
  actionsPlacement = "heading",
}: {
  title: string;
  label: string;
  tabs?: WorkspaceSectionTab[];
  value: string;
  onChange: (value: string) => void;
  actions?: ReactNode;
  actionsPlacement?: "heading" | "tabs";
}) {
  return (
    <header className="workspace-section-header">
      <div className="workspace-section-heading">
        <h2>{title}</h2>
        {actionsPlacement === "heading" && actions}
      </div>
      {tabs.length > 1 && (
        <div
          className={
            "workspace-section-navigation" +
            (actionsPlacement === "tabs" ? " with-actions" : "")
          }
        >
          <Tabs value={value} onValueChange={onChange}>
            <TabsList
              className="workspace-section-tabs"
              variant="line"
              aria-label={label}
            >
              {tabs.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                  {!!item.badge && (
                    <span
                      className="workspace-section-badge"
                      aria-label={item.badge + " onay bekliyor"}
                    >
                      {item.badge}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {actionsPlacement === "tabs" && actions}
        </div>
      )}
    </header>
  );
}
