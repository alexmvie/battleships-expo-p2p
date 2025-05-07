const { io } = require('socket.io-client');

// Connect to the local Socket.io server
const socket = io('http://localhost:3000', {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

console.log('Attempting to connect to socket server...');

// Connection established with the server
socket.on('connect', () => {
  console.log('Connected to server with ID:', socket.id);
  
  // Create a test game
  const gameCode = 'TEST123';
  console.log(`Creating test game with code: ${gameCode}`);
  socket.emit('create-game', gameCode);
  
  // Set up a timeout to disconnect after 10 seconds
  setTimeout(() => {
    console.log('Test complete, disconnecting...');
    socket.disconnect();
    process.exit(0);
  }, 10000);
});

// Connection error
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  console.error('Error details:', {
    message: error.message,
    description: error.description,
    type: error.type,
  });
  process.exit(1);
});

// Disconnected from server
socket.on('disconnect', (reason) => {
  console.log('Disconnected from server:', reason);
});

// Server error
socket.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Game created successfully
socket.on('game-created', (data) => {
  console.log('Game created:', data.gameCode);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('Caught interrupt signal, disconnecting...');
  socket.disconnect();
  process.exit(0);
});
