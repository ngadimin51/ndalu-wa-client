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
 * SOCKET.IO
 */
const io = require('socket.io')(server);
// middleware
app.use( (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    req.io = io
    // res.set('Cache-Control', 'no-store')
    next()
})
io.setMaxListeners(0)

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

app.use(express.static('src/public'))
app.get('/*', (req, res) => {
    res.status(404).end('404 - PAGE NOT FOUND')
})

server.listen(port, log.info(`Server run and listening port: ${port}`))