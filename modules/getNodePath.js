"use strict";

/**
Gets the right Node path

@module getNodePath
*/

const path = require('path');
const fs = require('fs');
const exec = require('child_process').exec;
const cmpVer = require('semver-compare');
const binaryPath = path.resolve(__dirname + '/../nodes');
const log = require('./utils/logger').create('getNodePath');
const Settings = require('./settings');


// cache
const paths = {},        // all versions (system + bundled):  { type: { path: version } }
    resolvedPaths = {};  // latest version:                   { type: path }


/**
 * Get path of system node
 *
 * @param  {String} type   the type of node (i.e. 'geth', 'eth')
 */
function getSystemPath(type) {
    var proc = exec('type ' + type, (e, stdout, stderr) => {
        if (!e)
            paths[type][stdout.match(/(\/\w+)+/)[0]] = null;
    });
}


/**
 * Get versions of node (system and bundled)
 *
 * @param  {String} type   the type of node (i.e. 'geth', 'eth')
 */
function getVersion(type) {
    setTimeout(() => {
        for (let path in paths[type]) {
            switch (type) {
                case 'geth':
                    var command = path + ' version';
                    break;
                case 'eth':
                case 'parity':
                    var command = path + ' --version';
                    break;
            }
            var proc = exec(command, (e, stdout, stderr) => {
                if (!e) {
                    paths[type][path] = stdout.match(/[\d.]+/)[0];
                }
            });
        }
    }, 50); // 3ms are sufficient on a SSD macbookpro for getSystemPath(type)
}


/**
 * Get paths of all nodes, returns system or bundled path depending on the latest version
 *
 * @param  {String} type   the type of node (i.e. 'geth', 'eth')
 */
module.exports = function(type) {
    // return path if already resolved
    if (resolvedPaths[type]) {
        return resolvedPaths[type];
    }

    // resolve base path of bundled nodes
    var binPath = (Settings.inProductionMode)
        ? binaryPath.replace('nodes','node')
        : binaryPath

    if(Settings.inProductionMode) {
        binPath = binPath.replace('app.asar/','').replace('app.asar\\','');
        
        if(process.platform === 'darwin') {
            binPath = path.resolve(binPath.replace('/node', '/../Frameworks/node'));
        }

        if(process.platform === 'win32') {
            binPath = binPath.replace(/\/+/,'\\');
            binPath += '.exe';
        }
    }

    // resolve node binary paths
    if (Settings.inProductionMode) {
        fs.readdirSync(binPath).forEach((type) => {
            var nodePath = binPath + '/' + type + '/' + type;
            paths[type] = {};
            paths[type][nodePath] = null;
        });
    } else {
        fs.readdirSync('nodes/').forEach((type) => {
            if (fs.statSync('nodes/' + type).isDirectory()) {
                var nodePath = path.resolve('nodes/' + type + '/' + process.platform +'-'+ process.arch + '/' + type);
                paths[type] = {};
                paths[type][nodePath] = null;
            }
        });
    }

    // compare versions to system-wide installed nodes (only linux and mac)
    if (process.platform === 'linux' || process.platform === 'darwin')
        for (var type in paths)
            getVersion(type, getSystemPath(type));

    setTimeout(() => {
        for (type in paths) {
            var path = Object.keys(paths[type])[0];

            if (Object.keys(paths[type]).length > 1)
                path = (cmpVer(Object.keys(paths[type])[0], Object.keys(paths[type])[1])) ? Object.keys(paths[type])[0] : Object.keys(paths[type])[1]

            resolvedPaths[type] = path;
        }

        log.info('Prefered backends: %j', resolvedPaths);    

        return resolvedPaths[type];
    }, 1500); // 100ms (geth) / 900ms (eth) are sufficient on a SSD macbookpro for two calls (bundled and system)
}
