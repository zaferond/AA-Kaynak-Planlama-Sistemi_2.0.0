import { ownValue } from "../shared/records.ts";
import { randomUUID } from "node:crypto";
import { entityCollections } from "../shared/entity-kinds.ts";
import { publicUser } from "./auth.mjs";
import { dataChanges, recordChanges } from "./change-set.mjs";

function fields(before, after, path = [], out = []) {
  if (JSON.stringify(before) === JSON.stringify(after)) return out;
  if (
    (before === undefined && after === "") ||
    (after === undefined && before === "")
  )
    return out;
  const object = (value) => value !== null && typeof value === "object";
  if (object(before) || object(after)) {
    for (const key of new Set([
      ...Object.keys(object(before) ? before : {}),
      ...Object.keys(object(after) ? after : {}),
    ])) {
      fields(ownValue(before, key), ownValue(after, key), [...path, key], out);
    }
  } else out.push({ path, before: before ?? null, after: after ?? null });
  return out;
}
const indexed = (items) =>
  Object.fromEntries((items || []).map((item) => [item.id, item]));
const sanitized = (kind, value) => {
  if (value === undefined) return undefined;
  if (kind === "resource") {
    const { note, ...rest } = value;
    return rest;
  }
  if (kind === "personDay") {
    const { label, ...rest } = value;
    return rest;
  }
  return value;
};
export function auditEntries(
  before,
  after,
  actor,
  {
    beforeUsers = [],
    afterUsers = [],
    changeSet = dataChanges(before, after),
  } = {},
) {
  const time = new Date().toISOString(),
    entries = [];
  const names = (collection) =>
    Object.fromEntries(
      [...(before[collection] || []), ...(after[collection] || [])].map(
        (item) => [item.id, item.name],
      ),
    );
  const resources = names("resources"),
    teams = names("teams"),
    projects = names("projects");
  const recordLabel = (kind, id, fallback) => {
    const [owner, projectOrDate, month] = id.split("|");
    if (kind === "allocation" || kind === "actual")
      return [
        ownValue(kind === "actual" ? resources : teams, owner) || owner,
        ownValue(projects, projectOrDate) || projectOrDate,
        month,
      ].join(" · ");
    if (kind === "workedHours" || kind === "personDay")
      return [ownValue(resources, owner) || owner, projectOrDate].join(" · ");
    return fallback;
  };
  const collect = (kind, records) => {
    for (const { id, before: previous, value } of records) {
      const old = sanitized(kind, previous),
        next = sanitized(kind, value);
      const changes = fields(old, next);
      if (!changes.length) continue;
      const name =
        next?.name || old?.name || next?.description || old?.description || id;
      entries.push({
        id: randomUUID(),
        occurred_at: time,
        actor_id: actor._id,
        actor_name: actor.name || actor._id,
        kind,
        record_id: id,
        record_name: String(recordLabel(kind, id, name)).slice(0, 300),
        action:
          old === undefined
            ? "create"
            : next === undefined
              ? "delete"
              : "update",
        changes: JSON.stringify(changes),
      });
    }
  };
  for (const kind of Object.keys(entityCollections))
    collect(kind, changeSet[kind]);
  for (const kind of ["workedHours", "calendar", "personDay", "leader"])
    collect(kind, changeSet[kind]);
  collect(
    "user",
    recordChanges(
      indexed(beforeUsers.map(publicUser)),
      indexed(afterUsers.map(publicUser)),
    ),
  );
  return entries;
}
