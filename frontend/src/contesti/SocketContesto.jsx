// ============================================
// GymMaster — Contesto Socket.io
// Provider per connessione WebSocket globale
// ============================================

import { createContext, useContext, useEffect, useRef, useState } from 'react';
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

  const valore = {
    socket: socketRef.current,
    connesso,
    emit: (evento, dati, callback) => {
      socketRef.current?.emit(evento, dati, callback);
    },
    on: (evento, handler) => {
      socketRef.current?.on(evento, handler);
      return () => socketRef.current?.off(evento, handler);
    }
  };

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
