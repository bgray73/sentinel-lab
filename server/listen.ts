export type ListenConfig = {
  port: number;
  address: string;
};

export function listenConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ListenConfig {
  const rawPort = environment.PORT?.trim() || '4100';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const address = environment.SENTINEL_LISTEN_ADDRESS?.trim() || '0.0.0.0';
  if (address.length > 253 || /[\s/]/.test(address) || address.includes('://')) {
    throw new Error('SENTINEL_LISTEN_ADDRESS must be an IP address or hostname');
  }

  return { port, address };
}
