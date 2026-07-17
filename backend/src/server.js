import http from 'http';
import app from './app.js';
import { configureSockets } from './sockets/index.js';
import { connectRedis } from './redis/index.js';

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io (Phase 6)
const io = configureSockets(server);

const startServer = async () => {
    try {
        await connectRedis();
        server.listen(PORT, () => {
          console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start server", err);
    }
};

startServer();
