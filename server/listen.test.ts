import { describe, expect, it } from 'vitest';
import { listenConfigFromEnvironment } from './listen.js';

describe('listenConfigFromEnvironment', () => {
  it('preserves the container-compatible defaults', () => {
    expect(listenConfigFromEnvironment({})).toEqual({
      port: 4100,
      address: '0.0.0.0',
    });
  });

  it('supports a loopback-only native deployment', () => {
    expect(
      listenConfigFromEnvironment({
        PORT: '4200',
        SENTINEL_LISTEN_ADDRESS: '127.0.0.1',
      }),
    ).toEqual({ port: 4200, address: '127.0.0.1' });
  });

  it.each(['0', '65536', 'abc', '4.1'])(
    'rejects invalid port %s',
    (port) => {
      expect(() => listenConfigFromEnvironment({ PORT: port })).toThrow(
        'PORT must be an integer between 1 and 65535',
      );
    },
  );

  it.each(['http://127.0.0.1', 'bad host', '10.0.0.1/path'])(
    'rejects invalid listen address %s',
    (address) => {
      expect(() =>
        listenConfigFromEnvironment({ SENTINEL_LISTEN_ADDRESS: address }),
      ).toThrow('SENTINEL_LISTEN_ADDRESS must be an IP address or hostname');
    },
  );
});
