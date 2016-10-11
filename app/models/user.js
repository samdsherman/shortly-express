var db = require('../config');
var Promise = require('bluebird');
var util = require('../../lib/utility');


var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: true,
  urls: function() {
    return this.hasMany(Link);
  },
  initialize: function() {
    //console.log('in user initialize');
    this.on('creating', this.createUser, this);
  },

  createUser: function(model, attrs, options) {
    return util.hashPassword(model.get('password'))
      .then(hash => {
        //console.log(hash);
        model.set('password', hash);
        //console.log('password set', model.get('password'));
        return this;
      })
      .catch(util.log);
  }
});

module.exports = User;


