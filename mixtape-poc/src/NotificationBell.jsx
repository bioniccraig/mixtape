// NotificationBell.jsx
// Bell icon with unread badge + dropdown list of notifications.
// Shown in the header for signed-in users.

import { useState, useRef, useEffect } from 'react';
import { useNotifications } from './useNotifications';

function timeAgo(iso) {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const TYPE_ICON = { like: '❤️', comment: '💬', play: '▶' };

export default function NotificationBell({ user, onOpenTape }) {
  const { notifications, unreadCount, loading, markAllRead } = useNotifications(user);
  const [open, setOpen] = useState(false);
  const ref  = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle() {
    if (!open && unreadCount > 0) markAllRead();
    setOpen(v => !v);
  }

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        className="notif-bell-btn"
        onClick={toggle}
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        🔔
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Notifications</span>
          </div>

          {loading && <p className="notif-empty">Loading…</p>}

          {!loading && notifications.length === 0 && (
            <p className="notif-empty">Nothing yet — share a tape to get started!</p>
          )}

          <div className="notif-list">
            {notifications.map(n => (
              <div
                key={n.id}
                className={`notif-item ${n.read ? '' : 'notif-unread'}`}
                onClick={() => {
                  if (n.tape_id && onOpenTape) onOpenTape(n.tape_id);
                  setOpen(false);
                }}
                style={{ cursor: n.tape_id ? 'pointer' : 'default' }}
              >
                <span className="notif-icon">{TYPE_ICON[n.type] || '🔔'}</span>
                <div className="notif-body">
                  <p className="notif-message">{n.message}</p>
                  {n.from_email && (
                    <p className="notif-from">{n.from_email.split('@')[0]}</p>
                  )}
                  <p className="notif-time">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
