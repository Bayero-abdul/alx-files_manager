const Queue = require('bull/lib/queue');
const mime = require('mime-types');
const { ObjectId } = require('mongodb');
const uuidv4 = require('uuid').v4;
const fs = require('fs');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');

class FilesController {
  static async getUser(req) {
    const xTokenHeader = req.headers['x-token'];
    if (!xTokenHeader) {
      return null;
    }
    const key = `auth_${xTokenHeader}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return null;
    }
    const users = await dbClient.usersCollection();
    const aUser = await users.findOne({ _id: ObjectId(userId) });
    if (!aUser) {
      return null;
    }
    return aUser;
  }

  static async postUpload(req, res) {
    try {
      const aUser = await FilesController.getUser(req);
      if (!aUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const filesProps = req.body;
      const {
        name, type, data, parentId,
      } = filesProps;
      const isPublic = filesProps.isPublic || false;

      if (!name) {
        res.status(400).json({ error: 'Missing name' });
        return;
      }
      if (!type || !(['folder', 'file', 'image'].includes(type))) {
        res.status(400).json({ error: 'Missing type' });
        return;
      }
      if (!data && type !== 'folder') {
        res.status(400).json({ error: 'Missing data' });
        return;
      }

      const files = await dbClient.filesCollection();
      if (parentId) {
        const parent = await files.findOne({ _id: ObjectId(parentId), userId: aUser._id });
        if (!parent) {
          res.status(400).json({ error: 'Parent not found' });
          return;
        }
        if (parent.type !== 'folder') {
          res.status(400).json({ error: 'Parent is not a folder' });
          return;
        }
      }
      if (type === 'folder') {
        const newFileCreation = await files.insertOne({
          userId: aUser._id,
          name,
          type,
          parentId: ObjectId(parentId) || 0,
          isPublic,
        });

        const newFile = newFileCreation.ops[0];
        res.status(201).json({
          id: newFile._id,
          userId: aUser._id,
          name,
          type,
          isPublic,
          parentId: ObjectId(parentId) || 0,
        });

        return;
      }

      const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(FOLDER_PATH)) {
        fs.mkdirSync(FOLDER_PATH, { recursive: true });
      }

      const filename = uuidv4();
      const filePath = `${FOLDER_PATH}/${filename}`;

      const buffer = Buffer.from(data, 'base64');
      fs.writeFile(filePath, buffer, { encoding: 'utf-8' }, (err) => { if (err) throw err; });

      const newFileCreation = await files.insertOne({
        userId: aUser._id,
        name,
        type,
        isPublic,
        parentId: ObjectId(parentId) || 0,
        localPath: filePath,
      });

      const newFile = newFileCreation.ops[0];
      res.status(201).json({
        id: newFile._id,
        userId: aUser._id,
        name,
        type,
        isPublic,
        parentId: ObjectId(parentId) || 0,
      });

      if (type === 'image') fileQueue.add({ userId: aUser._id, fileId: newFile._id });

      return;
    } catch (e) {
      res.status(500).json({ error: e.toString() });
      throw e;
    }
  }

  static async getShow(req, res) {
    try {
      const aUser = await FilesController.getUser(req);
      if (!aUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const fileId = req.params.id;
      const files = await dbClient.filesCollection();
      const file = await files.findOne({ _id: ObjectId(fileId), userId: aUser._id });
      if (!file) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      res.json(file);
      return;
    } catch (e) {
      res.status(500).json({ error: e.toString() });
      throw e;
    }
  }

  static async getIndex(req, res) {
    try {
      const aUser = await FilesController.getUser(req);
      if (!aUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { parentId } = req.query;
      const page = parseInt(req.query.page || 0, 10);

      const files = await dbClient.filesCollection();

      const query = parentId
        ? { userId: aUser._id, parentId: ObjectId(parentId) }
        : { userId: aUser._id };

      const result = await files.aggregate([
        { $match: query },
        {
          $facet: {
            metadata: [{ $count: 'total' }, { $addFields: { page } }],
            data: [{ $skip: 20 * page }, { $limit: 20 }],
          },
        },
      ]);

      const allFiles = [];
      for await (const doc of result) {
        const aFiles = doc.data;
        aFiles.forEach((file) => {
          allFiles.push({
            id: file._id,
            userId: file.userId,
            name: file.name,
            type: file.type,
            isPublic: file.isPublic,
            parentId: file.parentId,
          });
        });
      }
      res.json(allFiles);
      return;
    } catch (e) {
      res.status(500).json({ error: e.toString() });
      throw e;
    }
  }

  static async putPublish(req, res) {
    try {
      const aUser = await FilesController.getUser(req);
      if (!aUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const fileId = req.params.id;
      const files = await dbClient.filesCollection();

      const result = await files.updateOne(
        { _id: ObjectId(fileId), userId: aUser._id }, { $set: { isPublic: true } },
      );

      const file = await files.findOne({ _id: ObjectId(fileId), userId: aUser._id });
      if (!file || result.matchedCount === 0) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      res.status(200).json({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      });
      return;
    } catch (e) {
      res.status(500).json({ error: e.toString() });
      throw e;
    }
  }

  static async putUnpublish(req, res) {
    try {
      const aUser = await FilesController.getUser(req);
      if (!aUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const fileId = req.params.id;
      const files = await dbClient.filesCollection();

      const result = await files.updateOne(
        { _id: ObjectId(fileId), userId: aUser._id }, { $set: { isPublic: false } },
      );

      const file = await files.findOne({ _id: ObjectId(fileId), userId: aUser._id });
      if (!file || result.matchedCount === 0) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      res.status(200).json({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      });
      return;
    } catch (e) {
      res.status(500).json({ error: e.toString() });
      throw e;
    }
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const files = await dbClient.filesCollection();
    const file = await files.findOne({ _id: ObjectId(fileId) });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (!file.isPublic) {
      const aUser = await FilesController.getUser(req);
      if (!aUser || aUser._id.toString() !== file.userId.toString()) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }

    if (file.type === 'folder') {
      res.status(400).json({ error: 'A folder doesn\'t have content' });
      return;
    }

    if (!fs.existsSync(file.localPath)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    let filename = file.localPath;
    const { size } = req.query;
    if (size) filename += `_${size}`;

    const contentType = mime.contentType(file.name);
    res.header('Content-Type', contentType).sendFile(filename);
  }
}

module.exports = FilesController;
