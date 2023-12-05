/* jshint esversion: 8 */

const { createClient } = require('redis');
const { promisify } = require('util');

class RedisClient {
  constructor() {
    this.client = createClient();
    this.isConnected = true;
    this.client.on('error', (err) => {
      this.isConnected = false;
      console.error(err.toString());
    });
    this.client.on('connect', () => {
      this.isConnected = true;
      console.log('Connected successfully to the redis server');
    });
  }

  isAlive() {
    return this.isConnected;
  }

  async get(key) {
    return promisify(this.client.GET).bind(this.client)(key);
  }

  async set(key, value, duration) {
    await promisify(this.client.SETEX).bind(this.client)(key, duration, value);
  }

  async del(key) {
    await promisify(this.client.DEL).bind(this.client)(key);
  }
}

const redisClient = new RedisClient();

module.exports = redisClient;
