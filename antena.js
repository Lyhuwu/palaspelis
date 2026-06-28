const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, runTransaction, push, set } = require('firebase/database');

// ==========================================
// 1. CONFIGURACIÓN DE FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD5L51DKMU8ozgN8wTt9WATlgzjI7lQ2Ls",
    authDomain: "monkeycine.firebaseapp.com",
    projectId: "monkeycine",
    storageBucket: "monkeycine.firebasestorage.app",
    messagingSenderId: "134472914894",
    appId: "1:134472914894:web:df59027eb99b5c05207d9f"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ==========================================
// 2. INICIALIZACIÓN DEL SERVIDOR
// ==========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const salas = {};

app.get('/', (req, res) => {
    res.send('📡 Antena Monkeycine V3 operando al 100%');
});

// ==========================================
// 3. LÓGICA DE SOCKETS Y BASE DE DATOS
// ==========================================
io.on('connection', (socket) => {
    console.log('🔗 Nuevo usuario conectado:', socket.id);

    // UNIRSE A LA SALA Y BLINDAR EL ROL DE LÍDER
    socket.on('unirse_sala', (data) => {
        const nombreSala = data.sala;
        socket.nombre = data.nombre; // Guardamos tu nombre en la memoria del servidor
        socket.join(nombreSala);

        if (!salas[nombreSala]) {
            salas[nombreSala] = { hostId: socket.id };
            socket.emit('asignar_rol', { rol: 'host' });
            console.log(`👑 ${data.nombre} es ahora el Líder de la sala: ${nombreSala}`);
        } else {
            socket.emit('asignar_rol', { rol: 'guest' });
            console.log(`👥 ${data.nombre} entró como invitado a: ${nombreSala}`);
        }
    });

    socket.on('sync_continua', (data) => {
        const sala = Array.from(socket.rooms)[1]; 
        if (sala && salas[sala] && salas[sala].hostId === socket.id) {
            socket.to(sala).emit('estado_host', data);
        }
    });

    // SISTEMA DE MENSAJES SIN ECO (Usa broadcast)
    socket.on('enviar_mensaje', (data) => {
        socket.broadcast.to(data.sala).emit('recibir_mensaje', { 
            remitente: socket.nombre || "Alguien", 
            texto: data.texto 
        });
    });

    // ==========================================
    // FASE 3 (V3): INTERACCIONES CON FIREBASE
    // ==========================================

    socket.on('v3_enviar_abacho', (data) => {
        io.to(data.sala).emit('v3_recibir_abacho', { de: data.de });
        
        const contadorRef = ref(db, 'estadisticas/total_abachos');
        runTransaction(contadorRef, (actual) => {
            return (actual || 0) + 1;
        });
    });

    socket.on('v3_guardar_momento', (data) => {
        const momentosRef = ref(db, 'momentos_guardados');
        const nuevoMomentoRef = push(momentosRef); 
        set(nuevoMomentoRef, data).catch(err => console.error("Error guardando momento:", err));
    });

    socket.on('v3_fin_pelicula', (data) => {
        const historialRef = ref(db, 'historial_vistas');
        push(historialRef, {
            ...data,
            fecha: new Date().toISOString()
        });

        const pelisRef = ref(db, 'estadisticas/total_peliculas');
        runTransaction(pelisRef, (actual) => {
            return (actual || 0) + 1;
        });
    });

    // ==========================================
    // 4. LIMPIEZA AL DESCONECTAR
    // ==========================================
    socket.on('disconnect', () => {
        console.log('❌ Usuario desconectado:', socket.id);
        for (const sala in salas) {
            if (salas[sala].hostId === socket.id) {
                delete salas[sala];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Monkeycine V3 encendido en el puerto ${PORT}`);
});
