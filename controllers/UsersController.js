const Queue = require('bull/lib/queue');
const { ObjectId } = require('mongodb');
const sha1 = require('sha1');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

const userQueue = new Queue('userQueue', 'redis://127.0.0.1:6379');
class UsersController {
  static async postNew(req, res) {
    try {
      const requestData = req.body;
      const { email, password } = requestData;
      if (!email) return res.status(400).json({ error: 'Missing email' });

      if (!password) return res.status(400).json({ error: 'Missing password' });

      const users = await dbClient.usersCollection();
      const aUser = await users.findOne({ email });
      if (aUser) return res.status(400).json({ error: 'Already exist' });

      const hashedPassword = sha1(password);
      const newUser = { email, password: hashedPassword };
      const result = await users.insertOne(newUser);
      const id = result.ops[0]._id;

      userQueue.add({ userId: id });

      return res.status(201).json({ id, email });
    } catch (e) {
      return res.status(500).json({ error: e.toString() });
    }
  }

  static async getMe(req, res) {
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
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      res.status(200).json({ email: aUser.email, id: aUserId });
    } catch (e) {
      res.status(500).json({ error: e.toString() });
      throw e;
    }
  }
}

module.exports = UsersController;
