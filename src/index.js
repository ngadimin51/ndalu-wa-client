'use strict'

require('dotenv').config()
const lib = require('./lib')
global.log = lib.log

/**
 * CHECK THE .ENV FIRST
 */
const port = process.env.PORT

if ( !port ) {
    log.fatal('PLEACE CHECK YOUR .env FILE')
    process.exit(1)
}
log.info('YOUR .env FILE is configured')

/**
 * EXPRESS FOR ROUTING
 */
const express = require('express')
const app = express()
const http = require('http')
const server = http.createServer(app)

/**
 * PARSER
 */
// body parser
const bodyParser = require('body-parser')
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

app.use(require('./router'))

server.listen(port, log.info(`Server run and listening port: ${port}`))