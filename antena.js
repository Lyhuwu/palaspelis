const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Escudo protector: Intentamos cargar Firebase sin que rompa el servidor si algo falla
let db = null;
let ref, runTransaction, push, set;

try {
    const { initializeApp } = require('firebase/app');
    const fbDB = require('firebase/database');
    
    const firebaseConfig = {
        apiKey: "AIzaSyD5L51DKMU8ozgN8wTt9WATlgzjI7lQ2Ls",
        authDomain: "monkeycine.firebaseapp.com",
        projectId: "monkeycine",
        storageBucket: "monkeycine.firebasestorage.app",
        messagingSenderId: "134472914894",
        appId: "1:134472914894:web:df59027eb99b5c05207d9f"
    };

    const firebaseApp = initializeApp(firebaseConfig);
    db = fbDB.getDatabase(firebaseApp);
    ref = fbDB.ref;
    runTransaction = fbDB.runTransaction;
    push = fbDB.push;
    set = fbDB.set;
    console.log("✅ Firebase inicializado con éxito.");
} catch (err) {
    console.error("❌ Error al cargar Firebase:", err.message);
}

const salas = {};

// Aquí creamos el panel de diagnóstico
app.get('/', (req, res) => {
    const estadoFb = db ? "🟢 CONECTADO" : "🔴 ERROR AL CONECTAR FIREBASE";
    res.send(`📡 Antena Monkeycine V3 operando al 100% <br><br> Base de datos: ${estadoFb}`);
});

// ==========================================
// 3. LÓGICA DE SOCKETS Y BASE DE DATOS
// ==========================================
io.on('connection', (socket) => {
    console.log('🔗 Nuevo usuario conectado:', socket.id);

    socket.on('unirse_sala', (data) => {
        const nombreSala = data.sala;
        socket.nombre = data.nombre; 
        socket.join(nombreSala);

        if (!salas[nombreSala]) {
            salas[nombreSala] = { hostId: socket.id };
            socket.emit('asignar_rol', { rol: 'host' });
        } else {
            socket.emit('asignar_rol', { rol: 'guest' });
        }
    });

    socket.on('sync_continua', (data) => {
        const sala = Array.from(socket.rooms)[1]; 
        if (sala && salas[sala] && salas[sala].hostId === socket.id) {
            socket.to(sala).emit('estado_host', data);
        }
    });

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
        
        if (db) {
            const contadorRef = ref(db, 'estadisticas/total_abachos');
            runTransaction(contadorRef, (actual) => (actual || 0) + 1);
        }
    });

    socket.on('v3_guardar_momento', (data) => {
        if (db) {
            const momentosRef = ref(db, 'momentos_guardados');
            const nuevoMomentoRef = push(momentosRef); 
            set(nuevoMomentoRef, data).catch(err => console.error(err));
        }
    });

    socket.on('v3_fin_pelicula', (data) => {
        if (db) {
            const historialRef = ref(db, 'historial_vistas');
            push(historialRef, { ...data, fecha: new Date().toISOString() });
            const pelisRef = ref(db, 'estadisticas/total_peliculas');
            runTransaction(pelisRef, (actual) => (actual || 0) + 1);
        }
    });

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
    console.log(`🚀 Servidor encendido en puerto ${PORT}`);
});
