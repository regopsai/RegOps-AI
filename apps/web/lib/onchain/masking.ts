export function maskWalletAddress(address: string): string {
  if (!address || address.length < 8) {
    return "****";
  }
  const start = address.slice(0, 4);
  const end = address.slice(-4);
  return `${start}...${end}`;
}
