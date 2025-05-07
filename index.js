const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Add more detailed CORS configuration
const corsOptions = {
      origin: function (origin, callback) {
            // Allow any origin
            callback(null, true);
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
};

app.use(cors(corsOptions));

// Add CORS headers to all responses
app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
});

const server = http.createServer(app);
const io = new Server(server, {
      cors: {
            origin: '*', // In production, you'd want to restrict this
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: false,
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true, // Allow Engine.IO version 3 client
      pingTimeout: 60000, // Increase ping timeout
});

// Store active game rooms with their state
const gameRooms = new Map();

// Game states
const GAME_STATES = {
      WAITING: 'waiting', // Waiting for second player
      STARTED: 'started', // Game started, players placing ships
      PLAYING: 'playing', // Both players ready, game in progress
      ENDED: 'ended', // Game ended
};

// Handle socket connections
io.on('connection', (socket) => {
      console.log(`User connected: ${socket.id}`);
      console.log('Connection details:', {
            headers: socket.handshake.headers,
            address: socket.handshake.address,
            time: new Date().toISOString(),
      });

      // Host creates a new game
      socket.on('create-game', (gameCode) => {
            console.log(`Host created game: ${gameCode}`);
            console.log('Game creation details:', {
                  socketId: socket.id,
                  gameCode,
                  time: new Date().toISOString(),
            });

            // Create a new game room with all necessary properties
            gameRooms.set(gameCode, {
                  hostId: socket.id,
                  clientId: null,
                  status: 'waiting',
                  state: GAME_STATES.WAITING,
                  createdAt: new Date(),
                  hostDisconnected: false,
                  clientDisconnected: false,
                  readyPlayers: [],
            });

            // Join the socket to the game room
            socket.join(gameCode);

            // Confirm game creation to the host
            socket.emit('game-created', { gameCode });

            // Log the current state of all game rooms
            console.log('Current game rooms after creation:', [...gameRooms.entries()]);
      });

      // Client joins an existing game
      socket.on('join-game', (gameCode) => {
            console.log(`Client attempting to join game: ${gameCode}`);
            console.log('Join game details:', {
                  socketId: socket.id,
                  gameCode,
                  time: new Date().toISOString(),
            });

            const gameRoom = gameRooms.get(gameCode);

            if (!gameRoom) {
                  // Game doesn't exist
                  socket.emit('error', { message: 'Game not found' });
                  return;
            }

            // Log all current game rooms for debugging
            console.log('Current game rooms:', [...gameRooms.entries()]);

            // Check if this is a reconnection
            const isReconnectingClient = gameRoom.clientId && gameRoom.clientDisconnected;
            const isReconnectingHost = gameRoom.hostId && gameRoom.hostDisconnected;

            // If the client is reconnecting, update their socket ID
            if (isReconnectingClient) {
                  console.log(`Client ${socket.id} is reconnecting to game ${gameCode}`);
                  gameRoom.clientId = socket.id;
                  gameRoom.clientDisconnected = false;
            }
            // If the host is reconnecting, update their socket ID
            else if (isReconnectingHost) {
                  console.log(`Host ${socket.id} is reconnecting to game ${gameCode}`);
                  gameRoom.hostId = socket.id;
                  gameRoom.hostDisconnected = false;
            }
            // If this is a new client joining
            else if (gameRoom.status === 'waiting') {
                  console.log(`New client ${socket.id} is joining game ${gameCode}`);
                  // Update the game room
                  gameRoom.clientId = socket.id;
                  gameRoom.status = 'ready';
            } else {
                  // Game already has two players and this is not a reconnection
                  socket.emit('error', { message: 'Game is full or already started' });
                  return;
            }

            // Join the client to the game room
            socket.join(gameCode);

            // Notify the client that they've joined the game
            socket.emit('game-joined', { gameCode });

            // Notify both players that the game is ready
            io.to(gameCode).emit('game-ready', { gameCode });

            // If the game is already in the STARTED state, immediately send the start_game event to the client
            if (gameRoom.state === GAME_STATES.STARTED) {
                  console.log(`Game ${gameCode} already started, sending start_game event to new client`);
                  socket.emit('start_game');
            }

            // If the game is already in the PLAYING state, immediately send the battle_start event to the client
            if (gameRoom.state === GAME_STATES.PLAYING) {
                  console.log(`Game ${gameCode} already in battle, sending battle_start event to new client`);
                  socket.emit('battle_start');
            }
      });

      // Handle game data exchange
      socket.on('game-data', (data) => {
            const { gameCode, ...gameData } = data;

            console.log('Received game data:', data);

            // Special handling for start_game event
            if (gameData.type === 'start_game') {
                  console.log('Received start_game event, broadcasting to room:', gameCode);

                  // Update the game state
                  const gameRoom = gameRooms.get(gameCode);
                  if (gameRoom) {
                        gameRoom.state = GAME_STATES.STARTED;
                        console.log(`Game ${gameCode} state updated to: ${gameRoom.state}`);
                  }

                  // Broadcast the start_game event to all clients in the room
                  io.to(gameCode).emit('start_game');
                  return;
            }

            // Special handling for ready_to_battle event
            if (gameData.type === 'ready_to_battle') {
                  console.log('Received ready_to_battle event from:', socket.id);

                  // Update the game room to track which players are ready
                  const gameRoom = gameRooms.get(gameCode);
                  if (gameRoom) {
                        // Initialize the readyPlayers array if it doesn't exist
                        if (!gameRoom.readyPlayers) {
                              gameRoom.readyPlayers = [];
                        }

                        // Add this player to the ready players if not already there
                        if (!gameRoom.readyPlayers.includes(socket.id)) {
                              gameRoom.readyPlayers.push(socket.id);
                        }

                        console.log(
                              `Game ${gameCode} ready players: ${gameRoom.readyPlayers.length}/${gameRoom.clientId ? 2 : 1}`
                        );

                        // If both players are ready, update the game state and notify all players
                        if (gameRoom.readyPlayers.length === 2) {
                              gameRoom.state = GAME_STATES.PLAYING;
                              console.log(`Game ${gameCode} state updated to: ${gameRoom.state}`);

                              // Broadcast the battle_start event to all clients in the room
                              io.to(gameCode).emit('battle_start');
                        }
                  }

                  return;
            }

            // Forward the game data to all players in the room except the sender
            socket.to(gameCode).emit('game-data', gameData);
      });

      // Handle player disconnection
      socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);

            // Find any game rooms where this socket is a player
            for (const [gameCode, room] of gameRooms.entries()) {
                  if (room.hostId === socket.id || room.clientId === socket.id) {
                        // Notify the other player that their opponent disconnected
                        socket.to(gameCode).emit('opponent-disconnected');

                        // Instead of immediately removing the game room, mark the player as disconnected
                        // This allows them to reconnect within a certain time window
                        if (room.hostId === socket.id) {
                              room.hostDisconnected = true;
                              console.log(`Host disconnected from game ${gameCode}`);
                        } else if (room.clientId === socket.id) {
                              room.clientDisconnected = true;
                              console.log(`Client disconnected from game ${gameCode}`);
                        }

                        // If both players are disconnected, or if it's been more than 5 minutes since creation,
                        // then remove the game room
                        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                        if (
                              (room.hostDisconnected && room.clientDisconnected) ||
                              (room.createdAt && room.createdAt < fiveMinutesAgo)
                        ) {
                              gameRooms.delete(gameCode);
                              console.log(`Game ${gameCode} ended due to player disconnection`);
                        } else {
                              // Log the current state of the game room
                              console.log(`Game ${gameCode} waiting for reconnection:`, {
                                    hostId: room.hostId,
                                    clientId: room.clientId,
                                    hostDisconnected: room.hostDisconnected,
                                    clientDisconnected: room.clientDisconnected,
                                    state: room.state,
                              });
                        }
                  }
            }
      });

      // Handle heartbeats to keep the connection alive
      socket.on('heartbeat', () => {
            socket.emit('heartbeat-ack');
      });
});

// Health check endpoint
app.get('/', (_, res) => {
      res.send('Battleship Game Server is running');
});

// Serve the test HTML file
app.get('/test', (_, res) => {
      res.sendFile(__dirname + '/test.html');
});

// Serve the CORS test HTML file
app.get('/test-cors', (_, res) => {
      res.sendFile(__dirname + '/test-cors.html');
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
});
