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

// Memoria volátil para controlar quién es el Líder
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
        socket.join(nombreSala);

        // Si la sala no existe o está vacía, el primero en llegar es el Líder
        if (!salas[nombreSala]) {
            salas[nombreSala] = { hostId: socket.id };
            socket.emit('asignar_rol', { rol: 'host' });
            console.log(`👑 ${data.nombre} es ahora el Líder de la sala: ${nombreSala}`);
        } else {
            // Si ya hay líder, automáticamente es invitado, sin importar su nombre
            socket.emit('asignar_rol', { rol: 'guest' });
            console.log(`👥 ${data.nombre} entró como invitado a: ${nombreSala}`);
        }
    });

    // SISTEMA DE REPRODUCCIÓN (No se toca)
    socket.on('sync_continua', (data) => {
        // Obtenemos en qué sala está este socket
        const sala = Array.from(socket.rooms)[1]; 
        if (sala && salas[sala] && salas[sala].hostId === socket.id) {
            socket.to(sala).emit('estado_host', data);
        }
    });

    socket.on('enviar_mensaje', (data) => {
        io.to(data.sala).emit('recibir_mensaje', { 
            remitente: data.texto.split(':')[1] || "Usuario", 
            texto: data.texto 
        });
    });

    // ==========================================
    // FASE 3 (V3): INTERACCIONES CON FIREBASE
    // ==========================================

    // 1. Procesar Monkeyabacho
    socket.on('v3_enviar_abacho', (data) => {
        // Rebotar la señal a la otra persona para que vibre su celular
        io.to(data.sala).emit('v3_recibir_abacho', { de: data.de });
        
        // Sumar +1 al contador histórico en Firebase
        const contadorRef = ref(db, 'estadisticas/total_abachos');
        runTransaction(contadorRef, (actual) => {
            return (actual || 0) + 1;
        });
        console.log(`🫂 Monkeyabacho registrado de ${data.de}`);
    });

    // 2. Guardar Momento
    socket.on('v3_guardar_momento', (data) => {
        const momentosRef = ref(db, 'momentos_guardados');
        const nuevoMomentoRef = push(momentosRef); // Crea un ID único automático
        set(nuevoMomentoRef, data).then(() => {
            console.log(`📸 Momento guardado exitosamente: ${data.pelicula}`);
        }).catch(err => console.error("Error guardando momento:", err));
    });

    // 3. Registrar Fin de Película/Capítulo
    socket.on('v3_fin_pelicula', (data) => {
        // Guardar en el historial completo
        const historialRef = ref(db, 'historial_vistas');
        push(historialRef, {
            ...data,
            fecha: new Date().toISOString()
        });

        // Sumar +1 al contador de películas
        const pelisRef = ref(db, 'estadisticas/total_peliculas');
        runTransaction(pelisRef, (actual) => {
            return (actual || 0) + 1;
        });
        console.log(`🏁 Película terminada registrada: ${data.pelicula}`);
    });

    // ==========================================
    // 4. LIMPIEZA AL DESCONECTAR
    // ==========================================
    socket.on('disconnect', () => {
        console.log('❌ Usuario desconectado:', socket.id);
        // Si el que se desconectó era el Líder, eliminamos la sala de la memoria 
        // para que la próxima persona en refrescar la página pueda ser Líder.
        for (const sala in salas) {
            if (salas[sala].hostId === socket.id) {
                delete salas[sala];
                console.log(`🧹 La sala ${sala} se ha quedado sin líder y fue reseteada.`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Monkeycine V3 encendido en el puerto ${PORT}`);
});
