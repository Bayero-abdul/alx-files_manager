const { ObjectId } = require('mongodb');
const uuidv4 = require('uuid').v4;
const sha1 = require('sha1');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class AuthController {
  static async getConnect(req, res) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const [authType, base64Credentials] = authHeader.split(' ');
      if (authType !== 'Basic') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      if (!credentials) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const [email, password] = credentials.split(':');
      if (!email || !password) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const hashedPassword = sha1(password);
      const users = await dbClient.usersCollection();
      const aUser = await users.findOne({ email, password: hashedPassword });
      if (!aUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const token = uuidv4();
      const key = `auth_${token}`;
      await redisClient.set(key, aUser._id.toString(), 24 * 60 * 60);
      res.json({ token });
    } catch (e) {
      res.status(500).json({ error: e.toString() });
      throw e;
    }
  }

  static async getDisconnect(req, res) {
    try {
      const xTokenHeader = req.headers['x-token'];
      if (!xTokenHeader) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const key = `auth_${xTokenHeader}`;
      const aUserId = await redisClient.get(key);
      if (!aUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const users = await dbClient.usersCollection();
      const aUser = await users.findOne({ _id: ObjectId(aUserId) });
      if (!aUser) {
        res.status(401).json({ error: 'Unauthorized!' });
        return;
      }
      await redisClient.del(key);
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ error: e.toString() });
      throw e;
    }
  }
}

module.exports = AuthController;
