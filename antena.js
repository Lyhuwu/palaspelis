const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Estructura: { nombreSala: { host: socketId, usuarios: Map(socketId -> nombre) } }
const salas = {};

io.on('connection', (socket) => {
    let miSala = null;
    let miNombre = '';

    socket.on('unirse_sala', (data) => {
        const { sala, nombre } = data;
        miSala = sala;
        miNombre = nombre;
        socket.join(sala);

        if (!salas[sala]) {
            salas[sala] = { host: socket.id, usuarios: new Map() };
        }
        salas[sala].usuarios.set(socket.id, nombre);

        const esHost = salas[sala].host === socket.id;
        socket.emit('asignar_rol', { rol: esHost ? 'host' : 'guest' });

        io.to(sala).emit('recibir_mensaje', {
            texto: `✨ ${nombre} acaba de entrar a la sala ✨`,
            sistema: true
        });
    });

    // Sincronización continua enviada por el Host
    socket.on('sync_continua', (estado) => {
        if (salas[miSala] && salas[miSala].host === socket.id) {
            // Retransmitimos el estado exacto del host a todos los guests en la sala
            socket.to(miSala).emit('estado_host', estado);
        }
    });

    // Chat
    socket.on('enviar_mensaje', (data) => {
        socket.to(data.sala).emit('recibir_mensaje', {
            texto: data.texto,
            remitente: miNombre
        });
    });

    socket.on('disconnect', () => {
        if (!miSala || !salas[miSala]) return;

        salas[miSala].usuarios.delete(socket.id);

        io.to(miSala).emit('recibir_mensaje', {
            texto: `❌ ${miNombre} se ha desconectado.`,
            sistema: true
        });

        // Lógica de reasignación de Host si el Host se fue
        if (salas[miSala].host === socket.id) {
            if (salas[miSala].usuarios.size > 0) {
                const nuevoHostId = Array.from(salas[miSala].usuarios.keys())[0];
                salas[miSala].host = nuevoHostId;
                const nombreNuevoHost = salas[miSala].usuarios.get(nuevoHostId);
                
                io.to(nuevoHostId).emit('asignar_rol', { rol: 'host' });
                io.to(miSala).emit('recibir_mensaje', {
                    texto: `👑 ${nombreNuevoHost} es el nuevo Host de la sala.`,
                    sistema: true
                });
            } else {
                delete salas[miSala]; // Destruir sala si está vacía
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Antena Cine Sync encendida en el puerto ${PORT}`);
});
