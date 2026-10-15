// Creates a NEW SQL.js database filled with fictional presentation data.
// Usage: node --env-file=.env scripts/demo-data.mjs data/demo-sunum.sqlite
// The target must not exist; the script never opens or modifies another database.
// The root admin uses ADMIN_USERNAME / ADMIN_PASSWORD from .env (same login as usual).
import fs from "node:fs/promises";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges, applyLeaderChange } from "../backend/operations.mjs";
import { directoryRevision } from "../shared/directory-policy.ts";
import { createActualMonthIndex } from "../shared/actual-months.ts";

const target = process.argv[2];
if (!target)
  throw Error("Kullanım: node scripts/demo-data.mjs <yeni-dosya.sqlite>");
const file = path.resolve(target);
if (path.basename(file) === "planlama.sqlite")
  throw Error("Gerçek veritabanı adına demo verisi yazılmaz.");
try {
  await fs.access(file);
  throw Error(
    file + " zaten var. Demo verisi yalnızca yeni bir dosyaya yazılır.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const adminUsername = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "";
if (!adminUsername || adminPassword.length < 10)
  throw Error("ADMIN_USERNAME / ADMIN_PASSWORD .env içinde tanımlı olmalı.");
const DEMO_PASSWORD = "Sunum-2026!";

// Deterministic pseudo-random numbers: the same file every run.
let seed = 20261016;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (items) => items[Math.floor(rand() * items.length)];
const between = (min, max) => min + rand() * (max - min);
const quarter = (value) => Math.round(value * 4) / 4;
const monthAdd = (month, delta) => {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + m - 1 + delta;
  return Math.floor(i / 12) + "-" + String((i % 12) + 1).padStart(2, "0");
};
const monthRange = (start, end) => {
  const out = [];
  for (let m = start; m <= end; m = monthAdd(m, 1)) out.push(m);
  return out;
};
const lastDay = (month) => {
  const [y, m] = month.split("-").map(Number);
  return month + "-" + String(new Date(Date.UTC(y, m, 0)).getUTCDate());
};

const store = new Store({
  env: {
    NODE_ENV: "development",
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: file,
    DB_AUTO_MIGRATE: "true",
  },
});
await store.connect();
try {
  await store.bootstrapUser({
    _id: "root-admin",
    username: adminUsername,
    name: "Sistem Yöneticisi",
    role: "admin",
    resourceId: "",
    leaders: [],
    active: true,
    password: await hashPassword(adminPassword),
    revision: 1,
    version: 1,
  });
  const actor = await store.findUser({ id: "root-admin" });
  const read = async () => (await store.read()).data;
  const apply = (changes) =>
    store.mutate(actor, (d, u) => applyChanges(d, u, changes));

  // ---------------------------------------------------------------- Organisation
  const TOP = "AA Mühendislik Liderliği";
  const unassigned = {
    "AA Mühendislik Liderliği Destek Takımı": TOP,
    "AA Kule Mekanik Sistemleri Takımı": "AA Alt Sistemler Tasarım Liderliği",
    "AA Kule Kontrol Sistemleri Takımı": "AA Alt Sistemler Tasarım Liderliği",
    "AA Hidrolik ve Beka Sistemleri Takımı":
      "AA Alt Sistemler Tasarım Liderliği",
    "AA Yaşam Destek Sistemleri Takımı": "AA Alt Sistemler Tasarım Liderliği",
    "AA Prototip Montaj Takımı": "AA Yapısal Tasarım Liderliği",
    "AA Prototip Kaynak ve Metot Takımı": "AA Yapısal Tasarım Liderliği",
    "AA Trim Tasarım Takımı": "AA Yapısal Tasarım Liderliği",
    "AA Ergonomi ve Endüstriyel Tasarım Takımı": "AA Yapısal Tasarım Liderliği",
    "AA 6x6 Platformlar Sistem Mühendisliği Takımı":
      "AA Sistem Mühendisliği Liderliği",
    "AA 8x8 Platformlar Sistem Mühendisliği Takımı":
      "AA Sistem Mühendisliği Liderliği",
  };
  let data = await read();
  await apply(
    data.teams
      .filter((team) => !team.lead && unassigned[team.name])
      .map((team) => ({
        kind: "team",
        id: team.id,
        value: { ...team, lead: unassigned[team.name] },
        revision: data.revisions["team:" + team.id] || 0,
      })),
  );

  // Fictional people: unique first/last name combinations.
  const first =
    "Ahmet Ayşe Mehmet Elif Can Zeynep Burak Selin Emre Deniz Gizem Okan Merve Kerem Ece Tolga Pınar Murat Esra Serkan Derya Barış Sevgi Onur Hande Volkan Ceren Umut İrem Kaan Buse Arda Gökçe Hakan Nazlı Cem Tuba Eren Damla Berk Sibel Oğuz Aslı Mert Yasemin Taner Özge Alper Nur Sinan Ebru Yiğit Melis Levent Gül Koray Seda Batuhan Duygu Erdem Canan Furkan Şule İlker Begüm".split(
      " ",
    );
  const last =
    "Yılmaz Kaya Demir Şahin Çelik Yıldız Yıldırım Öztürk Aydın Özdemir Arslan Doğan Kılıç Aslan Çetin Kara Koç Kurt Özkan Şimşek Polat Korkmaz Karaca Ünal Erdem Güneş Aksoy Bulut Tekin Bozkurt Turan Keskin Acar Uçar Sarı Tan Ateş Coşkun Güler Başaran Eren Taş Akın Duman Avcı Soylu Öz Uysal Altun Kalkan".split(
      " ",
    );
  const usedNames = new Set();
  const personName = () => {
    for (;;) {
      const name = pick(first) + " " + pick(last);
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
  };

  data = await read();
  const units = new Map(
    Object.entries(data.leadershipUnits || {}).map(([leader, id]) => [
      id,
      leader,
    ]),
  );
  const workTeams = data.teams.filter((team) => team.kind !== "leadership");
  const discipline = (team) => {
    const lead = team.lead;
    if (lead === "AA Sistem Mühendisliği Liderliği") return "SYS";
    if (lead === "AA Yapısal Tasarım Liderliği") return "STR";
    if (lead === "AA Elektrik Elektronik Sistemler Tasarım Liderliği")
      return "EE";
    if (lead === "AA Alt Sistemler Tasarım Liderliği") return "SUB";
    if (lead === "AA Ürün Teknik Yönetimi Liderliği") return "PTY";
    return "PM";
  };
  const resources = [];
  let rid = 0;
  const person = (team, role, status, start, extra = {}) => {
    const id = "d-r-" + String(++rid).padStart(3, "0");
    const resource = {
      id,
      name: personName(),
      note: "",
      versions: [
        {
          effective: start.slice(0, 7),
          start,
          end: extra.end || "",
          team: team.id,
          lead: team.lead || "",
          status,
          // Vacancies stay out of capacity until an admin turns on
          // "Aktif İlanları Dahil Et".
          included: !status.endsWith("İlan"),
          amount: 1,
          assignmentRole: role,
        },
      ],
    };
    resources.push(resource);
    return resource;
  };
  const leaders = {};
  for (const team of data.teams.filter((t) => t.kind === "leadership"))
    leaders[units.get(team.id)] = person(
      team,
      "leader",
      "Aktif Çalışan",
      "2019-0" + (1 + Math.floor(rand() * 9)) + "-01",
    );
  const owners = {};
  const members = {};
  for (const team of workTeams) {
    const size =
      { SYS: 5, STR: 6, EE: 6, SUB: 5, PTY: 4, PM: 3 }[discipline(team)] +
      Math.floor(rand() * 3) -
      1;
    owners[team.id] = person(
      team,
      "productOwner",
      "Aktif Çalışan",
      "2020-02-01",
    );
    members[team.id] = [];
    const memberRole = /CoE/.test(team.name) ? "coe" : "member";
    for (let i = 0; i < size; i++) {
      const r = rand();
      const status =
        r < 0.08
          ? "Gear Up"
          : r < 0.13
            ? "SAAT Ücretli Ofis Ç."
            : "Aktif Çalışan";
      const start =
        r > 0.9
          ? "2026-0" + (3 + Math.floor(rand() * 5)) + "-01"
          : 2018 +
            Math.floor(rand() * 8) +
            "-" +
            String(1 + Math.floor(rand() * 12)).padStart(2, "0") +
            "-01";
      members[team.id].push(person(team, memberRole, status, start));
    }
  }
  // Two departures and open positions in the most loaded disciplines.
  const departed = [members[workTeams[5].id][0], members[workTeams[17].id][1]];
  for (const r of departed) r.versions[0].end = "2026-06-30";
  const postingTeams = workTeams
    .filter((t) => ["STR", "EE", "SYS"].includes(discipline(t)))
    .slice(0, 9);
  postingTeams.forEach((team, i) =>
    person(
      team,
      "member",
      "Aktif İlan",
      monthAdd(i < 5 ? "2026-07" : "2026-11", i % 4) + "-01",
    ),
  );
  postingTeams
    .slice(0, 2)
    .forEach((team) => person(team, "member", "Pasif İlan", "2026-05-01"));
  await apply(
    resources.map((value) => ({
      kind: "resource",
      id: value.id,
      value,
      revision: 0,
    })),
  );

  // Leadership managers (shown in reports and planning headers). Leaderships
  // stay independent; none is placed under another.
  for (const leader of Object.keys(leaders)) {
    await store.mutate(actor, (d, u, c, generation) =>
      applyLeaderChange(
        d,
        u,
        {
          action: "update",
          name: leader,
          managerName: leaders[leader].name,
          catalogRevision: directoryRevision(d),
        },
        c,
        generation,
      ),
    );
  }

  // ---------------------------------------------------------------- Accounts
  const password = await hashPassword(DEMO_PASSWORD);
  const accounts = [];
  const account = (username, resource, role, leadersOf, planningTeams = []) =>
    accounts.push({
      _id: "demo-" + username.replace(/\W/g, "-"),
      username,
      name: resource.name,
      role,
      resourceId: resource.id,
      leaders: leadersOf,
      planningTeams,
      active: true,
      password,
      version: 1,
      revision: 1,
    });
  account("genel.mudur", leaders[TOP], "manager", Object.keys(leaders));
  const slug = {
    "AA Sistem Mühendisliği Liderliği": "lider.sistem",
    "AA Yapısal Tasarım Liderliği": "lider.yapisal",
    "AA Elektrik Elektronik Sistemler Tasarım Liderliği": "lider.ee",
    "AA Alt Sistemler Tasarım Liderliği": "lider.altsistem",
    "AA Ürün Teknik Yönetimi Liderliği": "lider.urunteknik",
    "AA Mühendislik Proje Yönetimi Takımı": "lider.projeyonetimi",
  };
  for (const [leader, username] of Object.entries(slug))
    account(username, leaders[leader], "manager", [leader]);
  const byName = (name) => workTeams.find((t) => t.name === name);
  const poTeams = [
    ["po.govde", "AA 6x6 / 8x8 Gövde Geliştirme Takımı"],
    ["po.gomulu", "AA Gömülü Yazılımlar Takımı"],
    ["po.gucpaketi", "AA Güç Paketi Geliştirme Takımı"],
  ];
  for (const [username, name] of poTeams)
    account(
      username,
      owners[byName(name).id],
      "manager",
      [],
      [byName(name).id],
    );
  const employees = [
    ["muhendis.detay", "AA Detay Tasarım Takımı"],
    ["muhendis.yazilim", "AA Uygulama Yazılımları Takımı"],
    ["muhendis.entegrasyon", "AA Entegrasyon Sistem Müh Takımı"],
  ];
  for (const [username, name] of employees) {
    const team = byName(name);
    account(username, members[team.id][1], "normal", [team.lead]);
  }
  for (const user of accounts) await store.bootstrapUser(user);

  // ---------------------------------------------------------------- Projects
  const P = {
    concept: ["Konsept Tasarım", "blue"],
    pdr: ["Ön Tasarım (PDR)", "purple"],
    cdr: ["Detay Tasarım (CDR)", "green"],
    proto: ["Prototip Üretimi", "amber"],
    qual: ["Kalifikasyon Testleri", "red"],
    serial: ["Seri Üretim Desteği", "gray"],
    feas: ["Fizibilite ve Gereksinim", "blue"],
    demo: ["Demonstratör Geliştirme", "amber"],
    adapt: ["Müşteri Uyarlama Tasarımı", "green"],
    accept: ["Müşteri Kabul Testleri", "red"],
    deliver: ["Teslimat ve Garanti", "gray"],
  };
  const definitions = [
    {
      code: "AA-801",
      name: "KARTAL 8x8 Zırhlı Personel Taşıyıcı",
      start: "2024-07",
      phases: [
        ["concept", 5],
        ["pdr", 6],
        ["cdr", 9],
        ["proto", 8],
        ["qual", 10],
        ["serial", 14],
      ],
      disciplines: ["SYS", "STR", "EE", "SUB", "PTY"],
      scale: 1.25,
      platform: /8x8|6x6\/8x8|Gövde|Zırh/,
    },
    {
      code: "AA-602",
      name: "ŞAHİN 6x6 Taktik Tekerlekli Araç",
      start: "2025-03",
      phases: [
        ["concept", 4],
        ["pdr", 6],
        ["cdr", 10],
        ["proto", 8],
        ["qual", 9],
      ],
      disciplines: ["SYS", "STR", "EE", "SUB"],
      scale: 1.1,
      platform: /6x6|Gövde|Şasi/,
    },
    {
      code: "AA-410",
      name: "POYRAZ 4x4 Hafif Taktik Araç Yenileme",
      start: "2025-09",
      phases: [
        ["concept", 4],
        ["pdr", 5],
        ["cdr", 8],
        ["proto", 7],
        ["qual", 8],
      ],
      disciplines: ["SYS", "STR", "EE", "SUB", "PTY"],
      scale: 1.0,
      platform: /4x4/,
    },
    {
      code: "AA-PL1",
      name: "BOZKURT Paletli Piyade Muharebe Aracı",
      start: "2025-01",
      phases: [
        ["pdr", 7],
        ["cdr", 12],
        ["proto", 10],
        ["qual", 12],
      ],
      disciplines: ["SYS", "STR", "EE", "SUB"],
      scale: 1.3,
      platform: /Paletli|Kule|Güç Paketi/,
    },
    {
      code: "AA-K30",
      name: "YILDIRIM 30 mm Uzaktan Komutalı Kule",
      start: "2025-06",
      phases: [
        ["pdr", 5],
        ["cdr", 8],
        ["proto", 6],
        ["qual", 8],
        ["serial", 10],
      ],
      disciplines: ["SYS", "EE", "SUB", "STR"],
      scale: 0.9,
      platform: /Kule/,
    },
    {
      code: "AA-T105",
      name: "TOROS Orta Sınıf Tank Kule Entegrasyonu",
      start: "2026-02",
      phases: [
        ["concept", 5],
        ["pdr", 7],
        ["cdr", 10],
        ["proto", 8],
      ],
      disciplines: ["SYS", "STR", "EE", "SUB"],
      scale: 1.0,
      platform: /Kule|Paletli|Hidrolik/,
    },
    {
      code: "AA-EV4",
      name: "MERCAN Elektrikli 4x4 Demonstratörü",
      start: "2026-01",
      phases: [
        ["feas", 6],
        ["demo", 10],
        ["qual", 6],
      ],
      disciplines: ["SYS", "EE", "SUB"],
      scale: 0.7,
      platform: /Güç Paketi|Elektronik|4x4|Donanım/,
    },
    {
      code: "AA-MR6",
      name: "ATMACA Mayına Karşı Korumalı Araç (MRAP)",
      start: "2024-03",
      phases: [
        ["cdr", 6],
        ["proto", 7],
        ["qual", 9],
        ["serial", 18],
      ],
      disciplines: ["STR", "SUB", "PTY", "SYS"],
      scale: 0.9,
      platform: /Zırh|6x6|Beka|Yaşam/,
    },
    {
      code: "AA-KK2",
      name: "KUZGUN Komuta Kontrol Aracı Türevi",
      start: "2026-04",
      phases: [
        ["adapt", 8],
        ["proto", 5],
        ["accept", 5],
      ],
      disciplines: ["EE", "SYS", "PTY"],
      scale: 0.8,
      platform: /Yazılım|Entegre|Elektronik|Entegrasyon/,
    },
    {
      code: "AA-AMF",
      name: "SEYHAN Amfibi Araç Konsept Çalışması",
      start: "2026-06",
      phases: [
        ["feas", 8],
        ["concept", 8],
      ],
      disciplines: ["SYS", "STR"],
      scale: 0.6,
      platform: /Hidrolik|Gövde|Ergonomi/,
    },
    {
      code: "AA-AMB",
      name: "ÇAĞLAR Zırhlı Ambulans Türevi",
      start: "2025-11",
      phases: [
        ["adapt", 6],
        ["proto", 5],
        ["accept", 4],
        ["deliver", 8],
      ],
      disciplines: ["STR", "SUB", "PTY"],
      scale: 0.6,
      platform: /Yaşam|Trim|Ergonomi|Detay/,
    },
    {
      code: "AA-EXP",
      name: "EFE İhracat Uyarlaması (Körfez Müşterisi)",
      start: "2025-10",
      phases: [
        ["adapt", 7],
        ["proto", 4],
        ["accept", 5],
        ["deliver", 10],
      ],
      disciplines: ["SYS", "STR", "EE", "PTY"],
      scale: 1.05,
      platform: /6x6|8x8|Dokümantasyon|Konfigürasyon/,
    },
    {
      code: "AA-PWR",
      name: "DEMİR Yerli Güç Paketi Entegrasyonu",
      start: "2025-05",
      phases: [
        ["pdr", 6],
        ["cdr", 8],
        ["proto", 7],
        ["qual", 9],
      ],
      disciplines: ["SUB", "EE", "SYS"],
      scale: 0.9,
      platform: /Güç Paketi|Şasi|Mekanik/,
    },
    {
      code: "AA-OTN",
      name: "ANKA Otonom Sürüş Yetenek Geliştirme",
      start: "2026-03",
      phases: [
        ["feas", 6],
        ["demo", 12],
        ["qual", 6],
      ],
      disciplines: ["SYS", "EE"],
      scale: 0.75,
      platform: /Yazılım|Elektronik|Gömülü|Uygulama/,
      restricted: true,
    },
    {
      code: "AA-MOD",
      name: "KALE Filo Modernizasyon Programı",
      start: "2025-01",
      phases: [
        ["adapt", 9],
        ["serial", 30],
      ],
      disciplines: ["PTY", "STR", "SUB", "EE"],
      scale: 0.8,
      platform: /Dokümantasyon|Lojistik|Konfigürasyon|Detay|PLM/,
    },
  ];
  const allLeaders = Object.keys(leaders);
  const projects = definitions.map((def, index) => {
    const phases = {},
      phaseColors = {},
      plan = [];
    let month = def.start;
    for (const [key, length] of def.phases)
      for (let i = 0; i < length; i++) {
        const [label, color] = P[key];
        phases[month] = label;
        phaseColors[month] = color;
        plan.push([month, key]);
        month = monthAdd(month, 1);
      }
    const end = monthAdd(month, -1);
    return {
      def,
      plan,
      value: {
        id: "d-p-" + String(index + 1).padStart(2, "0"),
        name: def.name,
        code: def.code,
        responsibleName: pick(Object.values(owners)).name,
        sortOrder: index,
        start: def.start,
        end,
        phases,
        phaseColors,
        milestones: [],
        ...(def.restricted
          ? {
              access: {
                roles: ["manager"],
                leaders: [
                  "AA Sistem Mühendisliği Liderliği",
                  "AA Elektrik Elektronik Sistemler Tasarım Liderliği",
                ],
                teams: [],
                people: [],
              },
            }
          : {}),
      },
    };
  });

  // Detail headers, notes and milestones. Only open, current items feed the
  // critical report; completed history stays on the timeline.
  const NOW = "2026-10";
  const WINDOW = ["2025-10", "2027-12"];
  const critical = [
    "Zırh çeliği tedarikinde 6 haftalık gecikme riski; alternatif tedarikçi değerlendiriliyor.",
    "Kule entegrasyonu sonrası ağırlık bütçesi 240 kg aşıldı; optimizasyon çalışması başlatıldı.",
    "Atış testleri için poligon tarihi kesinleşmedi; müşteri onayı bekleniyor.",
    "Araç elektrik mimarisi yazılım sürümü v2.3 iki sprint gecikmede.",
    "Soğutma sistemi 52 °C ortam testinde hedefin %8 üzerinde; radyatör revizyonu gerekli.",
    "Müşteri teknik şartnamesinde 14 madde güncellendi; maliyet ve takvim etki analizi sürüyor.",
    "Prototip montaj hattında kapasite darboğazı; ikinci vardiya için onay bekleniyor.",
    "EMC testlerinde iki alt sistemde emisyon limiti aşımı tespit edildi.",
    "Kritik mühendis ihtiyacı: 3 pozisyon için ilan açık, işe alım takvimi CDR'yi etkileyebilir.",
    "Güç paketi tedarikçisinden teslim tarihi 2 ay ötelendi; geçici çözüm araştırılıyor.",
    "Mayın patlama testinde koltuk sistemi ivme limitine yakın; ek doğrulama testi planlandı.",
    "İhracat lisansı başvurusu değerlendirmede; teslimat planı lisansa bağlı.",
  ];
  const routine = [
    "Tasarım gözden geçirme toplantısı tamamlandı; aksiyonlar takip ediliyor.",
    "Tedarikçi kalifikasyon denetimi tamamlandı.",
    "Teknik veri paketi müşteriye teslim edildi.",
    "Simülasyon sonuçları hedef değerleri karşılıyor.",
    "Kullanıcı katılımlı ergonomi değerlendirmesi yapıldı.",
    "Malzeme listesi (BOM) PLM sistemine aktarıldı.",
    "Alt sistem arayüz kontrol dokümanları imzalandı.",
  ];
  const supply = [
    "Uzun teslim süreli parçalar için sipariş verildi.",
    "Yerli tedarikçi oranı %68'e yükseldi.",
    "İki kritik parça için ikinci kaynak geliştirme çalışması sürüyor.",
  ];
  const gateName = {
    pdr: "PDR kararı",
    cdr: "CDR kararı",
    qual: "Kalifikasyon onayı",
    accept: "Müşteri kabulü",
    demo: "Demonstrasyon günü",
  };
  const milestoneColor = {
    pdr: "purple",
    cdr: "green",
    proto: "amber",
    qual: "red",
    serial: "gray",
    adapt: "green",
    accept: "red",
    deliver: "gray",
    feas: "blue",
    demo: "amber",
    concept: "blue",
  };
  // About a third of past notes are marked done; the rest stay as history.
  let pastNotes = 0;
  const note = (text, month, day, includeInReport) => ({
    text,
    includeInReport,
    ...(month < NOW && pastNotes++ % 3 === 0 ? { completed: true } : {}),
    start: month + "-" + day,
    end: month + "-" + String(Number(day) + 10).padStart(2, "0"),
  });
  let criticalIndex = 0;
  projects.forEach((p, index) => {
    const headers = [];
    const segments = [];
    for (const [month, key] of p.plan) {
      const last = segments.at(-1);
      if (last && last.key === key) last.to = month;
      else segments.push({ key, from: month, to: month });
    }
    const visible = segments
      .filter((g) => g.to >= WINDOW[0] && g.from <= WINDOW[1])
      .slice(0, 3);
    visible.forEach((g, i) => {
      const months = monthRange(
        g.from < WINDOW[0] ? WINDOW[0] : g.from,
        g.to > WINDOW[1] ? WINDOW[1] : g.to,
      );
      const firstMonth = months[0],
        midMonth = months[Math.floor(months.length / 2)];
      const open = midMonth >= "2026-06";
      const isCritical = open && (index + i) % 2 === 0;
      const notes = [
        {
          ...note(
            routine[(index + i) % routine.length],
            firstMonth,
            "03",
            false,
          ),
        },
        {
          ...note(
            isCritical
              ? critical[criticalIndex++ % critical.length]
              : routine[(index + i + 3) % routine.length],
            midMonth,
            "08",
            isCritical,
          ),
        },
      ];
      if (isCritical) delete notes[1].completed;
      const ranges = [];
      if (gateName[g.key]) {
        const done = g.to < NOW;
        ranges.push({
          displayKind: "milestone",
          diamondStyle: done ? "solid" : "outline",
          start: g.to + "-20",
          end: g.to + "-20",
          color: done ? "green" : "red",
          notes: [
            {
              text: gateName[g.key] + (done ? " alındı" : " bekleniyor"),
              includeInReport: !done && index % 3 === 0,
            },
          ],
        });
      }
      headers.push({
        id: "m-" + g.key,
        name: P[g.key][0],
        start:
          g.from + "-01" < p.value.start + "-01"
            ? p.value.start + "-01"
            : g.from + "-01",
        end: lastDay(g.to),
        barColor: milestoneColor[g.key],
        barStyle: "solid",
        barNotes: notes,
        ...(ranges.length ? { additionalRanges: ranges } : {}),
      });
    });
    // Cross-cutting header: supply chain, inside the project and 2026.
    const supplyFrom = p.value.start > "2026-01" ? p.value.start : "2026-01";
    const supplyTo = p.value.end < "2026-12" ? p.value.end : "2026-12";
    if (supplyFrom <= supplyTo) {
      const sm = monthRange(supplyFrom, supplyTo);
      const late = sm[Math.max(0, sm.length - 3)];
      const supplyCritical = index % 3 === 1 && late >= "2026-06";
      const n2 = note(
        supplyCritical
          ? critical[criticalIndex++ % critical.length]
          : supply[(index + 2) % supply.length],
        late,
        "12",
        supplyCritical,
      );
      if (supplyCritical) delete n2.completed;
      headers.push({
        id: "m-tedarik",
        name: "Tedarik Zinciri ve Kritik Parçalar",
        start: supplyFrom + "-01",
        end: lastDay(supplyTo),
        barColor: "gray",
        barStyle: "striped",
        barNotes: [note(supply[index % supply.length], sm[0], "10", false), n2],
      });
    }
    // Quarterly customer reviews as milestones.
    const reviews = [
      "2026-01",
      "2026-04",
      "2026-07",
      "2026-10",
      "2027-01",
      "2027-04",
    ].filter((m) => m >= p.value.start && m <= p.value.end);
    if (reviews.length >= 2) {
      const [head, ...rest] = reviews;
      headers.push({
        id: "m-musteri",
        name: "Müşteri Gözden Geçirmeleri",
        start: head + "-24",
        end: head + "-24",
        displayKind: "milestone",
        diamondStyle: head < NOW ? "solid" : "outline",
        barColor: "blue",
        barNotes: [
          {
            text: "Çeyrek dönem ilerleme toplantısı",
            includeInReport: false,
            ...(head < NOW ? { completed: true } : {}),
          },
        ],
        additionalRanges: rest.map((m) => ({
          displayKind: "milestone",
          diamondStyle: m < NOW ? "solid" : "outline",
          start: m + "-24",
          end: m + "-24",
          color: "blue",
          notes: [
            {
              text: "Çeyrek dönem ilerleme toplantısı",
              includeInReport: false,
              ...(m < NOW ? { completed: true } : {}),
            },
          ],
        })),
      });
    }
    p.value.milestones = headers;
  });
  await apply(
    projects.map((p) => ({
      kind: "project",
      id: p.value.id,
      value: p.value,
      revision: 0,
    })),
  );

  // ---------------------------------------------------------------- Calendar
  const holidays = {
    "2026-01-01": "Yılbaşı",
    "2026-03-19": "Ramazan Bayramı Arifesi",
    "2026-03-20": "Ramazan Bayramı",
    "2026-03-21": "Ramazan Bayramı",
    "2026-03-22": "Ramazan Bayramı",
    "2026-04-23": "Ulusal Egemenlik ve Çocuk Bayramı",
    "2026-05-01": "Emek ve Dayanışma Günü",
    "2026-05-19": "Gençlik ve Spor Bayramı",
    "2026-05-26": "Kurban Bayramı Arifesi",
    "2026-05-27": "Kurban Bayramı",
    "2026-05-28": "Kurban Bayramı",
    "2026-05-29": "Kurban Bayramı",
    "2026-05-30": "Kurban Bayramı",
    "2026-07-15": "Demokrasi ve Milli Birlik Günü",
    "2026-08-30": "Zafer Bayramı",
    "2026-10-28": "Cumhuriyet Bayramı Arifesi",
    "2026-10-29": "Cumhuriyet Bayramı",
    "2027-01-01": "Yılbaşı",
    "2027-04-23": "Ulusal Egemenlik ve Çocuk Bayramı",
    "2027-05-01": "Emek ve Dayanışma Günü",
    "2027-05-19": "Gençlik ve Spor Bayramı",
  };
  const calendar = Object.fromEntries(
    Object.entries(holidays).map(([day, label]) => [
      day,
      { type: "official", label, fraction: /Arifesi/.test(label) ? 0.5 : 1 },
    ]),
  );
  data = await read();
  await apply([
    {
      kind: "calendar",
      id: "shared",
      value: calendar,
      revision: data.revisions["calendar:shared"] || 0,
    },
  ]);

  // Personal leave and training days for a subset of people.
  const workers = resources.filter(
    (r) => r.versions[0].status !== "Aktif İlan",
  );
  const personDays = [];
  for (const r of workers.filter(() => rand() < 0.35)) {
    const month = monthRange("2026-02", "2026-09")[Math.floor(rand() * 8)];
    const day = String(10 + Math.floor(rand() * 14)).padStart(2, "0");
    const date = new Date(month + "-" + day + "T00:00:00Z");
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const training = rand() < 0.4;
    personDays.push({
      kind: "personDay",
      id:
        r.id +
        "|" +
        month +
        "-" +
        day +
        "|" +
        (training ? "training" : "leave"),
      value: training
        ? {
            type: "training",
            hours: 9,
            label: pick([
              "Proje yönetimi eğitimi",
              "Sistem mühendisliği eğitimi",
              "İSG eğitimi",
            ]),
          }
        : { type: "leave", hours: 9, label: "Yıllık izin" },
      revision: 0,
    });
  }
  await apply(personDays);

  // ---------------------------------------------------------------- Planned allocations
  const weights = {
    concept: { SYS: 1.0, STR: 0.35, EE: 0.35, SUB: 0.3, PTY: 0.1, PM: 0.3 },
    feas: { SYS: 1.0, STR: 0.3, EE: 0.5, SUB: 0.4, PTY: 0.1, PM: 0.3 },
    pdr: { SYS: 1.0, STR: 0.8, EE: 0.75, SUB: 0.7, PTY: 0.3, PM: 0.3 },
    cdr: { SYS: 0.7, STR: 1.3, EE: 1.15, SUB: 1.05, PTY: 0.6, PM: 0.3 },
    adapt: { SYS: 0.6, STR: 1.0, EE: 0.9, SUB: 0.7, PTY: 0.7, PM: 0.3 },
    proto: { SYS: 0.5, STR: 1.0, EE: 0.85, SUB: 0.85, PTY: 0.8, PM: 0.3 },
    demo: { SYS: 0.8, STR: 0.4, EE: 1.2, SUB: 0.7, PTY: 0.3, PM: 0.3 },
    qual: { SYS: 0.85, STR: 0.5, EE: 0.75, SUB: 0.6, PTY: 0.7, PM: 0.3 },
    accept: { SYS: 0.7, STR: 0.5, EE: 0.6, SUB: 0.5, PTY: 0.8, PM: 0.3 },
    serial: { SYS: 0.2, STR: 0.3, EE: 0.3, SUB: 0.3, PTY: 0.9, PM: 0.2 },
    deliver: { SYS: 0.2, STR: 0.25, EE: 0.25, SUB: 0.25, PTY: 0.8, PM: 0.2 },
  };
  const planMonths = monthRange("2026-01", "2027-12");
  const allocations = {};
  const pmTeam = workTeams.find(
    (t) => t.name === "AA Mühendislik Proje Yönetimi Takımı",
  );
  const used = new Map();
  const fill = (p, team, d) => {
    const teamFactor = between(0.75, 1.25);
    for (const [month, key] of p.plan) {
      if (!planMonths.includes(month)) continue;
      const v = quarter(
        weights[key][d] * p.def.scale * teamFactor * between(0.85, 1.15),
      );
      if (v > 0) allocations[team.id + "|" + p.value.id + "|" + month] = v;
    }
  };
  for (const p of projects) {
    const involved = [];
    for (const d of p.def.disciplines) {
      const pool = workTeams.filter((t) => discipline(t) === d);
      const relevant = pool.filter((t) => p.def.platform.test(t.name));
      const others = pool.filter((t) => !relevant.includes(t));
      const chosen = [...relevant.slice(0, 3)];
      while (chosen.length < 3 && others.length)
        chosen.push(others.splice(Math.floor(rand() * others.length), 1)[0]);
      involved.push(...chosen.map((t) => [t, d]));
    }
    if (pmTeam) involved.push([pmTeam, "PM"]);
    p.involved = involved;
    for (const [team, d] of involved) {
      used.set(team.id, (used.get(team.id) || 0) + 1);
      const teamFactor = between(0.75, 1.25);
      for (const [month, key] of p.plan) {
        if (!planMonths.includes(month)) continue;
        const v = quarter(
          weights[key][d] * p.def.scale * teamFactor * between(0.85, 1.15),
        );
        if (v > 0) allocations[team.id + "|" + p.value.id + "|" + month] = v;
      }
    }
  }
  for (const team of workTeams) {
    const d = discipline(team);
    let count = used.get(team.id) || 0;
    const candidates = projects.filter(
      (p) => p.def.disciplines.includes(d) || d === "PM",
    );
    while (count < 2 && candidates.length) {
      fill(
        candidates.splice(Math.floor(rand() * candidates.length), 1)[0],
        team,
        d === "PM" ? "PM" : d,
      );
      count++;
    }
  }
  // Scale each team to a deliberate load: most teams near full, the teams with
  // open positions short of capacity (the hiring story), a few with spare room.
  data = await read();
  const capacityOf = (teamId, month) =>
    data.resources.filter((r) => {
      const v = r.versions[0];
      return (
        v.team === teamId &&
        ["Aktif Çalışan", "Gear Up", "SAAT Ücretli Ofis Ç."].includes(
          v.status,
        ) &&
        v.start.slice(0, 7) <= month &&
        (!v.end || v.end.slice(0, 7) >= month)
      );
    }).length;
  const shortageTeams = new Set(postingTeams.map((t) => t.id));
  const year = monthRange("2026-01", "2026-12");
  for (const team of workTeams) {
    const keys = Object.keys(allocations).filter((k) =>
      k.startsWith(team.id + "|"),
    );
    if (!keys.length) continue;
    const loads = year
      .map((month) => {
        const plan = keys
          .filter((k) => k.endsWith("|" + month))
          .reduce((s, k) => s + allocations[k], 0);
        const cap = capacityOf(team.id, month);
        return plan && cap ? plan / cap : 0;
      })
      .filter(Boolean);
    if (!loads.length) continue;
    const average = loads.reduce((a, b) => a + b, 0) / loads.length;
    const r = rand();
    const target = shortageTeams.has(team.id)
      ? between(1.18, 1.35)
      : r < 0.1
        ? between(0.72, 0.82)
        : r < 0.35
          ? between(1.05, 1.15)
          : between(0.95, 1.05);
    for (const key of keys) {
      const value = quarter(allocations[key] * (target / average));
      if (value > 0) allocations[key] = value;
      else delete allocations[key];
    }
  }
  await apply(
    Object.entries(allocations).map(([id, value]) => ({
      kind: "allocation",
      id,
      value,
      revision: 0,
    })),
  );

  // ---------------------------------------------------------------- Actuals (Jan–Oct 2026)
  data = await read();
  const index = createActualMonthIndex(data);
  const actualMonths = monthRange("2026-01", "2026-10");
  const actualChanges = [];
  for (const r of data.resources) {
    const v = r.versions[0];
    if (
      !["Aktif Çalışan", "Gear Up", "SAAT Ücretli Ofis Ç."].includes(v.status)
    )
      continue;
    const role = v.assignmentRole;
    for (const month of actualMonths) {
      if (v.start.slice(0, 7) > month || (v.end && v.end.slice(0, 7) < month))
        continue;
      const ownTeams =
        role === "leader"
          ? new Set(workTeams.filter((t) => t.lead === v.lead).map((t) => t.id))
          : new Set([v.team]);
      const byProject = new Map();
      for (const [key, value] of Object.entries(allocations)) {
        const [team, project, m] = key.split("|");
        if (m === month && ownTeams.has(team))
          byProject.set(project, (byProject.get(project) || 0) + value);
      }
      const shares = [...byProject];
      if (!shares.length) continue;
      const summary = index.get(r.id, month);
      const room = summary.capacityFte - summary.trainingFte - 0.03;
      const utilisation =
        (role === "leader"
          ? 0.35
          : role === "productOwner"
            ? 0.65
            : between(0.78, 0.95)) * (month === "2026-10" ? 0.45 : 1);
      const total = Math.min(room, utilisation);
      if (total <= 0.05) continue;
      const sum = shares.reduce((s, [, value]) => s + value, 0);
      const top = shares
        .sort((a, b) => b[1] - a[1])
        .slice(0, role === "member" || role === "coe" ? 3 : 4);
      const topSum = top.reduce((s, [, value]) => s + value, 0) || sum;
      for (const [project, value] of top) {
        const fte = Math.floor(((total * value) / topSum) * 100) / 100;
        if (fte >= 0.05)
          actualChanges.push({
            kind: "actual",
            id: r.id + "|" + project + "|" + month,
            value: fte,
            revision: 0,
          });
      }
    }
  }
  for (let i = 0; i < actualChanges.length; i += 3000)
    await apply(actualChanges.slice(i, i + 3000));

  // ---------------------------------------------------------------- Summary
  data = await read();
  const loads = [];
  for (const team of workTeams)
    for (const month of monthRange("2026-01", "2026-12")) {
      const cap = capacityOf(team.id, month);
      const plan = Object.entries(data.allocations)
        .filter(([k]) => k.startsWith(team.id + "|") && k.endsWith("|" + month))
        .reduce((s, [, x]) => s + x, 0);
      if (plan) loads.push(plan - cap);
    }
  console.log(
    JSON.stringify(
      {
        dosya: file,
        takim: workTeams.length,
        calisan: data.resources.filter(
          (r) => r.versions[0].status !== "Aktif İlan",
        ).length,
        ilan: data.resources.filter(
          (r) => r.versions[0].status === "Aktif İlan",
        ).length,
        proje: data.projects.length,
        planlananKayit: Object.keys(data.allocations).length,
        gerceklesenKayit: Object.keys(data.actualAllocations || {}).length,
        eksikTakimAy2026: loads.filter((x) => x > 0).length,
        bosTakimAy2026: loads.filter((x) => x < 0).length,
        hesaplar: accounts.map((a) => a.username),
      },
      null,
      1,
    ),
  );
} finally {
  await store.close();
}
