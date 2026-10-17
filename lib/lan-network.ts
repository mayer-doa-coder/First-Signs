import { networkInterfaces } from "node:os";

export function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function lanIpv4Addresses() {
  const candidates: Array<{ address: string; score: number }> = [];

  for (const [interfaceName, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal || !isPrivateIpv4(address.address)) continue;

      const normalizedName = interfaceName.toLowerCase();
      const isPhysical = /wi-?fi|wlan|wireless|ethernet/.test(normalizedName);
      const isVirtual = /virtual|vethernet|wsl|docker|vpn|tailscale|loopback/.test(normalizedName);
      const rangeScore = address.address.startsWith("192.168.")
        ? 30
        : address.address.startsWith("10.")
          ? 20
          : 10;

      candidates.push({
        address: address.address,
        score: rangeScore + (isPhysical ? 100 : 0) - (isVirtual ? 100 : 0),
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.address);
}
