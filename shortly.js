var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.use(session({
  secret: 'cookie monster',
  saveUninitialized: true,
  resave: false,
  cookie: { maxAge: 60000 * 5 }
}));

passport.use(new LocalStrategy(
  function(username, password, done) {
    // fetch user
    User.where({ username: username }).fetch()
    .then(function (user) {
      if (!user) { return done(null, false); }

      // compare passwords
      util.comparePassword(password, user.get('password'))
      .then(passwordsMatch => {
        if (!passwordsMatch) { return done(null, false); }
        return done(null, user);
      });
    })
    .catch(function (err) {
      if (err) { return done(err); }
    });
  }
));
passport.serializeUser(function(user, done) {
  done(null, user.id);
});
passport.deserializeUser(function(id, done) {
  User.where({ id: id }).fetch()
  .then(function (user) {
    if (!user) {
      return done(null, false);
    } else {
      done(null, user);
    }
  });
});
app.use(passport.initialize());
app.use(passport.session());

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


app.get('/', util.checkUser,
function(req, res) {
  res.render('index');
});

app.get('/create', util.checkUser,
function(req, res) {
  res.render('index');
});

app.get('/links', util.checkUser,
function(req, res) {
  User.where({ id: req.user.get('id') }).fetch({ withRelated: ['links'] })
  .then(function(user) {
    res.status(200).send(user.related('links'));
  });
  // Links.reset().fetch().then(function(links) {
  //   res.status(200).send(links.models);
  // });
});

app.post('/links', util.checkUser,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    //console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri, 'user_id': req.user.get('id') }).fetch()
  .then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin,
          'user_id': req.user.get('id')
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/


app.get('/login',
function(req, res) {
  res.render('login', { hideClass: req.user && req.user.failedLogin ? 'valid' : 'hide' });
  req.logout();
});

app.get('/logout',
function(req, res) {
  req.logout();
  res.redirect('/login');
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.post('/login', function(req, res, next) {
  passport.authenticate('local', function (err, user, info) {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.redirect('/login');
    }

    req.logIn(user, function(err) {
      if (err) {
        return next(err);
      }
      User.where({ username: user.get('username') }).fetch()
      .then(function (resultUser) {
        //req.user.set('userId', resultUser.get('id'));
        return res.redirect('/');
      })
      .catch(function (err) {
        console.log('user fetch failed:', user.get('username'));
      });
    });
  })(req, res, next);
}
);

app.post('/signup',
function(req, res) {
  new User({ username: req.body.username, password: req.body.password })
  .save()
  .then(function(user) {
    // handle creating user
    req.user.username = user.get('username');
    res.redirect('/');
  }).catch(function(err) {
    // user already exists
    res.end('username is already taken');
  });
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
