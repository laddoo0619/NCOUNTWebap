import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/ncount',
    migrations: {
      directory: path.resolve(__dirname, '../migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.resolve(__dirname, '../seeds'),
      extension: 'ts',
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: path.resolve(__dirname, '../migrations'),
    },
    seeds: {
      directory: path.resolve(__dirname, '../seeds'),
    },
    pool: {
      min: 2,
      max: 20,
    },
  },
};

export default config;
module.exports = config;
