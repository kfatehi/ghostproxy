module.exports = GhostProvisioner;
var Client = require('ssh2').Client;
var Ghosts = require('./ghosts');
var Promise = require('bluebird');
var logger = require('./logger');
var config = require('../etc/config');
var privKeyPath = config.ssh.privateKeyPath;
var blockUntilListening = require('./instance_provisioner/block_until_listening');
function GhostProvisioner(opts) {
  this.type = opts.type;
  this.script = opts.script;
}

GhostProvisioner.prototype.runRemoteScript = function(connectOpts) {
  var script = this.script;
  return new Promise(function(resolve, reject) {
    var conn = new Client();
    conn.on('ready', function() {
      conn.exec(script, function(err, stream) {
        if (err) return reject(err);
        stream.on('end', function() {
        }).on('close', function(exitCode, signal) {
          conn.end();
          if (exitCode === 0) return resolve();
          else reject(new Error("Remote script exited with non-zero status"));
        }).on('data', function(data) {
          logger.info(data.toString().trim());
        }).stderr.on('data', function(data) {
          logger.warn(data.toString().trim());
        });
      });
    }).connect(connectOpts);
  });
}

GhostProvisioner.prototype.provision = function(ghost) {
  var self = this;
  logger.info("provisioning ghost");
  return blockUntilListening({
    port: 22,
    ip: ghost.ipAddress,
    match: "SSH"
  }).then(function(ip) {
    logger.info('SSH connection now possible');
    return self.runRemoteScript({
      host: ghost.ipAddress,
      port: 22,
      username: 'root',
      privateKey: require('fs').readFileSync(privKeyPath)
    });
  }).then(function() {
    return blockUntilListening({
      http: true,
      port: ghost.httpPort,
      ip: ghost.ipAddress
    })
  }).then(function() {
    return Ghosts.updateStatus(ghost, Ghosts.READY);
  });
}
