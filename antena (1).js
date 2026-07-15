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
        socket.sala = nombreSala; // NUEVO: guardamos la sala directamente en el socket (más fiable que derivarla de socket.rooms más adelante)
        socket.join(nombreSala);

        let rol;
        if (!salas[nombreSala]) {
            salas[nombreSala] = { hostId: socket.id, usuarios: {}, ultimoEstado: null };
            rol = 'host';
        } else {
            rol = 'guest';
        }
        socket.emit('asignar_rol', { rol });

        // NUEVO: sincronización inmediata al entrar. Si ya había reproducción en curso,
        // se le manda al que acaba de entrar el último estado conocido de una sola vez,
        // sin depender de esperar al próximo "tick" periódico del líder.
        if (rol === 'guest' && salas[nombreSala].ultimoEstado) {
            socket.emit('estado_host', salas[nombreSala].ultimoEstado);
        }

        // NUEVO: lista de usuarios conectados en tiempo real (evento 'lista_usuarios' que
        // ya espera el content.js). Se avisa a los demás que alguien entró, y se manda la
        // lista completa a todos para que quede sincronizada en todos los clientes.
        salas[nombreSala].usuarios[socket.id] = { nombre: socket.nombre || 'Alguien', rol };
        socket.to(nombreSala).emit('usuario_conectado', { nombre: socket.nombre || 'Alguien', rol });
        io.to(nombreSala).emit('lista_usuarios', Object.values(salas[nombreSala].usuarios));
    });

    socket.on('sync_continua', (data) => {
        const sala = socket.sala || Array.from(socket.rooms)[1];
        if (sala && salas[sala] && salas[sala].hostId === socket.id) {
            salas[sala].ultimoEstado = data; // NUEVO: se guarda para poder sincronizar de inmediato a quien entre después
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
        const sala = socket.sala;
        if (!sala || !salas[sala]) return;

        const nombreSaliente = socket.nombre || 'Alguien';
        delete salas[sala].usuarios[socket.id];

        if (salas[sala].hostId === socket.id) {
            // ANTES: se borraba toda la sala, y los invitados se quedaban sin líder y sin
            // controles para siempre (bug del "único líder" que dejaba de existir).
            // AHORA: se promueve a otro usuario conectado de la misma sala como nuevo líder.
            const idsRestantes = Object.keys(salas[sala].usuarios);
            if (idsRestantes.length > 0) {
                const nuevoHostId = idsRestantes[0];
                salas[sala].hostId = nuevoHostId;
                salas[sala].usuarios[nuevoHostId].rol = 'host';
                io.to(nuevoHostId).emit('asignar_rol', { rol: 'host' });
                io.to(sala).emit('recibir_mensaje', {
                    sistema: true,
                    remitente: 'Sistema',
                    texto: '👑 ' + salas[sala].usuarios[nuevoHostId].nombre + ' es ahora la líder.'
                });
            } else {
                delete salas[sala]; // sala vacía, no queda nadie a quien avisar
                return;
            }
        }

        io.to(sala).emit('usuario_desconectado', { nombre: nombreSaliente });
        if (salas[sala]) io.to(sala).emit('lista_usuarios', Object.values(salas[sala].usuarios));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor encendido en puerto ${PORT}`);
});
