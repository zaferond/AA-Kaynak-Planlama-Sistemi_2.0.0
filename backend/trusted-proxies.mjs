import { isIP } from "node:net";

// Only explicit proxy addresses/subnets are trusted; never trust arbitrary
// forwarded headers or a hop count that changes with the network route.
export function trustedProxyAddresses(value = "") {
  if (!value.trim()) return [];
  const addresses = value.split(",").map((address) => address.trim());
  for (const address of addresses) {
    if (address === "loopback") continue;
    const [ip, prefix, ...extra] = address.split("/");
    const version = isIP(ip);
    if (
      !version ||
      extra.length ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (version === 4 ? 32 : 128)))
    ) {
      throw Error(
        "TRUST_PROXY yalnızca proxy IP adresleri, CIDR aralıkları veya loopback içerebilir.",
      );
    }
  }
  return addresses;
}
