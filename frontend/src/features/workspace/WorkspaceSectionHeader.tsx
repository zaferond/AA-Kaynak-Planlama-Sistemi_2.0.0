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
}: {
  title: string;
  label: string;
  tabs?: WorkspaceSectionTab[];
  value: string;
  onChange: (value: string) => void;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-section-header">
      <div className="workspace-section-heading">
        <h2>{title}</h2>
        {actions}
      </div>
      {tabs.length > 1 && (
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
      )}
    </header>
  );
}
