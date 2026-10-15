import { isResponsibilityConflictCode } from "../../shared/resource-roles.ts";
import type { Change, ChangeKind, ChangeValues } from "../../shared/commands";
export type { Change, ChangeKind, ChangeValues } from "../../shared/commands";
import type { Data } from "./model";
import type { Principal } from "./access";
import type { ImportRow } from "./resource-import";
import { mergePlanningDelta } from "../../shared/planning-response.ts";
import { publishSessionChange, watchSessionChanges } from "./session-events.ts";
import {
  HttpTransport,
  RequestFailure,
  REQUEST_DEADLINES,
} from "./http-transport.ts";
import { WriteRecovery, WriteBlockedError } from "./write-recovery.ts";
export { RequestFailure, WriteBlockedError };
export const isUncertainWrite = (error: unknown) =>
  error instanceof WriteBlockedError ||
  (error instanceof RequestFailure && error.outcomeUnknown);
const transport = new HttpTransport();
const writeRecovery = new WriteRecovery();
export const observeWriteRecovery = writeRecovery.subscribe;
export const hasUncertainWrite = writeRecovery.pending;
let principal: Principal | null = null,
  csrf = "",
  generation = -1;
let writeTail: Promise<unknown> = Promise.resolve();
let sessionEpoch = 0;
let sessionContext = 0;
let sessionIdentity = "";
let latestView: { data: Data; generation: number; user?: Principal } | null =
  null;
export class StaleSessionError extends Error {
  constructor() {
    super("Oturum değişti. Verileri yenileyip tekrar deneyin.");
    this.name = "StaleSessionError";
  }
}
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
function clearSession() {
  sessionEpoch++;
  transport.cancelAll(new StaleSessionError());
  writeRecovery.reset();
  sessionContext++;
  principal = null;
  csrf = "";
  sessionIdentity = "";
  generation = -1;
  latestView = null;
  writeTail = Promise.resolve();
}
function expireSession() {
  const hadSession = !!principal || !!sessionIdentity;
  clearSession();
  if (hadSession) publishSessionChange();
  window.dispatchEvent(new Event("session-expired"));
}
function sessionChanged() {
  clearSession();
  window.dispatchEvent(new Event("session-changed"));
}
export const observeSessionChanges = () => watchSessionChanges(sessionChanged);
function acceptSessionIdentity(identity: string | null | undefined) {
  if (!identity) return; // Compatibility with an older server during rollout.
  if (sessionIdentity && identity !== sessionIdentity) {
    sessionChanged();
    throw new StaleSessionError();
  }
  sessionIdentity = identity;
}
export const currentUser = () =>
  principal ? structuredClone(principal) : null;
export function captureSessionGuard() {
  const context = sessionContext;
  return () => {
    if (context !== sessionContext) throw new StaleSessionError();
  };
}
async function api(path: string, body?: unknown) {
  const epoch = sessionEpoch;
  const businessWrite = body !== undefined && !path.startsWith("/auth/");
  if (businessWrite) writeRecovery.assert();
  let exchange;
  try {
    exchange = await transport.json(
      "/api" + path,
      {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers:
          body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "X-Requested-With": "KaynakPortal",
                "X-CSRF-Token": csrf,
              },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      body === undefined ? REQUEST_DEADLINES.read : REQUEST_DEADLINES.write,
      (response) => {
        if (epoch !== sessionEpoch) {
          void response.body?.cancel().catch(() => {});
          throw new StaleSessionError();
        }
        try {
          acceptSessionIdentity(response.headers?.get("X-Session-Identity"));
        } catch (error) {
          void response.body?.cancel().catch(() => {});
          throw error;
        }
      },
    );
  } catch (error) {
    if (epoch !== sessionEpoch) throw new StaleSessionError();
    if (businessWrite && isUncertainWrite(error)) writeRecovery.markUnknown();
    throw error;
  }
  const { response } = exchange;
  let { result } = exchange;
  if (epoch !== sessionEpoch) throw new StaleSessionError();
  acceptSessionIdentity(result.sessionIdentity);
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      expireSession();
    }
    throw new ApiError(
      result.error || "Sunucu hatası.",
      response.status,
      isResponsibilityConflictCode(result.code) ? result.code : undefined,
    );
  }
  if (result.responseMode === "planning-delta-v1") {
    if (latestView && result.generation <= latestView.generation)
      return { ...latestView };
    const data = latestView && mergePlanningDelta(latestView, result);
    if (!data) {
      try {
        return await api("/data");
      } catch (error) {
        if (epoch !== sessionEpoch || error instanceof StaleSessionError)
          throw new StaleSessionError();
        // The POST succeeded, but its fallback view could not be loaded. Do not
        // repeat the committed command or let already queued writes continue.
        writeRecovery.markUnknown();
        throw new RequestFailure(
          true,
          error instanceof RequestFailure && error.timedOut,
        );
      }
    }
    result = { data, generation: result.generation, user: result.user };
  }
  // Reads and writes can complete out of order. All consumers receive the newest
  // accepted view; an old response must never replace newer data or permissions.
  if (
    result.data &&
    typeof result.generation === "number" &&
    latestView &&
    result.generation < latestView.generation
  ) {
    return { ...result, ...latestView };
  }
  if (result.user) principal = result.user;
  if (result.csrf) csrf = result.csrf;
  if (result.generation !== undefined) generation = result.generation;
  if (result.data && typeof result.generation === "number") {
    latestView = {
      data: result.data,
      generation: result.generation,
      user: result.user,
    };
  }
  return result;
}
export async function login(
  username: string,
  password: string,
  remember = false,
) {
  clearSession();
  await api("/auth/login", {
    username: username.trim().toLowerCase(),
    password,
    remember,
  });
  publishSessionChange();
}
export async function resumeRemembered() {
  try {
    await api("/auth/me");
    return true;
  } catch (error) {
    if (
      error instanceof StaleSessionError ||
      (error instanceof ApiError && error.status === 401)
    )
      return false;
    throw error;
  }
}
export async function logout() {
  sessionEpoch++;
  transport.cancelAll(new StaleSessionError());
  latestView = null;
  generation = -1;
  await api("/auth/logout", {});
  clearSession();
  publishSessionChange();
}
export async function readLocal(): Promise<Data> {
  return (await api("/data")).data;
}
export type ActivityReportSnapshot = {
  teams: import("./model").Team[];
  leaders: string[];
  leaderParents: Record<string, string>;
  rows: import("../../shared/activity-report").ActivityRow[];
};
export async function readActivityReport(
  start: string,
  count: number,
  projects: string[],
): Promise<ActivityReportSnapshot> {
  return api(
    "/activity-report?" +
      new URLSearchParams({
        start,
        count: String(count),
        projects: JSON.stringify(projects),
      }),
  );
}
export async function checkUpdates() {
  const epoch = sessionEpoch;
  try {
    const { response, result: r } = await transport.json(
      "/api/version",
      { credentials: "same-origin" },
      REQUEST_DEADLINES.version,
      (response) => {
        if (epoch !== sessionEpoch) {
          void response.body?.cancel().catch(() => {});
          throw new StaleSessionError();
        }
        try {
          acceptSessionIdentity(response.headers?.get("X-Session-Identity"));
        } catch (error) {
          if (error instanceof StaleSessionError) {
            void response.body?.cancel().catch(() => {});
            throw error;
          }
          throw error;
        }
      },
    );
    if (response.status === 401) {
      expireSession();
      return false;
    }
    if (!response.ok) return false;
    if (epoch !== sessionEpoch) return false;
    try {
      acceptSessionIdentity(r.sessionIdentity);
    } catch (error) {
      if (error instanceof StaleSessionError) return false;
      throw error;
    }
    return epoch === sessionEpoch && r.generation > generation;
  } catch (error) {
    if (error instanceof StaleSessionError) return false;
    throw error;
  }
}
export async function writeBatch(changes: Change[]): Promise<Data> {
  // Choose the base when the queued request starts, after the preceding response.
  // Other edits and older servers keep the complete snapshot response contract.
  const epoch = sessionEpoch;
  const writeEpoch = writeRecovery.capture();
  const request = writeTail.then(() => {
    if (epoch !== sessionEpoch) throw new StaleSessionError();
    writeRecovery.assert(writeEpoch);
    const response =
      latestView?.user &&
      changes.length > 0 &&
      changes.every((change) => change.kind === "allocation")
        ? {
            responseMode: "planning-delta-v1",
            baseGeneration: latestView.generation,
          }
        : {};
    return api("/changes", { changes, ...response });
  });
  writeTail = request.then(
    () => undefined,
    () => undefined,
  );
  return (await request).data;
}

export async function writeEmployeeRecord(
  changes: Change[],
  permission: import("../../shared/employee-account").EmployeePermission,
): Promise<Data> {
  const epoch = sessionEpoch,
    writeEpoch = writeRecovery.capture();
  const request = writeTail.then(() => {
    if (epoch !== sessionEpoch) throw new StaleSessionError();
    writeRecovery.assert(writeEpoch);
    return api("/employees/save", { changes, permission });
  });
  writeTail = request.then(
    () => undefined,
    () => undefined,
  );
  return (await request).data;
}

export async function inspectUncertainWrite() {
  const assertSession = captureSessionGuard();
  const epoch = writeRecovery.capture();
  const data = await readLocal();
  assertSession();
  return { data, check: writeRecovery.checkedAt(epoch) };
}
export const acknowledgeUncertainWrite = (check: object) =>
  writeRecovery.acknowledge(check);
export async function writeLocal<K extends ChangeKind>(
  kind: K,
  id: string,
  value: ChangeValues[K] | null,
  revision: number,
) {
  return writeBatch([{ kind, id, value, revision }]);
}
export async function changeLeader(input: {
  action: "create" | "rename" | "update" | "delete";
  name: string;
  newName?: string;
  managerName?: string;
  parentName?: string;
  generation?: number;
  catalogRevision?: number;
}): Promise<Data> {
  return (
    await api("/leaders/change", {
      ...input,
      generation: input.generation ?? generation,
    })
  ).data;
}
export const currentGeneration = () => generation;
export async function resetAllocations(d: Data): Promise<Data> {
  return (
    await api("/allocations/reset", {
      revisions: Object.fromEntries(
        Object.entries(d.revisions).filter(([k]) =>
          k.startsWith("allocation:"),
        ),
      ),
    })
  ).data;
}
export type UserInput = {
  id: string;
  role: "admin" | "manager" | "normal";
  leaders: string[];
  planningTeams?: string[];
  resourceId: string;
  revision: number;
  reactivate?: boolean;
};
export async function saveUser(input: UserInput): Promise<Data> {
  return (await api("/users", input)).data;
}
export async function revokeUser(
  input: Pick<UserInput, "id" | "revision">,
): Promise<Data> {
  return (await api("/users/revoke", input)).data;
}
export type CreateUserInput = {
  directoryId: string;
  role: "admin" | "manager" | "normal";
  leaders: string[];
  planningTeams?: string[];
  resourceId: string;
};
export async function createUser(input: CreateUserInput): Promise<Data> {
  return (await api("/users/create", input)).data;
}
export async function directoryUsers(
  query = "",
): Promise<import("../../shared/directory-identity").DirectoryUsers> {
  return api("/directory/users?q=" + encodeURIComponent(query));
}
export async function importResources(
  rows: ImportRow[],
): Promise<{ data: Data; imported: number; skipped: number }> {
  return api("/resources/import", { rows });
}
export async function exportBackup() {
  const result = await api("/backup");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "aa-planlama-veri-yedegi-" +
    new Date().toISOString().slice(0, 10) +
    ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function restoreBackup(file: File, _includeUsers = false) {
  const assertSession = captureSessionGuard();
  if (file.size > 20 * 1024 * 1024)
    throw Error("Yedek en fazla 20 MB olabilir.");
  const input = JSON.parse(await file.text());
  assertSession();
  if (input.format === "kaynak-planlama-encrypted-v1")
    throw Error(
      "Eski şifreli yedeği önce kılavuzdaki convert-legacy komutuyla dönüştürün.",
    );
  if (input.format !== "aa-planning-data-v1")
    throw Error("Geçerli bir veri yedeği seçin.");
  return api("/restore", { data: input.data, generation });
}

export async function readAuditLog(
  offset = 0,
  limit = 30,
): Promise<import("../../shared/audit-types").AuditPage> {
  return api("/audit?offset=" + offset + "&limit=" + limit);
}

export type ActualViewSnapshot = {
  data: Data;
  monthSummaries: Record<
    string,
    import("../../shared/actual-months").ActualMonthSummary
  >;
};
export async function readActualView(
  start: string,
  count: number,
): Promise<ActualViewSnapshot> {
  return api(
    "/actual-view?" + new URLSearchParams({ start, count: String(count) }),
  );
}
