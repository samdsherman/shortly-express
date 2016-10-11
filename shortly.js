var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.use(session({
  secret: 'cookie monster',
  cookie: { maxAge: 60000 },
  resave: false,
  saveUninitialized: false
}));

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


app.get('/', util.isAuthenticated,
function(req, res) {
  res.render('index');
});

app.get('/create', util.isAuthenticated,
function(req, res) {
  res.render('index');
});

app.get('/links', util.isAuthenticated,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

// TODO: make it only show that user's links.
app.post('/links', util.isAuthenticated,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
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
          baseUrl: req.headers.origin
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
  res.render('login');
});

app.get('/logout',
function(req, res) {
  req.session.destroy(function() {
    res.redirect('/login');
  });
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.post('/login',
function(req, res) {
  new User({username: req.body.username})
  .fetch().then(function(user) {
    if (!user) {
      util.log('user not found: ', req.body.username);
      res.sendStatus(401);
    } else {
      // compare passwords
      util.comparePassword(req.body.password, user.get('password'))
      .then(passwordsMatch => {
        if (passwordsMatch) {
          // TODO: start a session
          req.session.regenerate(function(err) {
            if (err) {
              console.log('error regenerating session: ', err);
              res.sendStatus(500);
            } else {
              req.session.user = user.get('username');
              res.redirect('/');
            }
          });
        } else {
          // show failed login message
          res.end('login failed');
        }
      });
    }
  }).catch(util.log);
});

app.post('/signup',
function(req, res) {
  new User({username: req.body.username, password: req.body.password})
  .save()
  .then(function(user) {
    // handle creating user
    req.session.regenerate(function(err) {
      if (err) {
        console.log('error regenerating session: ', err);
        res.sendStatus(500);
      } else {
        req.session.user = user.get('username');
        res.redirect('/');
      }
    });
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
