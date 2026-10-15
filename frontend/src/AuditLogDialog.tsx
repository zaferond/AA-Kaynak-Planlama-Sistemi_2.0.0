import { ownValue } from "../../shared/records";
import retentionPolicy from "../../shared/data-retention-policy.json";
import { useEffect, useState } from "react";
import { History, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { readAuditLog } from "./storage";
import type { AuditPage, AuditValue } from "../../shared/audit-types";
import "./audit-log.css";

const kinds: Record<string, string> = {
  project: "Proje",
  risk: "Risk",
  resource: "Çalışan kaynak",
  team: "Takım",
  allocation: "Planlanan dağılım",
  actual: "Gerçekleşen dağılım",
  workedHours: "Çalışma saati",
  calendar: "Çalışma takvimi",
  personDay: "İzin / eğitim",
  leader: "Liderlik",
  user: "Kullanıcı yetkisi",
  maintenance: "Geçmiş bakımı",
};
const fields: Record<string, string> = {
  name: "Ad",
  description: "Açıklama",
  start: "Başlangıç",
  end: "Bitiş",
  phases: "Aşamalar",
  phaseColors: "Aşama renkleri",
  milestones: "Kritik konular",
  barNotes: "Detay notlar",
  additionalRanges: "Ek notlar",
  notes: "Notlar",
  text: "Metin",
  includeInReport: "Rapora ekle",
  completed: "Tamamlandı",
  barColor: "Bar rengi",
  barStyle: "Bar görünümü",
  diamondStyle: "Milestone görünümü",
  barText: "Not",
  hasCriticalTopics: "Detay konu var",
  responsibleName: "Proje sorumlusu",
  sortOrder: "Proje sırası",
  versions: "Kaynak dönemleri",
  effective: "Geçerlilik ayı",
  status: "Statü",
  included: "Plana dahil",
  amount: "Kaynak miktarı",
  team: "Takım",
  lead: "Liderlik",
  managerName: "Yönetici",
  type: "Tür",
  hours: "Saat",
  label: "Açıklama",
  fraction: "Gün oranı",
  role: "Rol",
  leaders: "Liderlikler",
  active: "Aktif",
  resourceId: "Çalışan kaydı",
  reportedBy: "Bildiren",
  category: "Kategori",
  reportedAt: "Bildirim tarihi",
  system: "Sistem",
  cause: "Sebep",
  actionPlan: "Aksiyon planı",
  targetAt: "Hedef tarihi",
  owner: "Risk sorumlusu",
  likelihood: "Olasılık",
  impact: "Etki",
  strategy: "Strateji",
  implementedAt: "Aksiyon tarihi",
  actionResult: "Aksiyon sonucu",
  residualLikelihood: "Son olasılık",
  residualImpact: "Son etki",
  projectId: "Proje",
  updatedAt: "Güncelleme zamanı",
  createdAt: "Oluşturma zamanı",
  createdByName: "Oluşturan",
  username: "Kullanıcı adı",
  code: "Çalışan kodu",
  excelCapacity: "Başlangıç kapasitesi",
  catalog: "Katalog kaydı",
  id: "Kayıt",
  createdBy: "Oluşturan kullanıcı",
  auditRetentionYears: "Saklama süresi (yıl)",
  auditCutoff: "Saklama sınırı (UTC)",
  auditRemoved: "Kaldırılan geçmiş kaydı",
  backupChecksum: "Tam yedek doğrulama özeti",
};
const values: Record<string, string> = {
  true: "Evet",
  false: "Hayır",
  leave: "İzin",
  training: "Eğitim",
  official: "Resmî tatil",
  religious: "Bayram tatili",
  company: "Çalışma dışı",
  admin: "Admin",
  manager: "Yönetici",
  normal: "Normal kullanıcı",
  solid: "Düz",
  outline: "Çerçeveli",
  blue: "Mavi",
  green: "Yeşil",
  amber: "Sarı",
  red: "Kırmızı",
  purple: "Mor",
  gray: "Gri",
};
const display = (value: AuditValue) =>
  value === null || value === ""
    ? "—"
    : typeof value === "number"
      ? value.toLocaleString("tr-TR")
      : ownValue(values, String(value)) || String(value);
const label = (path: string[]) =>
  path.length
    ? path
        .map(
          (part) =>
            ownValue(fields, part) ||
            (/^\d+$/.test(part) ? String(Number(part) + 1) : part),
        )
        .join(" › ")
    : "Değer";
const pageSize = 30;
export default function AuditLogDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [page, setPage] = useState(0),
    [result, setResult] = useState<AuditPage | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (open) setPage(0);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    setError("");
    setResult(null);
    readAuditLog(page * pageSize, pageSize)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((cause) => {
        if (!cancelled) setError((cause as Error).message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, page]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="audit-log-dialog">
        <DialogHeader>
          <DialogTitle>
            <History size={20} />
            Değişiklik Geçmişi
          </DialogTitle>
          <DialogDescription>
            Bu özellik devreye alındıktan sonra kaydedilen değişiklikler.
            Yalnızca yöneticilerden admin rolü olan kullanıcılar
            görüntüleyebilir. Saklama süresi{" "}
            {retentionPolicy.auditRetentionYears} yıldır. Süresi dolan kayıtlar
            yönetici bakımıyla kaldırılır. Bu geçmiş JSON veri yedeğine dahil
            değildir.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="negative" role="alert">
            {error}
          </p>
        )}
        <div className="audit-log-list" aria-busy={busy}>
          {busy ? (
            <p>Geçmiş yükleniyor…</p>
          ) : !result?.entries.length ? (
            <p>Henüz değişiklik kaydı yok.</p>
          ) : (
            result.entries.map((entry) => (
              <article key={entry.id} className="audit-log-entry">
                <header>
                  <div>
                    <span className={"audit-action " + entry.action}>
                      {entry.action === "create"
                        ? "Eklendi"
                        : entry.action === "delete"
                          ? "Silindi"
                          : "Düzenlendi"}
                    </span>
                    <strong>
                      {ownValue(kinds, entry.kind) || entry.kind} ·{" "}
                      {entry.record_name}
                    </strong>
                  </div>
                  <time>
                    {new Date(entry.occurred_at).toLocaleString("tr-TR")}
                  </time>
                </header>
                <p>{entry.actor_name}</p>
                <details>
                  <summary>{entry.changes.length} alan değişikliği</summary>
                  <table>
                    <thead>
                      <tr>
                        <th>Alan</th>
                        <th>Önceki değer</th>
                        <th>Yeni değer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.changes.map((change, index) => (
                        <tr key={index}>
                          <th>{label(change.path)}</th>
                          <td>{display(change.before)}</td>
                          <td>{display(change.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </article>
            ))
          )}
        </div>
        <footer className="audit-log-footer">
          <span>
            {result ? `${result.total} kayıt · Sayfa ${page + 1}` : " "}
          </span>
          <button
            className="button"
            disabled={busy || page === 0}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={15} />
            Önceki
          </button>
          <button
            className="button"
            disabled={busy || !result || (page + 1) * pageSize >= result.total}
            onClick={() => setPage(page + 1)}
          >
            Sonraki
            <ChevronRight size={15} />
          </button>
          <button className="button" onClick={() => onOpenChange(false)}>
            Kapat
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
