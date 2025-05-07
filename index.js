const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Configure Socket.io with CORS
const io = new Server(server, {
      cors: {
            origin: '*',
            methods: ['GET', 'POST'],
      },
});

// Game room map: gameCode -> room data
const gameRooms = new Map();

// Game states
const GAME_STATES = {
      SETUP: 'SETUP',
      PLACEMENT: 'PLACEMENT',
      BATTLE: 'BATTLE',
      FINISHED: 'FINISHED',
};

// Root route for testing
app.get('/', (req, res) => {
      res.send('Battleship Socket Server is running!');
});

// Socket.io connection handler
io.on('connection', (socket) => {
      console.log('New client connected:', socket.id);

      // Handle create-game event
      socket.on('create-game', (gameCode) => {
            console.log(`Client ${socket.id} is creating game: ${gameCode}`);

            // Check if game already exists
            if (gameRooms.has(gameCode)) {
                  socket.emit('error', { message: 'Game code already in use' });
                  return;
            }

            // Create a new game room
            const gameRoom = {
                  clients: {},
                  clientOrder: [],
                  state: GAME_STATES.SETUP,
                  currentTurnIndex: 0,
            };

            // Add the game room to the map
            gameRooms.set(gameCode, gameRoom);

            // Join the socket to the game room
            socket.join(gameCode);

            // Notify the client
            socket.emit('game-created', { gameCode });

            console.log(`Game ${gameCode} created by ${socket.id}`);
      });

      // Handle join-game event
      socket.on('join-game', (gameCode) => {
            console.log(`Client ${socket.id} is joining game: ${gameCode}`);

            // Check if game exists
            if (!gameRooms.has(gameCode)) {
                  socket.emit('error', { message: 'Game not found' });
                  return;
            }

            const gameRoom = gameRooms.get(gameCode);

            // Check if game is joinable
            if (gameRoom.state !== GAME_STATES.SETUP) {
                  socket.emit('error', { message: 'Game already in progress' });
                  return;
            }

            // Join the socket to the game room
            socket.join(gameCode);

            // Notify the client
            socket.emit('game-joined', { gameCode });

            // Notify all clients in the room that a new player has joined
            io.to(gameCode).emit('client-joined', { clientId: socket.id });

            console.log(`Client ${socket.id} joined game ${gameCode}`);
      });

      // Handle game-data event
      socket.on('game-data', (data) => {
            const { gameCode } = data;

            // Check if game exists
            if (!gameRooms.has(gameCode)) {
                  socket.emit('error', { message: 'Game not found' });
                  return;
            }

            const gameRoom = gameRooms.get(gameCode);

            // Special handling for client_info event
            if (data.type === 'client_info') {
                  const { clientId, isHost } = data;
                  
                  // Add or update client in the game room
                  gameRoom.clients[clientId] = {
                        id: clientId,
                        socketId: socket.id,
                        isHost,
                        ready: false,
                  };
                  
                  // Add to client order if not already there
                  if (!gameRoom.clientOrder.includes(clientId)) {
                        gameRoom.clientOrder.push(clientId);
                  }
                  
                  // Broadcast client info to all clients in the room
                  socket.to(gameCode).emit('game-data', data);
                  
                  // If this is the first client and they're the host, update game state
                  if (Object.keys(gameRoom.clients).length === 1 && isHost) {
                        gameRoom.state = GAME_STATES.PLACEMENT;
                        
                        // Notify all clients of the state change
                        io.to(gameCode).emit('game-data', {
                              type: 'game_state_change',
                              gameCode,
                              state: GAME_STATES.PLACEMENT,
                        });
                  }
                  
                  return;
            }
            
            // Special handling for client_ready event
            if (data.type === 'client_ready') {
                  const { clientId, ready } = data;
                  
                  // Update client ready status
                  if (gameRoom.clients[clientId]) {
                        gameRoom.clients[clientId].ready = ready;
                  }
                  
                  // Broadcast to all clients in the room
                  socket.to(gameCode).emit('game-data', data);
                  
                  // Check if all clients are ready
                  const allReady = Object.values(gameRoom.clients).every(client => client.ready);
                  
                  if (allReady && gameRoom.state === GAME_STATES.PLACEMENT) {
                        // All clients are ready for battle
                        console.log(`All clients in game ${gameCode} are ready for battle`);
                        
                        // Let the host handle the state change
                        // The host will send a game_state_change event
                  }
                  
                  return;
            }
            
            // Special handling for game_state_change event
            if (data.type === 'game_state_change') {
                  const { state, clientOrder, currentTurnIndex } = data;
                  
                  // Update game room state
                  gameRoom.state = state;
                  
                  // Update client order if provided
                  if (clientOrder) {
                        gameRoom.clientOrder = clientOrder;
                  }
                  
                  // Update current turn if provided
                  if (currentTurnIndex !== undefined) {
                        gameRoom.currentTurnIndex = currentTurnIndex;
                  }
                  
                  // Broadcast to all clients in the room
                  socket.to(gameCode).emit('game-data', data);
                  
                  return;
            }
            
            // Special handling for attack event
            if (data.type === 'attack') {
                  const { fromClientId, toClientId } = data;
                  
                  // Forward the attack to the target client
                  const targetClient = gameRoom.clients[toClientId];
                  
                  if (targetClient) {
                        io.to(targetClient.socketId).emit('game-data', data);
                  }
                  
                  return;
            }
            
            // Special handling for attack_result event
            if (data.type === 'attack_result') {
                  const { fromClientId, toClientId } = data;
                  
                  // Forward the result to the attacking client
                  const sourceClient = gameRoom.clients[toClientId];
                  
                  if (sourceClient) {
                        io.to(sourceClient.socketId).emit('game-data', data);
                  }
                  
                  return;
            }
            
            // Special handling for game_over event
            if (data.type === 'game_over') {
                  // Update game room state
                  gameRoom.state = GAME_STATES.FINISHED;
                  
                  // Broadcast to all clients in the room
                  socket.to(gameCode).emit('game-data', data);
                  
                  return;
            }
            
            // For all other game-data events, just forward to all other clients in the room
            socket.to(gameCode).emit('game-data', data);
      });

      // Handle heartbeat event
      socket.on('heartbeat', () => {
            socket.emit('heartbeat-ack');
      });

      // Handle disconnect event
      socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);

            // Find all game rooms this socket is in
            for (const [gameCode, gameRoom] of gameRooms.entries()) {
                  // Find the client ID for this socket
                  const clientId = Object.keys(gameRoom.clients).find(
                        id => gameRoom.clients[id].socketId === socket.id
                  );
                  
                  if (clientId) {
                        // Remove the client from the game room
                        delete gameRoom.clients[clientId];
                        
                        // Remove from client order
                        gameRoom.clientOrder = gameRoom.clientOrder.filter(id => id !== clientId);
                        
                        // Adjust current turn if needed
                        if (gameRoom.currentTurnIndex >= gameRoom.clientOrder.length) {
                              gameRoom.currentTurnIndex = 0;
                        }
                        
                        // Notify all clients in the room
                        io.to(gameCode).emit('game-data', {
                              type: 'client_left',
                              gameCode,
                              clientId,
                        });
                        
                        // If no clients left, remove the game room
                        if (Object.keys(gameRoom.clients).length === 0) {
                              gameRooms.delete(gameCode);
                              console.log(`Game ${gameCode} removed (no clients left)`);
                        }
                        // If game is in battle and only one client left, game over
                        else if (gameRoom.state === GAME_STATES.BATTLE && Object.keys(gameRoom.clients).length === 1) {
                              const winnerId = Object.keys(gameRoom.clients)[0];
                              
                              // Update game state
                              gameRoom.state = GAME_STATES.FINISHED;
                              
                              // Notify the remaining client
                              io.to(gameCode).emit('game-data', {
                                    type: 'game_over',
                                    gameCode,
                                    winnerId,
                              });
                        }
                  }
            }
      });
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
});

// Export for testing
module.exports = { app, server, io };
