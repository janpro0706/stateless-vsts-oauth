const express = require('express');
const request = require('request');
const hbs = require('express-handlebars');
const uuid = require('uuid/v4');

const app = express();
app.engine('.hbs', hbs({ extname: '.hbs' }));
app.set('view engine', '.hbs');

const E_UNABLE_TO_PARSE = 'Bad Request: unable to parse result.';

const clientId = process.env['CLIENT_ID'] || '9332cac0-01dc-46f7-a945-6a690f7581b1';
const clientSecret = process.env['CLIENT_SECRET'] || process.env.clientSecret;
const port = process.env['SERVER_PORT'] || process.env.port;
let host = process.env['WEBSITE_HOSTNAME'] || process.env.host;
let getHostUri = () => `https://${host}/`;
let getFullUriForPath = path => getHostUri() + path;
let getCallbackUri = () => getFullUriForPath('oauth-callback');

// validate critical variables
if (!clientSecret) {
    throw new Error('Missing CLIENT_SECRET variable!');
}
if (!port) {
    throw new Error('Missing PORT variable!');
}
if (!host) {
    throw new Error('Missing HOST variable!')
} else {
    host = process.env.DEV ? host + ':' + port : host;
    console.log('set "host" to', host);
}

// propertybag getter & setter
let getProperty;
let setProperty;
// property keys
const OAUTH_RESULT = 'oauth_result';
const FORM_DATA = 'form_data';

// set up middleware for propertybag
app.use((req, res, next) => {
    res.propertyBag = res.propertyBag || {};

    getProperty = key => res.propertyBag[key];
    setProperty = (key, val) => res.propertyBag[key] = val;

    next();
});

const getFormBody = (assertion, grantType) => `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer&client_assertion=${clientSecret}&grant_type=${grantType}&assertion=${assertion}&redirect_uri=${getCallbackUri()}`;
const getFormBodyForAuthorization = assertion => getFormBody(assertion, 'urn:ietf:params:oauth:grant-type:jwt-bearer');
const getFormBodyForRefresh = assertion => getFormBody(assertion, 'refresh_token');
const processQuery = (req, res, next) => {
    if (!req.query || !req.query.code) {
        return res.status(400).send('Bad Request: no code parameter in the request!');
    } else {
        next();
    }
};

const handleVstsOauth = (req, res, next) => {
    request.post({
        url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        body: getProperty(FORM_DATA),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }, (err, response, body) => {
        if (err) {
            res.status(400).send(err);
        } else {
            let result;
            try {
                result = JSON.parse(body);

                if (!result) {
                    res.status(400).send(E_UNABLE_TO_PARSE);
                } else if (result && result.Error) {
                    res.status(400).send(body);
                } else {
                    // stuff successful result into propertybag
                    setProperty(OAUTH_RESULT, result);
                    next();
                }
            } catch (e) {
                res.status(400).send(E_UNABLE_TO_PARSE);
            }
        }
    });
};

app.get('/oauth-callback', processQuery, (req, res, next) => {
    let formData = getFormBodyForAuthorization(req.query.code);
    setProperty(FORM_DATA, formData);
    next();
}, handleVstsOauth, (req, res) => {
    let result = getProperty(OAUTH_RESULT);

    res.render('token', {
        refreshToken: result['refresh_token']
    });
});

app.post('/token-refresh', processQuery, (req, res, next) => {
    let formData = getFormBodyForRefresh(req.query.code);
    setProperty(FORM_DATA, formData);
    next();
}, handleVstsOauth, (req, res) => {
    let result = getProperty(OAUTH_RESULT);
    res.setHeader('Content-Encoding', 'application/json');
    res.status(200).send(result);
});

app.get('/', (req, res) => {
    res.render('welcome', {
        clientId: clientId,
        state: uuid(),
        redirectUri: getCallbackUri()
    });
});

app.listen(port, () => {
    console.log(`app listening on port ${port}!`)
});