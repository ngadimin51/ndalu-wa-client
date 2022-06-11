'use strict'

const express = require('express')
const router = express.Router()

/**
 * THIS IS MAIN ROUTER
 */
const wa = require('./model/routes')
const store = require('./model/store')
const CryptoJS = require("crypto-js")
const validation = process.env.AUTH

router.use((req, res, next) => {

    /**
     * headers authorization
     */
    const authorization = req.headers.authorization
    // console.log(authorization)

    if ( authorization ) {
        const base64 = authorization.split(' ')[1]
        // console.log(base64)
        const parsedWord = CryptoJS.enc.Base64.parse(base64)
        const parsedStr = parsedWord.toString(CryptoJS.enc.Utf8)
        const check = parsedStr.substring(0, parsedStr.length - 1)
        const status = check === validation

        if (!status) {
            return res.status(403).end('403 - Unauthorized')
        }

    }

    next()
})

/**
 * API WHATSAPP
 */

router.post('/api/whatsapp/create-instance', wa.createInstance)
router.post('/api/whatsapp/send-text', wa.sendText)
router.post('/api/whatsapp/send-media', wa.sendMedia)
router.post('/api/whatsapp/send-button-message', wa.sendButtonMessage)
router.post('/api/whatsapp/send-template-message', wa.sendTemplateMessage)
router.post('/api/whatsapp/send-list-message', wa.sendListMessage)
router.post('/api/whatsapp/send-reaction', wa.sendReaction)
router.post('/api/whatsapp/is-exists', wa.isExists)
router.post('/api/whatsapp/get-profile-picture', wa.getPpUrl)
router.post('/api/whatsapp/delete-for-every-one', wa.deleteEveryOne)
router.post('/api/whatsapp/group-metadata', wa.groupMetadata)
router.post('/api/whatsapp/delete-credential', wa.deleteCredentials)
router.post('/api/whatsapp/store/chats', store.chats)

/**
 * SAMPLE HTML PAGE TO CONSUME QRCODE AND SOCKET.IO
 */
// sendFile will go here
router.get('/', (req, res) => {
    const path = require('path')
    res.sendFile(path.join(__dirname, '../public/index.html'));
})

module.exports = router