const fs = require('fs');
const http = require('http');
const url = require('url');
const opn = require('open');
const destroyer = require('server-destroy');
const config = require('./config.json');
const { google } = require('googleapis');
const people = google.people('v1');
const axios = require('axios');

const oauth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    "http://localhost:3000/oauth2"
);
google.options({ auth: oauth2Client });

const scopes = [
    'https://www.googleapis.com/auth/contacts',
];

async function authenticate(scopes) {
    return new Promise((resolve, reject) => {
        const authorizeUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes.join(' '),
            include_granted_scopes: true
        });
        const server = http
            .createServer(async (req, res) => {
                try {
                    if (req.url.indexOf('/oauth2') > -1) {
                        const qs = new url.URL(req.url, 'http://localhost:3000')
                            .searchParams;
                        res.end('Authentication successful! Please return to the console.');
                        // server.destroy();
                        const { tokens } = await oauth2Client.getToken(qs.get('code'));
                        oauth2Client.credentials = tokens;
                        resolve(oauth2Client);
                    }
                } catch (e) {
                    reject(e);
                }
            })
            .listen(3000, () => {
                opn(authorizeUrl, { wait: false }).then(cp => cp.unref());
            });
        destroyer(server);
    });
}

async function getContacts() {
    const res = await people.people.connections.list({
        personFields: 'names,emailAddresses,phoneNumbers,nicknames',
        resourceName: 'people/me',
        pageToken: 'GgYKAghkEAI'
    });
    let contacts = res.data.connections.map(el => {
        return {
            firstName: el.names[0].givenName || null,
            middleName: el.names[0].middleName || null,
            lastName: el.names[0].familyName || null,
            emails: el.emailAddresses != undefined ? el.emailAddresses.map(mail => mail.value) : [],
            phones: el.phoneNumbers != undefined ? el.phoneNumbers.map(ph => ph.value) : [],
        }
    })
    fs.writeFile('contacts.json', JSON.stringify(contacts), 'utf8', function (err) {
        if (err) {
            console.log("An error occurred while writing JSON Object to File.");
            return console.log(err);
        }

        console.log("JSON file has been saved.");
    })
}

async function updateToken() {
    if (new Date(oauth2Client.credentials.expiry_date) < new Date()) {
        let response = await axios.post('https://oauth2.googleapis.com/token',
            {
                refresh_token: oauth2Client.credentials.refresh_token,
                grant_type: 'refresh_token',
                client_id: config.client_id,
                client_secret: config.client_secret
            }
        )
        oauth2Client.credentials.access_token = response.data.access_token
        oauth2Client.credentials.id_token = response.data.id_token
    }
}

authenticate(scopes)
    .then(client => {
        getContacts()
        setInterval(() => {
            updateToken()
        }, 1000 * 60)
    })
    .catch(console.error);