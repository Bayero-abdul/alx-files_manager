const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');

class AppController {
  static async getStatus(req, res) {
    res.status(200).json({ redis: redisClient.isAlive(), db: dbClient.isAlive() });
  }

  static async getStats(req, res) {
    if (dbClient.isAlive()) {
      Promise.all([dbClient.nbUsers(), dbClient.nbFiles()])
        .then(([uCount, fCount]) => res.status(200).send({ users: uCount, files: fCount }));
    }
  }
}

module.exports = AppController;
