'use strict'

const { default: makeWASocket, makeWALegacySocket, downloadContentFromMessage } = require('@adiwajshing/baileys')
const { useSingleFileAuthState, makeInMemoryStore, fetchLatestBaileysVersion, AnyMessageContent, delay, MessageRetryMap, useMultiFileAuthState } = require('@adiwajshing/baileys')
const { DisconnectReason } = require('@adiwajshing/baileys')
const QRCode = require('qrcode')

// const logger = require('../../lib/pino')
const lib = require('../../lib')
const fs = require('fs')
let sock = []
let qrcode = []

const axios = require('axios')

/***********************************************************
 * FUNCTION
 **********************************************************/

//  import { Boom } from '@hapi/boom'
//  import makeWASocket, { AnyMessageContent, delay, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, MessageRetryMap, useMultiFileAuthState } from '../src'
 const MAIN_LOGGER = require('../../lib/pino')
 
 const logger = MAIN_LOGGER.child({ })
//  logger.level = 'trace'
 
 const useStore = !process.argv.includes('--no-store')
 const doReplies = !process.argv.includes('--no-reply')
 
 // external map to store retry counts of messages when decryption/encryption fails
 // keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
 const msgRetryCounterMap = () => MessageRetryMap = { }
 
 // start a connection
 
const connectToWhatsApp = async (token, io) => {

    try {
        let number = sock[token].user.id.split(':')
        number = number[0]+'@s.whatsapp.net'        
        const ppUrl = await getPpUrl(token, number)
        return { status: false, message: 'Already connected'}
    } catch (error) {
        console.log(error)
    }

    const { state, saveCreds } = await useMultiFileAuthState(`credentials/${token}`)
    // fetch latest version of WA Web
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

    // the store maintains the data of the WA connection in memory
    // can be written out to a file & read from it
    const store = useStore ? makeInMemoryStore({ logger }) : undefined
    store?.readFromFile(`credentials/${token}/multistore.js`)
    // save every 10s
    const interalStore = setInterval(() => {
        store?.writeToFile(`credentials/${token}/multistore.js`)
    }, 10_000)

    sock[token] = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: state,
        msgRetryCounterMap,
        // implement to handle retries
        getMessage: async key => {
            return {
                conversation: 'hello'
            }
        }
    })

    store?.bind(sock[token].ev)

    // const sendMessageWTyping = async({msg: AnyMessageContent, jid: string}) => {
    //     await sock.presenceSubscribe(jid)
    //     await delay(500)

    //     await sock.sendPresenceUpdate('composing', jid)
    //     await delay(2000)

    //     await sock.sendPresenceUpdate('paused', jid)

    //     await sock.sendMessage(jid, msg)
    // }

    // sock[token].ev.on('call', item => console.log('recv call event', item))
    // sock[token].ev.on('chats.set', item => console.log(`recv ${item.chats.length} chats (is latest: ${item.isLatest})`))
    // sock[token].ev.on('messages.set', item => console.log(`recv ${item.messages.length} messages (is latest: ${item.isLatest})`))
    // sock[token].ev.on('contacts.set', item => console.log(`recv ${item.contacts.length} contacts`))

    sock[token].ev.on('messages.upsert', async m => {
        // console.log(JSON.stringify(m, undefined, 2))

        // const msg = m.messages[0]
        // if(!msg.key.fromMe && m.type === 'notify' && doReplies) {
        //     console.log('replying to', m.messages[0].key.remoteJid)
        //     // await sock.sendReadReceipt(msg.key.remoteJid, msg.key.participant, [msg.key.id])
        //     // await sendMessageWTyping({ text: 'Hello there!' }, msg.key.remoteJid)
        // }
        
        // console.log('got contacts', Object.values(store.chats))
        store?.writeToFile(`credentials/${token}/multistore.js`)

        const key = m.messages[0].key
        const message = m.messages[0].message
        
        console.log( {key, message} )

        await sock[token].sendPresenceUpdate('unavailable', key.remoteJid)
        io.emit('message-upsert', {token, key, message})

        /** START WEBHOOK */
        const url = process.env.WEBHOOK
        if ( url ) {
            axios.post(url, {
                key: key,
                message: message
            })
            .then(function (response) {
                console.log(response);
                try {
                    io.emit('message-upsert', {token, key, message: message, info: 'Your webhook is configured', response: response})
                } catch (error) {
                    lib.log.error(error)
                }
            })
            .catch(function (error) {
                console.log(error);
                try {
                    io.emit('message-upsert', {token, key, message: message, alert: 'This is because you not set your webhook to receive this action', error: error})
                } catch (error) {
                    lib.log.error(error)
                }
            });
        }
        /** END WEBHOOK */

    })

    // sock[token].ev.on('messages.update', m => console.log(m))
    // sock[token].ev.on('message-receipt.update', m => console.log(m))
    // sock[token].ev.on('presence.update', m => console.log(m))
    // sock[token].ev.on('chats.update', m => console.log(m))
    // sock[token].ev.on('chats.delete', m => console.log(m))
    // sock[token].ev.on('contacts.upsert', m => console.log(m))

    sock[token].ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update
        if(connection === 'close') {
            // reconnect if not logged out
            if((lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                connectToWhatsApp(token, io)
            } else {
                console.log('Connection closed. You are logged out.')
                clearInterval(interalStore)
                delete sock[token]
                io.emit('message', {message: 'Connection closed. You are logged out.'})
                fs.rmdir(`credentials/${token}`, { recursive: true }, (err) => {
                    if (err) {
                        throw err;
                    }
                    console.log(`credentials/${token} is deleted`);
                });
            }
        }

        if (qr) {
            // console.log('QR CODE:\n'+qr)

            // CONVERT THE QRCODE TO DATA URL
            // SEND TO YOUR CLIENT SIDE
            QRCode.toDataURL(qr, function (err, url) {
                if (err) {
                    logger.error(err)
                }
                qrcode[token]=url
                try {
                    io.emit('qrcode', {token, data: url})
                } catch (error) {
                    lib.log.error(error)
                }
            })
        }

        if(connection === 'open') {
            logger.info('opened connection')
            logger.info(sock[token].user)
            await sock[token].sendPresenceUpdate('unavailable')

            let number = sock[token].user.id.split(':')
            number = number[0]+'@s.whatsapp.net'

            const ppUrl = await getPpUrl(token, number)
            io.emit('connection-open', {token, user: sock[token].user, ppUrl})
        }

        console.log('connection update', update)
    })
    
    // listen for when the auth credentials is updated
    sock[token].ev.on('creds.update', saveCreds)

    return sock[token]
}
 
//  startSock("test")

// connection
// async function connectToWhatsApp(token, io) {

//     if ( typeof sock[token] !== 'undefined' ) {
//         return sock[token]
//     }

//     // fetch latest version of WA Web
// 	const { version, isLatest } = await fetchLatestBaileysVersion()
// 	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

//     const useStore = !process.argv.includes('--no-store')
    
//     const store = useStore ? makeInMemoryStore({ }) : undefined

//     // can be read from a file
//     store.readFromFile(`credentials/store/${token}.json`)

//     // saves the state to a file every 60s
//     const intervalStore = setInterval(() => {
//         store.writeToFile(`credentials/store/${token}.json`)
//         logger.info({token, message: 'Storing data'})
//     }, 60_000)

//     const { state, saveState } = useSingleFileAuthState(`credentials/${token}.json`)

//     sock[token] = makeWASocket({
//         version,
//         printQRInTerminal: process.env.NODE_ENV.trim() !== 'production' ? true : false,
//         logger: logger,
//         auth: state,
//         getMessage: function (key) { return Promise(key); },
//         browser: ["nDalu.id", "chrome", "1.0.0"]
//     })

//     // bind
//     store.bind(sock[token].ev)

//     // update connection
//     sock[token].ev.on('connection.update', async (update) => {
//         const { qr, connection, lastDisconnect } = update

//         //catch qr code
//         if (qr && qr !== 'undefined') {
//             // console.log('QR CODE:\n'+qr)

//             // CONVERT THE QRCODE TO DATA URL
//             // SEND TO YOUR CLIENT SIDE
//             QRCode.toDataURL(qr, function (err, url) {
//                 if (err) {
//                     logger.error(err)
//                 }
//                 qrcode[token]=url
//                 try {
//                     io.emit('qrcode', {token, data: url})
//                 } catch (error) {
//                     lib.log.error(error)
//                 }
//             })
//         }

//         // if connection is ...
//         if(connection === 'close') {

//             if (lastDisconnect.error.isBoom) {
//                 const shouldReconnect = lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
//                 const statusCode = lastDisconnect.error.output.statusCode

//                 if ( !shouldReconnect) {
//                     console.log(statusCode)
//                     console.log(shouldReconnect)
//                     logger.warn(lastDisconnect.error.output.payload.message)
//                     try {
//                         (fs.existsSync(`credentials/${token}.json`) && fs.unlinkSync(`credentials/${token}.json`))
//                         clearInterval(intervalStore)
//                         delete sock[token]
//                     } catch (error) {
//                         logger.error(error)
//                     }
//                 } else {
//                     logger.info('Connecting')
//                     connectToWhatsApp(token, io)
//                 }
                
//             }
//         } else if(connection === 'open') {
//             logger.info('opened connection')
//             logger.info(sock[token].user)
//             await sock[token].sendPresenceUpdate('unavailable')

//             let number = sock[token].user.id.split(':')
//             number = number[0]+'@s.whatsapp.net'

//             const ppUrl = await getPpUrl(token, number)

//             try {
//                 io.emit('connection-open', {token, user: sock[token].user, ppUrl})
//             } catch (error) {
//                 lib.log.error(error)
//             }
//         }
//     })

//     // message upsert
//     sock[token].ev.on('messages.upsert', async m => {

//         await sock[token].sendPresenceUpdate('unavailable')
//         // console.log('got contacts', Object.values(store.chats))
//         store.writeToFile(`credentials/store/${token}.json`)

//         const key = m.messages[0].key
//         const message = m.messages[0].message
//         console.log( {key, message} )

//         try {
//             io.emit('message-upsert', {token, key, message})
//         } catch (error) {
//             lib.log.error(error)
//         }

//         /** START WEBHOOK */
//         const url = process.env.WEBHOOK
//         if ( url ) {
//             axios.post(url, {
//                 key: key,
//                 message: message
//             })
//             .then(function (response) {
//                 console.log(response);
//                 try {
//                     io.emit('message-upsert', {token, key, message: message, info: 'Your webhook is configured', response: response})
//                 } catch (error) {
//                     lib.log.error(error)
//                 }
//             })
//             .catch(function (error) {
//                 console.log(error);
//                 try {
//                     io.emit('message-upsert', {token, key, message: message, alert: 'This is because you not set your webhook to receive this action', error: error})
//                 } catch (error) {
//                     lib.log.error(error)
//                 }
//             });
//         }
//         /** END WEBHOOK */

//     })
    
//     // success connection
//     sock[token].ev.on ('creds.update', saveState)

//     // contacts upsert
//     sock[token].ev.on('contacts.upsert', async contacts => {

//         await sock[token].sendPresenceUpdate('unavailable')
//         // console.log('got contacts', Object.values(store.contacts))
//         store.writeToFile(`credentials/store/${token}.json`)

//     })

//     // chat set
//     sock[token].ev.on('chats.set', () => {

//         // can use "store.chats" however you want, even after the socket dies out
//         // "chats" => a KeyedDB instance
//         // console.log('got chats', store.chats.all())
//         store.writeToFile(`credentials/store/${token}.json`)

//     })

//     // contacts set
//     sock[token].ev.on('contacts.set', () => {

//         // console.log('got contacts', Object.values(store.contacts))
//         store.writeToFile(`credentials/store/${token}.json`)

//     })

//     return sock[token]
// }

// text message
async function sendText(token, number, text) {

    try {
        const sendingTextMessage = await sock[token].sendMessage(number, { text: text }) // awaiting sending message
        return sendingTextMessage
    } catch (error) {
        console.log(error)
        return false
    }

}

// media
async function sendMedia(token, number, type, url, fileName, caption) {

    /**
     * type is "url" or "local"
     * if you use local, you must upload into src/public/temp/[fileName]
     */

    try {
        if ( type == 'image' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { image: url ? {url} : fs.readFileSync('src/public/temp/'+fileName), caption: caption ? caption : null},
            )
        } else if ( type == 'video' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { video: url ? {url} : fs.readFileSync('src/public/temp/'+fileName), caption: caption ? caption : null},
            )
        } else if ( type == 'audio' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { audio: url ? {url} : fs.readFileSync('src/public/temp/'+fileName), caption: caption ? caption : null},
            )
        } else if ( type == 'pdf' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { document: { url: url }, mimetype: 'application/pdf'},
                { url: url }
            )
        } else if ( type == 'xls' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { document: { url: url }, mimetype: 'application/excel'},
                { url: url }
            )
        } else if ( type == 'xls' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { document: { url: url }, mimetype: 'application/excel'},
                { url: url }
            )
        } else if ( type == 'xlsx' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { document: { url: url }, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
                { url: url }
            )
        } else if ( type == 'doc' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { document: { url: url }, mimetype: 'application/msword'},
                { url: url }
            )
        } else if ( type == 'docx' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { document: { url: url }, mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
                { url: url }
            )
        } else if ( type == 'zip' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { document: { url: url }, mimetype: 'application/zip'},
                { url: url }
            )
        } else if ( type == 'mp3' ) {
            var sendMsg = await sock[token].sendMessage(
                number,
                { document: { url: url }, mimetype: 'application/mp3'},
                { url: url }
            )
        } else {
            console.log('Please add your won role of mimetype')
            return false
        }
        // console.log(sendMsg)
        return sendMsg
    } catch (error) {
        console.log(error)
        return false
    }

}

// button message
async function sendButtonMessage(token, number, button, message, footer, type, image) {
    
    /**
     * type is "url" or "local"
     * if you use local, you must upload into src/public/temp/[fileName]
     */

    try {
        const buttons = button.map( (x, i) => {
            return {buttonId: i, buttonText: {displayText: x.displayText}, type: 1}
        })
        if (image) {
            var buttonMessage = {
                image: type == 'url' ? {url: image} : fs.readFileSync('src/public/temp/'+image),
                // jpegThumbnail: await lib.base64_encode(),
                caption: message,
                footer: footer,
                buttons: buttons,
                headerType: 4
            }
        } else {
            var buttonMessage = {
                text: message,
                footer: footer,
                buttons: buttons,
                headerType: 1
            }
        }
        const sendMsg = await sock[token].sendMessage(number, buttonMessage)
        return sendMsg
    } catch (error) {
        console.log(error)
        return false
    }

}

// template message
async function sendTemplateMessage(token, number, button, text, footer, image) {
    
    try {
        const templateButtons = [
            {index: 1, urlButton: {displayText: button[0].displayText, url: button[0].url}},
            {index: 2, callButton: {displayText: button[1].displayText, phoneNumber: button[1].phoneNumber}},
            {index: 3, quickReplyButton: {displayText: button[2].displayText, id: button[2].id}},
        ]

        
          if (image) {
             const buttonMessage = {
            caption: text,
            footer: footer,
            templateButtons: templateButtons,
            image: {url: image}
        }
        } else {
              const buttonMessage = {
            caption: text,
            footer: footer,
            templateButtons: templateButtons
          
        }
        }
        
        

        const sendMsg = await sock[token].sendMessage(number, buttonMessage)
        return sendMsg
    } catch (error) {
        console.log(error)
        return false
    }

}

// list message
async function sendListMessage(token, number, list, text, footer, title, buttonText) {
    
    try {
        const sections = list.map( (x, i) => {
            return {
                title: x.title,
                rows: x.rows.map((xx, ii) => {
                    return {title: xx.title, rowId: ii, description: xx.description ? xx.description : null}
                })
            }
        })
        const listMessage = { text, footer, title, buttonText, sections }

        const sendMsg = await sock[token].sendMessage(number, listMessage)
        return sendMsg
    } catch (error) {
        console.log(error)
        return false
    }

}

// reaction message
async function sendReaction(token, number, text, key) {
    
    try {
        const reactionMessage = {
            react: {
                text: text,
                key: key
            }
        }
        const sendMsg = await sock[token].sendMessage(number, reactionMessage)
        return sendMsg
    } catch (error) {
        console.log(error)
        return false
    }

}

// if exist
async function isExist(token, number) {
    
    try {
        const [result] = await sock[token].onWhatsApp(number)
        return result
    } catch (error) {
        return false
    }

}

// ppUrl
async function getPpUrl(token, number, highrest) {

    let ppUrl
    try {
        if (highrest) {
            // for high res picture
            ppUrl = await sock[token].profilePictureUrl(number, 'image')
        } else {
            // for low res picture
            ppUrl = await sock[token].profilePictureUrl(number)
        }

        return ppUrl
    } catch (error) {
        console.log(error)
        return false
    }
}

// delete for everyone
async function deleteEveryOne(token, number, key) {
    try {
        const deleteEveryOne = await sock[token].sendMessage(number, { delete: key })
        return deleteEveryOne
    } catch (error) {
        console.log(error)
        return false
    }
}

// group metadata
async function groupMetadata(token, number) {
    try {
        const metadata = await sock[token].groupMetadata(number) 
        return metadata
    } catch (error) {
        console.log(error)
        return false
    }
}

// close connection
function deleteCredentials(token) {
    try {
        delete sock[token]
        fs.existsSync('credentials/'+token.json) && fs.unlinkSync('credentials/'+token.json) && fs.existsSync('credentials/store/'+token.json) && fs.unlinkSync('credentials/store/'+token.json)
        return 'Deleting session and credential'
    } catch (error) {
        return 'Nothing deleted'
    }
}

module.exports = {

    connectToWhatsApp,
    sendText,
    sendMedia,
    sendButtonMessage,
    sendTemplateMessage,
    sendListMessage,
    sendReaction,
    isExist,
    getPpUrl,
    deleteEveryOne,
    groupMetadata,
    deleteCredentials

}
