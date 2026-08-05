// Shared package exports
import config = require('./config/index');
import persistence = require('./persistence/index');
import logger = require('./utils/logger');
import keys = require('./utils/keys');
import id = require('./utils/id');

const shared = { ...config, ...persistence, ...logger, ...keys, ...id };

export = shared;