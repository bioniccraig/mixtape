// useNotifications.js
// Loads the signed-in user's notifications and subscribes to new ones via Realtime.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export function useNotifications(user) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);

  // Initial load
  useEffect(() => {
    if (!user || !supabase) return;
    setLoading(true);
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        const items = data || [];
        setNotifications(items);
        setUnreadCount(items.filter(n => !n.read).length);
        setLoading(false);
      });
  }, [user?.id]); // eslint-disable-line

  // Realtime — new notification arrives
  useEffect(() => {
    if (!user || !supabase) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${user.id}`,
      }, ({ new: n }) => {
        setNotifications(prev => [n, ...prev]);
        setUnreadCount(c => c + 1);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id]); // eslint-disable-line

  // Mark all unread notifications as read
  const markAllRead = useCallback(async () => {
    if (!user || !supabase || unreadCount === 0) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, [user?.id, unreadCount]); // eslint-disable-line

  return { notifications, unreadCount, loading, markAllRead };
}
