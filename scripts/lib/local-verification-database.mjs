// These runners create disposable clones. Never accept a remote/project URL,
// a normal application database, or libpq parameters that override the host.
export function localVerificationDatabase(value) {
  let source;
  try { source = new URL(value); } catch { throw new Error('LOCAL_VERIFICATION_DATABASE_REQUIRED'); }
  if (!['postgres:', 'postgresql:'].includes(source.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname)
      || !/^\/girlzculture_(?:[a-z_0-9]+)?(?:release|clean)$/.test(source.pathname)
      || source.search || source.hash) {
    throw new Error('LOCAL_VERIFICATION_DATABASE_REQUIRED');
  }
  return source;
}
