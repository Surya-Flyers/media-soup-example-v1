/**
 * integrating mediasoup server with a node.js application
 */

/* Please follow mediasoup installation requirements */
/* https://mediasoup.org/documentation/v3/mediasoup/installation/ */
import express from 'express'
const app = express()

import https from 'httpolyglot'
import fs from 'fs'
import path from 'path'
const __dirname = path.resolve()

import { Server } from 'socket.io'
import mediasoup, { getSupportedRtpCapabilities } from 'mediasoup';

function logger(name="", items=[]){
  console.log(`B ---- ${name} ----`);
  items.forEach(item => {
    console.log(`${item} $####$\n`);
  });
  console.log(`**** xxx **** \n\n\n`)
};

function SS(name, value = ""){
  if(typeof value === "object"){
    try {
      return (`-> STRINGFIED :: ${name} :: ${JSON.stringify(value)}`)
    } catch (error) {
      return (`-> !!STRINGFIED :: ${name} :: ${value}`)
    }
  } else {
    return (`${name} :: ${value}`);
  }
}

app.get('*', (req, res, next) => {
  const path = '/sfu/'

  if (req.path.indexOf(path) == 0 && req.path.length > path.length) return next()

  res.send(`You need to specify a room name in the path e.g. 'https://127.0.0.1/sfu/room'`)
})

app.use('/sfu/:room', express.static(path.join(__dirname, 'public')))

// SSL cert for HTTPS access
const options = {
  key: fs.readFileSync('./server/ssl/key.pem', 'utf-8'),
  cert: fs.readFileSync('./server/ssl/cert.pem', 'utf-8')
}

const httpsServer = https.createServer(options, app)
httpsServer.listen(3000, () => {
  console.log('listening on port: ' + 3000)
})

const io = new Server(httpsServer)

// socket.io namespace (could represent a room?)
const connections = io.of('/mediasoup')

/**
 * Worker
 * |-> Router(s)
 *     |-> Producer Transport(s)
 *         |-> Producer
 *     |-> Consumer Transport(s)
 *         |-> Consumer 
 **/
let worker
let rooms = {}          // { roomName1: { Router, rooms: [ sicketId1, ... ] }, ...}
let peers = {}          // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
let transports = []     // [ { socketId1, roomName1, transport, consumer }, ... ]
let producers = []      // [ { socketId1, roomName1, producer, }, ... ]
let consumers = []      // [ { socketId1, roomName1, consumer, }, ... ]

const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  })
  console.log(`worker pid ${worker.pid}`)

  worker.on('died', error => {
    // This implies something serious happened, so kill the application
    console.error('mediasoup worker has died')
    setTimeout(() => process.exit(1), 2000) // exit in 2 seconds
  })

  return worker
}

// We create a Worker as soon as our application starts
worker = createWorker()

// This is an Array of RtpCapabilities
// https://mediasoup.org/documentation/v3/mediasoup/rtp-parameters-and-capabilities/#RtpCodecCapability
// list of media codecs supported by mediasoup ...
// https://github.com/versatica/mediasoup/blob/v3/src/supportedRtpCapabilities.ts
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
]

connections.on('connection', async socket => {
  console.log(socket.id);
  // logger("connection", [SS("socket", socket), SS("socket.id",socket.id)]);
  socket.emit('connection-success', {
    socketId: socket.id
  });

  const removeItems = (items, socketId, type) => {
    items.forEach(item => {
      if (item.socketId === socket.id) {
        item[type].close()
      }
    })
    items = items.filter(item => item.socketId !== socket.id)

    return items
  }

  socket.on('disconnect', () => {
    // do some cleanup
    console.log('peer disconnected')
    consumers = removeItems(consumers, socket.id, 'consumer')
    producers = removeItems(producers, socket.id, 'producer')
    transports = removeItems(transports, socket.id, 'transport')

    const { roomName } = peers[socket.id]
    delete peers[socket.id]

    // remove socket from room
    rooms[roomName] = {
      router: rooms[roomName].router,
      peers: rooms[roomName].peers.filter(socketId => socketId !== socket.id)
    }
  })

  socket.on('joinRoom', async ({ roomName }, callback) => {
    // create Router if it does not exist
    // const router1 = rooms[roomName] && rooms[roomName].get('data').router || await createRoom(roomName, socket.id)
    const router1 = await createRoom(roomName, socket.id)
  logger("joinRoom", [SS("roomName", roomName), SS("router1",router1)]);


    peers[socket.id] = {
      socket,
      roomName,           // Name for the Router this Peer joined
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: '',
        isAdmin: false,   // Is this Peer the Admin?
      }
    }

  logger("joinRoom", [SS("peers", peers)]);


    // get Router RTP Capabilities
    const rtpCapabilities = router1.rtpCapabilities
    logger("joinRoom", [SS("rtpCapabilities", rtpCapabilities)]);

    // call callback from the client and send back the rtpCapabilities
    callback({ rtpCapabilities })
  });


  const createRoom = async (roomName, socketId) => {
    // worker.createRouter(options)
    // options = { mediaCodecs, appData }
    // mediaCodecs -> defined above
    // appData -> custom application data - we are not supplying any
    // none of the two are required
  logger("createRoom");

    let router1
    let peers = []
    if (rooms[roomName]) {
      router1 = rooms[roomName].router
      peers = rooms[roomName].peers || []
    } else {
      router1 = await worker.createRouter({ mediaCodecs, })
    }
    
    console.log(`Router ID: ${router1.id}`, peers.length)
    logger("createRoom", [SS("rooms", rooms)]);

    rooms[roomName] = {
      router: router1,
      peers: [...peers, socketId],
    }

    logger("createRoom", [SS("rooms", rooms), SS("router1",router1)]);

    return router1
  }

  // Client emits a request to create server side Transport
  // We need to differentiate between the producer and consumer transports
  socket.on('createWebRtcTransport', async ({ consumer }, callback) => {
    // get Room Name from Peer's properties
    logger("createWebRtcTransport", [SS("consumer", consumer)]);
    const roomName = peers[socket.id].roomName
    logger("createWebRtcTransport", [SS("roomName", roomName)]);

    // get Router (Room) object this peer is in based on RoomName
    const router = rooms[roomName].router
    logger("createWebRtcTransport", [SS("router", router)]);


    createWebRtcTransport(router).then(
      transport => {
        logger("createWebRtcTransport", [SS("transport", transport)]);

        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          }
        })

        // add transport to Peer's properties
        addTransport(transport, roomName, consumer)
      },
      error => {
        console.log(error)
      })
  });

  const addTransport = (transport, roomName, consumer) => {
    logger("addTransport", [SS("transport", transport),SS("roomName", roomName),SS("consumer", consumer)]);

    logger("addTransport", [SS("transports", transports)]);
    transports = [
      ...transports,
      { socketId: socket.id, transportId : transport.internal.transportId, transport, roomName, consumer, }
    ]

    logger("addTransport", [SS("peers", peers)]);
    peers[socket.id] = {
      ...peers[socket.id],
      transports: [
        ...peers[socket.id].transports,
        transport.id,
      ]
    }

    logger("addTransport", [SS("transports", transports), SS("transports.length", transports.length)]);
    logger("addTransport", [SS("peers", peers)]);

  }

  const addProducer = (producer, roomName) => {
    logger("addProducer", [SS("producer", producer),SS("roomName", roomName)]);

    logger("addProducer", [SS("producers", producers)]);
    producers = [
      ...producers,
      { socketId: socket.id, producer, roomName, }
    ]

    logger("addProducer", [SS("peers", peers)]);
    peers[socket.id] = {
      ...peers[socket.id],
      producers: [
        ...peers[socket.id].producers,
        producer.id,
      ]
    }

    logger("addProducer", [SS("producers", producers), SS("producers - count", producers.length)]);
    logger("addProducer", [SS("peers", peers)]);
  }

  const addConsumer = (consumer, roomName) => {
    logger("addConsumer", [SS("consumer", consumer),SS("roomName", roomName)]);
    // add the consumer to the consumers list
    logger("addConsumer", [SS("consumers", consumers)]);
    consumers = [
      ...consumers,
      { socketId: socket.id, consumer, roomName, }
    ]

    // add the consumer id to the peers list
    logger("addConsumer", [SS("peers", peers)]);
    peers[socket.id] = {
      ...peers[socket.id],
      consumers: [
        ...peers[socket.id].consumers,
        consumer.id,
      ]
    };

    logger("addConsumer", [SS("consumers", consumers)]);
    logger("addConsumer", [SS("peers", peers)]);
  }

  socket.on('getProducers', callback => {
    //return all producer transports
    const { roomName } = peers[socket.id]
    logger("getProducers", [SS("socket.id", socket.id),SS("roomName", roomName), SS("peers", peers)]);

    let producerList = []
    logger("getProducers", [SS("producerList", producerList)]);
    producers.forEach(producerData => {
      if (producerData.socketId !== socket.id && producerData.roomName === roomName) {
        producerList = [...producerList, producerData.producer.id]
      }
    })
    logger("getProducers", [SS("producerList", producerList)]);

    // return the producer list back to the client
    callback(producerList)
  })

  const informConsumers = (roomName, socketId, id) => {
    console.log(`just joined, id ${id} ${roomName}, ${socketId}`)
    logger("informConsumers", [SS("roomName", roomName), SS("socketId", socketId), SS("id", id)]);

    // A new producer just joined
    // let all consumers to consume this producer
    logger("informConsumers", [SS("producers", producers)]);
    producers.forEach(producerData => {
      if (producerData.socketId !== socketId && producerData.roomName === roomName) {
        const producerSocket = peers[producerData.socketId].socket
        // use socket to send producer id to producer
        producerSocket.emit('new-producer', { producerId: id })
      }
    })
    logger("informConsumers", [SS("producers", producers)]);
  }

  const getTransport = (socketId, transportId) => {
    
    const [producerTransport] = transports.filter(transport => transport.socketId === socketId && transport.transportId === transportId && !transport.consumer)
    logger("getTransport", [SS("producerTransport", producerTransport), SS("transports.length", transports.length), SS("transports", transports)]);
    return producerTransport.transport
  }

  // see client's socket.emit('transport-connect', ...)
  socket.on('transport-connect', ({ dtlsParameters, transportId }) => {
    console.log('DTLS PARAMS... ', { dtlsParameters })
    
    logger("transport-connect", [SS("dtlsParameters", dtlsParameters)]);
    getTransport(socket.id, transportId).connect({ dtlsParameters })
  })

  // see client's socket.emit('transport-produce', ...)
  socket.on('transport-produce', async ({ kind, rtpParameters, appData, transportId }, callback) => {
    // call produce based on the prameters from the client
    logger("transport-produce", [SS("kind", kind), SS("rtpParameters", rtpParameters), SS("appData", appData)]);
    const producer = await getTransport(socket.id, transportId).produce({
      kind,
      rtpParameters,
    })

    // add producer to the producers array
    const { roomName } = peers[socket.id]
    
    logger("transport-produce", [SS("producer", producer), SS("roomName", roomName)]);
    addProducer(producer, roomName)

    informConsumers(roomName, socket.id, producer.id)

    console.log('Producer ID: ', producer.id, producer.kind)

    producer.on('transportclose', () => {
      console.log('transport for this producer closed ')
    logger("transport-produce", [SS("transportclose")]);
    producer.close()
    })

    // Send back to the client the Producer's id
    callback({
      id: producer.id,
      producersExist: producers.length>1 ? true : false
    })
  })

  // see client's socket.emit('transport-recv-connect', ...)
  socket.on('transport-recv-connect', async ({ dtlsParameters, serverConsumerTransportId }) => {
    console.log(`DTLS PARAMS: ${dtlsParameters}`);

    logger("transport-recv-connect", [SS("dtlsParameters", dtlsParameters), SS("serverConsumerTransportId", serverConsumerTransportId)]);

    const consumerTransport = transports.find(transportData => (
      transportData.consumer && transportData.transport.id == serverConsumerTransportId
    )).transport
    logger("transport-recv-connect", [SS("consumerTransport", consumerTransport)]);
    await consumerTransport.connect({ dtlsParameters })
  })

  socket.on('consume', async ({ rtpCapabilities, remoteProducerId, serverConsumerTransportId }, callback) => {
    try {

    logger("consume", [SS("rtpCapabilities", rtpCapabilities), SS("remoteProducerId", remoteProducerId), SS("serverConsumerTransportId", serverConsumerTransportId)]);
    const { roomName } = peers[socket.id]
      const router = rooms[roomName].router
      let consumerTransport = transports.find(transportData => (
        transportData.consumer && transportData.transport.id == serverConsumerTransportId
      )).transport
      logger("consume", [SS("router", router), SS("consumerTransport", consumerTransport)]);

      // check if the router can consume the specified producer
      if (router.canConsume({
        producerId: remoteProducerId,
        rtpCapabilities
      })) {
        // transport can now consume and return a consumer
        const consumer = await consumerTransport.consume({
          producerId: remoteProducerId,
          rtpCapabilities,
          paused: true,
        })

      logger("consume", [SS("consumer", consumer)]);
      consumer.on('transportclose', () => {
          console.log('transport close from consumer')
        })

        consumer.on('producerclose', () => {
          console.log('producer of consumer closed')
          socket.emit('producer-closed', { remoteProducerId })

          consumerTransport.close([])
          transports = transports.filter(transportData => transportData.transport.id !== consumerTransport.id)
          consumer.close()
          consumers = consumers.filter(consumerData => consumerData.consumer.id !== consumer.id)
      logger("consume-producerclose", [SS("transports", transports), SS("consumers", consumers)]);
    })

        addConsumer(consumer, roomName)

        // from the consumer extract the following params
        // to send back to the Client
        const params = {
          id: consumer.id,
          producerId: remoteProducerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          serverConsumerId: consumer.id,
        }
        logger("consume", [SS("params", params)]);

        // send the parameters to the client
        callback({ params })
      }
    } catch (error) {
      console.log(error.message)
      callback({
        params: {
          error: error
        }
      })
    }
  })

  socket.on('consumer-resume', async ({ serverConsumerId }) => {
    console.log('consumer resume')
      logger("consumer-resume", [SS("serverConsumerId", serverConsumerId)]);
      const { consumer } = consumers.find(consumerData => consumerData.consumer.id === serverConsumerId)
      logger("consumer-resume", [SS("consumer", consumer)]);
      await consumer.resume()
  })
})

const createWebRtcTransport = async (router) => {
  return new Promise(async (resolve, reject) => {
    try {
      // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
      const webRtcTransport_options = {
        listenIps: [
          {
            ip: '0.0.0.0', // replace with relevant IP address
            // announcedIp: '10.0.0.115',
            announcedIp : '127.0.0.1',
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      }

      // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
      let transport = await router.createWebRtcTransport(webRtcTransport_options)
      console.log(`transport id: ${transport.id}`)
      logger("createWebRtcTransport", [SS("transport", transport)]);

      transport.on('dtlsstatechange', dtlsState => {
        if (dtlsState === 'closed') {
          transport.close()
        }
      })

      transport.on('close', () => {
      logger("createWebRtcTransport-close");
      console.log('transport closed')
      })

      resolve(transport)

    } catch (error) {
      reject(error)
    }
  })
}