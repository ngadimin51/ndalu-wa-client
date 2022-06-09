'use strict'

const express = require('express')
const router = express.Router()

/**
 * THIS IS MAIN ROUTER
 */
const wa = require('./model/route')
const store = require('./model/store')

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

module.exports = router