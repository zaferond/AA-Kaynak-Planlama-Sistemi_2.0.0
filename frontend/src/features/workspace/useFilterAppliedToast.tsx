import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck } from "lucide-react";

export type FilterNotice =
  | "applied"
  | "reset"
  | "period"
  | "leader"
  | "team"
  | "project"
  | "person"
  | "startMonth"
  | "search";
const messages: Record<FilterNotice, string> = {
  applied: "Filtre Uygulandı",
  reset: "Filtreler Sıfırlandı",
  period: "Görünür Dönem Değiştirildi",
  leader: "Liderlik Filtresi Uygulandı",
  team: "Takım Filtresi Uygulandı",
  project: "Proje Filtresi Uygulandı",
  person: "Kişi Filtresi Uygulandı",
  startMonth: "Başlangıç Ayı Filtresi Uygulandı",
  search: "Arama Filtresi Uygulandı",
};

export function useFilterAppliedToast() {
  const [notice, setNotice] = useState<FilterNotice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  function notify(kind: FilterNotice = "applied") {
    if (timer.current !== null) clearTimeout(timer.current);
    setNotice(kind);
    timer.current = setTimeout(() => {
      setNotice(null);
      timer.current = null;
    }, 1500);
  }

  return {
    notify,
    toast: notice
      ? createPortal(
          <div
            className={
              "filter-applied-toast" +
              (notice === "reset" ? " filter-reset-toast" : "")
            }
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <CircleCheck size={19} aria-hidden="true" />
            <span>{messages[notice]}</span>
          </div>,
          document.body,
        )
      : null,
  };
}

/** Save results and similar messages: shown briefly in the corner instead of
 * as a line between the filters and the table. */
export function useMessageToast(message: string, id: number) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, [message, id]);
  return visible && message
    ? createPortal(
        <div
          className="filter-applied-toast message-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <CircleCheck size={19} aria-hidden="true" />
          <span>{message}</span>
        </div>,
        document.body,
      )
    : null;
}
