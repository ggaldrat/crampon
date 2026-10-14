const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

//const localPackagePaths = ['localpath/code/llama.rn'];

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

const defaultConfig = getDefaultConfig(__dirname);
const {assetExts, sourceExts} = defaultConfig.resolver;

const config = {
  resolver: {
    //nodeModulesPaths: [...localPackagePaths], // update to resolver
    assetExts: assetExts.filter(ext => ext !== 'svg'),
    sourceExts: [...sourceExts, 'svg'],
    // Crampon : node_modules est un lien symbolique vers /data (la partition
    // racine, 20 Go, est trop petite pour les 4+ Go de deps RN/natives).
    // Metro ne suit pas les symlinks hors-projet sans ce flag explicite.
    unstable_enableSymlinks: true,
  },
  watchFolders: ['/data/crampon-build/node_modules'],
  transformer: {
    babelTransformerPath: require.resolve(
      'react-native-svg-transformer/react-native',
    ),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
    // Make sure decorators are properly transformed
    enableBabelRuntime: true,
  },
  //watchFolders: [...localPackagePaths],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
