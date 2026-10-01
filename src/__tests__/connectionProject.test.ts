import { connectionProject, parseProjectRef, proxyConnection } from '../skyspark/connectionProject';

describe('proxyConnection', () => {
  it('reads the proxy session id and pinned project from _meta', () => {
    expect(proxyConnection({ 'mcp-proxy/sessionId': 's1', 'mcp-proxy/project': 'a/b' })).toEqual({
      sessionId: 's1',
      pinned: { instance: 'a', project: 'b' },
    });
    expect(proxyConnection({ 'mcp-proxy/sessionId': 's1' })).toEqual({ sessionId: 's1', pinned: null });
  });

  it('returns null without a proxy session id', () => {
    expect(proxyConnection(undefined)).toBeNull();
    expect(proxyConnection({ progressToken: 1 })).toBeNull();
    expect(proxyConnection({ 'mcp-proxy/sessionId': ' ' })).toBeNull();
  });
});

describe('parseProjectRef', () => {
  it('parses instance/project', () => {
    expect(parseProjectRef('calinos/calinos')).toEqual({ instance: 'calinos', project: 'calinos' });
    expect(parseProjectRef(' a / b ')).toEqual({ instance: 'a', project: 'b' });
  });

  it('takes the first value of a repeated header', () => {
    expect(parseProjectRef(['a/b', 'c/d'])).toEqual({ instance: 'a', project: 'b' });
  });

  it('rejects anything else', () => {
    for (const bad of [undefined, null, '', 'calinos', 'a/', '/b', 'a/b/c', 42]) {
      expect(parseProjectRef(bad)).toBeNull();
    }
  });
});

describe('connectionProject', () => {
  it('reads the x-axon-project header', () => {
    expect(connectionProject({ 'x-axon-project': 'a/b' })).toEqual({ instance: 'a', project: 'b' });
  });

  it('returns null without the header', () => {
    expect(connectionProject({})).toBeNull();
    expect(connectionProject(undefined)).toBeNull();
  });
});
