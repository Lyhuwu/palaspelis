const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require("socket.io");

const io = new Server(http, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
  console.log('¡Cine Sync conectado a la antena!');

  socket.on('unirse_sala', (nombreSala) => {
    socket.join(nombreSala);
    console.log(`Alguien entró a la sala: ${nombreSala}`);
  });

  socket.on('enviar_mensaje', (data) => {
    socket.to(data.sala).emit('recibir_mensaje', data.texto);
  });

  socket.on('accion_video', (data) => {
    socket.to(data.sala).emit('ejecutar_accion', data.accion);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de Cine Sync funcionando al 100%`);
});
