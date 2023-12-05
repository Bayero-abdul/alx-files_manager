const Queue = require('bull/lib/queue');
const { ObjectId } = require('mongodb');
const fs = require('fs');
const imageThumbnail = require('image-thumbnail');
const dbClient = require('./utils/db');

const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');
fileQueue.process(async (job, done) => {
  try {
    const { fileId } = job.data;
    if (!fileId) done(new Error('Missing fileId'));

    const { userId } = job.data;
    if (!userId) done(new Error('Missing userId'));

    const files = await dbClient.filesCollection();
    const file = await files.findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
    if (!file) done(new Error('File not found'));

    const widths = [500, 250, 100];

    widths.forEach(async (width) => {
      const fileName = file.localPath;
      const thumbnail = await imageThumbnail(fileName, { width });

      const image = `${file.localPath}_${width}`;

      fs.writeFile(image, thumbnail, (err) => { if (err) done(err); });
    });
    done();
  } catch (err) {
    done(err);
  }
});

const userQueue = new Queue('userQueue', 'redis://127.0.0.1:6379');
userQueue.process(async (job, done) => {
  const { userId } = job.data;
  if (!userId) done(new Error('Missing userId'));

  const files = await dbClient.filesCollection();
  const file = await files.findOne({ userId: ObjectId(userId) });
  if (!file) done(new Error('User not found'));

  const users = await dbClient.usersCollection();
  const aUser = await users.findOne({ _id: ObjectId(userId) });
  if (!file) done(new Error('User not found'));

  console.log(`Welcome ${aUser.email}!`);
});
