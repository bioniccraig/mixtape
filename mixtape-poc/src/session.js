// Shared per-browser-session id, used to group analytics events.
// Generate (or reuse) a session UUID stored in sessionStorage so multiple
// events from the same browser session are linked together in analytics.
export function getSessionId() {
  const key = 'mixtape_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}
