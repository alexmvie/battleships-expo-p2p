# Battleship Game Socket.io Server

A simple Socket.io server for the Battleship multiplayer game.

## Features

- Real-time bidirectional communication using Socket.io
- Game room management
- Player connection handling
- Game state synchronization

## Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```

3. For development with auto-restart:
   ```
   npm run dev
   ```

## Deployment to Render.com

1. Create a new Web Service on Render.com
2. Connect your GitHub repository
3. Configure the service:
   - Name: battleship-socket-server
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Auto-Deploy: Yes

## API Endpoints

- `GET /`: Health check endpoint
- `GET /test`: Test HTML page for Socket.io connection
- `GET /test-cors`: Test HTML page for CORS configuration

## Socket.io Events

### Server Events (emitted by the server)
- `game-created`: Emitted when a game is created
- `game-joined`: Emitted when a player joins a game
- `game-ready`: Emitted when both players are connected
- `game-data`: Emitted when game data is received from a player
- `opponent-disconnected`: Emitted when a player disconnects
- `heartbeat-ack`: Emitted in response to a heartbeat

### Client Events (listened for by the server)
- `create-game`: Create a new game with a game code
- `join-game`: Join an existing game with a game code
- `game-data`: Send game data to the other player
- `heartbeat`: Keep the connection alive
