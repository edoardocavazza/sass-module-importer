import fs from 'fs';
import glob from 'glob';
import path from 'path';
import Map from 'es6-map';
import assign from 'object-assign';
import npmResolve from 'resolve';
import bowerResolve from 'resolve-bower';

class ModuleImporter {
  constructor(opts) {
    this.aliases = new Map();
    this.options = assign({}, { packageFilter: this.filter }, opts);
  }

  resolve({ url, prev }) {
    const fullPath = prev === 'stdin' ? url : path.resolve(path.dirname(prev), url);
    const extname = path.extname(fullPath);

    if (extname === '.js') {
      return Promise.resolve({ contents: '' });
    }

    if (this.aliases.has(fullPath)) {
      return Promise.resolve(this.aliases.get(fullPath));
    }

    const dirName = path.dirname(fullPath);
    const fileName = `?(_)${path.basename(fullPath)}.+(scss|sass|css)`;
    const matches = glob.sync(path.join(dirName, fileName));

    if (matches.length > 0) {
      return Promise.resolve({ file: fullPath });
    }

    return Promise.resolve({ url, prev })
      .then(file => this.npm(file))
      .then(file => this.bower(file))
      .then(file => this.read(file))
      .then((res) => {
        if (res) {
          this.aliases.set(fullPath, res);
        }
        return res;
      });
  }

  resolveSync({ url, prev }) {
    const fullPath = prev === 'stdin' ? url : path.resolve(path.dirname(prev), url);
    const extname = path.extname(fullPath);

    if (extname === '.js') {
      return { contents: '' };
    }

    if (this.aliases.has(fullPath)) {
      return this.aliases.get(fullPath);
    }

    const dirName = path.dirname(fullPath);
    const fileName = `?(_)${path.basename(fullPath)}.+(scss|sass|css)`;
    const matches = glob.sync(path.join(dirName, fileName));

    if (matches.length > 0) {
      return { file: fullPath };
    }

    const p = this.npmSync({ url, prev }) || this.bowerSync({ url, prev });
    const res = this.readSync(p);

    if (res) {
      this.aliases.set(fullPath, res);
    }
    return res;
  }

  filter(pkg) {
    const regex = /\.s?[c|a]ss$/;
    if (!pkg.main ||
       (typeof pkg.main !== 'string') ||
       (pkg.main && !pkg.main.match(regex))) {
      if (typeof pkg.main === 'object') {
        pkg.main = pkg.main.find(elem => elem.match(regex));
      } else {
        pkg.main = pkg.style || pkg.sass || pkg['main.scss'] || pkg['main.sass'] || 'index.css';
      }
    }
    return pkg;
  }

  find(resolver, { url, prev, resolved }) {
    return new Promise((resolve) => {
      if (resolved) {
        resolve({ url, prev, resolved });
      } else {
        resolver(url.replace(/^\~\@/, '@'), this.options, (err, res) => {
          resolve({ url: (err ? url : res), prev, resolved: !err });
        });
      }
    });
  }

  findSync(resolver, { url, prev, resolved }) {
    if (resolved) {
      return { url, prev, resolved };
    }
    if ((!prev || prev === 'stdin') && url.match(/(^(\.\/)|(\.\.\/))/)) {
      return { url, prev, resolved: false };
    }
    let moduleUrl = url.replace(/^\~\@/, '@').split('/');
    const moduleName = (moduleUrl[0][0] === '@' ? moduleUrl.splice(0, 2) :
        moduleUrl.splice(0, 1)).join('/');
    moduleUrl = moduleUrl.join('/');
    let res = resolver(`${moduleName}/package.json`, this.options);
    if (res && moduleUrl) {
      res = path.join(path.dirname(res), moduleUrl);
    }
    return { url: (res || url), prev, resolved: !!res };
  }

  read({ url, prev, resolved }) {
    return new Promise((resolve, reject) => {
      if (!resolved) {
        resolve();
      } else {
        if (url.match(/\.css$/)) {
          fs.readFile(url, 'utf8', (err, contents) => {
            if (err) {
              reject(err);
            } else {
              resolve({ contents });
            }
          });
        } else {
          let resolvedURL = url;
          if (!resolved && prev && prev !== 'stdin' && !path.isAbsolute(url)) {
            resolvedURL = path.resolve(path.dirname(prev), url);
          }
          resolve({ file: resolvedURL });
        }
      }
    });
  }

  readSync({ url, prev, resolved }) {
    if (!resolved) {
      return undefined;
    }
    if (url.match(/\.css$/)) {
      const contents = fs.readFileSync(url, 'utf8');
      return { contents };
    }
    let resolvedURL = url;
    if (!resolved && prev && prev !== 'stdin' && !path.isAbsolute(url)) {
      resolvedURL = path.resolve(path.dirname(prev), url);
    }
    return { file: resolvedURL };
  }

  npm(file) {
    return this.find(npmResolve, file);
  }

  npmSync(file) {
    return this.findSync(npmResolve.sync, file);
  }

  bower(file) {
    return this.find(bowerResolve, file);
  }

  bowerSync(file) {
    return this.findSync(bowerResolve.sync, file);
  }
}


/**
 * Look for Sass files installed through npm
 * @param opts {Object}       Options to be passed to the resolver module
 *
 * @return {Function}         Function to be used by node-sass importer
 */
const SassModuleImporter = function SassModuleImporter(opts) {
  const importer = new ModuleImporter(opts);

  return (url, prev, done) => {
    importer.resolve({ url, prev })
      .then(done)
      .catch(err => setImmediate(() => { throw err; }));
  };
};

SassModuleImporter.sync = function sync(opts) {
  const importer = new ModuleImporter(opts);

  return (url, prev) => importer.resolveSync({ url, prev });
};

export default SassModuleImporter;
