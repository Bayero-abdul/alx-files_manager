const express = require('express');
const linkRoutes = require('./routes');

const port = process.env.PORT || 5000;
const server = express();

server.use(express.json());

linkRoutes(server);

server.listen(port, () => console.log(`Server is runnning on port ${port}`));

module.exports = server;
