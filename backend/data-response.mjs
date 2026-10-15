import { gzip, constants } from "node:zlib";
import { promisify } from "node:util";

const compressGzip = promisify(gzip);
const minimumBytes = 32 * 1024;

// Only authenticated /api/data snapshots use this sender. Session/CSRF tokens,
// login, backup exports and write responses keep their existing response path.
export async function sendDataSnapshot(
  req,
  res,
  snapshot,
  { compress = compressGzip } = {},
) {
  if (res.destroyed || res.writableEnded) return;
  res.vary("Accept-Encoding");
  const encoding = req.acceptsEncodings("gzip", "identity");
  if (!encoding)
    return res
      .status(406)
      .json({ error: "Desteklenen yanıt biçimi bulunamadı." });
  if (encoding === "identity") return res.json(snapshot);

  // Match Express JSON settings so compression cannot change the representation.
  let json = JSON.stringify(
    snapshot,
    res.app.get("json replacer"),
    res.app.get("json spaces"),
  );
  if (res.app.get("json escape"))
    json = json.replace(/[<>&]/g, (character) =>
      character === "<" ? "\\u003c" : character === ">" ? "\\u003e" : "\\u0026",
    );
  const body = Buffer.from(json);
  const identityAllowed = !!req.acceptsEncodings("identity");
  if (body.length < minimumBytes && identityAllowed)
    return res.type("json").send(body);

  // Callback-based zlib runs asynchronously; do not block the event loop with
  // gzipSync or cache responses across users/generations.
  const compressed = await compress(body, { level: constants.Z_BEST_SPEED });
  if (res.destroyed || res.writableEnded) return;
  if (compressed.length >= body.length && identityAllowed)
    return res.type("json").send(body);
  res.set("Content-Encoding", "gzip");
  return res.type("json").send(compressed);
}
