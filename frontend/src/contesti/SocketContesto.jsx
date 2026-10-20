// ============================================
// GymMaster — Socket.io context
// Provider for the global WebSocket connection
// ============================================

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContesto.jsx';
import { ottieniToken } from '../config/api.js';

const SocketContesto = createContext(null);

export function SocketProvider({ children }) {
  const { autenticato } = useAuth();
  const [connesso, setConnesso] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!autenticato) {
      // Disconnect if the user logs out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnesso(false);
      }
      return;
    }

    const token = ottieniToken();
    if (!token) return;

    // Socket.io connection
    const socket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    socket.on('connect', () => {
      setConnesso(true);
      console.log('🔌 Socket.io connesso');
    });

    socket.on('disconnect', () => {
      setConnesso(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket.io errore:', err.message);
      setConnesso(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [autenticato]);

  // Stable across renders: whoever puts them in an effect's dependencies
  // does not re-run that effect on every render
  const emit = useCallback((evento, dati, callback) => {
    socketRef.current?.emit(evento, dati, callback);
  }, []);

  // Changes when the connection changes, not on every render: whoever
  // subscribes in an effect that depends on `on` (the notification bell, the
  // sidebar) subscribes again when the socket connects, even if it was not
  // there on the first render. The cleanup removes the handler from the
  // socket it was added to, even if another one was created in the meantime
  // (new login).
  const on = useCallback((evento, handler) => {
    const socket = socketRef.current;
    socket?.on(evento, handler);
    return () => socket?.off(evento, handler);
  }, [connesso]); // eslint-disable-line react-hooks/exhaustive-deps -- see above

  const valore = useMemo(() => ({ connesso, emit, on }), [connesso, emit, on]);

  return (
    <SocketContesto.Provider value={valore}>
      {children}
    </SocketContesto.Provider>
  );
}

export function useSocket() {
  const contesto = useContext(SocketContesto);
  if (!contesto) {
    throw new Error('useSocket deve essere usato dentro SocketProvider');
  }
  return contesto;
}
