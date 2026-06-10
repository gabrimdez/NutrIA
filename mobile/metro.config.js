const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const nm = path.resolve(projectRoot, 'node_modules');
config.watchFolders = [projectRoot];
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [nm, path.join(nm, 'expo', 'node_modules')],
};

module.exports = config;
