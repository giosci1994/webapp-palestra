// ============================================
// GymMaster — Contesto Socket.io
// Provider per connessione WebSocket globale
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
      // Disconnetti se l'utente esce
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnesso(false);
      }
      return;
    }

    const token = ottieniToken();
    if (!token) return;

    // Connessione Socket.io
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

  // Stabili fra un render e l'altro: chi le mette fra le dipendenze di un
  // effetto non si riscrive a ogni render
  const emit = useCallback((evento, dati, callback) => {
    socketRef.current?.emit(evento, dati, callback);
  }, []);

  // Cambia quando cambia la connessione, non a ogni render: chi si iscrive in
  // un effetto che dipende da `on` (la campanella, la sidebar) si iscrive di
  // nuovo quando il socket si collega, anche se al primo render non c'era.
  // La pulizia toglie l'handler dal socket su cui e' stato messo, anche se nel
  // frattempo ne e' nato un altro (nuovo login).
  const on = useCallback((evento, handler) => {
    const socket = socketRef.current;
    socket?.on(evento, handler);
    return () => socket?.off(evento, handler);
  }, [connesso]); // eslint-disable-line react-hooks/exhaustive-deps -- vedi sopra

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

export default SocketContesto;
