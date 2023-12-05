const AppController = require('../controllers/AppController');
const AuthController = require('../controllers/AuthController');
const FilesController = require('../controllers/FilesController');
const UsersController = require('../controllers/UsersController');

const linkRoutes = (server) => {
  server.get('/status', AppController.getStatus);
  server.get('/stats', AppController.getStats);

  server.post('/users', UsersController.postNew);
  server.get('/users/me', UsersController.getMe);

  server.get('/connect', AuthController.getConnect);
  server.get('/disconnect', AuthController.getDisconnect);

  server.post('/files', FilesController.postUpload);
  server.get('/files/:id', FilesController.getShow);
  server.get('/files', FilesController.getIndex);

  server.put('/files/:id/publish', FilesController.putPublish);
  server.put('/files/:id/unpublish', FilesController.putUnpublish);

  server.get('/files/:id/data', FilesController.getFile);
};

module.exports = linkRoutes;
