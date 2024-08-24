const mongoose = require("mongoose")

const mcSchema = mongoose.Schema({
    username: String,
    uuid: String,
    token: String,
    timestamp: Date,
    tokenAuth: String,
})

module.exports = mongoose.model("session-tokens", mcSchema)