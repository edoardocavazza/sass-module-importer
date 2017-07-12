'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs'));
var glob = _interopDefault(require('glob'));
var path = _interopDefault(require('path'));
var Map = _interopDefault(require('es6-map'));
var assign = _interopDefault(require('object-assign'));
var npmResolve = _interopDefault(require('resolve'));
var bowerResolve = _interopDefault(require('resolve-bower'));

var ModuleImporter = function ModuleImporter(opts) {
  this.aliases = new Map();
  this.options = assign({}, { packageFilter: this.filter }, opts);
};

ModuleImporter.prototype.resolve = function resolve(ref) {
  var this$1 = this;
    var url = ref.url;
    var prev = ref.prev;

    var fullPath = prev === 'stdin' ? url : path.resolve(path.dirname(prev), url);
  var extname = path.extname(fullPath);

  if (extname === '.js') {
    return Promise.resolve({ contents: '' });
  }

  if (this.aliases.has(fullPath)) {
    return Promise.resolve(this.aliases.get(fullPath));
  }

  var dirName = path.dirname(fullPath);
  var fileName = "?(_)" + (path.basename(fullPath)) + ".+(scss|sass|css)";
  var matches = glob.sync(path.join(dirName, fileName));

  if (matches.length > 0) {
    return Promise.resolve({ file: fullPath });
  }

  return Promise.resolve({ url: url, prev: prev })
    .then(function ( file ) { return this$1.npm(file); })
    .then(function ( file ) { return this$1.bower(file); })
    .then(function ( file ) { return this$1.read(file); })
    .then(function (res) {
      if (res) {
        this$1.aliases.set(fullPath, res);
      }
      return res;
    });
};

ModuleImporter.prototype.resolveSync = function resolveSync(ref) {
  var url = ref.url;
    var prev = ref.prev;

    var fullPath = prev === 'stdin' ? url : path.resolve(path.dirname(prev), url);
  var extname = path.extname(fullPath);

  if (extname === '.js') {
    return { contents: '' };
  }

  if (this.aliases.has(fullPath)) {
    return this.aliases.get(fullPath);
  }

  var dirName = path.dirname(fullPath);
  var fileName = "?(_)" + (path.basename(fullPath)) + ".+(scss|sass|css)";
  var matches = glob.sync(path.join(dirName, fileName));

  if (matches.length > 0) {
    return { file: fullPath };
  }

  var p = this.npmSync({ url: url, prev: prev }) || this.bowerSync({ url: url, prev: prev });
  var res = this.readSync(p);

  if (res) {
    this.aliases.set(fullPath, res);
  }
  return res;
};

ModuleImporter.prototype.filter = function filter(pkg) {
  var regex = /\.s?[c|a]ss$/;
  if (!pkg.main ||
     (typeof pkg.main !== 'string') ||
     (pkg.main && !pkg.main.match(regex))) {
    if (typeof pkg.main === 'object') {
      pkg.main = pkg.main.find(function ( elem ) { return elem.match(regex); });
    } else {
      pkg.main = pkg.style || pkg.sass || pkg['main.scss'] || pkg['main.sass'] || 'index.css';
    }
  }
  return pkg;
};

ModuleImporter.prototype.find = function find(resolver, ref) {
  var this$1 = this;
    var url = ref.url;
    var prev = ref.prev;
    var resolved = ref.resolved;

    return new Promise(function (resolve) {
    if (resolved) {
      resolve({ url: url, prev: prev, resolved: resolved });
    } else {
      resolver(url.replace(/^\~\@/, '@'), this$1.options, function (err, res) {
        resolve({ url: (err ? url : res), prev: prev, resolved: !err });
      });
    }
  });
};

ModuleImporter.prototype.findSync = function findSync(resolver, ref) {
  var url = ref.url;
    var prev = ref.prev;
    var resolved = ref.resolved;

    if (resolved) {
    return { url: url, prev: prev, resolved: resolved };
  }
  if ((!prev || prev === 'stdin') && url.match(/(^(\.\/)|(\.\.\/))/)) {
    return { url: url, prev: prev, resolved: false };
  }
  var moduleUrl = url.replace(/^\~\@/, '@').split('/');
  var moduleName = (moduleUrl[0][0] === '@' ? moduleUrl.splice(0, 2) :
      moduleUrl.splice(0, 1)).join('/');
  moduleUrl = moduleUrl.join('/');
  var res = resolver(("" + moduleName + "/package.json"), this.options);
  if (res && moduleUrl) {
    res = path.join(path.dirname(res), moduleUrl);
  }
  return { url: (res || url), prev: prev, resolved: !!res };
};

ModuleImporter.prototype.read = function read(ref) {
  var url = ref.url;
    var prev = ref.prev;
    var resolved = ref.resolved;

    return new Promise(function (resolve, reject) {
    if (!resolved) {
      resolve();
    } else {
        if (url.match(/\.css$/)) {
        fs.readFile(url, 'utf8', function (err, contents) {
          if (err) {
            reject(err);
          } else {
            resolve({ contents: contents });
          }
        });
      } else {
        var resolvedURL = url;
        if (!resolved && prev && prev !== 'stdin' && !path.isAbsolute(url)) {
          resolvedURL = path.resolve(path.dirname(prev), url);
        }
        resolve({ file: resolvedURL });
      }
    }
  });
};

ModuleImporter.prototype.readSync = function readSync(ref) {
  var url = ref.url;
    var prev = ref.prev;
    var resolved = ref.resolved;

    if (!resolved) {
    return undefined;
  }
  if (url.match(/\.css$/)) {
    var contents = fs.readFileSync(url, 'utf8');
    return { contents: contents };
  }
  var resolvedURL = url;
  if (!resolved && prev && prev !== 'stdin' && !path.isAbsolute(url)) {
    resolvedURL = path.resolve(path.dirname(prev), url);
  }
  return { file: resolvedURL };
};

ModuleImporter.prototype.npm = function npm(file) {
  return this.find(npmResolve, file);
};

ModuleImporter.prototype.npmSync = function npmSync(file) {
  return this.findSync(npmResolve.sync, file);
};

ModuleImporter.prototype.bower = function bower(file) {
  return this.find(bowerResolve, file);
};

ModuleImporter.prototype.bowerSync = function bowerSync(file) {
  return this.findSync(bowerResolve.sync, file);
};


/**
 * Look for Sass files installed through npm
 * @param opts {Object}       Options to be passed to the resolver module
 *
 * @return {Function}         Function to be used by node-sass importer
 */
var SassModuleImporter = function SassModuleImporter(opts) {
  var importer = new ModuleImporter(opts);

  return function (url, prev, done) {
    importer.resolve({ url: url, prev: prev })
      .then(done)
      .catch(function ( err ) { return setImmediate(function () { throw err; }); });
  };
};

SassModuleImporter.sync = function sync(opts) {
  var importer = new ModuleImporter(opts);

  return function (url, prev) { return importer.resolveSync({ url: url, prev: prev }); };
};

module.exports = SassModuleImporter;